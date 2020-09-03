HashMap 源码中主要了解其核心源码及实现逻辑。ConcurrentHashMap 就不再重复那些数据结构相关的内容咯，这里重点看一下它的并发安全实现。源码如下。

```java
public class ConcurrentHashMap<K,V> extends AbstractMap<K,V> implements ConcurrentMap<K,V>,
		Serializable {

    /* --------- 常量及成员变量的设计 几乎与HashMap相差无几 -------- */

    /**
     * 最大容量
     */
    private static final int MAXIMUM_CAPACITY = 1 << 30;

    /**
     * 默认初始容量
     */
    private static final int DEFAULT_CAPACITY = 16;

    /**
     * 单个数组最大容量
     */
    static final int MAX_ARRAY_SIZE = Integer.MAX_VALUE - 8;

    /**
     * 默认并发等级，也就分成多少个单独上锁的区域
     */
    private static final int DEFAULT_CONCURRENCY_LEVEL = 16;

    /**
     * 扩容因子
     */
    private static final float LOAD_FACTOR = 0.75f;

    /**
     *
     */
    transient volatile Node<K,V>[] table;

    /**
     *
     */
    private transient volatile Node<K,V>[] nextTable;

    /* --------- 系列构造方法，依然推荐在初始化时根据实际情况设置好初始容量 -------- */
    public ConcurrentHashMap() {
    }

    public ConcurrentHashMap(int initialCapacity) {
        if (initialCapacity < 0)
            throw new IllegalArgumentException();
        int cap = ((initialCapacity >= (MAXIMUM_CAPACITY >>> 1)) ?
                   MAXIMUM_CAPACITY :
                   tableSizeFor(initialCapacity + (initialCapacity >>> 1) + 1));
        this.sizeCtl = cap;
    }

    public ConcurrentHashMap(Map<? extends K, ? extends V> m) {
        this.sizeCtl = DEFAULT_CAPACITY;
        putAll(m);
    }

    public ConcurrentHashMap(int initialCapacity, float loadFactor) {
        this(initialCapacity, loadFactor, 1);
    }

    public ConcurrentHashMap(int initialCapacity,
                             float loadFactor, int concurrencyLevel) {
        if (!(loadFactor > 0.0f) || initialCapacity < 0 || concurrencyLevel <= 0)
            throw new IllegalArgumentException();
        if (initialCapacity < concurrencyLevel)   // Use at least as many bins
            initialCapacity = concurrencyLevel;   // as estimated threads
        long size = (long)(1.0 + (long)initialCapacity / loadFactor);
        int cap = (size >= (long)MAXIMUM_CAPACITY) ?
            MAXIMUM_CAPACITY : tableSizeFor((int)size);
        this.sizeCtl = cap;
    }

    /**
     * ConcurrentHashMap 的核心就在于其put元素时 利用synchronized局部锁 和
     * CAS乐观锁机制 大大提升了本集合的并发能力，比JDK7的分段锁性能更强
     */
    public V put(K key, V value) {
        return putVal(key, value, false);
    }

	/**
	 * 当前指定数组位置无元素时，使用CAS操作 将 Node键值对 放入对应的数组下标。
	 * 出现hash冲突，则用synchronized局部锁锁住，若当前hash对应的节点是链表的头节点，遍历链表，
	 * 若找到对应的node节点，则修改node节点的val，否则在链表末尾添加node节点；倘若当前节点是
	 * 红黑树的根节点，在树结构上遍历元素，更新或增加节点
	 */
    final V putVal(K key, V value, boolean onlyIfAbsent) {
        if (key == null || value == null) throw new NullPointerException();
        int hash = spread(key.hashCode());
        int binCount = 0;
        for (Node<K,V>[] tab = table;;) {
            Node<K,V> f; int n, i, fh;
            if (tab == null || (n = tab.length) == 0)
                tab = initTable();
            else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
            	// 注意！这是一个CAS的方法，将新节点放入指定位置，不用加锁阻塞线程
            	// 也能保证并发安全
                if (casTabAt(tab, i, null, new Node<K,V>(hash, key, value, null)))
                    break;                   // no lock when adding to empty bin
            }
            // 当前Map在扩容，先协助扩容，在更新值
            else if ((fh = f.hash) == MOVED)
                tab = helpTransfer(tab, f);
            else { // hash冲突
                V oldVal = null;
                // 局部锁，有效减少锁竞争的发生
                synchronized (f) { // f 是 链表头节点/红黑树根节点
                    if (tabAt(tab, i) == f) {
                        if (fh >= 0) {
                            binCount = 1;
                            for (Node<K,V> e = f;; ++binCount) {
                                K ek;
                                // 若节点已经存在，修改该节点的值
                                if (e.hash == hash && ((ek = e.key) == key ||
                                    	 (ek != null && key.equals(ek)))) {
                                    oldVal = e.val;
                                    if (!onlyIfAbsent)
                                        e.val = value;
                                    break;
                                }
                                Node<K,V> pred = e;
                                // 节点不存在，添加到链表末尾
                                if ((e = e.next) == null) {
                                    pred.next = new Node<K,V>(hash, key,
                                                              value, null);
                                    break;
                                }
                            }
                        }
                        // 如果该节点是 红黑树节点
                        else if (f instanceof TreeBin) {
                            Node<K,V> p;
                            binCount = 2;
                            if ((p = ((TreeBin<K,V>)f).putTreeVal(hash, key,
                                                           value)) != null) {
                                oldVal = p.val;
                                if (!onlyIfAbsent)
                                    p.val = value;
                            }
                        }
                    }
                }
                // 链表节点超过了8，链表转为红黑树
                if (binCount != 0) {
                    if (binCount >= TREEIFY_THRESHOLD)
                        treeifyBin(tab, i);
                    if (oldVal != null)
                        return oldVal;
                    break;
                }
            }
        }
        // 统计节点个数，检查是否需要resize
        addCount(1L, binCount);
        return null;
    }
}
```

**与 JDK1.7 在同步机制上的区别** 总结如下：  
JDK1.7 使用的是分段锁机制，其内部类 Segment 继承了 ReentrantLock，将 容器内的数组划分成多段区域，每个区域对应一把锁，相比于 HashTable 确实提升了不少并发能力，但在数据量庞大的情况下，性能依然不容乐观，只能通过不断的增加锁来维持并发性能。而 JDK1.8 则使用了 CAS 乐观锁 + synchronized 局部锁 处理并发问题，锁粒度更细，即使数据量很大也能保证良好的并发性。
