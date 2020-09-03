## 简介

AbstractQueuedSynchronizer 是 Doug Lea 大师创作的用来构建锁或者其他同步组件的基础框架类。J.U.C 中许多锁和并发工具类的核心实现都依赖于 AQS，如：ReentrantLock、ReentrantReadWriteLock、Semaphore、CountDownLatch 等。

AQS 的源码中 方法很多，但主要做了三件事情：

1. 管理 同步状态；
2. 维护 同步队列；
3. 阻塞和唤醒 线程。

另外，从行为上来区分就是 获取锁 和 释放锁，从模式上来区分就是 独占锁 和 共享锁。

## 实现原理

AQS 内部维护了一个 FIFO 队列来管理锁。线程首先会尝试获取锁，如果失败，则将当前线程以及等待状态等信息包成一个 Node 节点放入同步队列阻塞起来，当持有锁的线程释放锁时，就会唤醒队列中的后继线程。

#### 获取锁的伪代码

```
while (不满足获取锁的条件) {
    把当前线程包装成节点插入同步队列
    if (需要阻塞当前线程)
        阻塞当前线程直至被唤醒
}
将当前线程从同步队列中移除
```

#### 释放锁的伪代码

```
修改同步状态
if (修改后的状态允许其他线程获取到锁)
    唤醒后继线程
```

## 源码解析

#### AQS 的核心数据结构 Node(内部类)

```java
/**
 * 当共享资源被某个线程占有，其他请求该资源的线程将会阻塞，从而进入同步队列。
 * AQS 中的同步队列通过链表实现，下面的内部类 Node 便是其实现的载体
 */
static final class Node {

    /* 用于标记一个节点在共享模式下等待 */
    static final Node SHARED = new Node();

    /* 用于标记一个节点在独占模式下等待 */
    static final Node EXCLUSIVE = null;

    /* 当前线程因为超时或者中断被取消。这是一个终结态，也就是状态到此为止 */
    static final int CANCELLED = 1;

    /**
     * 当前线程的后继线程被阻塞或者即将被阻塞，当前线程释放锁或者取消后需要唤醒后继线程。
     * 这个状态一般都是后继线程来设置前驱节点的
     */
    static final int SIGNAL = -1;

    /* 当前线程在condition队列中 */
    static final int CONDITION = -2;

    /**
     * 用于将唤醒后继线程传递下去，这个状态的引入是为了完善和增强共享锁的唤醒机制。
     * 在一个节点成为头节点之前，是不会跃迁为此状态的
     */
    static final int PROPAGATE = -3;

    /* 等待状态 */
    volatile int waitStatus;

    /* 前驱节点 */
    volatile Node prev;

    /* 后继节点 */
    volatile Node next;

    /* 节点对应的线程 */
    volatile Thread thread;

    /* 等待队列中的后继节点 */
    Node nextWaiter;

    /* 当前节点是否处于共享模式等待 */
    final boolean isShared() {
        return nextWaiter == SHARED;
    }

    /* 获取前驱节点，如果为空的话抛出空指针异常 */
    final Node predecessor() throws NullPointerException {
        Node p = prev;
        if (p == null) {
            throw new NullPointerException();
        } else {
            return p;
        }
    }

    Node() {
    }

    /* addWaiter会调用此构造函数 */
    Node(Thread thread, Node mode) {
        this.nextWaiter = mode;
        this.thread = thread;
    }

    /* Condition会用到此构造函数 */
    Node(Thread thread, int waitStatus) {
        this.waitStatus = waitStatus;
        this.thread = thread;
    }
}
```

#### 获取独占锁的实现

