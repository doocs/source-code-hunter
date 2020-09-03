Semaphore 信号量，可用于控制一定时间内，并发执行的线程数，基于 AQS 实现。可应用于网关限流、资源限制 (如 最大可发起连接数)。由于 release() 释放许可时，未对释放许可数做限制，所以可以通过该方法增加总的许可数量。

**获取许可** 支持公平和非公平模式，默认非公平模式。公平模式无论是否有许可，都会先判断是否有线程在排队，如果有线程排队，则进入排队，否则尝试获取许可；非公平模式无论许可是否充足，直接尝试获取许可。

不多废话，下面直接看源码。

#### 核心内部类 Sync

```java
abstract static class Sync extends AbstractQueuedSynchronizer {

    private static final long serialVersionUID = 1192457210091910933L;

    /* 赋值state为总许可数 */
    Sync(int permits) {
        setState(permits);
    }

    /* 剩余许可数 */
    final int getPermits() {
        return getState();
    }

    /* 自旋 + CAS非公平获取 */
    final int nonfairTryAcquireShared(int acquires) {
        for (;;) {
            // 剩余可用许可数
            int available = getState();
            // 本次获取许可后，剩余许可
            int remaining = available - acquires;
            // 如果获取后，剩余许可大于0，则CAS更新剩余许可，否则获取失败失败
            if (remaining < 0 ||
                compareAndSetState(available, remaining))
                return remaining;
        }
    }

    /**
     * 自旋 + CAS 释放许可
     * 由于未对释放许可数做限制，所以可以通过release动态增加许可数量
     */
    protected final boolean tryReleaseShared(int releases) {
        for (;;) {
            // 当前剩余许可
            int current = getState();
            // 许可更新值
            int next = current + releases;
            // 如果许可更新值为负数，说明许可数量溢出，抛出错误
            if (next < current) // overflow
                throw new Error("Maximum permit count exceeded");
            // CAS更新许可数量
            if (compareAndSetState(current, next))
                return true;
        }
    }

    /* 自旋 + CAS 减少许可数量 */
    final void reducePermits(int reductions) {
        for (;;) {
            // 当前剩余许可
            int current = getState();
            // 更新值
            int next = current - reductions;
           	// 较少许可数错误，抛出异常
            if (next > current) // underflow
                throw new Error("Permit count underflow");
            // CAS更新许可数
            if (compareAndSetState(current, next))
                return;
        }
    }

    /* 丢弃所有许可 */
    final int drainPermits() {
        for (;;) {
            int current = getState();
            if (current == 0 || compareAndSetState(current, 0))
                return current;
        }
    }
}

/**
 * 非公平模式
 */
static final class NonfairSync extends Sync {
    private static final long serialVersionUID = -2694183684443567898L;

    NonfairSync(int permits) {
        super(permits);
    }

    protected int tryAcquireShared(int acquires) {
        return nonfairTryAcquireShared(acquires);
    }
}

/**
 * 公平模式
 */
static final class FairSync extends Sync {
    private static final long serialVersionUID = 2014338818796000944L;

    FairSync(int permits) {
        super(permits);
    }

    /**
     * 公平模式获取许可
     * 公平模式不论许可是否充足，都会判断同步队列中是否有线程在等地，如果有，获取失败，排队阻塞
     */
    protected int tryAcquireShared(int acquires) {
        for (;;) {
            // 如果有线程在排队，立即返回
            if (hasQueuedPredecessors())
                return -1;
            // 自旋 + cas获取许可
            int available = getState();
            int remaining = available - acquires;
            if (remaining < 0 ||
                compareAndSetState(available, remaining))
                return remaining;
        }
    }
}
```

#### 主要 API

