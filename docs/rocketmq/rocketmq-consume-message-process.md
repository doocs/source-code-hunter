该文所涉及的 RocketMQ 源码版本为 4.9.3。

# RocketMQ 消息消费流程

拉取消息 成功之后 会调用 org.apache.rocketmq.client.impl.consumer.ConsumeMessageConcurrentlyService#submitConsumeRequest 组装 消费消息 请求

获取 consumeMessageBatchMaxSize,表示一个 ConsumeRequest 包含的消息 数量，默认为 1

入参 msgs 为拉取消息的最大值，默认为 32

如果 msgs 小于等于 consumeMessageBatchMaxSize，直接创建`ConsumeRequest`任务并提交到 线程池，当出现`RejectedExecutionException`异常时会重新提交任务，但是查看线程池的队列

`this.consumeRequestQueue = new LinkedBlockingQueue<Runnable>();`

为无界队列，最大值为`Integer.MAX_VALUE`，理论上不会出现该异常

```java
if (msgs.size() <= consumeBatchSize) {
    ConsumeRequest consumeRequest = new ConsumeRequest(msgs, processQueue, messageQueue);
    try {
        this.consumeExecutor.submit(consumeRequest);
    } catch (RejectedExecutionException e) {
        this.submitConsumeRequestLater(consumeRequest);
    }
}
```

如果 msgs 大于 consumeMessageBatchMaxSize，消息分批处理，即创建多个`ConsumeRequest`任务

```java
for (int total = 0; total < msgs.size(); ) {
    List<MessageExt> msgThis = new ArrayList<MessageExt>(consumeBatchSize);
    for (int i = 0; i < consumeBatchSize; i++, total++) {
        if (total < msgs.size()) {
            msgThis.add(msgs.get(total));
        } else {
            break;
        }
    }

    ConsumeRequest consumeRequest = new ConsumeRequest(msgThis, processQueue, messageQueue);
    try {
        this.consumeExecutor.submit(consumeRequest);
    } catch (RejectedExecutionException e) {
        for (; total < msgs.size(); total++) {
            msgThis.add(msgs.get(total));
        }

        this.submitConsumeRequestLater(consumeRequest);
    }
}
```

`class ConsumeRequest implements Runnable`

详细的消费逻辑查看 org.apache.rocketmq.client.impl.consumer.ConsumeMessageConcurrentlyService.ConsumeRequest#run

第 1 步：首先会校验队列的 dropped 是否为 true，当队列重平衡的时候，该队列可能会被分配给其他消费者，如果该队列被分配给其他消费者，会设置 dropped 为 true

```java
if (this.processQueue.isDropped()) {
    log.info("the message queue not be able to consume, because it's dropped. group={} {}", ConsumeMessageConcurrentlyService.this.consumerGroup, this.messageQueue);
    return;
}
```

第 2 步：如果是重试消息重新设置主题

```java
public void resetRetryAndNamespace(final List<MessageExt> msgs, String consumerGroup) {
    final String groupTopic = MixAll.getRetryTopic(consumerGroup);
    for (MessageExt msg : msgs) {
        String retryTopic = msg.getProperty(MessageConst.PROPERTY_RETRY_TOPIC);
        if (retryTopic != null && groupTopic.equals(msg.getTopic())) {
            msg.setTopic(retryTopic);
        }

        if (StringUtils.isNotEmpty(this.defaultMQPushConsumer.getNamespace())) {
            msg.setTopic(NamespaceUtil.withoutNamespace(msg.getTopic(), this.defaultMQPushConsumer.getNamespace()));
        }
    }
}
```

第 3 步：如果有钩子函数则执行

```java
if (ConsumeMessageConcurrentlyService.this.defaultMQPushConsumerImpl.hasHook()) {
    consumeMessageContext = new ConsumeMessageContext();
    consumeMessageContext.setNamespace(defaultMQPushConsumer.getNamespace());
    consumeMessageContext.setConsumerGroup(defaultMQPushConsumer.getConsumerGroup());
    consumeMessageContext.setProps(new HashMap<String, String>());
    consumeMessageContext.setMq(messageQueue);
    consumeMessageContext.setMsgList(msgs);
    consumeMessageContext.setSuccess(false);
    ConsumeMessageConcurrentlyService.this.defaultMQPushConsumerImpl.executeHookBefore(consumeMessageContext);
}
```

第 4 步：调用消息监听器的`consumeMessage执行具体的消费逻辑` ，返回值为`ConsumeConcurrentlyStatus`

