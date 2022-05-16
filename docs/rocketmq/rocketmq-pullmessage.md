该文所涉及的 RocketMQ 源码版本为 4.9.3。

# RocketMQ 消息拉取流程

之前在消费者启动流程中描述过 MQClientInstance 的启动流程，在启动过程中会启动 PullMessageService，它继承了`ServiceThread`，并且 ServiceThread 实现了 Runnable 接口，所以是单独启动了一个线程

`public class PullMessageService extends ServiceThread`

`public abstract class ServiceThread implements Runnable`

PullMessageService 的 run 方法如下：

`protected volatile boolean stopped = false;`

```java
public void run() {
    log.info(this.getServiceName() + " service started");

    while (!this.isStopped()) {
        try {
            PullRequest pullRequest = this.pullRequestQueue.take();
            this.pullMessage(pullRequest);
        } catch (InterruptedException ignored) {
        } catch (Exception e) {
            log.error("Pull Message Service Run Method exception", e);
        }
    }

    log.info(this.getServiceName() + " service end");
}
```

只要没有停止，线程一直会从 PullRequestQueue 中获取 PullRequest 消息拉取任务，如果队列为空，会一直阻塞，直到有 PullRequest 被放入队列中，如果拿到了 PullRequest 就会调用 pullMessage 方法拉取消息

添加 PullRequest 有两个方法，一个是延迟添加，另一个是立即添加

```java
public void executePullRequestLater(final PullRequest pullRequest, final long timeDelay) {
    if (!isStopped()) {
        this.scheduledExecutorService.schedule(new Runnable() {
            @Override
            public void run() {
                PullMessageService.this.executePullRequestImmediately(pullRequest);
            }
        }, timeDelay, TimeUnit.MILLISECONDS);
    } else {
        log.warn("PullMessageServiceScheduledThread has shutdown");
    }
}

public void executePullRequestImmediately(final PullRequest pullRequest) {
    try {
        this.pullRequestQueue.put(pullRequest);
    } catch (InterruptedException e) {
        log.error("executePullRequestImmediately pullRequestQueue.put", e);
    }
}
```

org.apache.rocketmq.client.impl.consumer.PullMessageService#pullMessage

拉取消息流程：

根据消费组获取`MQConsumerInner`，根据推模式还是拉模式，强转为`DefaultMQPushConsumerImpl`还是`DefaultLitePullConsumerImpl`

org.apache.rocketmq.client.impl.consumer.DefaultMQPushConsumerImpl#pullMessage

`第1步：获取处理队列`,`如果队列被丢弃结束`

```java
final ProcessQueue processQueue = pullRequest.getProcessQueue();

if (processQueue.isDropped()) {
    log.info("the pull request[{}] is dropped.", pullRequest.toString());
    return;
}
```

第 2 步：`设置最后一次拉取时间戳`

`pullRequest.getProcessQueue().setLastPullTimestamp(System.currentTimeMillis());`

第 3 步：`确认消费者是启动的状态，如果不是启动的状态，将PullRequest延迟3s放入队列`

```java
try {
    this.makeSureStateOK();
} catch (MQClientException e) {
    log.warn("pullMessage exception, consumer state not ok", e);
    this.executePullRequestLater(pullRequest, pullTimeDelayMillsWhenException);
    return;
}
```

第 4 步：`如果消费者停止了，将PullRequest延迟1s放入队列`

```java
if (this.isPause()) {
    log.warn("consumer was paused, execute pull request later. instanceName={}, group={}", this.defaultMQPushConsumer.getInstanceName(), this.defaultMQPushConsumer.getConsumerGroup());
    this.executePullRequestLater(pullRequest,PULL_TIME_DELAY_MILLS_WHEN_SUSPEND);
    return;
}
```

第 5 步：`缓存的消息数量大于1000，将PullRequest延迟50ms放入队列,每触发1000次流控输出警告信息`

```java
if (cachedMessageCount > this.defaultMQPushConsumer.getPullThresholdForQueue()) {
    this.executePullRequestLater(pullRequest,PULL_TIME_DELAY_MILLS_WHEN_FLOW_CONTROL);
    if ((queueFlowControlTimes++ % 1000) == 0) {
        log.warn("the cached message count exceeds the threshold {}, so do flow control, minOffset={}, maxOffset={}, count={}, size={} MiB, pullRequest={}, flowControlTimes={}",
            this.defaultMQPushConsumer.getPullThresholdForQueue(), processQueue.getMsgTreeMap().firstKey(), processQueue.getMsgTreeMap().lastKey(), cachedMessageCount, cachedMessageSizeInMiB, pullRequest, queueFlowControlTimes);
    }
    return;
}
```

第 6 步：`缓存的消息大小大于100M 将PullRequest延迟50ms放入队列，每触发1000次输出警告信息`

