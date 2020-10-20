该文所涉及的 Netty 源码版本为 4.1.6。

## HashedWheelTimer 是什么

Netty 的时间轮 `HashedWheelTimer` 给出了一个**粗略的定时器实现**，之所以称之为粗略的实现是**因为该时间轮并没有严格的准时执行定时任务**，而是在每隔一个时间间隔之后的时间节点执行，并执行当前时间节点之前到期的定时任务。

当然具体的定时任务的时间执行精度可以通过调节 HashedWheelTimer 构造方法的时间间隔的大小来进行调节，在大多数网络应用的情况下，由于 IO 延迟的存在，并**不会严格要求具体的时间执行精度**，所以默认的 100ms 时间间隔可以满足大多数的情况，不需要再花精力去调节该时间精度。

## HashedWheelTimer 的实现原理

### HashedWheelTimer 内部的数据结构

```java
private final HashedWheelBucket[] wheel;
```

HashedWheelTimer 的主体数据结构 wheel 是一个**由多个链表所组成的数组**，默认情况下该数组的大小为 512。当定时任务准备加入到时间轮中的时候，将会以其等待执行的时间为依据选择该数组上的一个具体槽位上的链表加入。

```java
private HashedWheelTimeout head;
private HashedWheelTimeout tail;
```

在这个 wheel 数组中，每一个槽位都是一条由 HashedWheelTimeout 所组成的**链表**，其中链表中的**每一个节点都是一个等待执行的定时任务**。

### HashedWheelTimer 内部的线程模型

在 HashedWheelTimer 中，其内部是一个单线程的 worker 线程，通过类似 eventloop 的工作模式进行定时任务的调度。

```java
@Override
public void run() {
    // Initialize the startTime.
    startTime = System.nanoTime();
    if (startTime == 0) {
        // We use 0 as an indicator for the uninitialized value here, so make sure it's not 0 when initialized.
        startTime = 1;
    }

    // Notify the other threads waiting for the initialization at start().
    startTimeInitialized.countDown();

    do {
        final long deadline = waitForNextTick();
        if (deadline > 0) {
            transferTimeoutsToBuckets();
            HashedWheelBucket bucket =
                    wheel[(int) (tick & mask)];
            bucket.expireTimeouts(deadline);
            tick++;
        }
    } while (WORKER_STATE_UPDATER.get(HashedWheelTimer.this) == WORKER_STATE_STARTED);

    // Fill the unprocessedTimeouts so we can return them from stop() method.
    for (HashedWheelBucket bucket: wheel) {
        bucket.clearTimeouts(unprocessedTimeouts);
    }
    for (;;) {
        HashedWheelTimeout timeout = timeouts.poll();
        if (timeout == null) {
            break;
        }
        unprocessedTimeouts.add(timeout);
    }
}
```

简单看到 HashedWheelTimer 内部的 woker 线程的 `run()`方法，在其首先会记录启动时间作为 startTime 作为接下来调度定时任务的时间依据，而之后会通过 CountDownLatch 来通知所有外部线程当前 worker 工作线程已经初始化完毕。之后的循环体便是当时间轮持续生效的时间里的具体调度逻辑。**时间刻度是时间轮的一个重要属性**，其默认为 100ms，此处的循环间隔便是时间轮的时间刻度，默认情况下就是间隔 100ms 进行一次调度循环。工作线程会维护当前工作线程具体循环了多少轮，用于定位具体执行触发时间轮数组上的哪一个位置上的链表。当时间轮准备 shutdown 的阶段，最后的代码会对未执行的任务整理到未执行的队列中。

由此可见，**worker 线程的 run()方法中基本定义了工作线程的整个生命周期，从初始的初始化到循环体中的具体调度，最后到未执行任务的具体清理**。整体的调度逻辑便主要在这里执行。值得注意的是，在这里的前提下，每个 HashedWheelTimer 时间轮都会有一个工作线程进行调度，所以不需要在 netty 中在每一个连接中单独使用一个 HashedWheelTimer 来进行定时任务的调度，否则可能将对性能产生影响。

### 向 HashedWheelTimer 加入一个定时任务的流程

当调用 HashedWheelTimer 的 newTimeout()方法的时候，即是将定时任务加入时间轮中的 api。

```java
@Override
public Timeout newTimeout(TimerTask task, long delay, TimeUnit unit) {
    if (task == null) {
        throw new NullPointerException("task");
    }
    if (unit == null) {
        throw new NullPointerException("unit");
    }
    start();

    long deadline = System.nanoTime() + unit.toNanos(delay) - startTime;
    HashedWheelTimeout timeout = new HashedWheelTimeout(this, task, deadline);
    timeouts.add(timeout);
    return timeout;
}
```

