作为工作中最重要、最常用的容器之一，当然还是要自己动手写一篇 HashMap 的源码解析来加深对其的印象咯，而且它的设计与实现 也有很多值得学习的地方。

## 源码赏析

JDK1.8 的 HashMap 底层使用的是 动态数组，数组中元素存放的是 链表或红黑树。核心源码如下。

```java
public class HashMap<K,V> extends AbstractMap<K,V> implements Map<K,V>,
		Cloneable, Serializable {

    /**
     * 初始化容量，这里的 位运算 就不多解释咯，可以自行度娘
     */
    static final int DEFAULT_INITIAL_CAPACITY = 1 << 4; // aka 16

    /**
     * 最大容量
     */
    static final int MAXIMUM_CAPACITY = 1 << 30;

    /**
     * 扩容因子，使用的容量达到 当前容量的 75% 就扩容
     */
    static final float DEFAULT_LOAD_FACTOR = 0.75f;

    /**
     * 当前 HashMap 所能容纳键值对数量的最大值，超过这个值，则需扩容
     */
    int threshold;

    /**
     * 已使用的容量
     */
    transient int size;

    /**
     * Node数组，实际存放 键值对 的地方
     */
    transient Node<K,V>[] table;

    /**
     * 链表转红黑树的阈值，链表长度达到此值，会进化成红黑树
     */
    static final int TREEIFY_THRESHOLD = 8;

    /**
     * 系列构造方法，推荐在初始化时根据实际情况设置好初始容量，用好了可以显著减少 resize，提升效率
     */
    public HashMap(int initialCapacity, float loadFactor) {
        if (initialCapacity < 0)
            throw new IllegalArgumentException("Illegal initial capacity: " +
                                               initialCapacity);
        if (initialCapacity > MAXIMUM_CAPACITY)
            initialCapacity = MAXIMUM_CAPACITY;
        if (loadFactor <= 0 || Float.isNaN(loadFactor))
            throw new IllegalArgumentException("Illegal load factor: " +
                                               loadFactor);
        this.loadFactor = loadFactor;
        this.threshold = tableSizeFor(initialCapacity);
    }

    public HashMap(int initialCapacity) {
        this(initialCapacity, DEFAULT_LOAD_FACTOR);
    }

    public HashMap() {
        this.loadFactor = DEFAULT_LOAD_FACTOR; // all other fields defaulted
    }

    public HashMap(Map<? extends K, ? extends V> m) {
        this.loadFactor = DEFAULT_LOAD_FACTOR;
        putMapEntries(m, false);
    }

    public V put(K key, V value) {
        return putVal(hash(key), key, value, false, true);
    }

    final V putVal(int hash, K key, V value, boolean onlyIfAbsent,
                   boolean evict) {
        Node<K,V>[] tab; Node<K,V> p; int n, i;
        // 初始化桶数组 table，table 被延迟到插入新数据时再进行初始化
        if ((tab = table) == null || (n = tab.length) == 0)
            n = (tab = resize()).length;
        // 如果桶中不包含键值对节点引用，则将新键值对节点的引用存入桶中即可
        if ((p = tab[i = (n - 1) & hash]) == null)
            tab[i] = newNode(hash, key, value, null);
        else {
            Node<K,V> e; K k;
            // 如果键的值以及节点 hash 等于链表中的第一个键值对节点时，则将 e 指向该键值对
            if (p.hash == hash && ((k = p.key) == key || (key != null && key.equals(k))))
                e = p;
			// 如果桶中的引用类型为 TreeNode，则调用红黑树的插入方法
	        else if (p instanceof TreeNode)
	            e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
	        else {
	            // 对链表进行遍历，并统计链表长度
	            for (int binCount = 0; ; ++binCount) {
	                // 链表中不包含要插入的键值对节点时，则将该节点接在链表的最后
	                // ！！！ JDK1.7中 新增的Node节点采用头插入，而JDK1.8中改成了尾插入 ！！！
	                if ((e = p.next) == null) {
	                    p.next = newNode(hash, key, value, null);
	                    // 如果链表长度达到阈值，则进化成红黑树
	                    if (binCount >= TREEIFY_THRESHOLD - 1) // -1 for 1st
	                        treeifyBin(tab, hash);
	                    break;
	                }

	                // 条件为 true，表示当前链表包含要插入的键值对，终止遍历
	                if (e.hash == hash &&
	                    ((k = e.key) == key || (key != null && key.equals(k))))
	                    break;
	                p = e;
	            }
	        }

	        // 判断要插入的键值对是否存在 HashMap 中
	        if (e != null) { // existing mapping for key
	            V oldValue = e.value;
	            // onlyIfAbsent 表示是否仅在 oldValue 为 null 的情况下更新键值对的值
	            if (!onlyIfAbsent || oldValue == null)
	                e.value = value;
	            afterNodeAccess(e);
	            return oldValue;
	        }
	    }
	    ++modCount;
	    // 键值对数量超过阈值时，则进行扩容
	    if (++size > threshold)
	        resize();
	    afterNodeInsertion(evict);
	    return null;
    }

    /**
     * 扩容为原容量的两倍，并将存在的元素 放到新的数组上
     */
	final Node<K,V>[] resize() {
	    Node<K,V>[] oldTab = table;
	    int oldCap = (oldTab == null) ? 0 : oldTab.length;
	    int oldThr = threshold;
	    int newCap, newThr = 0;
	    // 如果 table 不为空，表明已经初始化过了
	    if (oldCap > 0) {
	        // 当 table 容量超过容量最大值，则不再扩容
	        if (oldCap >= MAXIMUM_CAPACITY) {
	            threshold = Integer.MAX_VALUE;
	            return oldTab;
	        }
	        // 按旧容量和阈值的2倍计算新容量和阈值的大小
	        else if ((newCap = oldCap << 1) < MAXIMUM_CAPACITY &&
	                 oldCap >= DEFAULT_INITIAL_CAPACITY)
	            newThr = oldThr << 1; // double threshold
	    } else if (oldThr > 0) // initial capacity was placed in threshold
	        // 初始化时，将 threshold 的值赋值给 newCap，
	        // HashMap 使用 threshold 变量暂时保存 initialCapacity 参数的值
	        newCap = oldThr;
	    else {               // zero initial threshold signifies using defaults
	        // 调用无参构造方法时，桶数组容量为默认容量，
	        // 阈值为默认容量与默认负载因子乘积
	        newCap = DEFAULT_INITIAL_CAPACITY;
	        newThr = (int)(DEFAULT_LOAD_FACTOR * DEFAULT_INITIAL_CAPACITY);
	    }

	    // newThr 为 0 时，按阈值计算公式进行计算
	    if (newThr == 0) {
	        float ft = (float)newCap * loadFactor;
	        newThr = (newCap < MAXIMUM_CAPACITY && ft < (float)MAXIMUM_CAPACITY ?
	                  (int)ft : Integer.MAX_VALUE);
	    }
	    threshold = newThr;
	    // 创建新的桶数组，桶数组的初始化也是在这里完成的
	    Node<K,V>[] newTab = (Node<K,V>[])new Node[newCap];
	    table = newTab;
	    if (oldTab != null) {
	        // 如果旧的桶数组不为空，则遍历桶数组，并将键值对映射到新的桶数组中
	        for (int j = 0; j < oldCap; ++j) {
	            Node<K,V> e;
	            if ((e = oldTab[j]) != null) {
	                oldTab[j] = null;
	                if (e.next == null)
	                    newTab[e.hash & (newCap - 1)] = e;
	                else if (e instanceof TreeNode)
	                    // 重新映射时，需要对红黑树进行拆分
	                    ((TreeNode<K,V>)e).split(this, newTab, j, oldCap);
	                else { // preserve order
	                    Node<K,V> loHead = null, loTail = null;
	                    Node<K,V> hiHead = null, hiTail = null;
	                    Node<K,V> next;
	                    // 遍历链表，并将链表节点按原顺序进行分组
	                    do {
	                        next = e.next;
	                        if ((e.hash & oldCap) == 0) {
	                            if (loTail == null)
	                                loHead = e;
	                            else
	                                loTail.next = e;
	                            loTail = e;
	                        }
	                        else {
	                            if (hiTail == null)
	                                hiHead = e;
	                            else
	                                hiTail.next = e;
	                            hiTail = e;
	                        }
	                    } while ((e = next) != null);
	                    // 将分组后的链表映射到新桶中
	                    if (loTail != null) {
	                        loTail.next = null;
	                        newTab[j] = loHead;
	                    }
	                    if (hiTail != null) {
	                        hiTail.next = null;
	                        newTab[j + oldCap] = hiHead;
	                    }
	                }
	            }
	        }
	    }
	    return newTab;
	}

    public V get(Object key) {
        Node<K,V> e;
        return (e = getNode(hash(key), key)) == null ? null : e.value;
    }

    /**
     * 根据 hash 和 key 获取相应的 Node节点
     */
	final Node<K,V> getNode(int hash, Object key) {
	    Node<K,V>[] tab; Node<K,V> first, e; int n; K k;
	    // 1. 定位键值对所在桶的位置，如果该位置有元素，则获取第一个元素
	    if ((tab = table) != null && (n = tab.length) > 0 &&
	        (first = tab[(n - 1) & hash]) != null) {
	        // 如果hash和key都与 第一个元素相同，则第一个元素就是我们要获取的，直接返回
	        if (first.hash == hash &&
	        		((k = first.key) == key || (key != null && key.equals(k))))
	            return first;
	        if ((e = first.next) != null) {
	            // 2. 如果 first 是 TreeNode 类型，则调用黑红树查找方法
	            if (first instanceof TreeNode)
	                return ((TreeNode<K,V>)first).getTreeNode(hash, key);
	            // 3. 对链表进行查找
	            do {
	                if (e.hash == hash &&
	                    ((k = e.key) == key || (key != null && key.equals(k))))
	                    return e;
	            } while ((e = e.next) != null);
	        }
	    }
	    return null;
	}

    /**
     * 还记HashMap底层的动态数组的定义吗 transient Node<K,V>[] table
     * 这里很明显是一个单向链表结构
     */
    static class Node<K,V> implements Map.Entry<K,V> {
        final int hash;
        final K key;
        V value;
        Node<K,V> next;

        Node(int hash, K key, V value, Node<K,V> next) {
            this.hash = hash;
            this.key = key;
            this.value = value;
            this.next = next;
        }

        public final K getKey()        { return key; }
        public final V getValue()      { return value; }
        public final String toString() { return key + "=" + value; }

        public final int hashCode() {
            return Objects.hashCode(key) ^ Objects.hashCode(value);
        }

        public final V setValue(V newValue) {
            V oldValue = value;
            value = newValue;
            return oldValue;
        }

        public final boolean equals(Object o) {
            if (o == this)
                return true;
            if (o instanceof Map.Entry) {
                Map.Entry<?,?> e = (Map.Entry<?,?>)o;
                if (Objects.equals(key, e.getKey()) &&
                    Objects.equals(value, e.getValue()))
                    return true;
            }
            return false;
        }
    }

    /**
     * JDK8 加入的 红黑树TreeNode内部类，红黑树的方法比较复杂，这里只展示一些重要的
     * 属性结构代码
     */
    static final class TreeNode<K,V> extends LinkedHashMap.Entry<K,V> {
        TreeNode<K,V> parent;  // red-black tree links
        TreeNode<K,V> left;
        TreeNode<K,V> right;
        TreeNode<K,V> prev;    // needed to unlink next upon deletion
        // 颜色，true红，false黑
        boolean red;
        TreeNode(int hash, K key, V val, Node<K,V> next) {
            super(hash, key, val, next);
        }
    }
}
```