```java
try {
    if (msgs != null && !msgs.isEmpty()) {
        for (MessageExt msg : msgs) {
            MessageAccessor.setConsumeStartTimeStamp(msg, String.valueOf(System.currentTimeMillis()));
        }
    }
    status = listener.consumeMessage(Collections.unmodifiableList(msgs), context);
} catch (Throwable e) {
        log.warn(String.format("consumeMessage exception: %s Group: %s Msgs: %s MQ: %s",
        RemotingHelper.exceptionSimpleDesc(e),
        ConsumeMessageConcurrentlyService.this.consumerGroup,
        msgs,
        messageQueue), e);
    hasException = true;
}
```

```java
public enum ConsumeConcurrentlyStatus {
    /**
     * Success consumption
     */
    CONSUME_SUCCESS,
    /**
     * Failure consumption,later try to consume
     */
    RECONSUME_LATER;
}

```

第 5 步：如果有 钩子 函数执行钩子

```java
if (ConsumeMessageConcurrentlyService.this.defaultMQPushConsumerImpl.hasHook()) {
    consumeMessageContext.setStatus(status.toString());
    consumeMessageContext.setSuccess(ConsumeConcurrentlyStatus.CONSUME_SUCCESS== status);
    ConsumeMessageConcurrentlyService.this.defaultMQPushConsumerImpl.executeHookAfter(consumeMessageContext);
}
```

第 6 步：再次校验队列 的 dropped 状态 ，如果为 false 才会对结果进行处理

```java
if (!processQueue.isDropped()) {
    ConsumeMessageConcurrentlyService.this.processConsumeResult(status, context, this);
} else {
    log.warn("processQueue is dropped without process consume result. messageQueue={}, msgs={}", messageQueue, msgs);
}
```

org.apache.rocketmq.client.impl.consumer.ConsumeMessageConcurrentlyService#processConsumeResult

第 7 步：计算 ackIndex，如果为`CONSUME_SUCCESS`等于`consumeRequest.getMsgs().size() - 1;`

如果为`RECONSUME_LATER`等于-1

```java
switch (status) {
    caseCONSUME_SUCCESS:
        if (ackIndex >= consumeRequest.getMsgs().size()) {
            ackIndex = consumeRequest.getMsgs().size() - 1;
        }
        int ok = ackIndex + 1;
        int failed = consumeRequest.getMsgs().size() - ok;
        this.getConsumerStatsManager().incConsumeOKTPS(consumerGroup, consumeRequest.getMessageQueue().getTopic(), ok);
        this.getConsumerStatsManager().incConsumeFailedTPS(consumerGroup, consumeRequest.getMessageQueue().getTopic(), failed);
        break;
    caseRECONSUME_LATER:
        ackIndex = -1;
        this.getConsumerStatsManager().incConsumeFailedTPS(consumerGroup, consumeRequest.getMessageQueue().getTopic(),
            consumeRequest.getMsgs().size());
        break;
    default:
        break;
}
```

第 8 步：如果是广播模式并且是消费失败，打印警告 信息，如果是集群模式并且消费失败会将消息发送到 broker，如果发送失败将消息封装到 consumerRequest 中延迟消费

```java
switch (this.defaultMQPushConsumer.getMessageModel()) {
    caseBROADCASTING:
        for (int i = ackIndex + 1; i < consumeRequest.getMsgs().size(); i++) {
            MessageExt msg = consumeRequest.getMsgs().get(i);
            log.warn("BROADCASTING, the message consume failed, drop it, {}", msg.toString());
        }
        break;
    caseCLUSTERING:
        List<MessageExt> msgBackFailed = new ArrayList<MessageExt>(consumeRequest.getMsgs().size());
        for (int i = ackIndex + 1; i < consumeRequest.getMsgs().size(); i++) {
            MessageExt msg = consumeRequest.getMsgs().get(i);
            boolean result = this.sendMessageBack(msg, context);
            if (!result) {
                msg.setReconsumeTimes(msg.getReconsumeTimes() + 1);
                msgBackFailed.add(msg);
            }
        }

        if (!msgBackFailed.isEmpty()) {
            consumeRequest.getMsgs().removeAll(msgBackFailed);

            this.submitConsumeRequestLater(msgBackFailed, consumeRequest.getProcessQueue(), consumeRequest.getMessageQueue());
        }
        break;
    default:
        break;
}
```

第 9 步：更新消息消费偏移量

```java
long offset = consumeRequest.getProcessQueue().removeMessage(consumeRequest.getMsgs());
if (offset >= 0 && !consumeRequest.getProcessQueue().isDropped()) {
    this.defaultMQPushConsumerImpl.getOffsetStore().updateOffset(consumeRequest.getMessageQueue(), offset, true);
}
```
