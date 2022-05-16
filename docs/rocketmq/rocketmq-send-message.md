该文所涉及的 RocketMQ 源码版本为 4.9.3。

# RocketMQ 消息发送流程

这里以同步发送为示例讲解：

入口：

org.apache.rocketmq.client.producer.DefaultMQProducer#send(org.apache.rocketmq.common.message.Message)

消息发送 默认超时时间 3 秒

第一步：验证

主题的长度不能大于 127，消息的大小不能大于 4M

```java
public static void checkMessage(Message msg, DefaultMQProducer defaultMQProducer) throws MQClientException {
    if (null == msg) {
        throw new MQClientException(ResponseCode.MESSAGE_ILLEGAL, "the message is null");
    }
    // topic
    Validators.checkTopic(msg.getTopic());
    Validators.isNotAllowedSendTopic(msg.getTopic());

    // body
    if (null == msg.getBody()) {
        throw new MQClientException(ResponseCode.MESSAGE_ILLEGAL, "the message body is null");
    }

    if (0 == msg.getBody().length) {
        throw new MQClientException(ResponseCode.MESSAGE_ILLEGAL, "the message body length is zero");
    }

    if (msg.getBody().length > defaultMQProducer.getMaxMessageSize()) {
        throw new MQClientException(ResponseCode.MESSAGE_ILLEGAL,
            "the message body size over max value, MAX: " + defaultMQProducer.getMaxMessageSize());
    }
}
```

第二步：查找路由信息

如果缓存中存在路由信息，并且队列信息不为空直接返回路由信息，如果缓存不存在，根据当前主题从 NameServer 中获取 路由信息，如果路由信息没有找到，根据默认主题查询路由信息，如果没有找到抛出异常

```java
private TopicPublishInfo tryToFindTopicPublishInfo(final String topic) {
    TopicPublishInfo topicPublishInfo = this.topicPublishInfoTable.get(topic);
    if (null == topicPublishInfo || !topicPublishInfo.ok()) {
        this.topicPublishInfoTable.putIfAbsent(topic, new TopicPublishInfo());
        this.mQClientFactory.updateTopicRouteInfoFromNameServer(topic);
        topicPublishInfo = this.topicPublishInfoTable.get(topic);
    }

    if (topicPublishInfo.isHaveTopicRouterInfo() || topicPublishInfo.ok()) {
        return topicPublishInfo;
    } else {
        this.mQClientFactory.updateTopicRouteInfoFromNameServer(topic, true, this.defaultMQProducer);
        topicPublishInfo = this.topicPublishInfoTable.get(topic);
        return topicPublishInfo;
    }
}

```

从 NameServer 查询路由信息方法：

org.apache.rocketmq.client.impl.factory.MQClientInstance#updateTopicRouteInfoFromNameServer(java.lang.String, boolean, org.apache.rocketmq.client.producer.DefaultMQProducer)

1、如果是默认的主题查询路由信息，返回成功，更新读队列和写队列的个数为默认的队列个数

```java
if (isDefault && defaultMQProducer != null) {
    topicRouteData = this.mQClientAPIImpl.getDefaultTopicRouteInfoFromNameServer(defaultMQProducer.getCreateTopicKey(),
        clientConfig.getMqClientApiTimeout());
    if (topicRouteData != null) {
        for (QueueData data : topicRouteData.getQueueDatas()) {
            int queueNums = Math.min(defaultMQProducer.getDefaultTopicQueueNums(), data.getReadQueueNums());
            data.setReadQueueNums(queueNums);
            data.setWriteQueueNums(queueNums);
        }
    }
}
```

2、返回路由信息之后，与本地缓存的路由信息比对，判断路由信息是否发生变化，如果发生变化更新 broker 地址缓存，更新`topicPublishInfoTable`，更新 topic 路由信息缓存`topicRouteTable`

```java
if (changed) {
    TopicRouteData cloneTopicRouteData = topicRouteData.cloneTopicRouteData();

    for (BrokerData bd : topicRouteData.getBrokerDatas()) {
        this.brokerAddrTable.put(bd.getBrokerName(), bd.getBrokerAddrs());
    }

    // Update Pub info
    if (!producerTable.isEmpty()) {
        TopicPublishInfo publishInfo =topicRouteData2TopicPublishInfo(topic, topicRouteData);
        publishInfo.setHaveTopicRouterInfo(true);
        Iterator<Entry<String, MQProducerInner>> it = this.producerTable.entrySet().iterator();
        while (it.hasNext()) {
            Entry<String, MQProducerInner> entry = it.next();
            MQProducerInner impl = entry.getValue();
            if (impl != null) {
                impl.updateTopicPublishInfo(topic, publishInfo);
            }
        }
    }
    log.info("topicRouteTable.put. Topic = {}, TopicRouteData[{}]", topic, cloneTopicRouteData);
    this.topicRouteTable.put(topic, cloneTopicRouteData);
    return true;
}
```

