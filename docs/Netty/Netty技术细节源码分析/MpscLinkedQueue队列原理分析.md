该文所涉及的 netty 源码版本为 4.1.6。

## MpscLinkedQueue 是什么

在 Netty 的核心中的核心成员 NioEventLoop 中，其中任务队列的实现 taskQueue 便是 MpscLinkedQueue。MpscLinkedQueue 是 Netty 所实现的一个基于多生产者单消费者的无锁队列，针对 NioEventLoop 中任务队列的特点，其单消费者的场景在一开始就避免了从队列中取数据时加锁的必要，而其最精妙的地方便是在多生产者并发从队列中添加数据的时候也没有加锁，达到 Netty 所期望的高性能实现。这是如何实现的？

## MpscLinkedQueue 无锁并发线程安全写入原理

### MpscLinkedQueue 对于尾结点的维护

首先，MpscLinkedQueue 继承自 AtomicReference，也就是说 MpscLinkedQueue 通过继承自 AtomicReference 的方式，显式地维护了一个提供原子读写能力的变量 value。而在 MpscLinkedQueue 中，这个 value 是其内部维护的队列的尾结点。

### MpscLinkedQueue 对于头结点的维护

而后，来看 MpscLinkedQueue 的构造方法。

```java
MpscLinkedQueue() {
    MpscLinkedQueueNode<E> tombstone = new DefaultNode<E>(null);
    headRef = new FullyPaddedReference<MpscLinkedQueueNode<E>>();
    headRef.set(tombstone);
    setTail(tombstone);
}
```

在 MpscLinkedQueue 中，维护着 headRef 头结点字段，其队列内部节点的实现是一个 MpscLinkedQueueNode。MpscLinkedQueueNode 是一个除了存放具体队列元素外只有 next 字段的节点，也就是说，MpscLinkedQueue 的队列是单向的。在构造方法的最后，通过 setTail()方法的，将 MpscLinkedQueue 的尾结点字段 value 也设置为头结点。MpscLinkedQueue 的头结点字段 headRef 的存在可以方便后续直接从头结点开始的队列操作，消费者可以简单判断头尾节点是否相等来确认队列中是否有元素可以消费。

### MpscLinkedQueue 如何做到线程安全的无锁加入

```java
@Override
@SuppressWarnings("unchecked")
public boolean offer(E value) {
    if (value == null) {
        throw new NullPointerException("value");
    }

    final MpscLinkedQueueNode<E> newTail;
    if (value instanceof MpscLinkedQueueNode) {
        newTail = (MpscLinkedQueueNode<E>) value;
        newTail.setNext(null);
    } else {
        newTail = new DefaultNode<E>(value);
    }

    MpscLinkedQueueNode<E> oldTail = replaceTail(newTail);
    oldTail.setNext(newTail);
    return true;
}

private MpscLinkedQueueNode<E> replaceTail(MpscLinkedQueueNode<E> node) {
    return getAndSet(node);
}
```

MpscLinkedQueue 的 offer()方法很简短，但是恰恰就是整个添加队列元素加入的流程，当元素被加入的时候，首先判断加入的元素是否是 MpscLinkedQueueNode，如果不是则进行封装。之后便是整个操作的重点：

- 通过 replaceTail()方法，将当前被加入的节点通过 AtomicReference 所提供的 getAndSet()方法将其设为队列的尾结点，并返回先前的尾结点。这次操作由 UNSAFE 的 CAS 来保证操作的原子性。
- 之后将之前的尾结点的 next 指向新加入的节点，本次加入宣告结束。
  整个操作就到此结束，这里可以看出，MpscLinkedQueue 利用了 AtomicReference 底层 UNSAFE 的能力，通过 CAS 确保新设置进入 value 的节点必定能够和原先的节点达成一个且唯一的联系，那么只需要自顶向下不断通过将这个联系变成引用，那么一条队列便形成了。由于其实现是链表而不是数组，也就没有涉及到资源的竞争，在不加锁的前提下其队列顺序可能不会严格按照加入顺序，但这在当前场景下并不是问题。在这个前提，高并发的插入场景下，每个新进入的新节点都将获取原尾位置 value 上的节点，而自身将会被设置为其后驱节点重新放到尾结点位置上，CAS 在不加锁的前提下保证了前后节点对应关系的唯一性，完成了并发条件下不加锁的线程安全写入。

### MpscLinkedQueue 不支持 remove()

在 MpscLinkedQueue 中，是不支持 remove()的方法去从队列中移除任意一个元素的。原因很简单，消费者和生产者是无锁的，消费者可以通过比较队首和队尾元素是否一致来保证线程安全地从队首取数据，但是 remove()从队列中任意位置修改数据是线程不安全的，主要体现在移除队尾元素可能会导致正在加入的新元素被丢弃。

## MpscLinkedQueue 另外的实现细节

- MpscLinkedQueue 中的头节点被通过 FullyPaddedReference 封装。其内部前后分别填充 56 字节和 64 字节来进行填充以避免伪共享导致的性能损耗，使得其头结点可以高效被访问。关于伪共享的相关知识可以通过搜索引擎进行查询。
- MpscLinkedQueue 在消费者消费数据后，当将下一个节点设置为头结点的时候，并不是直接进行赋值，而是通过 UNSAFE 来根据偏移量赋值，这样做将略微提高性能，主要是内存屏障 storestrore 和 loadstrore 之间的性能差异。
