nameserver如何与broker进行通信的？

nameserver每隔10s扫描一次Broker，移除处于未激活状态的Broker

核心代码：

`this.scheduledExecutorService.scheduleAtFixedRate(NamesrvController.this.routeInfoManager::scanNotActiveBroker, 5, 10, TimeUnit.*SECONDS*);`

```
public int scanNotActiveBroker() {
    int removeCount = 0;
    Iterator<Entry<String, BrokerLiveInfo>> it = this.brokerLiveTable.entrySet().iterator();
    while (it.hasNext()) {
        Entry<String, BrokerLiveInfo> next = it.next();
        long last = next.getValue().getLastUpdateTimestamp();
        if ((last +BROKER_CHANNEL_EXPIRED_TIME) < System.currentTimeMillis()) {
            RemotingUtil.closeChannel(next.getValue().getChannel());
            it.remove();
            log.warn("The broker channel expired, {} {}ms", next.getKey(),BROKER_CHANNEL_EXPIRED_TIME);
            this.onChannelDestroy(next.getKey(), next.getValue().getChannel());

            removeCount++;
        }
    }

    return removeCount;
}
```

broker每隔30秒会向集群中所有的NameServer发送心跳包

核心代码：

```
this.scheduledExecutorService.scheduleAtFixedRate(new Runnable() {

    @Override
    public void run() {
        try {
            BrokerController.this.registerBrokerAll(true, false, brokerConfig.isForceRegister());
        } catch (Throwable e) {
            log.error("registerBrokerAll Exception", e);
        }
    }
}, 1000 * 10, Math.max(10000, Math.min(brokerConfig.getRegisterNameServerPeriod(), 60000)), TimeUnit.MILLISECONDS);
```

```
public synchronized void registerBrokerAll(final boolean checkOrderConfig, boolean oneway, boolean forceRegister) {
    TopicConfigSerializeWrapper topicConfigWrapper = this.getTopicConfigManager().buildTopicConfigSerializeWrapper();

    if (!PermName.isWriteable(this.getBrokerConfig().getBrokerPermission())
        || !PermName.isReadable(this.getBrokerConfig().getBrokerPermission())) {
        ConcurrentHashMap<String, TopicConfig> topicConfigTable = new ConcurrentHashMap<String, TopicConfig>();
        for (TopicConfig topicConfig : topicConfigWrapper.getTopicConfigTable().values()) {
            TopicConfig tmp =
                new TopicConfig(topicConfig.getTopicName(), topicConfig.getReadQueueNums(), topicConfig.getWriteQueueNums(),
                    this.brokerConfig.getBrokerPermission());
            topicConfigTable.put(topicConfig.getTopicName(), tmp);
        }
        topicConfigWrapper.setTopicConfigTable(topicConfigTable);
    }

    if (forceRegister || needRegister(this.brokerConfig.getBrokerClusterName(),
        this.getBrokerAddr(),
        this.brokerConfig.getBrokerName(),
        this.brokerConfig.getBrokerId(),
        this.brokerConfig.getRegisterBrokerTimeoutMills())) {
        doRegisterBrokerAll(checkOrderConfig, oneway, topicConfigWrapper);
    }
}
```

org.apache.rocketmq.namesrv.processor.DefaultRequestProcessor 是网络处理器解析请求类型，如果请求类型为`*RequestCode.REGISTER_BROKER`，则请求最终转发到org.apache.rocketmq.namesrv.routeinfo.RouteInfoManager#registerBroker*

代码太多，文字来描述一下：

第一步：路由注册需要加写锁，防止并发修改RouteInfoManager中的路由表。首先判断Broker所属集群是否存在，如果不存在，则创建集群，然后将broker名加入集群。

第二步：维护BrokerData信息，首先从brokerAddrTable中根据 broker名尝试获取Broker信息，如果不存在，则新建BrokerData放入brokerAddrTable，registerFirst设置为true；如果存在，直接替换原先的Broker信息，registerFirst设置为false，表示非第一次注册

第三步：如果Broker为主节点，并且Broker的topic配置信息发生变化或者是初次注册，则需要创建或者更新topic的路由元数据，并填充topicQueueTable

根据topicConfig创建QueueData数据结构然后更新topicQueueTable

```
private void createAndUpdateQueueData(final String brokerName, final TopicConfig topicConfig) {
    QueueData queueData = new QueueData();
    queueData.setBrokerName(brokerName);
    queueData.setWriteQueueNums(topicConfig.getWriteQueueNums());
    queueData.setReadQueueNums(topicConfig.getReadQueueNums());
    queueData.setPerm(topicConfig.getPerm());
    queueData.setTopicSysFlag(topicConfig.getTopicSysFlag());

    Map<String, QueueData> queueDataMap = this.topicQueueTable.get(topicConfig.getTopicName());
    if (null == queueDataMap) {
        queueDataMap = new HashMap<>();
        queueDataMap.put(queueData.getBrokerName(), queueData);
        this.topicQueueTable.put(topicConfig.getTopicName(), queueDataMap);
        log.info("new topic registered, {} {}", topicConfig.getTopicName(), queueData);
    } else {
        QueueData old = queueDataMap.put(queueData.getBrokerName(), queueData);
        if (old != null && !old.equals(queueData)) {
        log.info("topic changed, {} OLD: {} NEW: {}", topicConfig.getTopicName(), old,
                    queueData);
        }
    }
}
```

