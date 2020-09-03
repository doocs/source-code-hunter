HashMap 大家都清楚，底层是 数组 + (链表 / 红黑树)，**元素是无序的**，而 LinkedHashMap 则比 HashMap 多了这一个功能，并且，LinkedHashMap 的有序可以按两种顺序排列，一种是按照插入的顺序，一种是按照访问的顺序（初始化 LinkedHashMap 对象时设置 accessOrder 参数为 true），而其内部是靠 建立一个双向链表 来维护这个顺序的，在每次插入、删除后，都会调用一个函数来进行 双向链表的维护，这也是实现 LRU Cache 功能的基础。

先说几个比较重要的结论，大家可以根据这些结论从后面的源码解析中 得到证据。

1. LinkedHashMap 继承了 HashMap，所以和 HashMap 的底层数据结构是一样的，都是数组+链表+红黑树，扩容机制也一样；
2. LinkedHashMap 是通过双向链表来维护数据的，与 HashMap 的拉链式存储不一样；
3. LinkedHashMap 存储顺序与添加顺序是一样得，同时可以根据 accessOrder 参数 来决定是否在访问时移动元素，以实现 LRU 功能。

```java
public class LinkedHashMap<K,V> extends HashMap<K,V> implements Map<K,V> {

    /**
     * 在 HashMap.Node节点 的基础上增加了 “前继节点” 和 “后继节点” 这种双向链表的功能特性
     */
    static class Entry<K,V> extends HashMap.Node<K,V> {
        Entry<K,V> before, after;
        Entry(int hash, K key, V value, Node<K,V> next) {
            super(hash, key, value, next);
        }
    }

    /**
     * 记录这个 LinkedHashMap容器的 头节点
     */
    transient LinkedHashMap.Entry<K,V> head;

    /**
     * 记录这个 LinkedHashMap容器的 尾节点
     */
    transient LinkedHashMap.Entry<K,V> tail;

    /**
     * 是否根据访问 进行排序，true为是，可通过构造方法进行设置
     */
    final boolean accessOrder;

    // 下面是一些私有的内部公用方法

    // 将元素连接到链表尾部
    private void linkNodeLast(LinkedHashMap.Entry<K,V> p) {
        LinkedHashMap.Entry<K,V> last = tail;
        tail = p;
        if (last == null)
            head = p;
        else {
            p.before = last;
            last.after = p;
        }
    }

    // apply src's links to dst
    private void transferLinks(LinkedHashMap.Entry<K,V> src, LinkedHashMap.Entry<K,V> dst) {
        LinkedHashMap.Entry<K,V> b = dst.before = src.before;
        LinkedHashMap.Entry<K,V> a = dst.after = src.after;
        if (b == null)
            head = dst;
        else
            b.after = dst;
        if (a == null)
            tail = dst;
        else
            a.before = dst;
    }

    // 下面是一些 重写的 HashMap 的 hook methods，其中 afterNodeInsertion、afterNodeRemoval
    // afterNodeAccess及方法，在每次插入、删除、访问后，都会回调 用来维护双向链表

    void reinitialize() {
        super.reinitialize();
        head = tail = null;
    }

    Node<K,V> newNode(int hash, K key, V value, Node<K,V> e) {
        LinkedHashMap.Entry<K,V> p =
            new LinkedHashMap.Entry<K,V>(hash, key, value, e);
        linkNodeLast(p);
        return p;
    }

    Node<K,V> replacementNode(Node<K,V> p, Node<K,V> next) {
        LinkedHashMap.Entry<K,V> q = (LinkedHashMap.Entry<K,V>)p;
        LinkedHashMap.Entry<K,V> t =
            new LinkedHashMap.Entry<K,V>(q.hash, q.key, q.value, next);
        transferLinks(q, t);
        return t;
    }

    TreeNode<K,V> newTreeNode(int hash, K key, V value, Node<K,V> next) {
        TreeNode<K,V> p = new TreeNode<K,V>(hash, key, value, next);
        linkNodeLast(p);
        return p;
    }

    TreeNode<K,V> replacementTreeNode(Node<K,V> p, Node<K,V> next) {
        LinkedHashMap.Entry<K,V> q = (LinkedHashMap.Entry<K,V>)p;
        TreeNode<K,V> t = new TreeNode<K,V>(q.hash, q.key, q.value, next);
        transferLinks(q, t);
        return t;
    }

    // 在删除元素之后，将元素从双向链表中删除
    void afterNodeRemoval(Node<K,V> e) { // unlink
        LinkedHashMap.Entry<K,V> p =
            (LinkedHashMap.Entry<K,V>)e, b = p.before, a = p.after;
        p.before = p.after = null;
        if (b == null)
            head = a;
        else
            b.after = a;
        if (a == null)
            tail = b;
        else
            a.before = b;
    }

    // 可用于删除最老的元素
    void afterNodeInsertion(boolean evict) { // possibly remove eldest
        LinkedHashMap.Entry<K,V> first;
        if (evict && (first = head) != null && removeEldestEntry(first)) {
            K key = first.key;
            removeNode(hash(key), key, null, false, true);
        }
    }
    // 是否删除 最近最少使用的元素
    protected boolean removeEldestEntry(Map.Entry<K,V> eldest) {
        return false;
    }

    // 在访问元素之后，将该元素放到双向链表的尾巴处
    void afterNodeAccess(Node<K,V> e) { // move node to last
        LinkedHashMap.Entry<K,V> last;
        if (accessOrder && (last = tail) != e) {
            LinkedHashMap.Entry<K,V> p =
                (LinkedHashMap.Entry<K,V>)e, b = p.before, a = p.after;
            p.after = null;
            if (b == null)
                head = a;
            else
                b.after = a;
            if (a != null)
                a.before = b;
            else
                last = b;
            if (last == null)
                head = p;
            else {
                p.before = last;
                last.after = p;
            }
            tail = p;
            ++modCount;
        }
    }

    void internalWriteEntries(java.io.ObjectOutputStream s) throws IOException {
        for (LinkedHashMap.Entry<K,V> e = head; e != null; e = e.after) {
            s.writeObject(e.key);
            s.writeObject(e.value);
        }
    }

    /**
     * 跟 HashMap 的构造方法没啥区别，初始容量、扩容因子 用以减少resize和rehash，提升容器整体性能
     */
    public LinkedHashMap(int initialCapacity, float loadFactor) {
        super(initialCapacity, loadFactor);
        accessOrder = false;
    }

    public LinkedHashMap(int initialCapacity) {
        super(initialCapacity);
        accessOrder = false;
    }

    /**
     * 注意！accessOrder参数默认为false，如果想使用 LRU机制，记得设为 true
     */
    public LinkedHashMap() {
        super();
        accessOrder = false;
    }

    public LinkedHashMap(Map<? extends K, ? extends V> m) {
        super();
        accessOrder = false;
        putMapEntries(m, false);
    }

    /**
     * 使用这个构造方法 设置accessOrder
     */
    public LinkedHashMap(int initialCapacity, float loadFactor, boolean accessOrder) {
        super(initialCapacity, loadFactor);
        this.accessOrder = accessOrder;
    }

    /**
     * 是否包含指定元素
     */
    public boolean containsValue(Object value) {
        for (LinkedHashMap.Entry<K,V> e = head; e != null; e = e.after) {
            V v = e.value;
            if (v == value || (value != null && value.equals(v)))
                return true;
        }
        return false;
    }

    /**
     * 获取指定key对应的value，如果accessOrder为true，会回调afterNodeAccess方法
     * 将元素放到队尾
     */
    public V get(Object key) {
        Node<K,V> e;
        if ((e = getNode(hash(key), key)) == null)
            return null;
        if (accessOrder)
            afterNodeAccess(e);
        return e.value;
    }

    /**
     * 根据 key 获取对应的 value，如果key不存在，则返回给定的默认值 defaultValue
     */
    public V getOrDefault(Object key, V defaultValue) {
       Node<K,V> e;
       if ((e = getNode(hash(key), key)) == null)
           return defaultValue;
       if (accessOrder)
           afterNodeAccess(e);
       return e.value;
    }

    /**
     * {@inheritDoc}
     */
    public void clear() {
        super.clear();
        head = tail = null;
    }

    /**
     * 获取key的set集合
     */
    public Set<K> keySet() {
        Set<K> ks = keySet;
        if (ks == null) {
            ks = new LinkedKeySet();
            keySet = ks;
        }
        return ks;
    }

    /**
     * 返回 键值对 的Set集合
     */
    public Set<Map.Entry<K,V>> entrySet() {
        Set<Map.Entry<K,V>> es;
        return (es = entrySet) == null ? (entrySet = new LinkedEntrySet()) : es;
    }
}
```