```java
/**
 * 首先尝试获取一次锁，如果成功，则返回；
 * 否则会把当前线程包装成Node插入到队列中，在队列中会检测是否为head的直接后继，并尝试获取锁,
 * 如果获取失败，则阻塞当前线程，直至被 "释放锁的线程" 唤醒或者被中断，随后再次尝试获取锁，如此反复
 */
public final void acquire(int arg) {
    if (!tryAcquire(arg) && acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
        selfInterrupt();
}

/**
 * 在队列中新增一个节点
 */
private Node addWaiter(Node mode) {
    Node node = new Node(Thread.currentThread(), mode);
    Node pred = tail;
    // 快速尝试
    if (pred != null) {
        node.prev = pred;
        // 通过CAS在队尾插入当前节点
        if (compareAndSetTail(pred, node)) {
            pred.next = node;
            return node;
        }
    }
    // 初始情况或者在快速尝试失败后插入节点
    enq(node);
    return node;
}

/**
 * 通过循环+CAS在队列中成功插入一个节点后返回
 */
private Node enq(final Node node) {
    for (;;) {
        Node t = tail;
        // 初始化head和tail
        if (t == null) {
            if (compareAndSetHead(new Node()))
                tail = head;
        } else {
            /*
             * AQS的精妙在于很多细节代码，比如需要用CAS往队尾里增加一个元素
             * 此处的else分支是先在CAS的if前设置node.prev = t，而不是在CAS成功之后再设置。
             * 一方面是基于CAS的双向链表插入目前没有完美的解决方案，另一方面这样子做的好处是：
             * 保证每时每刻tail.prev都不会是一个null值，否则如果node.prev = t
             * 放在下面if的里面，会导致一个瞬间tail.prev = null，这样会使得队列不完整
             */
            node.prev = t;
            // CAS设置tail为node，成功后把老的tail也就是t连接到node
            if (compareAndSetTail(t, node)) {
                t.next = node;
                return t;
            }
        }
    }
}

/**
 * 在队列中的节点通过此方法获取锁
 */
final boolean acquireQueued(final Node node, int arg) {
    boolean failed = true;
    try {
        boolean interrupted = false;
        for (;;) {
            final Node p = node.predecessor();
            /*
             * 检测当前节点的前驱节点是否为head，这是试获取锁的资格。
             * 如果是的话，则调用tryAcquire尝试获取锁，成功，则将head置为当前节点
             */
            if (p == head && tryAcquire(arg)) {
                setHead(node);
                p.next = null; // help GC
                failed = false;
                return interrupted;
            }
            /*
             * 如果未成功获取锁，则根据前驱节点判断是否要阻塞。
             * 如果阻塞过程中被中断，则置interrupted标志位为true。
             * shouldParkAfterFailedAcquire方法在前驱状态不为SIGNAL的情况下都会循环重试获取锁
             */
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                interrupted = true;
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}

/**
 * 根据前驱节点中的waitStatus来判断是否需要阻塞当前线程
 */
private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
    int ws = pred.waitStatus;
    if (ws == Node.SIGNAL)
        /*
         * 前驱节点设置为SIGNAL状态，在释放锁的时候会唤醒后继节点，
         * 所以后继节点（也就是当前节点）现在可以阻塞自己
         */
        return true;
    if (ws > 0) {
        /*
         * 前驱节点状态为取消，向前遍历，更新当前节点的前驱为往前第一个非取消节点。
         * 当前线程会之后会再次回到循环并尝试获取锁
         */
        do {
            node.prev = pred = pred.prev;
        } while (pred.waitStatus > 0);
        pred.next = node;
    } else {
         /**
          * 等待状态为0或者PROPAGATE(-3)，设置前驱的等待状态为SIGNAL,
          * 并且之后会回到循环再次重试获取锁
          */
        compareAndSetWaitStatus(pred, ws, Node.SIGNAL);
    }
    return false;
}


/**
 * 该方法实现某个node取消获取锁
 */
private void cancelAcquire(Node node) {

   if (node == null)
       return;

   node.thread = null;

   // 遍历并更新节点前驱，把node的prev指向前部第一个非取消节点
   Node pred = node.prev;
   while (pred.waitStatus > 0)
       node.prev = pred = pred.prev;

   // 记录pred节点的后继为predNext，后续CAS会用到
   Node predNext = pred.next;

   // 直接把当前节点的等待状态置为取消,后继节点即便也在cancel可以跨越node节点
   node.waitStatus = Node.CANCELLED;

   /*
    * 如果CAS将tail从node置为pred节点了
    * 则剩下要做的事情就是尝试用CAS将pred节点的next更新为null以彻底切断pred和node的联系。
    * 这样一来就断开了pred与pred的所有后继节点，这些节点由于变得不可达，最终会被回收掉。
    * 由于node没有后继节点，所以这种情况到这里整个cancel就算是处理完毕了。
    *
    * 这里的CAS更新pred的next即使失败了也没关系，说明有其它新入队线程或者其它取消线程更新掉了。
    */
   if (node == tail && compareAndSetTail(node, pred)) {
       compareAndSetNext(pred, predNext, null);
   } else {
       // 如果node还有后继节点，这种情况要做的事情是把pred和后继非取消节点拼起来
       int ws;
       if (pred != head &&
           ((ws = pred.waitStatus) == Node.SIGNAL ||
            (ws <= 0 && compareAndSetWaitStatus(pred, ws, Node.SIGNAL))) &&
           pred.thread != null) {
           Node next = node.next;
           /*
            * 如果node的后继节点next非取消状态的话，则用CAS尝试把pred的后继置为node的后继节点
            * 这里if条件为false或者CAS失败都没关系，这说明可能有多个线程在取消，总归会有一个能成功的
            */
           if (next != null && next.waitStatus <= 0)
               compareAndSetNext(pred, predNext, next);
       } else {
           /*
            * 这时说明pred == head或者pred状态取消或者pred.thread == null
            * 在这些情况下为了保证队列的活跃性，需要去唤醒一次后继线程。
            * 举例来说pred == head完全有可能实际上目前已经没有线程持有锁了，
            * 自然就不会有释放锁唤醒后继的动作。如果不唤醒后继，队列就挂掉了。
            *
            * 这种情况下看似由于没有更新pred的next的操作，队列中可能会留有一大把的取消节点。
            * 实际上不要紧，因为后继线程唤醒之后会走一次试获取锁的过程，
            * 失败的话会走到shouldParkAfterFailedAcquire的逻辑。
            * 那里面的if中有处理前驱节点如果为取消则维护pred/next,踢掉这些取消节点的逻辑。
            */
           unparkSuccessor(node);
       }

       /*
        * 取消节点的next之所以设置为自己本身而不是null,
        * 是为了方便AQS中Condition部分的isOnSyncQueue方法,
        * 判断一个原先属于条件队列的节点是否转移到了同步队列。
        *
        * 因为同步队列中会用到节点的next域，取消节点的next也有值的话，
        * 可以断言next域有值的节点一定在同步队列上。
        *
        * 在GC层面，和设置为null具有相同的效果
        */
       node.next = node;
   }
}

/**
 * 唤醒后继线程
 */
private void unparkSuccessor(Node node) {
    int ws = node.waitStatus;
    // 尝试将node的等待状态置为0,这样的话,后继争用线程可以有机会再尝试获取一次锁
    if (ws < 0)
        compareAndSetWaitStatus(node, ws, 0);

    Node s = node.next;
    /*
     * 这里的逻辑就是如果node.next存在并且状态不为取消，则直接唤醒s即可
     * 否则需要从tail开始向前找到node之后最近的非取消节点。
     *
     * 这里为什么要从tail开始向前查找也是值得琢磨的:
     * 如果读到s == null，不代表node就为tail，参考addWaiter以及enq函数中的我的注释。
     * 不妨考虑到如下场景：
     * 1. node某时刻为tail
     * 2. 有新线程通过addWaiter中的if分支或者enq方法添加自己
     * 3. compareAndSetTail成功
     * 4. 此时这里的Node s = node.next读出来s == null，但事实上node已经不是tail，它有后继了!
     */
    if (s == null || s.waitStatus > 0) {
        s = null;
        for (Node t = tail; t != null && t != node; t = t.prev)
            if (t.waitStatus <= 0)
                s = t;
    }
    if (s != null)
        LockSupport.unpark(s.thread);
}
```