```java
if (cachedMessageSizeInMiB > this.defaultMQPushConsumer.getPullThresholdSizeForQueue()) {
    this.executePullRequestLater(pullRequest,PULL_TIME_DELAY_MILLS_WHEN_FLOW_CONTROL);
    if ((queueFlowControlTimes++ % 1000) == 0) {
        log.warn("the cached message size exceeds the threshold {} MiB, so do flow control, minOffset={}, maxOffset={}, count={}, size={} MiB, pullRequest={}, flowControlTimes={}",
            this.defaultMQPushConsumer.getPullThresholdSizeForQueue(), processQueue.getMsgTreeMap().firstKey(), processQueue.getMsgTreeMap().lastKey(), cachedMessageCount, cachedMessageSizeInMiB, pullRequest, queueFlowControlTimes);
    }
    return;
}
```

第 7 步：`ProcessQueue中消息的最大偏移量与最小偏移量的差值不能大于2000，如果大于2000，触发流控，输出警告信息`

```java
if (!this.consumeOrderly) {
    if (processQueue.getMaxSpan() > this.defaultMQPushConsumer.getConsumeConcurrentlyMaxSpan()) {
        this.executePullRequestLater(pullRequest,PULL_TIME_DELAY_MILLS_WHEN_FLOW_CONTROL);
        if ((queueMaxSpanFlowControlTimes++ % 1000) == 0) {
            log.warn("the queue's messages, span too long, so do flow control, minOffset={}, maxOffset={}, maxSpan={}, pullRequest={}, flowControlTimes={}",
                processQueue.getMsgTreeMap().firstKey(), processQueue.getMsgTreeMap().lastKey(), processQueue.getMaxSpan(),
                pullRequest, queueMaxSpanFlowControlTimes);
        }
        return;
    }
}
```

第 8 步：`如果ProcessQueue被锁了，判断上一个PullRequest是否被锁，如果没有被锁通过RebalanceImpl计算拉取消息偏移量，如果计算异常，将请求延迟3s加入队列`，`如果下一次拉取消息 的偏移量大于计算出来的偏移量，说明要拉取的偏移量 大于消费偏移量，对 偏移量 进行修正，设置下一次拉取的偏移量为计算出来的偏移量`

```java
if (processQueue.isLocked()) {
    if (!pullRequest.isPreviouslyLocked()) {
        long offset = -1L;
        try {
            offset = this.rebalanceImpl.computePullFromWhereWithException(pullRequest.getMessageQueue());
        } catch (Exception e) {
            this.executePullRequestLater(pullRequest, pullTimeDelayMillsWhenException);
            log.error("Failed to compute pull offset, pullResult: {}", pullRequest, e);
            return;
        }
        boolean brokerBusy = offset < pullRequest.getNextOffset();
        log.info("the first time to pull message, so fix offset from broker. pullRequest: {} NewOffset: {} brokerBusy: {}",
            pullRequest, offset, brokerBusy);
        if (brokerBusy) {
            log.info("[NOTIFYME]the first time to pull message, but pull request offset larger than broker consume offset. pullRequest: {} NewOffset: {}",
                pullRequest, offset);
        }

        pullRequest.setPreviouslyLocked(true);
        pullRequest.setNextOffset(offset);
    }
} else {
    this.executePullRequestLater(pullRequest, pullTimeDelayMillsWhenException);
    log.info("pull message later because not locked in broker, {}", pullRequest);
    return;
}
```

第 9 步：`根据主题名称获取订阅信息，如果为空，将请求延迟3s放入队列`

```java
final SubscriptionData subscriptionData = this.rebalanceImpl.getSubscriptionInner().get(pullRequest.getMessageQueue().getTopic());
if (null == subscriptionData) {
    this.executePullRequestLater(pullRequest, pullTimeDelayMillsWhenException);
    log.warn("find the consumer's subscription failed, {}", pullRequest);
    return;
}
```

第 10 步：`创建PullCallback，为后面调用 拉取消息api做准备`