第三步：选择消息 队列

设置消息发送失败重试次数

`int timesTotal = communicationMode == CommunicationMode.*SYNC* ? 1 + this.defaultMQProducer.getRetryTimesWhenSendFailed() : 1;`

`MessageQueue mqSelected = this.selectOneMessageQueue(topicPublishInfo, lastBrokerName);`

首先判断是否启用故障延迟机制 ，默认不启用，第一次查询 lastBrokerName 为空，`sendWhichQueue`自增然后对队列个数取模获取队列，如果消息发送失败，下一次`sendWhichQueue`仍然自增然后对队列个数取模，可以规避掉上次失败的 broker

```java
public MessageQueue selectOneMessageQueue(final String lastBrokerName) {
    if (lastBrokerName == null) {
        return selectOneMessageQueue();
    } else {
        for (int i = 0; i < this.messageQueueList.size(); i++) {
            int index = this.sendWhichQueue.incrementAndGet();
            int pos = Math.abs(index) % this.messageQueueList.size();
            if (pos < 0)
                pos = 0;
            MessageQueue mq = this.messageQueueList.get(pos);
            if (!mq.getBrokerName().equals(lastBrokerName)) {
                return mq;
            }
        }
        return selectOneMessageQueue();
    }
}
```

如果启用故障延迟机制：

轮询获取队列 ，如果可用直接返回

```java
for (int i = 0; i < tpInfo.getMessageQueueList().size(); i++) {
    int pos = Math.abs(index++) % tpInfo.getMessageQueueList().size();
    if (pos < 0)
        pos = 0;
    MessageQueue mq = tpInfo.getMessageQueueList().get(pos);
    if (latencyFaultTolerance.isAvailable(mq.getBrokerName()))
        return mq;
}
```

判断是否可用逻辑：先从要规避的 broker 集合`faultItemTable`中获取该 broker 是否存在，如果存在判断是否可用，可用的标准是当前时间的时间戳大于上次该 broker 失败的时间 + 规避的时间，如果该 broker 在规避的 broker 集合中不存在，直接返回可用

```java
public boolean isAvailable(final String name) {
    final FaultItem faultItem = this.faultItemTable.get(name);
    if (faultItem != null) {
        return faultItem.isAvailable();
    }
    return true;
}
```

如果没有可用的 broker，尝试从 规避的 broker 集合中选择一个可用的 broker，如果选择的 broker 没有写队列，则从规避的 broker 列表中移除该 broker

```java
final String notBestBroker = latencyFaultTolerance.pickOneAtLeast();
int writeQueueNums = tpInfo.getQueueIdByBroker(notBestBroker);
if (writeQueueNums > 0) {
    final MessageQueue mq = tpInfo.selectOneMessageQueue();
    if (notBestBroker != null) {
        mq.setBrokerName(notBestBroker);
        mq.setQueueId(tpInfo.getSendWhichQueue().incrementAndGet() % writeQueueNums);
    }
    return mq;
} else {
    latencyFaultTolerance.remove(notBestBroker);
}
```

P.S. :

要规避的 broker 集合在同步发送的时候不会 更新，在异步发送的时候会更新

```java
public void updateFaultItem(final String brokerName, final long currentLatency, boolean isolation) {
    if (this.sendLatencyFaultEnable) {
        long duration = computeNotAvailableDuration(isolation ? 30000 : currentLatency);
        this.latencyFaultTolerance.updateFaultItem(brokerName, currentLatency, duration);
    }
}
```

主要更新消息发送故障的延迟时间`currentLatency`和故障规避的 开始时间`startTimestamp`

```java
public void updateFaultItem(final String name, final long currentLatency, final long notAvailableDuration) {
    FaultItem old = this.faultItemTable.get(name);
    if (null == old) {
        final FaultItem faultItem = new FaultItem(name);
        faultItem.setCurrentLatency(currentLatency);
        faultItem.setStartTimestamp(System.currentTimeMillis() + notAvailableDuration);

        old = this.faultItemTable.putIfAbsent(name, faultItem);
        if (old != null) {
            old.setCurrentLatency(currentLatency);
            old.setStartTimestamp(System.currentTimeMillis() + notAvailableDuration);
        }
    } else {
        old.setCurrentLatency(currentLatency);
        old.setStartTimestamp(System.currentTimeMillis() + notAvailableDuration);
    }
}
```

总结：

不管开不开启故障延迟机制，都可以规避故障的 broker，只是开启故障延迟机制，会在一段时间内都不会访问到该 broker，而不开启只是下一次不会访问到该 broker

第四步：消息发送

org.apache.rocketmq.client.impl.producer.DefaultMQProducerImpl#sendKernelImpl

1、为消息分配全局唯一 id