#### 释放独占锁的实现

释放一个独占锁，首先会调用 tryRelease 方法，在完全释放掉独占锁后，其后继线程是可以获取到独占锁的，因此释放线程需要做的事情是：唤醒一个队列中的后继线程，让它去尝试获取独占锁。

```java
public final boolean release(int arg) {
    if (tryRelease(arg)) {
        /*
         * 此时的head节点可能有3种情况:
         * 1. null (AQS的head延迟初始化+无竞争的情况)
         * 2. 当前线程在获取锁时new出来的节点通过setHead设置的
         * 3. 由于通过tryRelease已经完全释放掉了独占锁，有新的节点在acquireQueued中获取到了独占锁，并设置了head

         * 第三种情况可以再分为两种情况：
         *     情况一：
         *     		时刻1：线程A通过acquireQueued，持锁成功，set了head
         *          时刻2：线程B通过tryAcquire试图获取独占锁失败失败，进入acquiredQueued
         *          时刻3：线程A通过tryRelease释放了独占锁
         *          时刻4：线程B通过acquireQueued中的tryAcquire获取到了独占锁并调用setHead
         *          时刻5：线程A读到了此时的head实际上是线程B对应的node
         *     情况二：
         *     		时刻1：线程A通过tryAcquire直接持锁成功，head为null
         *          时刻2：线程B通过tryAcquire试图获取独占锁失败失败，入队过程中初始化了head，进入acquiredQueued
         *          时刻3：线程A通过tryRelease释放了独占锁，此时线程B还未开始tryAcquire
         *          时刻4：线程A读到了此时的head实际上是线程B初始化出来的傀儡head
         */
        Node h = head;
        // head节点状态不会是CANCELLED，所以这里h.waitStatus != 0相当于h.waitStatus < 0
        if (h != null && h.waitStatus != 0)
            // 唤醒后继线程，此函数在acquire中已经分析过，不再列举说明
            unparkSuccessor(h);
        return true;
    }
    return false;
}
```

