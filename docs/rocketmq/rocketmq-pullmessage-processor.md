该文所涉及的 RocketMQ 源码版本为 4.9.3。

# RocketMQ broker 处理拉取消息请求流程

org.apache.rocketmq.broker.processor.PullMessageProcessor#processRequest(io.netty.channel.ChannelHandlerContext, org.apache.rocketmq.remoting.protocol.RemotingCommand)

第 1 步、`校验broker是否可读`

```java
if (!PermName.isReadable(this.brokerController.getBrokerConfig().getBrokerPermission())) {
    response.setCode(ResponseCode.NO_PERMISSION);
    response.setRemark(String.format("the broker[%s] pulling message is forbidden", this.brokerController.getBrokerConfig().getBrokerIP1()));
    return response;
}
```

第 2 步、`根据消费组获取订阅信息`

```java
SubscriptionGroupConfig subscriptionGroupConfig =
    this.brokerController.getSubscriptionGroupManager().findSubscriptionGroupConfig(requestHeader.getConsumerGroup());
```

第 3 步、`校验是否允许消费`

```java
if (!subscriptionGroupConfig.isConsumeEnable()) {
    response.setCode(ResponseCode.NO_PERMISSION);
    response.setRemark("subscription group no permission, " + requestHeader.getConsumerGroup());
    return response;
}
```

第 4 步、`根据主题获取对应的配置信息`

```java
TopicConfig topicConfig = this.brokerController.getTopicConfigManager().selectTopicConfig(requestHeader.getTopic());
if (null == topicConfig) {
    log.error("the topic {} not exist, consumer: {}", requestHeader.getTopic(), RemotingHelper.parseChannelRemoteAddr(channel));
    response.setCode(ResponseCode.TOPIC_NOT_EXIST);
    response.setRemark(String.format("topic[%s] not exist, apply first please! %s", requestHeader.getTopic(), FAQUrl.suggestTodo(FAQUrl.APPLY_TOPIC_URL)));
    return response;
}
```

第 5 步、`校验主题对应的队列`

```java
if (requestHeader.getQueueId() < 0 || requestHeader.getQueueId() >= topicConfig.getReadQueueNums()) {
    String errorInfo = String.format("queueId[%d] is illegal, topic:[%s] topicConfig.readQueueNums:[%d] consumer:[%s]",
        requestHeader.getQueueId(), requestHeader.getTopic(), topicConfig.getReadQueueNums(), channel.remoteAddress());
    log.warn(errorInfo);
    response.setCode(ResponseCode.SYSTEM_ERROR);
    response.setRemark(errorInfo);
    return response;
}
```

第 6 步、`如果配置了消息过滤表达式，根据表达式进行构建consumerFilterData，如果没有，则根据主题构建`

```java
consumerFilterData = ConsumerFilterManager.build(
                        requestHeader.getTopic(), requestHeader.getConsumerGroup(), requestHeader.getSubscription(),
                        requestHeader.getExpressionType(), requestHeader.getSubVersion()

consumerFilterData = this.brokerController.getConsumerFilterManager().get(requestHeader.getTopic(),
                    requestHeader.getConsumerGroup());
```

第 7 步、`校验如果不是Tag过滤，是否开启了自定义属性过滤，如果没有开启，不允许操作 只有使用push推送模式的消费者才能用使用SQL92标准的sql语句，pull拉取模式的消费者是不支持这个功能的。`

```java
if (!ExpressionType.isTagType(subscriptionData.getExpressionType())
    && !this.brokerController.getBrokerConfig().isEnablePropertyFilter()) {
    response.setCode(ResponseCode.SYSTEM_ERROR);
    response.setRemark("The broker does not support consumer to filter message by " + subscriptionData.getExpressionType());
    return response;
}
```

第 8 步、`根据是否支持重试过滤创建不同的MessageFilter`

```java
if (this.brokerController.getBrokerConfig().isFilterSupportRetry()) {
    messageFilter = new ExpressionForRetryMessageFilter(subscriptionData, consumerFilterData,
        this.brokerController.getConsumerFilterManager());
} else {
    messageFilter = new ExpressionMessageFilter(subscriptionData, consumerFilterData,
        this.brokerController.getConsumerFilterManager());
}
```

第 9 步、`根据消费组、主题、队列、偏移量、最大拉取消息数量、消息过滤器查找信息`

```java
final GetMessageResult getMessageResult =
    this.brokerController.getMessageStore().getMessage(requestHeader.getConsumerGroup(), requestHeader.getTopic(),
        requestHeader.getQueueId(), requestHeader.getQueueOffset(), requestHeader.getMaxMsgNums(), messageFilter);

```

第 10 步、`消息为空 设置code为系统错误 返回response`

```java
response.setCode(ResponseCode.SYSTEM_ERROR);
response.setRemark("store getMessage return null");
```

第 11 步、`提交偏移量`

```java
if (storeOffsetEnable) {
    this.brokerController.getConsumerOffsetManager().commitOffset(RemotingHelper.parseChannelRemoteAddr(channel),
        requestHeader.getConsumerGroup(), requestHeader.getTopic(), requestHeader.getQueueId(), requestHeader.getCommitOffset());
}
```