```java
if (!(msg instanceof MessageBatch)) {
    MessageClientIDSetter.setUniqID(msg);
}
```

2、消息体大于 4k 启用压缩

```java
boolean msgBodyCompressed = false;
if (this.tryToCompressMessage(msg)) {
    sysFlag |= MessageSysFlag.COMPRESSED_FLAG;
    msgBodyCompressed = true;
}
```

3、如果是事务消息，设置消息类型为事务消息

```java
final String tranMsg = msg.getProperty(MessageConst.PROPERTY_TRANSACTION_PREPARED);
if (Boolean.parseBoolean(tranMsg)) {
    sysFlag |= MessageSysFlag.TRANSACTION_PREPARED_TYPE;
}
```

4、校验是否超时

```java
long costTimeSync = System.currentTimeMillis() - beginStartTime;
if (timeout < costTimeSync) {
    throw new RemotingTooMuchRequestException("sendKernelImpl call timeout");
}
```

5、组装请求头

```java
SendMessageRequestHeader requestHeader = new SendMessageRequestHeader();
requestHeader.setProducerGroup(this.defaultMQProducer.getProducerGroup());
requestHeader.setTopic(msg.getTopic());
requestHeader.setDefaultTopic(this.defaultMQProducer.getCreateTopicKey());
requestHeader.setDefaultTopicQueueNums(this.defaultMQProducer.getDefaultTopicQueueNums());
requestHeader.setQueueId(mq.getQueueId());
requestHeader.setSysFlag(sysFlag);
requestHeader.setBornTimestamp(System.currentTimeMillis());
requestHeader.setFlag(msg.getFlag());
requestHeader.setProperties(MessageDecoder.messageProperties2String(msg.getProperties()));
requestHeader.setReconsumeTimes(0);
requestHeader.setUnitMode(this.isUnitMode());
requestHeader.setBatch(msg instanceof MessageBatch);
if (requestHeader.getTopic().startsWith(MixAll.RETRY_GROUP_TOPIC_PREFIX)) {
    String reconsumeTimes = MessageAccessor.getReconsumeTime(msg);
    if (reconsumeTimes != null) {
        requestHeader.setReconsumeTimes(Integer.valueOf(reconsumeTimes));
        MessageAccessor.clearProperty(msg, MessageConst.PROPERTY_RECONSUME_TIME);
    }

    String maxReconsumeTimes = MessageAccessor.getMaxReconsumeTimes(msg);
    if (maxReconsumeTimes != null) {
        requestHeader.setMaxReconsumeTimes(Integer.valueOf(maxReconsumeTimes));
        MessageAccessor.clearProperty(msg, MessageConst.PROPERTY_MAX_RECONSUME_TIMES);
    }
}
```

6、发送请求

```java
caseSYNC:
    long costTimeSync = System.currentTimeMillis() - beginStartTime;
    if (timeout < costTimeSync) {
        throw new RemotingTooMuchRequestException("sendKernelImpl call timeout");
    }
    sendResult = this.mQClientFactory.getMQClientAPIImpl().sendMessage(
        brokerAddr,
        mq.getBrokerName(),
        msg,
        requestHeader,
        timeout - costTimeSync,
        communicationMode,
        context,
        this);
    break;
```

第五步：处理响应结果

1、处理状态码

```java
switch (response.getCode()) {
    case ResponseCode.FLUSH_DISK_TIMEOUT: {
        sendStatus = SendStatus.FLUSH_DISK_TIMEOUT;
        break;
    }
    case ResponseCode.FLUSH_SLAVE_TIMEOUT: {
        sendStatus = SendStatus.FLUSH_SLAVE_TIMEOUT;
        break;
    }
    case ResponseCode.SLAVE_NOT_AVAILABLE: {
        sendStatus = SendStatus.SLAVE_NOT_AVAILABLE;
        break;
    }
    case ResponseCode.SUCCESS: {
        sendStatus = SendStatus.SEND_OK;
        break;
    }
    default: {
        throw new MQBrokerException(response.getCode(), response.getRemark(), addr);
    }
}
```

2、构造 SendResult

```java
SendResult sendResult = new SendResult(sendStatus,
    uniqMsgId,
    responseHeader.getMsgId(), messageQueue, responseHeader.getQueueOffset());
sendResult.setTransactionId(responseHeader.getTransactionId());
String regionId = response.getExtFields().get(MessageConst.PROPERTY_MSG_REGION);
String traceOn = response.getExtFields().get(MessageConst.PROPERTY_TRACE_SWITCH);
if (regionId == null || regionId.isEmpty()) {
    regionId = MixAll.DEFAULT_TRACE_REGION_ID;
}
if (traceOn != null && traceOn.equals("false")) {
    sendResult.setTraceOn(false);
} else {
    sendResult.setTraceOn(true);
}
sendResult.setRegionId(regionId);
```