第四步：更新BrokerLiveInfo,存储状态正常的Broker信息表，BrokerLiveInfo是执行路由删除操作的重要依据。

```
BrokerLiveInfo prevBrokerLiveInfo = this.brokerLiveTable.put(brokerAddr,
        new BrokerLiveInfo(
                System.currentTimeMillis(),
                topicConfigWrapper.getDataVersion(),
                channel,
                haServerAddr));
```

第五步：注册Broker的过滤器Server地址列表，一个Broker上会关联多个 FilterServer消息过滤服务器。如果此Broker为从节点，则需要查找该Broker的主节点信息，并更新对应的masterAddr属性

```
if (MixAll.MASTER_ID!= brokerId) {
    String masterAddr = brokerData.getBrokerAddrs().get(MixAll.MASTER_ID);
    if (masterAddr != null) {
        BrokerLiveInfo brokerLiveInfo = this.brokerLiveTable.get(masterAddr);
        if (brokerLiveInfo != null) {
            result.setHaServerAddr(brokerLiveInfo.getHaServerAddr());
            result.setMasterAddr(masterAddr);
        }
    }
}
```

总结：

    NameServer与Broker保持长连接，Broker的状态信息存储在BrokerLiveTable中，NameServer每收到一个心跳包，将更新brokerLiveTable中关于broker的状态信息以及路由表（topicQueueTable、brokerAddrTable、brokerLiveTable、filterServerTable）。更新上述路由表使用了锁粒度较少的读写锁，允许多个消息发送者并发读操作，保证消息发送时的高并发，同一时刻NameServer只处理一个Broker心跳包，多个心跳包请求串行执行。

NameServer如何剔除失效的Broker？

1、NameServer每隔十秒注册一次brokerLiveTable状态表，如果BrokerLive的lastUpdateTimestamp

时间戳距当前时间超过120秒，则认为Broker失效，移除该Broker，关闭与broker的连接，同时更新topicQueueTable、brokerAddrTable、brokerLiveTable、filterServerTable。

2、如果broker在正常关闭的情况下，会发送unRegisterBroker指令。

不管是哪一种方式触发的路由删除，处理逻辑是一样的

第一步：申请写锁，移除brokerLiveTable、filterServerTable中Broker相关的信息

```
this.lock.writeLock().lockInterruptibly();
BrokerLiveInfo brokerLiveInfo = this.brokerLiveTable.remove(brokerAddr);
log.info("unregisterBroker, remove from brokerLiveTable {}, {}",brokerLiveInfo != null ? "OK" : "Failed",brokerAddr);
this.filterServerTable.remove(brokerAddr);
```

第二步：维护brokerAddrTable，找到具体的broker，将其从brokerData中移除，如果移除之后不再包含其他broker，则在brokerAddrtable移除该brokerName对应的数据

```
BrokerData brokerData = this.brokerAddrTable.get(brokerName);
if (null != brokerData) {
    String addr = brokerData.getBrokerAddrs().remove(brokerId);
    log.info("unregisterBroker, remove addr from brokerAddrTable {}, {}",addr != null ? "OK" : "Failed",brokerAddr);

    if (brokerData.getBrokerAddrs().isEmpty()) {
        this.brokerAddrTable.remove(brokerName);
        log.info("unregisterBroker, remove name from brokerAddrTable OK, {}",brokerName);
        removeBrokerName = true;
    }
}
```

第三步：根据brokerName从clusterAddrTable中找到Broker并将其中集群中移除，如果移除后集群中不包含任何Broker，则将该集群从clusterAddrTable中移除

```
if (removeBrokerName) {
    Set<String> nameSet = this.clusterAddrTable.get(clusterName);
    if (nameSet != null) {
        boolean removed = nameSet.remove(brokerName);
        log.info("unregisterBroker, remove name from clusterAddrTable {}, {}",removed ? "OK" : "Failed",brokerName);

        if (nameSet.isEmpty()) {
            this.clusterAddrTable.remove(clusterName);
            log.info("unregisterBroker, remove cluster from clusterAddrTable {}",clusterName);
        }
    }
    
}
```

第四步： 根据brokerName，遍历所有主题的队列，如果队列中包含当前broker的队列，则移除，如果topic中包含待移除的Broker的队列，从路由表中删除该topic

```
this.topicQueueTable.forEach((topic, queueDataMap) -> {
    QueueData old = queueDataMap.remove(brokerName);
    if (old != null) {
        log.info("removeTopicByBrokerName, remove one broker's topic {} {}", topic, old);
    }

    if (queueDataMap.size() == 0) {
        noBrokerRegisterTopic.add(topic);
        log.info("removeTopicByBrokerName, remove the topic all queue {}", topic);
    }
});
```

第五步：

释放锁，完成路由删除

```
 finally {
    this.lock.writeLock().unlock();
}
```