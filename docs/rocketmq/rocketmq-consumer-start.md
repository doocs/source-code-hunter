该文所涉及的 RocketMQ 源码版本为 4.9.3。

# RocketMQ 消费者启动流程

org.apache.rocketmq.client.impl.consumer.DefaultMQPushConsumerImpl#start

`1、检查配置信息`

org.apache.rocketmq.client.impl.consumer.DefaultMQPushConsumerImpl#checkConfig

校验消费组的长度不能大于 255

`public static final int CHARACTER_MAX_LENGTH = 255;`

```java
if (group.length() >CHARACTER_MAX_LENGTH) {
    throw new MQClientException("the specified group is longer than group max length 255.", null);
}
```

消费组名称只能包含数字、字母、%、-、\_、|

```java
// regex: ^[%|a-zA-Z0-9_-]+$
// %
VALID_CHAR_BIT_MAP['%'] = true;
// -
VALID_CHAR_BIT_MAP['-'] = true;
// _
VALID_CHAR_BIT_MAP['_'] = true;
// |
VALID_CHAR_BIT_MAP['|'] = true;
for (int i = 0; i <VALID_CHAR_BIT_MAP.length; i++) {
    if (i >= '0' && i <= '9') {
        // 0-9
        VALID_CHAR_BIT_MAP[i] = true;
    } else if (i >= 'A' && i <= 'Z') {
        // A-Z
        VALID_CHAR_BIT_MAP[i] = true;
    } else if (i >= 'a' && i <= 'z') {
        // a-z
        VALID_CHAR_BIT_MAP[i] = true;
    }
}
```

```java
public static boolean isTopicOrGroupIllegal(String str) {
    int strLen = str.length();
    int len =VALID_CHAR_BIT_MAP.length;
    boolean[] bitMap =VALID_CHAR_BIT_MAP;
    for (int i = 0; i < strLen; i++) {
        char ch = str.charAt(i);
        if (ch >= len || !bitMap[ch]) {
            return true;
        }
    }
    return false;
}
```

消费组名称不能是`DEFAULT_CONSUMER`

`public static final String DEFAULT_CONSUMER_GROUP = "DEFAULT_CONSUMER";`

```java
if (this.defaultMQPushConsumer.getConsumerGroup().equals(MixAll.DEFAULT_CONSUMER_GROUP)) {
    throw new MQClientException("consumerGroup can not equal " + MixAll.DEFAULT_CONSUMER_GROUP
+ ", please specify another one." + FAQUrl.suggestTodo(FAQUrl.CLIENT_PARAMETER_CHECK_URL), null);
}
```

消费者最小线程数需要在 1-1000 之间

```java
if (this.defaultMQPushConsumer.getConsumeThreadMin() < 1
    || this.defaultMQPushConsumer.getConsumeThreadMin() > 1000) {
    throw new MQClientException("consumeThreadMin Out of range [1, 1000]"
            + FAQUrl.suggestTodo(FAQUrl.CLIENT_PARAMETER_CHECK_URL), null);
}
```

消费者最大线程数需要在 1-1000 之间

```java
if (this.defaultMQPushConsumer.getConsumeThreadMax() < 1 || this.defaultMQPushConsumer.getConsumeThreadMax() > 1000) {
    throw new MQClientException("consumeThreadMax Out of range [1, 1000]"
            + FAQUrl.suggestTodo(FAQUrl.CLIENT_PARAMETER_CHECK_URL), null);
}
```

`2、设置订阅信息`

构造主题订阅消息`SubscriptionData`并将其加入`RebalanceImpl`，如果是消费模式是集群，订阅默认的重试主题并且构造`SubscriptionData`加入`RebalanceImpl`

```java
private void copySubscription() throws MQClientException {
    try {
        Map<String, String> sub = this.defaultMQPushConsumer.getSubscription();
        if (sub != null) {
            for (final Map.Entry<String, String> entry : sub.entrySet()) {
                final String topic = entry.getKey();
                final String subString = entry.getValue();
                SubscriptionData subscriptionData = FilterAPI.buildSubscriptionData(topic, subString);
                this.rebalanceImpl.getSubscriptionInner().put(topic, subscriptionData);
            }
        }

        if (null == this.messageListenerInner) {
            this.messageListenerInner = this.defaultMQPushConsumer.getMessageListener();
        }

        switch (this.defaultMQPushConsumer.getMessageModel()) {
            caseBROADCASTING:
                break;
            caseCLUSTERING:
                final String retryTopic = MixAll.getRetryTopic(this.defaultMQPushConsumer.getConsumerGroup());
                SubscriptionData subscriptionData = FilterAPI.buildSubscriptionData(retryTopic, SubscriptionData.SUB_ALL);
                this.rebalanceImpl.getSubscriptionInner().put(retryTopic, subscriptionData);
                break;
            default:
                break;
        }
    } catch (Exception e) {
        throw new MQClientException("subscription exception", e);
    }
}
```

`3、初始化MqClientInstance、RebalanceImpl、PullApiWrapper`

创建`MqClientInstance`， 无论在生产者端还是消费者端都是一个很重要的类， 封装了 Topic 信息、broker 信息，当然还有生产者和消费者的信息。

