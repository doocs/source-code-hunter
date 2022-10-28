该文所涉及的 RocketMQ 源码版本为 4.9.3。

# RocketMQ ConsumeQueue 详解

RocketMQ 基于主题订阅模式实现消息消费，消费者关注每一个主题下的所有消息，但是同一主题下的消息是不连续地存储在 CommitLog 文件中的，如果消费者直接从消息存储文件中遍历查找主题下的消息，效率会特别低。所以为了在查找消息的时候效率更高一些，设计了 ConsumeQueue 文件，可以看作 CommitLog 消费的目录文件.

ConsumeQueue 的第一级目录为消息主题名称，第二级目录为主题的队列 id

为了加速 ConsumeQueue 消息的查询速度并节省磁盘空间，不会存储消息的全量信息，只会 存储一些 关键信息，如 8 字节的 CommmitLog 偏移量、4 字节的文件大小、8 字节的 tag 哈希码

1、根据消息存储时间查找物理偏移量：

org.apache.rocketmq.store.ConsumeQueue#getOffsetInQueueByTime

第一步：根据时间戳定位物理文件

```java
public MappedFile getMappedFileByTime(final long timestamp) {
    Object[] mfs = this.copyMappedFiles(0);

    if (null == mfs)
        return null;

    for (int i = 0; i < mfs.length; i++) {
        MappedFile mappedFile = (MappedFile) mfs[i];
        if (mappedFile.getLastModifiedTimestamp() >= timestamp) {
            return mappedFile;
        }
    }

    return (MappedFile) mfs[mfs.length - 1];
}
```

从第一个文件 开始，找到第一个更新时间大于该时间戳的文件

第二步：利用二分查找法来加速检索

计算最低查找偏移量，如果消息队列偏移量大于文件的偏移量，则最低偏移量等于消息队列偏移量减去文件的偏移量，反之为 0

`int low = minLogicOffset > mappedFile.getFileFromOffset() ? (int) (minLogicOffset - mappedFile.getFileFromOffset()) : 0;`

计算中间偏移量，其中*`CQ_STORE_UNIT_SIZE` =* 8 字节的 CommmitLog 偏移量 + 4 字节的文件大小+8 字节的 tag 哈希码

`midOffset = (low + high) / (2 * *CQ_STORE_UNIT_SIZE*) * *CQ_STORE_UNIT_SIZE*;`

如果得到的物理偏移量小于当前最小物理偏移量，则待查找消息的物理偏移量大于 midOffset，将 low 设置为 midOffset，继续查询

```java
byteBuffer.position(midOffset);
long phyOffset = byteBuffer.getLong();
int size = byteBuffer.getInt();
if (phyOffset < minPhysicOffset) {
    low = midOffset +CQ_STORE_UNIT_SIZE;
    leftOffset = midOffset;
    continue;
}
```

如果得到的物理偏移量大于最小物理偏移量，说明该消息为有效信息，则根据消息物理偏移量和消息长度获取消息存储的时间戳

```java
long storeTime = this.defaultMessageStore.getCommitLog().pickupStoreTimestamp(phyOffset, size);
```

如果存储时间小于 0，则为无效消息，返回 0；

如果存储时间戳等于待查找时间戳，说明查找到了目标消息，设置 targetOffset，跳出循环；

如果存储时间戳大于待查找时间戳，说明待查找消息的物理偏移量小于 midOffset，设置 high 为 midOffset，设置 rightIndexValue 等于 storeTime，设置 rightOffset 为 midOffset；

如果存储时间戳小于待查找时间戳，说明待查找消息的物理偏移量大于 midOffset，设置 low 为 midOffset，设置 leftIndexValue 等于 storeTime，设置 leftOffset 为 midOffset

```java
if (storeTime < 0) {
    return 0;
} else if (storeTime == timestamp) {
    targetOffset = midOffset;
    break;
} else if (storeTime > timestamp) {
    high = midOffset -CQ_STORE_UNIT_SIZE;
    rightOffset = midOffset;
    rightIndexValue = storeTime;
} else {
    low = midOffset +CQ_STORE_UNIT_SIZE;
    leftOffset = midOffset;
    leftIndexValue = storeTime;
}
```

如果 targetOffset 不等于-1，表示找到了存储时间戳等于待查找时间戳的消息；