源码部分 结合注释还是很容易看懂的，比较复杂的是红黑树这种数据结构，以及红黑树与链表之间的相互转换。下面我们回顾下这个数据结构。

## 红黑树

红黑树是一种自平衡的二叉查找树，比普通的二叉查找树效率更高，它可在 O(logN) 时间内完成查找、增加、删除等操作。

普通的二叉查找树在极端情况下可退化成链表，导致 增、删、查 效率低下。红黑树通过定义一些性质，将任意节点的左右子树高度差控制在规定范围内，以达到平衡状态，红黑树的性质定义如下。

1. 节点是红色或黑色。
2. 根是黑色。
3. 所有叶子都是黑色（叶子是 NIL 节点）。
4. 每个红色节点必须有两个黑色的子节点。（从每个叶子到根的所有路径上不能有两个连续的红色节点。）
5. 从任一节点到其每个叶子的所有简单路径都包含相同数目的黑色节点。

红黑树的操作和其他树一样，包括查找、插入、删除等，其查找过程和二叉查找树一样简单，但插入和删除操作要复杂的多，这也是其 为保持平衡性 不会退化成链表 所付出的代价。红黑树为保持平衡性 所进行的操作主要有 旋转（左旋、右旋）和变色。

红黑树的实现 确实比较复杂，光是理解其 插入、删除 的操作原理 就蛮费劲，所以这里先挖个坑，后面单独用一篇博文来分析 HashMap 的 内部类 TreeNode 对红黑树数据结构的实现。
