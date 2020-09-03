# Spring JmsTemplate

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)
- 源码路径: `org.springframework.jms.core.JmsTemplate`

## 源码分析

### send 发送消息

```java
    @Override
    public void send(final String destinationName, final MessageCreator messageCreator) throws JmsException {
        // 执行.
        execute(session -> {
            Destination destination = resolveDestinationName(session, destinationName);
            doSend(session, destination, messageCreator);
            return null;
        }, false);
    }

```

```java
    @Nullable
    public <T> T execute(SessionCallback<T> action, boolean startConnection) throws JmsException {
        Assert.notNull(action, "Callback object must not be null");
        Connection conToClose = null;
        Session sessionToClose = null;
        try {
            Session sessionToUse = ConnectionFactoryUtils.doGetTransactionalSession(
                    obtainConnectionFactory(), this.transactionalResourceFactory, startConnection);
            if (sessionToUse == null) {
                // 创建链接
                conToClose = createConnection();
                // 创建session
                sessionToClose = createSession(conToClose);
                if (startConnection) {
                    conToClose.start();
                }
                sessionToUse = sessionToClose;
            }
            if (logger.isDebugEnabled()) {
                logger.debug("Executing callback on JMS Session: " + sessionToUse);
            }
            /**
             * sessionCallback 执行
             * {@link JmsTemplate#doSend(Session, javax.jms.Destination, org.springframework.jms.core.MessageCreator)}
             */
            return action.doInJms(sessionToUse);
        } catch (JMSException ex) {
            throw convertJmsAccessException(ex);
        } finally {
            // 资源释放
            JmsUtils.closeSession(sessionToClose);
            ConnectionFactoryUtils.releaseConnection(conToClose, getConnectionFactory(), startConnection);
        }
    }

```

- 最后`action.doInJms(sessionToUse)`的操作

```java
            Destination destination = resolveDestinationName(session, destinationName);
            doSend(session, destination, messageCreator);
            return null;
```

- `doSend`真正做的发送方法

```java
    protected void doSend(Session session, Destination destination, MessageCreator messageCreator)
            throws JMSException {

        Assert.notNull(messageCreator, "MessageCreator must not be null");

        // 创建消息生产者
        MessageProducer producer = createProducer(session, destination);
        try {
            // 创建消息
            Message message = messageCreator.createMessage(session);
            if (logger.isDebugEnabled()) {
                logger.debug("Sending created message: " + message);
            }
            // 发送
            doSend(producer, message);
            // Check commit - avoid commit call within a JTA transaction.
            if (session.getTransacted() && isSessionLocallyTransacted(session)) {
                // Transacted session created by this template -> commit.
                JmsUtils.commitIfNecessary(session);
            }
        } finally {
            // 关闭消息生产者
            JmsUtils.closeMessageProducer(producer);
        }
    }

```

1. `createProducer`中通过`javax.jms.Session.createProducer`创建`MessageProducer`,第三方消息中间件独立实现
2. `createMessage`

```java
@Override
public javax.jms.Message createMessage(Session session) throws JMSException {
    try {
        // 消息转换
        return this.messageConverter.toMessage(this.message, session);
    } catch (Exception ex) {
        throw new MessageConversionException("Could not convert '" + this.message + "'", ex);
    }
}
```

- 消息转换后续在更新

3. `doSend` 这里也是第三方消息中间件实现

```java
protected void doSend(MessageProducer producer, Message message) throws JMSException {
    if (this.deliveryDelay >= 0) {
        producer.setDeliveryDelay(this.deliveryDelay);
    }
    if (isExplicitQosEnabled()) {
        // 发送消息,第三方消息中间件实现
        producer.send(message, getDeliveryMode(), getPriority(), getTimeToLive());
    } else {
        producer.send(message);
    }
}
```

4. `closeMessageProducer` 这个方法特别,直接关闭

```java
public static void closeMessageProducer(@Nullable MessageProducer producer) {
    if (producer != null) {
        try {
            producer.close();
        } catch (JMSException ex) {
            logger.trace("Could not close JMS MessageProducer", ex);
        } catch (Throwable ex) {
            // We don't trust the JMS provider: It might throw RuntimeException or Error.
            logger.trace("Unexpected exception on closing JMS MessageProducer", ex);
        }
    }
}

```

### receive 接收消息

```java
    @Override
    @Nullable
    public Message receive(String destinationName) throws JmsException {
        return receiveSelected(destinationName, null);
    }
    @Override
    @Nullable
    public Message receiveSelected(final String destinationName, @Nullable final String messageSelector) throws JmsException {
        return execute(session -> {
            Destination destination = resolveDestinationName(session, destinationName);
            return doReceive(session, destination, messageSelector);
        }, true);
    }
    @Nullable
    protected Message doReceive(Session session, Destination destination, @Nullable String messageSelector)
            throws JMSException {

        return doReceive(session, createConsumer(session, destination, messageSelector));
    }
    @Nullable
    protected Message doReceive(Session session, MessageConsumer consumer) throws JMSException {
        try {
            // Use transaction timeout (if available).
            long timeout = getReceiveTimeout();
            // 链接工厂
            ConnectionFactory connectionFactory = getConnectionFactory();
            // JMS 资源信息
            JmsResourceHolder resourceHolder = null;
            if (connectionFactory != null) {
                // 从连接对象中获取JMS 资源信息
                resourceHolder = (JmsResourceHolder) TransactionSynchronizationManager.getResource(connectionFactory);
            }
            if (resourceHolder != null && resourceHolder.hasTimeout()) {
                // 超时时间
                timeout = Math.min(timeout, resourceHolder.getTimeToLiveInMillis());
            }
            // 具体的消息
            Message message = receiveFromConsumer(consumer, timeout);
            if (session.getTransacted()) {
                // 事务性操作
                // Commit necessary - but avoid commit call within a JTA transaction.
                if (isSessionLocallyTransacted(session)) {
                    // Transacted session created by this template -> commit.
                    JmsUtils.commitIfNecessary(session);
                }
            } else if (isClientAcknowledge(session)) {
                // Manually acknowledge message, if any.
                if (message != null) {
                    message.acknowledge();
                }
            }
            return message;
        } finally {
            JmsUtils.closeMessageConsumer(consumer);
        }
    }

```