当此次是首次向该时间轮加入定时任务的时候，将会通过 start()方法开始执行上文所述的 worker 工作线程的启动与循环调度逻辑，这里暂且不提。之后计算定时任务触发时间相对于时间轮初始化时间的相对时间间隔 deadline，并将其包装为一个链表节点 HashedWheelTimeout ，投入到 timeouts 队列中，等待 worker 工作线程在下一轮调度循环中将其加入到时间轮的具体链表中等待触发执行，timeouts 的实现是一个 mpsc 队列，关于 mpsc 队列可以查看[此文](https://mp.weixin.qq.com/s/VVoDJwrLZrN3mm-jaQJayQ)，这里也符合**多生产者单消费者的队列模型**。

### HashedWheelTimer 中工作线程的具体调度

```java
do {
    final long deadline = waitForNextTick();
    if (deadline > 0) {
        transferTimeoutsToBuckets();
        HashedWheelBucket bucket =
                wheel[(int) (tick & mask)];
        bucket.expireTimeouts(deadline);
        tick++;
    }
} while (WORKER_STATE_UPDATER.get(HashedWheelTimer.this) == WORKER_STATE_STARTED);
```

在 HashedWheelTimer 中的工作线程 run()方法的主要循环中，主要分为三个步骤。

首先 worker 线程会通过 `waitForNextTick()`方法根据时间轮的时间刻度等待一轮循环的开始，在默认情况下时间轮的时间刻度是 100ms，那么此处 worker 线程也将在这个方法中 sleep 相应的时间等待下一轮循环的开始。此处也决定了时间轮的定时任务时间精度。

当 worker 线程经过相应时间间隔的 sleep 之后，也代表新的一轮调度开始。此时，会通过 `transferTimeoutsToBuckets()`方法将之前刚刚加入到 timeouts 队列中的定时任务放入到时间轮具体槽位上的链表中。

```java
for (int i = 0; i < 100000; i++) {
    HashedWheelTimeout timeout = timeouts.poll();
    if (timeout == null) {
        // all processed
        break;
    }
    if (timeout.state() == HashedWheelTimeout.ST_CANCELLED
            || !timeout.compareAndSetState(HashedWheelTimeout.ST_INIT, HashedWheelTimeout.ST_IN_BUCKET)) {
        timeout.remove();
        continue;
    }
    long calculated = timeout.deadline / tickDuration;
    long remainingRounds = (calculated - tick) / wheel.length;
    timeout.remainingRounds = remainingRounds;

    final long ticks = Math.max(calculated, tick); // Ensure we don't schedule for past.
    int stopIndex = (int) (ticks & mask);

    HashedWheelBucket bucket = wheel[stopIndex];
    bucket.addTimeout(timeout);
}
```

首先，在每一轮的调度中，最多只会从 `timeouts` 队列中定位到时间轮 100000 个定时任务，这也是为了防止在这里耗时过久导致后面触发定时任务的延迟。在这里会不断从 timeouts 队列中获取刚加入的定时任务。

**具体的计算流程**便是将定时任务相对于时间轮初始化时间的相对间隔与时间轮的时间刻度相除得到相对于初始化时间的具体轮数，之后便在减去当前轮数得到还需要遍历几遍整个时间轮数组得到 remainingRounds，最后将轮数与时间轮数组长度-1 相与，得到该定时任务到底应该存放到时间轮上哪个位置的链表。

用具体的数组**举个例子**，该时间轮初始化时间为 12 点，时间刻度为 1 小时，时间轮数组长度为 8，当前时间 13 点，当向时间轮加入一个明天 13 点执行的任务的时候，首先得到该任务相对于初始化的时间间隔是 25 小时，也就是需要 25 轮调度，而当前 13 点，当前调度轮数为 1，因此还需要 24 轮调度，就需要再遍历 3 轮时间轮，因此 remainingRounds 为 3，再根据 25 与 8-1 相与的结果为 1，因此将该定时任务放置到时间轮数组下标为 1 的链表上等待被触发。

这便是**一次完整的定时任务加入到时间轮具体位置的计算**。

在 worker 线程的最后，就需要来具体执行定时任务了，首先通过当前循环轮数与时间轮数组长度-1 相与的结果定位具体触发时间轮数组上哪个位置上的链表，再通过 `expireTimeouts()`方法依次对链表上的定时任务进行触发执行。这里的流程就相对很简单，链表上的节点如果 remainingRounds 小于等于 0，那么就可以直接执行这个定时任务，如果 remainingRounds 大于 0，那么显然还没有到达触发的时间点，则将其-1 等待下一轮的调度之后再进行执行。在继续回到上面的例子，当 14 点来临之时，此时工作线程将进行第 2 轮的调度，将会把 2 与 8-1 进行相与得到结果 2，那么当前工作线程就会选择时间轮数组下标为 2 的链表依次判断是否需要触发，如果 remainingRounds 为 0 将会直接触发，否则将会将 remainingRounds-1 等待下一轮的执行。
