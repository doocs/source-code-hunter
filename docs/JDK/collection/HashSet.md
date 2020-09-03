HashSet 本身并没有什么特别的东西，它提供的所有集合核心功能，都是基于 HashMap 来实现的。如果了解 HashMap 源码的实现，HashSet 源码看起来跟玩一样。我的博客中有专门分析 HashMap 源码的文章，不熟悉的请自行翻阅。

HashSet 的特点如下：

- 内部使用 HashMap 的 key 存储元素，以此来保证**元素不重复**；
- HashSet 是无序的，因为 HashMap 的 key 是**无序**的；
- HashSet 中允许有一个 null 元素，因为 HashMap 允许 key 为 null；
- HashSet 是**非线程安全**的。

```java
public class HashSet<E> extends AbstractSet<E> implements Set<E>, Cloneable, java.io.Serializable {
    static final long serialVersionUID = -5024744406713321676L;

    // 基于HashMap实现
    private transient HashMap<E,Object> map;

    // 只需要用到HashMap中key唯一的特性，所以value全部使用同一个 Object实例填充，节省内存空间
    private static final Object PRESENT = new Object();

    /**
     * 实例化 HashSet 的时候，初始化内部的 HashMap
     */
    public HashSet() {
        map = new HashMap<>();
    }

    /**
     * 根据一个集合实例，实例化 HashSet
     */
    public HashSet(Collection<? extends E> c) {
        map = new HashMap<>(Math.max((int) (c.size()/.75f) + 1, 16));
        addAll(c);
    }

    /**
     * 根据初始容量和扩容因子实例化 HashSet，减少rehash频率，提升性能，原理与HashMap相同
     */
    public HashSet(int initialCapacity, float loadFactor) {
        map = new HashMap<>(initialCapacity, loadFactor);
    }

    /**
     * 同上
     */
    public HashSet(int initialCapacity) {
        map = new HashMap<>(initialCapacity);
    }

    HashSet(int initialCapacity, float loadFactor, boolean dummy) {
        map = new LinkedHashMap<>(initialCapacity, loadFactor);
    }

    /**
     * 返回迭代器，用于迭代
     * 下面所有的功能都是基于 HashMap 来实现的
     */
    public Iterator<E> iterator() {
        return map.keySet().iterator();
    }

    /**
     * 元素个数
     */
    public int size() {
        return map.size();
    }

    /**
     * 是否为空
     */
    public boolean isEmpty() {
        return map.isEmpty();
    }

    /**
     * 是否包含给定元素
     */
    public boolean contains(Object o) {
        return map.containsKey(o);
    }

    /**
     * 添加元素，如果 Set集合中未包含该元素，返回true
     */
    public boolean add(E e) {
        return map.put(e, PRESENT)==null;
    }

    /**
     * 删除元素，如果Set集合包含该元素，返回true
     */
    public boolean remove(Object o) {
        return map.remove(o)==PRESENT;
    }

    /**
     * 清除元素
     */
    public void clear() {
        map.clear();
    }

    /**
     * 浅克隆
     */
    @SuppressWarnings("unchecked")
    public Object clone() {
        try {
            HashSet<E> newSet = (HashSet<E>) super.clone();
            newSet.map = (HashMap<E, Object>) map.clone();
            return newSet;
        } catch (CloneNotSupportedException e) {
            throw new InternalError(e);
        }
    }
}
```
