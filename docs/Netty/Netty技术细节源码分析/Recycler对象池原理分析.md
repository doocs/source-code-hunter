该文所涉及的 netty 源码版本为 4.1.6。

## Netty 的对象池 Recycler 是什么

Recycler 是 Netty 中基于 ThreadLocal 的轻量化的对象池实现。既然是基于 ThreadLocal，那么就可以将其理解为当前线程在通过对象池 Recycler 得到一个对象之后，在回收对象的时候，不需要将其销毁，而是放回到该线程的对象池中即可，在该线程下一次用到该对象的时候，不需要重新申请空间创建，而是直接重新从对象池中获取。

## Recycler 在 netty 中被如何使用

Recycler 对象池在 netty 中最重要的使用，就在于 netty 的池化 ByteBuf 的场景下。首先，何为池化？以 PooledDirectByteBuf 举例，每一个 PooledDirectByteBuf 在应用线程中使用完毕之后，并不会被释放，而是等待被重新利用，类比线程池每个线程在执行完毕之后不会被立即释放，而是等待下一次执行的时候被重新利用。所谓的对象池也是如此，池化减少了 ByteBuf 创建和销毁的开销，也是 netty 高性能表现的基石之一。

```java
private static final Recycler<PooledDirectByteBuf> RECYCLER = new Recycler<PooledDirectByteBuf>() {
    @Override
    protected PooledDirectByteBuf newObject(Handle<PooledDirectByteBuf> handle) {
        return new PooledDirectByteBuf(handle, 0);
    }
};

static PooledDirectByteBuf newInstance(int maxCapacity) {
    PooledDirectByteBuf buf = RECYCLER.get();
    buf.reuse(maxCapacity);
    return buf;
}
```

PooledDirectByteBuf 在其类加载的过程中，初始化了一个静态的 RECYCLER 成员，通过重写其 newObject()方法达到使 Recycler 可以初始化一个 PooledDirectByteBuf。而在接下来的使用中，只需要通过静态方法 newInstance()就可以从 RECYCLER 对象池的 get()方法获取一个新的 PooledDirectByteBuf 对象返回，而重写的方法 newObject()中的入参 Handler 则提供了 recycle()方法给出了对象重新放入池中回收的能力，这里的具体实现在下文展开。因此，newInstance()方法和 recycle()方法就提供了对象池出池和入池的能力，也通过此，PooledDirectByteBuf 达到了池化的目标。

## Recycler 的实现原理分析

**Recycler 的实现原理很抽象，可以先直接阅读文末的例子再阅读这部分内容。**  
Recycler 中，最核心的是两个通过 ThreadLocal 作为本地线程私有的两个成员，而其实现原理只需要围绕这两个成员分析，就可以对对象池的设计有直接的理解和认识。

- 第一个成员是在 Recycler 被定义的 Stack 成员对象。

```java
private final FastThreadLocal<Stack<T>> threadLocal = new FastThreadLocal<Stack<T>>() {
    @Override
    protected Stack<T> initialValue() {
        return new Stack<T>(Recycler.this, Thread.currentThread(), maxCapacityPerThread, maxSharedCapacityFactor,
                ratioMask, maxDelayedQueuesPerThread);
    }
};
```

顾名思义，这个 Stack 主体是一个堆栈，但是其还维护着一个链表，而链表中的每一个节点都是一个队列。

```java
private DefaultHandle<?>[] elements;
private WeakOrderQueue cursor, prev;
```

上述的 elements 数组便是存放当前线程被回收的对象，当当前线程从该线程的 Recycler 对象池尝试获取新的对象的时候，首先就会从当前 Stack 的这个数组中尝试获取已经在先前被创建并且在当前线程被回收的对象，因为当对象池的对象在当前线程被调用 recycle()的时候，是会直接放到 elements 数组中等待下一次的利用。 那么问题来了，如果从该线程中被申请的这个对象是在另外一个线程中被调用 recycle()方法回收呢？那么该对象就会处于链表中的队列中，当堆栈数组中的对象不存在的时候，将会尝试把链表队列中的对象转移到数组中供当前线程获取。那么其他线程是如何把被回收的对象放到这些链表中的队列的呢？接下来就是另一个成员的使命了。

- 第二个成员是在 Recycler 中也是通过 ThreadLocal 所实现的一个线程本地变量，DELAYED_RECYCLED ，是一个 Stack 和队列的映射 Map。

```java
private static final FastThreadLocal<Map<Stack<?>, WeakOrderQueue>> DELAYED_RECYCLED =
        new FastThreadLocal<Map<Stack<?>, WeakOrderQueue>>() {
    @Override
    protected Map<Stack<?>, WeakOrderQueue> initialValue() {
        return new WeakHashMap<Stack<?>, WeakOrderQueue>();
    }
};
```