```java
PullCallback pullCallback = new PullCallback() {
    @Override
    public void onSuccess(PullResult pullResult) {
        if (pullResult != null) {
            pullResult = DefaultMQPushConsumerImpl.this.pullAPIWrapper.processPullResult(pullRequest.getMessageQueue(), pullResult,
                subscriptionData);

            switch (pullResult.getPullStatus()) {
                caseFOUND:
                    long prevRequestOffset = pullRequest.getNextOffset();
                    pullRequest.setNextOffset(pullResult.getNextBeginOffset());
                    long pullRT = System.currentTimeMillis() - beginTimestamp;
                    DefaultMQPushConsumerImpl.this.getConsumerStatsManager().incPullRT(pullRequest.getConsumerGroup(),
                        pullRequest.getMessageQueue().getTopic(), pullRT);

                    long firstMsgOffset = Long.MAX_VALUE;
                    if (pullResult.getMsgFoundList() == null || pullResult.getMsgFoundList().isEmpty()) {
                        DefaultMQPushConsumerImpl.this.executePullRequestImmediately(pullRequest);
                    } else {
                        firstMsgOffset = pullResult.getMsgFoundList().get(0).getQueueOffset();

                        DefaultMQPushConsumerImpl.this.getConsumerStatsManager().incPullTPS(pullRequest.getConsumerGroup(),
                            pullRequest.getMessageQueue().getTopic(), pullResult.getMsgFoundList().size());

                        boolean dispatchToConsume = processQueue.putMessage(pullResult.getMsgFoundList());
                        DefaultMQPushConsumerImpl.this.consumeMessageService.submitConsumeRequest(
                            pullResult.getMsgFoundList(),
                            processQueue,
                            pullRequest.getMessageQueue(),
                            dispatchToConsume);

                        if (DefaultMQPushConsumerImpl.this.defaultMQPushConsumer.getPullInterval() > 0) {
                            DefaultMQPushConsumerImpl.this.executePullRequestLater(pullRequest,
                                DefaultMQPushConsumerImpl.this.defaultMQPushConsumer.getPullInterval());
                        } else {
                            DefaultMQPushConsumerImpl.this.executePullRequestImmediately(pullRequest);
                        }
                    }

                    if (pullResult.getNextBeginOffset() < prevRequestOffset
                        || firstMsgOffset < prevRequestOffset) {
                        log.warn("[BUG] pull message result maybe data wrong, nextBeginOffset: {} firstMsgOffset: {} prevRequestOffset: {}",
                            pullResult.getNextBeginOffset(),
                            firstMsgOffset,
                            prevRequestOffset);
                    }

                    break;
                caseNO_NEW_MSG:
                caseNO_MATCHED_MSG:
                    pullRequest.setNextOffset(pullResult.getNextBeginOffset());

                    DefaultMQPushConsumerImpl.this.correctTagsOffset(pullRequest);

                    DefaultMQPushConsumerImpl.this.executePullRequestImmediately(pullRequest);
                    break;
                caseOFFSET_ILLEGAL:
                    log.warn("the pull request offset illegal, {} {}",
                        pullRequest.toString(), pullResult.toString());
                    pullRequest.setNextOffset(pullResult.getNextBeginOffset());

                    pullRequest.getProcessQueue().setDropped(true);
                    DefaultMQPushConsumerImpl.this.executeTaskLater(new Runnable() {

                        @Override
                        public void run() {
                            try {
                                DefaultMQPushConsumerImpl.this.offsetStore.updateOffset(pullRequest.getMessageQueue(),
                                    pullRequest.getNextOffset(), false);

                                DefaultMQPushConsumerImpl.this.offsetStore.persist(pullRequest.getMessageQueue());

                                DefaultMQPushConsumerImpl.this.rebalanceImpl.removeProcessQueue(pullRequest.getMessageQueue());

                                log.warn("fix the pull request offset, {}", pullRequest);
                            } catch (Throwable e) {
                                log.error("executeTaskLater Exception", e);
                            }
                        }
                    }, 10000);
                    break;
                default:
                    break;
            }
        }
    }

    @Override
    public void onException(Throwable e) {
        if (!pullRequest.getMessageQueue().getTopic().startsWith(MixAll.RETRY_GROUP_TOPIC_PREFIX)) {
            log.warn("execute the pull request exception", e);
        }

        DefaultMQPushConsumerImpl.this.executePullRequestLater(pullRequest, pullTimeDelayMillsWhenException);
    }
};
```

第 11 步：`设置系统标记`

`FLAG_COMMIT_OFFSET: 消费进度 大于0`

`FLAG_SUSPEND: 拉取消息时支持线程挂起`

`FLAG_SUBSCRIPTION: 消息过滤机制表达式`

`FLAG_CLASS_FILTER: 消息过滤机制是否为类过滤`

```java
int sysFlag = PullSysFlag.buildSysFlag(
    commitOffsetEnable, // commitOffset
    true, // suspend
    subExpression != null, // subscription
    classFilter // class filter
);
```

第 12 步：`调用 broker 拉取消息`

```java
// 每一个参数的含义如下
this.pullAPIWrapper.pullKernelImpl(
    pullRequest.getMessageQueue(), // 要拉取的消息队列
    subExpression, // 消息过滤表达式
    subscriptionData.getExpressionType(), // 过滤表达式类型
    subscriptionData.getSubVersion(), // 时间戳
    pullRequest.getNextOffset(), // 消息拉取的开始偏移量
    this.defaultMQPushConsumer.getPullBatchSize(), // 拉取消息的数量 默认32条
    sysFlag, // 系统标记
    commitOffsetValue, // 消费的偏移量
    BROKER_SUSPEND_MAX_TIME_MILLIS,  // 允许broker挂起的时间 默认15s
    CONSUMER_TIMEOUT_MILLIS_WHEN_SUSPEND, // 允许的超时时间 默认30s
    CommunicationMode.ASYNC, // 默认为异步拉取
    pullCallback // 拉取消息之后的回调
);
```