如果 leftIndexValue 等于-1，返回大于并且最接近待查找消息的时间戳的偏移量

如果 rightIndexValue 等于-1，返回小于并且最接近待查找消息的时间戳的偏移量

```java
if (targetOffset != -1) {

    offset = targetOffset;
} else {
    if (leftIndexValue == -1) {
        offset = rightOffset;
    } else if (rightIndexValue == -1) {
        offset = leftOffset;
    } else {
        offset = Math.abs(timestamp - leftIndexValue) > Math.abs(timestamp - rightIndexValue) ? rightOffset : leftOffset;
    }
}
```

2、根据当前偏移量获取下一个文件的偏移量

org.apache.rocketmq.store.ConsumeQueue#rollNextFile

```java
public long rollNextFile(final long index) {
    int mappedFileSize = this.mappedFileSize;
    int totalUnitsInFile = mappedFileSize /CQ_STORE_UNIT_SIZE;
    return index + totalUnitsInFile - index % totalUnitsInFile;
}
```

3、ConsumeQueue 添加消息

org.apache.rocketmq.store.ConsumeQueue#putMessagePositionInfo

将消息偏移量、消息长度、tag 哈希码写入 ByteBuffer，将内容追加到 ConsumeQueue 的内存映射文件中。

```java
private boolean putMessagePositionInfo(final long offset, final int size, final long tagsCode,
    final long cqOffset) {

    if (offset + size <= this.maxPhysicOffset) {
        log.warn("Maybe try to build consume queue repeatedly maxPhysicOffset={} phyOffset={}", maxPhysicOffset, offset);
        return true;
    }

    this.byteBufferIndex.flip();
    this.byteBufferIndex.limit(CQ_STORE_UNIT_SIZE);
    this.byteBufferIndex.putLong(offset);
    this.byteBufferIndex.putInt(size);
    this.byteBufferIndex.putLong(tagsCode);

    final long expectLogicOffset = cqOffset *CQ_STORE_UNIT_SIZE;

    MappedFile mappedFile = this.mappedFileQueue.getLastMappedFile(expectLogicOffset);
    if (mappedFile != null) {

        if (mappedFile.isFirstCreateInQueue() && cqOffset != 0 && mappedFile.getWrotePosition() == 0) {
            this.minLogicOffset = expectLogicOffset;
            this.mappedFileQueue.setFlushedWhere(expectLogicOffset);
            this.mappedFileQueue.setCommittedWhere(expectLogicOffset);
            this.fillPreBlank(mappedFile, expectLogicOffset);
            log.info("fill pre blank space " + mappedFile.getFileName() + " " + expectLogicOffset + " "
                + mappedFile.getWrotePosition());
        }

        if (cqOffset != 0) {
            long currentLogicOffset = mappedFile.getWrotePosition() + mappedFile.getFileFromOffset();

            if (expectLogicOffset < currentLogicOffset) {
                log.warn("Build  consume queue repeatedly, expectLogicOffset: {} currentLogicOffset: {} Topic: {} QID: {} Diff: {}", expectLogicOffset, currentLogicOffset, this.topic, this.queueId, expectLogicOffset - currentLogicOffset);
                return true;
            }

            if (expectLogicOffset != currentLogicOffset) {
                LOG_ERROR.warn("[BUG]logic queue order maybe wrong, expectLogicOffset: {} currentLogicOffset: {} Topic: {} QID: {} Diff: {}",
                    expectLogicOffset,
                    currentLogicOffset,
                    this.topic,
                    this.queueId,
                    expectLogicOffset - currentLogicOffset
                );
            }
        }
        this.maxPhysicOffset = offset + size;
        return mappedFile.appendMessage(this.byteBufferIndex.array());
    }
    return false;
}
```

4、ConsumeQueue 文件删除

org.apache.rocketmq.store.ConsumeQueue#destroy

重置 ConsumeQueue 的 maxPhysicOffset 与 minLogicOffset，调用 MappedFileQueue 的 destroy()方法将 ConsumeQueue 目录下的文件全部删除

```java
public void destroy() {
    this.maxPhysicOffset = -1;
    this.minLogicOffset = 0;
    this.mappedFileQueue.destroy();
    if (isExtReadEnable()) {
        this.consumeQueueExt.destroy();
    }
}
```