```java
public class Semaphore implements java.io.Serializable {

    private static final long serialVersionUID = -3222578661600680210L;

    /** All mechanics via AbstractQueuedSynchronizer subclass */
    private final Sync sync;

    /**
     * 根据给定的 总许可数permits，创建 Semaphore
     */
    public Semaphore(int permits) {
        sync = new NonfairSync(permits);
    }

    /**
     * fair为true表示使用公平锁模式，false使用非公平锁
     */
    public Semaphore(int permits, boolean fair) {
        sync = fair ? new FairSync(permits) : new NonfairSync(permits);
    }

    // --------------------- 获取许可 --------------------

    /* 获取指定数量的许可	*/
    public void acquire(int permits) throws InterruptedException {
        if (permits < 0) throw new IllegalArgumentException();
        sync.acquireSharedInterruptibly(permits);
    }

    /* 获取一个许可	*/
    public void acquire() throws InterruptedException {
        sync.acquireSharedInterruptibly(1);
    }

    public final void acquireSharedInterruptibly(int arg)
        throws InterruptedException {
        if (Thread.interrupted())
            throw new InterruptedException();
        if (tryAcquireShared(arg) < 0) // 获取许可，剩余许可>=0，则获取许可成功，<0获取许可失败，进入排队
            doAcquireSharedInterruptibly(arg);
    }

    protected int tryAcquireShared(int acquires) {
        return nonfairTryAcquireShared(acquires);
    }

    /**
     * @return 剩余许可数量。非负数，获取许可成功，负数，获取许可失败
     */
    final int nonfairTryAcquireShared(int acquires) {
        for (;;) {
            int available = getState();
            int remaining = available - acquires;
            if (remaining < 0 ||
                compareAndSetState(available, remaining))
                return remaining;
        }
    }

    /**
     * 获取许可失败，当前线程进入同步队列，排队阻塞
     */
    private void doAcquireSharedInterruptibly(int arg)
        throws InterruptedException {
        // 创建同步队列节点，并入队
        final Node node = addWaiter(Node.SHARED);
        boolean failed = true;
        try {
            for (;;) {
                // 如果当前节点是第二个节点，尝试获取锁
                final Node p = node.predecessor();
                if (p == head) {
                    int r = tryAcquireShared(arg);
                    if (r >= 0) {
                        setHeadAndPropagate(node, r);
                        p.next = null; // help GC
                        failed = false;
                        return;
                    }
                }
                // 阻塞当前线程
                if (shouldParkAfterFailedAcquire(p, node) &&
                    parkAndCheckInterrupt())
                    throw new InterruptedException();
            }
        } finally {
            if (failed)
                cancelAcquire(node);
        }
    }

    // --------------------- 释放归还许可 -------------------------

    /* 释放指定数量的许可 */
    public void release(int permits) {
        if (permits < 0) throw new IllegalArgumentException();
        sync.releaseShared(permits);
    }

    /* 释放一个许可 */
    public void release() {
        sync.releaseShared(1);
    }

    public final boolean releaseShared(int arg) {
        // 归还许可成功
        if (tryReleaseShared(arg)) {
            doReleaseShared();
            return true;
        }
        return false;
    }

    /**
     * 释放许可
     * 由于未对释放许可数做限制，所以可以通过release动态增加许可数量
     */
    protected final boolean tryReleaseShared(int releases) {
        for (;;) {
            int current = getState();
            int next = current + releases;
            if (next < current) // overflow
                throw new Error("Maximum permit count exceeded");
            if (compareAndSetState(current, next))
                return true;
        }
    }

    private void doReleaseShared() {
        // 自旋，唤醒等待的第一个线程(其他线程将由第一个线程向后传递唤醒)
        for (;;) {
            Node h = head;
            if (h != null && h != tail) {
                int ws = h.waitStatus;
                if (ws == Node.SIGNAL) {
                    if (!compareAndSetWaitStatus(h, Node.SIGNAL, 0))
                        continue;            // loop to recheck cases
                    // 唤醒第一个等待线程
                    unparkSuccessor(h);
                }
                else if (ws == 0 &&
                         !compareAndSetWaitStatus(h, 0, Node.PROPAGATE))
                    continue;                // loop on failed CAS
            }
            if (h == head)                   // loop if head changed
                break;
        }
    }
}
```