整个 release 做的事情就是：

1. 调用 tryRelease；
2. 如果 tryRelease 返回 true 也就是独占锁被完全释放，唤醒后继线程。

#### 获取共享锁的实现

共享锁允许多个线程持有，如果要使用 AQS 中的共享锁，在实现 tryAcquireShared 方法 时需要注意，返回负数表示获取失败，返回 0 表示成功，但是后继争用线程不会成功，返回正数表示获取成功，并且后继争用线程也可能成功。

```java
public final void acquireShared(int arg) {
    if (tryAcquireShared(arg) < 0)
        doAcquireShared(arg);
}

private void doAcquireShared(int arg) {
    final Node node = addWaiter(Node.SHARED);
    boolean failed = true;
    try {
        boolean interrupted = false;
        for (;;) {
            final Node p = node.predecessor();
            if (p == head) {
                int r = tryAcquireShared(arg);
                // 一旦共享获取成功，设置新的头结点，并且唤醒后继线程
                if (r >= 0) {
                    setHeadAndPropagate(node, r);
                    p.next = null; // help GC
                    if (interrupted)
                        selfInterrupt();
                    failed = false;
                    return;
                }
            }
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                interrupted = true;
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}

/**
 * 这个函数做的事情有两件:
 * 1. 在获取共享锁成功后，设置head节点
 * 2. 根据调用tryAcquireShared返回的状态以及节点本身的等待状态来判断是否需要唤醒后继线程
 */
private void setHeadAndPropagate(Node node, int propagate) {
    // 把当前的head封闭在方法栈上，用以下面的条件检查
    Node h = head;
    setHead(node);
    /*
     * propagate是tryAcquireShared的返回值，这是决定是否传播唤醒的依据之一。
     * h.waitStatus为SIGNAL或者PROPAGATE时也根据node的下一个节点共享来决定是否传播唤醒，
     * 这里为什么不能只用propagate > 0来决定是否可以传播在本文下面的思考问题中有相关讲述
     */
    if (propagate > 0 || h == null || h.waitStatus < 0 ||
        (h = head) == null || h.waitStatus < 0) {
        Node s = node.next;
        if (s == null || s.isShared())
            doReleaseShared();
    }
}

/**
 * 这是共享锁中的核心唤醒函数，主要做的事情就是唤醒下一个线程或者设置传播状态。
 * 后继线程被唤醒后，会尝试获取共享锁，如果成功之后，则又会调用setHeadAndPropagate,将唤醒传播下去。
 * 这个函数的作用是保障在acquire和release存在竞争的情况下，保证队列中处于等待状态的节点能够有办法被唤醒。
 */
private void doReleaseShared() {
    /*
     * 以下的循环做的事情就是，在队列存在后继线程的情况下，唤醒后继线程；
     * 或者由于多线程同时释放共享锁由于处在中间过程，读到head节点等待状态为0的情况下，
     * 虽然不能unparkSuccessor，但为了保证唤醒能够正确稳固传递下去，设置节点状态为PROPAGATE。
     * 这样的话获取锁的线程在执行setHeadAndPropagate时可以读到PROPAGATE，从而由获取锁的线程去释放后继等待线程
     */
    for (;;) {
        Node h = head;
        // 如果队列中存在后继线程。
        if (h != null && h != tail) {
            int ws = h.waitStatus;
            if (ws == Node.SIGNAL) {
                if (!compareAndSetWaitStatus(h, Node.SIGNAL, 0))
                    continue;
                unparkSuccessor(h);
            }
            // 如果h节点的状态为0，需要设置为PROPAGATE用以保证唤醒的传播。
            else if (ws == 0 &&
                     !compareAndSetWaitStatus(h, 0, Node.PROPAGATE))
                continue;
        }
        // 检查h是否仍然是head，如果不是的话需要再进行循环。
        if (h == head)
            break;
    }
}
```

#### 释放共享锁的实现

共享锁的获取和释放都会涉及到 doReleaseShared 方法，也就是后继线程的唤醒。

```java
public final boolean releaseShared(int arg) {
    if (tryReleaseShared(arg)) {
        // doReleaseShared的实现上面获取共享锁已经介绍
        doReleaseShared();
        return true;
    }
    return false;
}
```