```java
public MQClientInstance getOrCreateMQClientInstance(final ClientConfig clientConfig, RPCHook rpcHook) {
    String clientId = clientConfig.buildMQClientId();
    MQClientInstance instance = this.factoryTable.get(clientId);
    if (null == instance) {
        instance = new MQClientInstance(clientConfig.cloneClientConfig(),
                this.factoryIndexGenerator.getAndIncrement(), clientId, rpcHook);
        MQClientInstance prev = this.factoryTable.putIfAbsent(clientId, instance);
        if (prev != null) {
            instance = prev;
            log.warn("Returned Previous MQClientInstance for clientId:[{}]", clientId);
        } else {
            log.info("Created new MQClientInstance for clientId:[{}]", clientId);
        }
    }

    return instance;
}
```

构造`RebalanceImpl` 用来负载消费者与队列的消费关系

```java
this.rebalanceImpl.setConsumerGroup(this.defaultMQPushConsumer.getConsumerGroup());
this.rebalanceImpl.setMessageModel(this.defaultMQPushConsumer.getMessageModel());
this.rebalanceImpl.setAllocateMessageQueueStrategy(this.defaultMQPushConsumer.getAllocateMessageQueueStrategy());
this.rebalanceImpl.setmQClientFactory(this.mQClientFactory);
```

构造`PullApiWrapper` 消费者拉取消息类

```java
this.pullAPIWrapper = new PullAPIWrapper(mQClientFactory, this.defaultMQPushConsumer.getConsumerGroup(), isUnitMode());
this.pullAPIWrapper.registerFilterMessageHook(filterMessageHookList);
```

`4、设置消息偏移量`

如果是广播模式消费，消息消费进度存储在消费端，如果是集群模式消费，消息消费进度存储在 broker 端

```java
if (this.defaultMQPushConsumer.getOffsetStore() != null) {
    this.offsetStore = this.defaultMQPushConsumer.getOffsetStore();
} else {
    switch (this.defaultMQPushConsumer.getMessageModel()) {
        caseBROADCASTING:
            this.offsetStore = new LocalFileOffsetStore(this.mQClientFactory, this.defaultMQPushConsumer.getConsumerGroup());
            break;
        caseCLUSTERING:
            this.offsetStore = new RemoteBrokerOffsetStore(this.mQClientFactory, this.defaultMQPushConsumer.getConsumerGroup());
            break;
        default:
            break;
    }
    this.defaultMQPushConsumer.setOffsetStore(this.offsetStore);
}
this.offsetStore.load();
```

`5、是否是顺序消费`

根据是否是顺序消费构造不同的`ConsumeMessageService`

```java
if (this.getMessageListenerInner() instanceof MessageListenerOrderly) {
    this.consumeOrderly = true;
    this.consumeMessageService = new ConsumeMessageOrderlyService(this, (MessageListenerOrderly) this.getMessageListenerInner());
} else if (this.getMessageListenerInner() instanceof MessageListenerConcurrently) {
    this.consumeOrderly = false;
    this.consumeMessageService = new ConsumeMessageConcurrentlyService(this, (MessageListenerConcurrently) this.getMessageListenerInner());
}
```

区别在于启动的线程任务不同：

顺序消费线程：

```java
if (MessageModel.CLUSTERING.equals(ConsumeMessageOrderlyService.this.defaultMQPushConsumerImpl.messageModel())) {
    this.scheduledExecutorService.scheduleAtFixedRate(new Runnable() {
        @Override
        public void run() {
            try {
                ConsumeMessageOrderlyService.this.lockMQPeriodically();
            } catch (Throwable e) {
                log.error("scheduleAtFixedRate lockMQPeriodically exception", e);
            }
        }
    }, 1000 * 1, ProcessQueue.REBALANCE_LOCK_INTERVAL, TimeUnit.MILLISECONDS);
}
```

正常消费线程：

```java
this.cleanExpireMsgExecutors.scheduleAtFixedRate(new Runnable() {

    @Override
    public void run() {
        try {
            cleanExpireMsg();
        } catch (Throwable e) {
            log.error("scheduleAtFixedRate cleanExpireMsg exception", e);
        }
    }

}, this.defaultMQPushConsumer.getConsumeTimeout(), this.defaultMQPushConsumer.getConsumeTimeout(), TimeUnit.MINUTES);
```

6`、启动MQClientInstance`

消费者与生产者共用 MQClientInstance

大部分流程已经在生产者启动流程中讲解，这里主要讲解与生产者不同的部分

启动保证消费者偏移量最终一致性的任务

```java
this.scheduledExecutorService.scheduleAtFixedRate(new Runnable() {

    @Override
    public void run() {
        try {
            MQClientInstance.this.persistAllConsumerOffset();
        } catch (Exception e) {
            log.error("ScheduledTask persistAllConsumerOffset exception", e);
        }
    }
}, 1000 * 10, this.clientConfig.getPersistConsumerOffsetInterval(), TimeUnit.MILLISECONDS);
```

启动调整线程池大小任务：

```java
this.scheduledExecutorService.scheduleAtFixedRate(new Runnable() {

    @Override
    public void run() {
        try {
            MQClientInstance.this.adjustThreadPool();
        } catch (Exception e) {
            log.error("ScheduledTask adjustThreadPool exception", e);
        }
    }
}, 1, 1, TimeUnit.MINUTES);
```

启动重平衡服务：

`this.rebalanceService.start();`

7`、更新订阅主题信息`

更新主题订阅信息：

```java
private void updateTopicSubscribeInfoWhenSubscriptionChanged() {
    Map<String, SubscriptionData> subTable = this.getSubscriptionInner();
    if (subTable != null) {
        for (final Map.Entry<String, SubscriptionData> entry : subTable.entrySet()) {
            final String topic = entry.getKey();
            this.mQClientFactory.updateTopicRouteInfoFromNameServer(topic);
        }
    }
}
```
