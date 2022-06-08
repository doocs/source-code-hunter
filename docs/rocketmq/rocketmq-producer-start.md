该文所涉及的 RocketMQ 源码版本为 4.9.3。

# RocketMQ 生产者启动流程

入口：

org.apache.rocketmq.client.producer.DefaultMQProducer#start

```java
@Override
    public void start() throws MQClientException {
        this.setProducerGroup(withNamespace(this.producerGroup));
        this.defaultMQProducerImpl.start();
        if (null != traceDispatcher) {
            try {
                traceDispatcher.start(this.getNamesrvAddr(), this.getAccessChannel());
            } catch (MQClientException e) {
                log.warn("trace dispatcher start failed ", e);
            }
        }
    }
```

第一步、检查 producerGroup

```java
private void checkConfig() throws MQClientException {
        Validators.checkGroup(this.defaultMQProducer.getProducerGroup());

        if (null == this.defaultMQProducer.getProducerGroup()) {
            throw new MQClientException("producerGroup is null", null);
        }

        if (this.defaultMQProducer.getProducerGroup().equals(MixAll.DEFAULT_PRODUCER_GROUP)) {
            throw new MQClientException("producerGroup can not equal " + MixAll.DEFAULT_PRODUCER_GROUP + ", please specify another one.",null);
        }
    }
```

第二步、设置 instanceName

```java
public void changeInstanceNameToPID() {
    if (this.instanceName.equals("DEFAULT")) {
        this.instanceName = UtilAll.getPid() + "#" + System.nanoTime();
    }
}
```

第三步、创建 mqClientInstance,它是与 nameserver 和 broker 通信的中介

```java
public MQClientInstance getOrCreateMQClientInstance(final ClientConfig clientConfig, RPCHook rpcHook) {
        String clientId = clientConfig.buildMQClientId();
        MQClientInstance instance = this.factoryTable.get(clientId);
        if (null == instance) {
            instance =
                new MQClientInstance(clientConfig.cloneClientConfig(),
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

第四步、将生产者加入 mqClientInstance 管理

```java
public synchronized boolean registerProducer(final String group, final DefaultMQProducerImpl producer) {
    if (null == group || null == producer) {
        return false;
    }

    MQProducerInner prev = this.producerTable.putIfAbsent(group, producer);
    if (prev != null) {
        log.warn("the producer group[{}] exist already.", group);
        return false;
    }

    return true;
}
```

第五步、启动 MQClientInstance（有一些关于消费者的任务 会在消费者启动流程中讲解）

1. 启动 netty 客户端 ，创建与 nameserver、broker 通信的 channel

```java
public void start() {
    this.defaultEventExecutorGroup = new DefaultEventExecutorGroup(
        nettyClientConfig.getClientWorkerThreads(),
        new ThreadFactory() {

            private AtomicInteger threadIndex = new AtomicInteger(0);

            @Override
            public Thread newThread(Runnable r) {
                return new Thread(r, "NettyClientWorkerThread_" + this.threadIndex.incrementAndGet());
            }
        });

    Bootstrap handler = this.bootstrap.group(this.eventLoopGroupWorker).channel(NioSocketChannel.class)
        .option(ChannelOption.TCP_NODELAY, true)
        .option(ChannelOption.SO_KEEPALIVE, false)
        .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, nettyClientConfig.getConnectTimeoutMillis())
        .handler(new ChannelInitializer<SocketChannel>() {
            @Override
            public void initChannel(SocketChannel ch) throws Exception {
                ChannelPipeline pipeline = ch.pipeline();
                if (nettyClientConfig.isUseTLS()) {
                    if (null != sslContext) {
                        pipeline.addFirst(defaultEventExecutorGroup, "sslHandler", sslContext.newHandler(ch.alloc()));
                        log.info("Prepend SSL handler");
                    } else {
                        log.warn("Connections are insecure as SSLContext is null!");
                    }
                }
                pipeline.addLast(
                    defaultEventExecutorGroup,
                    new NettyEncoder(),
                    new NettyDecoder(),
                    new IdleStateHandler(0, 0, nettyClientConfig.getClientChannelMaxIdleTimeSeconds()),
                    new NettyConnectManageHandler(),
                    new NettyClientHandler());
            }
        });
    if (nettyClientConfig.getClientSocketSndBufSize() > 0) {
        log.info("client set SO_SNDBUF to {}", nettyClientConfig.getClientSocketSndBufSize());
        handler.option(ChannelOption.SO_SNDBUF, nettyClientConfig.getClientSocketSndBufSize());
    }
    if (nettyClientConfig.getClientSocketRcvBufSize() > 0) {
        log.info("client set SO_RCVBUF to {}", nettyClientConfig.getClientSocketRcvBufSize());
        handler.option(ChannelOption.SO_RCVBUF, nettyClientConfig.getClientSocketRcvBufSize());
    }
    if (nettyClientConfig.getWriteBufferLowWaterMark() > 0 && nettyClientConfig.getWriteBufferHighWaterMark() > 0) {
        log.info("client set netty WRITE_BUFFER_WATER_MARK to {},{}",nettyClientConfig.getWriteBufferLowWaterMark(), nettyClientConfig.getWriteBufferHighWaterMark());
        handler.option(ChannelOption.WRITE_BUFFER_WATER_MARK, new WriteBufferWaterMark(
                nettyClientConfig.getWriteBufferLowWaterMark(), nettyClientConfig.getWriteBufferHighWaterMark()));
    }

    this.timer.scheduleAtFixedRate(new TimerTask() {
        @Override
        public void run() {
            try {
                NettyRemotingClient.this.scanResponseTable();
            } catch (Throwable e) {
                log.error("scanResponseTable exception", e);
            }
        }
    }, 1000 * 3, 1000);

    if (this.channelEventListener != null) {
        this.nettyEventExecutor.start();
    }
}
```

2. 启动一些周期性的任务：

更新 nameserver 地址的任务：

```java
if (null == this.clientConfig.getNamesrvAddr()) {
    this.scheduledExecutorService.scheduleAtFixedRate(new Runnable() {

        @Override
        public void run() {
            try {
                MQClientInstance.this.mQClientAPIImpl.fetchNameServerAddr();
            } catch (Exception e) {
                log.error("ScheduledTask fetchNameServerAddr exception", e);
            }
        }
    }, 1000 * 10, 1000 * 60 * 2, TimeUnit.MILLISECONDS);
}
```

更新 topic 路由信息的任务：

```java
this.scheduledExecutorService.scheduleAtFixedRate(new Runnable() {

    @Override
    public void run() {
        try {
            MQClientInstance.this.updateTopicRouteInfoFromNameServer();
        } catch (Exception e) {
            log.error("ScheduledTask updateTopicRouteInfoFromNameServer exception", e);
        }
    }
}, 10, this.clientConfig.getPollNameServerInterval(), TimeUnit.MILLISECONDS);
```

更新 broker 的任务：

```java
this.scheduledExecutorService.scheduleAtFixedRate(new Runnable() {

    @Override
    public void run() {
        try {
            MQClientInstance.this.cleanOfflineBroker();
            MQClientInstance.this.sendHeartbeatToAllBrokerWithLock();
        } catch (Exception e) {
            log.error("ScheduledTask sendHeartbeatToAllBroker exception", e);
        }
    }
}, 1000, this.clientConfig.getHeartbeatBrokerInterval(), TimeUnit.MILLISECONDS);
```

启动拉取消息线程：

`this.pullMessageService.start();`

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
