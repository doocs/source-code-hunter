该文所涉及的 RocketMQ 源码版本为 4.9.3。

# RocketMQ 消息发送存储流程

第一步：检查消息存储状态

org.apache.rocketmq.store.DefaultMessageStore#checkStoreStatus

1、检查 broker 是否可用

```java
if (this.shutdown) {
log.warn("message store has shutdown, so putMessage is forbidden");
    return PutMessageStatus.SERVICE_NOT_AVAILABLE;
}
```

2、检查 broker 的角色

```java
if (BrokerRole.SLAVE== this.messageStoreConfig.getBrokerRole()) {
    long value = this.printTimes.getAndIncrement();
    if ((value % 50000) == 0) {
log.warn("broke role is slave, so putMessage is forbidden");
    }
    return PutMessageStatus.SERVICE_NOT_AVAILABLE;
}
```

3、检查 messageStore 是否可写

```java
if (!this.runningFlags.isWriteable()) {
    long value = this.printTimes.getAndIncrement();
    if ((value % 50000) == 0) {
log.warn("the message store is not writable. It may be caused by one of the following reasons: " +
            "the broker's disk is full, write to logic queue error, write to index file error, etc");
    }
    return PutMessageStatus.SERVICE_NOT_AVAILABLE;
} else {
    this.printTimes.set(0);
}
```

4、检查 pageCache

```java
if (this.isOSPageCacheBusy()) {
    return PutMessageStatus.OS_PAGECACHE_BUSY;
}
```

第二步：检查消息

org.apache.rocketmq.store.DefaultMessageStore#checkMessage

1、校验主题的长度不能大于 127

```java
if (msg.getTopic().length() > Byte.MAX_VALUE) {
log.warn("putMessage message topic length too long " + msg.getTopic().length());
    return PutMessageStatus.MESSAGE_ILLEGAL;
}
```

2、校验属性的长度不能大于 32767

```java
if (msg.getPropertiesString() != null && msg.getPropertiesString().length() > Short.MAX_VALUE) {
log.warn("putMessage message properties length too long " + msg.getPropertiesString().length());
    return PutMessageStatus.MESSAGE_ILLEGAL;
}
```

第三步：获取当前可以写入的 CommitLog 文件

CommitLog 文件的存储目录为${ROCKET_HOME}/store/commitlog ,MappedFileQueue 对应此文件夹，MappedFile 对应文件夹下的文件

```java
msg.setStoreTimestamp(beginLockTimestamp);

if (null == mappedFile || mappedFile.isFull()) {
    mappedFile = this.mappedFileQueue.getLastMappedFile(0); // Mark: NewFile may be cause noise
}
if (null == mappedFile) {
    log.error("create mapped file1 error, topic: " + msg.getTopic() + " clientAddr: " + msg.getBornHostString());
    return CompletableFuture.completedFuture(new PutMessageResult(PutMessageStatus.CREATE_MAPEDFILE_FAILED, null));
}
```

如果是第一次写入或者最新偏移量所属文件已满，创建新的文件

```java
public MappedFile getLastMappedFile(final long startOffset, boolean needCreate) {
    long createOffset = -1;
    MappedFile mappedFileLast = getLastMappedFile();

    if (mappedFileLast == null) {
        createOffset = startOffset - (startOffset % this.mappedFileSize);
    }

    if (mappedFileLast != null && mappedFileLast.isFull()) {
        createOffset = mappedFileLast.getFileFromOffset() + this.mappedFileSize;
    }

    if (createOffset != -1 && needCreate) {
        return tryCreateMappedFile(createOffset);
    }

    return mappedFileLast;
}
```

第四步：将消息写入到 MappedFile 中

```java
public AppendMessageResult appendMessagesInner(final MessageExt messageExt, final AppendMessageCallback cb,
        PutMessageContext putMessageContext) {
    assert messageExt != null;
    assert cb != null;

    int currentPos = this.wrotePosition.get();

    if (currentPos < this.fileSize) {
        ByteBuffer byteBuffer = writeBuffer != null ? writeBuffer.slice() : this.mappedByteBuffer.slice();
        byteBuffer.position(currentPos);
        AppendMessageResult result;
        if (messageExt instanceof MessageExtBrokerInner) {
            result = cb.doAppend(this.getFileFromOffset(), byteBuffer, this.fileSize - currentPos,
                    (MessageExtBrokerInner) messageExt, putMessageContext);
        } else if (messageExt instanceof MessageExtBatch) {
            result = cb.doAppend(this.getFileFromOffset(), byteBuffer, this.fileSize - currentPos,
                    (MessageExtBatch) messageExt, putMessageContext);
        } else {
            return new AppendMessageResult(AppendMessageStatus.UNKNOWN_ERROR);
        }
        this.wrotePosition.addAndGet(result.getWroteBytes());
        this.storeTimestamp = result.getStoreTimestamp();
        return result;
    }
log.error("MappedFile.appendMessage return null, wrotePosition: {} fileSize: {}", currentPos, this.fileSize);
    return new AppendMessageResult(AppendMessageStatus.UNKNOWN_ERROR);
}
```

org.apache.rocketmq.store.CommitLog.DefaultAppendMessageCallback#doAppend(long, java.nio.ByteBuffer, int, org.apache.rocketmq.store.MessageExtBrokerInner, org.apache.rocketmq.store.CommitLog.PutMessageContext)

计算要写入的偏移量

`long wroteOffset = fileFromOffset + byteBuffer.position();`

对事务消息做特殊处理：

```java
final int tranType = MessageSysFlag.getTransactionValue(msgInner.getSysFlag());
switch (tranType) {
    // Prepared and Rollback message is not consumed, will not enter the
    // consumer queue
    case MessageSysFlag.TRANSACTION_PREPARED_TYPE:
    case MessageSysFlag.TRANSACTION_ROLLBACK_TYPE:
        queueOffset = 0L;
        break;
    case MessageSysFlag.TRANSACTION_NOT_TYPE:
    case MessageSysFlag.TRANSACTION_COMMIT_TYPE:
    default:
        break;
}
```

构造 AppendMessageResult：

```java
AppendMessageResult result = new AppendMessageResult(AppendMessageStatus.PUT_OK, wroteOffset, msgLen, msgIdSupplier,
    msgInner.getStoreTimestamp(), queueOffset, CommitLog.this.defaultMessageStore.now() - beginTimeMills);
```

事务消息特殊处理：

```java
switch (tranType) {
    case MessageSysFlag.TRANSACTION_PREPARED_TYPE:
    case MessageSysFlag.TRANSACTION_ROLLBACK_TYPE:
        break;
    case MessageSysFlag.TRANSACTION_NOT_TYPE:
    case MessageSysFlag.TRANSACTION_COMMIT_TYPE:
        // The next update ConsumeQueue information
        CommitLog.this.topicQueueTable.put(key, ++queueOffset);
        CommitLog.this.multiDispatch.updateMultiQueueOffset(msgInner);
        break;
    default:
        break;
}
```
