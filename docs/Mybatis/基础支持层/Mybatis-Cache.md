# mybatis 缓存

- Author: [HuiFer](https://github.com/huifer)
- Description: 该文介绍 mybatis Cache 源码
- 源码阅读工程: [SourceHot-Mybatis](https://github.com/SourceHot/mybatis-read.git)

- `org.apache.ibatis.cache.Cache`

```java
public interface Cache {

    String getId();

    /**
     * 放入数据
     */
    void putObject(Object key, Object value);

    /**
     * 获取数据
     */
    Object getObject(Object key);

    /**
     * 移除数据
     */
    Object removeObject(Object key);

    /**
     * 清空数据
     */
    void clear();

    /**
     * 有多少缓存数据
     */
    int getSize();

    /**
     * 重入锁
     * @return A ReadWriteLock
     */
    default ReadWriteLock getReadWriteLock() {
        return null;
    }

}
```

- BlockingCache: 阻塞的缓存
- FifoCache: 按对象进入缓存的顺序来移除它们。
- LruCache: 最近最少使用的：移除最长时间不被使用的对象。
- SoftCache: 软引用：移除基于垃圾回收器状态和软引用规则的对象
- WeakCache: 弱引用：更积极地移除基于垃圾收集器状态和弱引用规则的对象。

## BlockingCache

- BlockingCache 内部使用了`ReentrantLock`来进行加锁开锁这个操作.在插入缓存时上锁,插入缓存后释放.请求缓存值得时候同理

```java
public class BlockingCache implements Cache {

    private final Cache delegate;
    /**
     * 线程安全的map
     */
    private final ConcurrentHashMap<Object, ReentrantLock> locks;
    private long timeout;

    public BlockingCache(Cache delegate) {
        this.delegate = delegate;
        this.locks = new ConcurrentHashMap<>();
    }

    @Override
    public String getId() {
        return delegate.getId();
    }

    @Override
    public int getSize() {
        return delegate.getSize();
    }

    @Override
    public void putObject(Object key, Object value) {
        try {
            delegate.putObject(key, value);
        } finally {
            releaseLock(key);
        }
    }

    @Override
    public Object getObject(Object key) {
        acquireLock(key);
        Object value = delegate.getObject(key);
        if (value != null) {
            // 释放锁
            releaseLock(key);
        }
        return value;
    }

    @Override
    public Object removeObject(Object key) {
        // despite of its name, this method is called only to release locks
        releaseLock(key);
        return null;
    }

    @Override
    public void clear() {
        delegate.clear();
    }

    private ReentrantLock getLockForKey(Object key) {
        return locks.computeIfAbsent(key, k -> new ReentrantLock());
    }

    /**
     * 请求锁
     * @param key
     */
    private void acquireLock(Object key) {
        Lock lock = getLockForKey(key);
        if (timeout > 0) {
            try {
                // 上锁
                boolean acquired = lock.tryLock(timeout, TimeUnit.MILLISECONDS);
                if (!acquired) {
                    throw new CacheException("Couldn't get a lock in " + timeout + " for the key " + key + " at the cache " + delegate.getId());
                }
            } catch (InterruptedException e) {
                throw new CacheException("Got interrupted while trying to acquire lock for key " + key, e);
            }
        } else {
            lock.lock();
        }
    }

    /**
     * 释放锁
     * @param key
     */
    private void releaseLock(Object key) {
        ReentrantLock lock = locks.get(key);
        if (lock.isHeldByCurrentThread()) {
            lock.unlock();
        }
    }

    public long getTimeout() {
        return timeout;
    }

    public void setTimeout(long timeout) {
        this.timeout = timeout;
    }
}
```

## FifoCache

- 存储结构是`java.util.LinkedList`

```java
public class FifoCache implements Cache {

    private final Cache delegate;
    /**
     * 队列
     */
    private final Deque<Object> keyList;
    private int size;

    public FifoCache(Cache delegate) {
        this.delegate = delegate;
        this.keyList = new LinkedList<>();
        this.size = 1024;
    }

    @Override
    public String getId() {
        return delegate.getId();
    }

    @Override
    public int getSize() {
        return delegate.getSize();
    }

    public void setSize(int size) {
        this.size = size;
    }

    @Override
    public void putObject(Object key, Object value) {
        cycleKeyList(key);
        delegate.putObject(key, value);
    }

    @Override
    public Object getObject(Object key) {
        return delegate.getObject(key);
    }

    @Override
    public Object removeObject(Object key) {
        return delegate.removeObject(key);
    }

    @Override
    public void clear() {
        delegate.clear();
        keyList.clear();
    }

    /**
     * 添加 key 删除最开始的一个
     *
     * @param key
     */
    private void cycleKeyList(Object key) {
        keyList.addLast(key);
        if (keyList.size() > size) {
            Object oldestKey = keyList.removeFirst();
            delegate.removeObject(oldestKey);
        }
    }

}
```

## LruCache

- 存储结构是`java.util.LinkedHashMap`

```java
/**
 * Lru (least recently used) cache decorator.
 * LRU  緩存策略 最近最少使用的：移除最长时间不被使用的对象。
 *
 * @author Clinton Begin
 */
public class LruCache implements Cache {

    private final Cache delegate;
    /**
     * {@link  LinkedHashMap}
     */
    private Map<Object, Object> keyMap;
    private Object eldestKey;

    public LruCache(Cache delegate) {
        this.delegate = delegate;
        setSize(1024);
    }

    @Override
    public String getId() {
        return delegate.getId();
    }

    @Override
    public int getSize() {
        return delegate.getSize();
    }

    /**
     * 设置大小
     *
     * @param size
     */
    public void setSize(final int size) {
        keyMap = new LinkedHashMap<Object, Object>(size, .75F, true) {
            private static final long serialVersionUID = 4267176411845948333L;

            @Override
            protected boolean removeEldestEntry(Map.Entry<Object, Object> eldest) {
                // 数量超出预设值 执行
                boolean tooBig = size() > size;
                if (tooBig) {
//                    获取被移除的key
                    eldestKey = eldest.getKey();
                }
                return tooBig;
            }
        };
    }

    @Override
    public void putObject(Object key, Object value) {
        delegate.putObject(key, value);
        cycleKeyList(key);
    }

    @Override
    public Object getObject(Object key) {
        keyMap.get(key); //touch
        return delegate.getObject(key);
    }

    @Override
    public Object removeObject(Object key) {
        return delegate.removeObject(key);
    }

    @Override
    public void clear() {
        delegate.clear();
        keyMap.clear();
    }

    /**
     * 删除最早的一个key
     * @param key
     */
    private void cycleKeyList(Object key) {
        keyMap.put(key, key);
        if (eldestKey != null) {
            delegate.removeObject(eldestKey);
            eldestKey = null;
        }
    }

}
```