第二个成员 DELAYED_RECYCLED 可以通过上文的 Stack 获取一个队列。  
在前一个成员的解释中提到，当别的线程调用另一个线程的对象池的 recycle()方法进行回收的时候，并不会直接落到持有对象池的线程的 Stack 数组当中，当然原因也很简单，在并发情况下这样的操作显然是线程不安全的，而加锁也会带来性能的开销。因此，netty 在 Recycler 对象池中通过更巧妙的方式解决这一问题。  
在前面提到，除了数组，Stack 还持有了一系列队列的组成的链表，这些链表中的每一个节点都是一个队列，这些队列又存放着别的线程所回收到当前线程对象池的对象。那么，这些队列就是各个线程针对持有对象池的专属回收队列，说起来很拗口，看下面的代码。

```java
private void pushLater(DefaultHandle<?> item, Thread thread) {
    // we don't want to have a ref to the queue as the value in our weak map
    // so we null it out; to ensure there are no races with restoring it later
    // we impose a memory ordering here (no-op on x86)
    Map<Stack<?>, WeakOrderQueue> delayedRecycled = DELAYED_RECYCLED.get();
    WeakOrderQueue queue = delayedRecycled.get(this);
    if (queue == null) {
        if (delayedRecycled.size() >= maxDelayedQueues) {
            // Add a dummy queue so we know we should drop the object
            delayedRecycled.put(this, WeakOrderQueue.DUMMY);
            return;
        }
        // Check if we already reached the maximum number of delayed queues and if we can allocate at all.
        if ((queue = WeakOrderQueue.allocate(this, thread)) == null) {
            // drop object
            return;
        }
        delayedRecycled.put(this, queue);
    } else if (queue == WeakOrderQueue.DUMMY) {
        // drop object
        return;
    }

    queue.add(item);
}

private WeakOrderQueue(Stack<?> stack, Thread thread) {
    head = tail = new Link();
    owner = new WeakReference<Thread>(thread);
    synchronized (stack) {
        next = stack.head;
        stack.head = this;
    }

    // Its important that we not store the Stack itself in the WeakOrderQueue as the Stack also is used in
    // the WeakHashMap as key. So just store the enclosed AtomicInteger which should allow to have the
    // Stack itself GCed.
    availableSharedCapacity = stack.availableSharedCapacity;
}
```

pushLater()方法发生在当一个对象被回收的时候，当当前线程不是这个对象所申请的时候的线程时，将会通过该对象的 Stack 直接去通过 DELAYED_RECYCLED 映射到一条队列上，如果没有则创建并建立映射，再把该对象放入到该队列中，以上操作结束后该次回收即宣告结束

```java
private WeakOrderQueue(Stack<?> stack, Thread thread) {
    head = tail = new Link();
    owner = new WeakReference<Thread>(thread);
    synchronized (stack) {
        next = stack.head;
        stack.head = this;
    }

    // Its important that we not store the Stack itself in the WeakOrderQueue as the Stack also is used in
    // the WeakHashMap as key. So just store the enclosed AtomicInteger which should allow to have the
    // Stack itself GCed.
    availableSharedCapacity = stack.availableSharedCapacity;
}
```

如果在操作中，队列是被创建的，会把该队列放置在 Stack 中的链表里的头结点，保证创建该对象的线程在数组空了之后能够通过链表访问到该队列并将该队列中的回收对象重新放到数组中等待被下次重新利用，队列交给 A 线程的链表是唯一的阻塞操作。在这里通过一次阻塞操作，避免后续都不存在资源的竞争问题。

## 举一个例子来解释对象池的原理

_A 线程申请，A 线程回收的场景。_

- 显然，当对象的申请与回收是在一个线程中时，直接把对象放入到 A 线程的对象池中即可，不存在资源的竞争，简单轻松。

_A 线程申请，B 线程回收的场景。_

- 首先，当 A 线程通过其对象池申请了一个对象后，在 B 线程调用 recycle()方法回收该对象。显然，该对象是应该回收到 A 线程私有的对象池当中的，不然，该对象池也失去了其意义。
- 那么 B 线程中，并不会直接将该对象放入到 A 线程的对象池中，如果这样操作在多线程场景下存在资源的竞争，只有增加性能的开销，才能保证并发情况下的线程安全，显然不是 netty 想要看到的。
- 那么 B 线程会专门申请一个针对 A 线程回收的专属队列，在首次创建的时候会将该队列放入到 A 线程对象池的链表首节点（这里是唯一存在的资源竞争场景，需要加锁），并将被回收的对象放入到该专属队列中，宣告回收结束。
- 在 A 线程的对象池数组耗尽之后，将会尝试把各个别的线程针对 A 线程的专属队列里的对象重新放入到对象池数组中，以便下次继续使用。
