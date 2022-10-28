该文所涉及的 RocketMQ 源码版本为 4.9.3。

# RocketMQ CommitLog 详解

commitlog 目录主要存储消息，为了保证性能，顺序写入，每一条消息的长度都不相同，每条消息的前面四个字节存储该条消息的总长度，每个文件大小默认为 1G，文件的命名是以 commitLog 起始偏移量命名的，可以通过修改 broker 配置文件中 mappedFileSizeCommitLog 属性改变文件大小

1、获取最小偏移量

org.apache.rocketmq.store.CommitLog#getMinOffset

```java
public long getMinOffset() {
    MappedFile mappedFile = this.mappedFileQueue.getFirstMappedFile();
    if (mappedFile != null) {
        if (mappedFile.isAvailable()) {
            return mappedFile.getFileFromOffset();
        } else {
            return this.rollNextFile(mappedFile.getFileFromOffset());
        }
    }

    return -1;
}
```

获取目录下的第一个文件

```java
public MappedFile getFirstMappedFile() {
    MappedFile mappedFileFirst = null;

    if (!this.mappedFiles.isEmpty()) {
        try {
            mappedFileFirst = this.mappedFiles.get(0);
        } catch (IndexOutOfBoundsException e) {
            //ignore
        } catch (Exception e) {
            log.error("getFirstMappedFile has exception.", e);
        }
    }

    return mappedFileFirst;
}
```

如果该文件可用返回文件的起始偏移量,否则返回下一个文件的 起始偏移量

```java
public long rollNextFile(final long offset) {
    int mappedFileSize = this.defaultMessageStore.getMessageStoreConfig().getMappedFileSizeCommitLog();
    return offset + mappedFileSize - offset % mappedFileSize;
}
```

2、根据偏移量和消息长度查找消息

org.apache.rocketmq.store.CommitLog#getMessage

```java
public SelectMappedBufferResult getMessage(final long offset, final int size) {
    int mappedFileSize = this.defaultMessageStore.getMessageStoreConfig().getMappedFileSizeCommitLog();
    MappedFile mappedFile = this.mappedFileQueue.findMappedFileByOffset(offset, offset == 0);
    if (mappedFile != null) {
        int pos = (int) (offset % mappedFileSize);
        return mappedFile.selectMappedBuffer(pos, size);
    }
    return null;
}
```

首先获取 commitLog 文件大小,默认 1G

`private int mappedFileSizeCommitLog = 1024 * 1024 * 1024;`

获取偏移量所在的 MappedFile

org.apache.rocketmq.store.MappedFileQueue#findMappedFileByOffset(long, boolean)

获取第一个 MappedFile 和最后一个 MappedFile，校验偏移量是否在这两个 MappedFile 之间,计算当前偏移量所在 MappedFiles 索引值为当前偏移量的索引减去第一个文件的索引值

```java
if (firstMappedFile != null && lastMappedFile != null) {
    if (offset < firstMappedFile.getFileFromOffset() || offset >= lastMappedFile.getFileFromOffset() + this.mappedFileSize) {
        LOG_ERROR.warn("Offset not matched. Request offset: {}, firstOffset: {}, lastOffset: {}, mappedFileSize: {}, mappedFiles count: {}",
            offset,
            firstMappedFile.getFileFromOffset(),
            lastMappedFile.getFileFromOffset() + this.mappedFileSize,
            this.mappedFileSize,
            this.mappedFiles.size());
    } else {
        int index = (int) ((offset / this.mappedFileSize) - (firstMappedFile.getFileFromOffset() / this.mappedFileSize));
        MappedFile targetFile = null;
        try {
            targetFile = this.mappedFiles.get(index);
        } catch (Exception ignored) {
        }

        if (targetFile != null && offset >= targetFile.getFileFromOffset()
            && offset < targetFile.getFileFromOffset() + this.mappedFileSize) {
            return targetFile;
        }

        for (MappedFile tmpMappedFile : this.mappedFiles) {
            if (offset >= tmpMappedFile.getFileFromOffset()
                && offset < tmpMappedFile.getFileFromOffset() + this.mappedFileSize) {
                return tmpMappedFile;
            }
        }
    }

    if (returnFirstOnNotFound) {
        return firstMappedFile;
    }
}
```

根据在文件内的偏移量和消息长度获取消息内容

```java
public SelectMappedBufferResult selectMappedBuffer(int pos, int size) {
    int readPosition = getReadPosition();
    if ((pos + size) <= readPosition) {
        if (this.hold()) {
            ByteBuffer byteBuffer = this.mappedByteBuffer.slice();
            byteBuffer.position(pos);
            ByteBuffer byteBufferNew = byteBuffer.slice();
            byteBufferNew.limit(size);
            return new SelectMappedBufferResult(this.fileFromOffset + pos, byteBufferNew, size, this);
        } else {
            log.warn("matched, but hold failed, request pos: " + pos + ", fileFromOffset: "
                + this.fileFromOffset);
        }
    } else {
        log.warn("selectMappedBuffer request pos invalid, request pos: " + pos + ", size: " + size
            + ", fileFromOffset: " + this.fileFromOffset);
    }

    return null;
}
```

3、Broker 正常停止文件恢复

org.apache.rocketmq.store.CommitLog#recoverNormally

首先查询消息是否验证 CRC

`boolean checkCRCOnRecover = this.defaultMessageStore.getMessageStoreConfig().isCheckCRCOnRecover();`

从倒数第 3 个文件开始恢复，如果不足 3 个文件，则从第一个文件开始恢复

```java
int index = mappedFiles.size() - 3;
if (index < 0)
    index = 0;
```

循环遍历 CommitLog 文件，每次取出一条消息

`DispatchRequest dispatchRequest = this.checkMessageAndReturnSize(byteBuffer, checkCRCOnRecover);`

如果查找结果为 true 并且消息的长度大于 0，表示消息正确，mappedFileOffset 指针向前移动本条消息的长度；

```java
if (dispatchRequest.isSuccess() && size > 0) {
    mappedFileOffset += size;
}
```

如果查找结果为 true 并且结果等于 0，表示已到文件 的末尾，如果还有下一个文件，则重置 processOffset、mappedOffset 并重复上述步骤，否则跳出循环；

```java
else if (dispatchRequest.isSuccess() && size == 0) {
    index++;
    if (index >= mappedFiles.size()) {
        // Current branch can not happen
        log.info("recover last 3 physics file over, last mapped file " + mappedFile.getFileName());
        break;
    } else {
        mappedFile = mappedFiles.get(index);
        byteBuffer = mappedFile.sliceByteBuffer();
        processOffset = mappedFile.getFileFromOffset();
        mappedFileOffset = 0;
        log.info("recover next physics file, " + mappedFile.getFileName());
    }
}
```

如果查找结果为 false，则表示消息没有填满该文件，跳出循环，结束遍历

```java
else if (!dispatchRequest.isSuccess()) {
    log.info("recover physics file end, " + mappedFile.getFileName());
    break;
}
```

更新 committedPosition 和 flushedWhere 指针

```java
this.mappedFileQueue.setFlushedWhere(processOffset);
this.mappedFileQueue.setCommittedWhere(processOffset);
```

删除 offset 之后的所有文件。遍历目录下面的所有文件，如果文件尾部偏移量小于 offset 则跳过该文件，如果尾部的偏移量大于 offset，则进一步比较 offset 与文件的开始偏移量，如果 offset 大于文件的开始偏移量，说明当前文件包含了有效偏移量，设置 MappedFile 的 flushPosition 和 commitedPosition。

如果 offset 小于文件的开始偏移量，说明该文件是有效文件后面创建的，调用 MappedFile#destroy()方法释放资源

```java
if (fileTailOffset > offset) {
    if (offset >= file.getFileFromOffset()) {
        file.setWrotePosition((int) (offset % this.mappedFileSize));
        file.setCommittedPosition((int) (offset % this.mappedFileSize));
        file.setFlushedPosition((int) (offset % this.mappedFileSize));
    } else {
        file.destroy(1000);
        willRemoveFiles.add(file);
    }
}
```

释放资源需要关闭 MappedFile 和文件通道 fileChannel

```java
public boolean destroy(final long intervalForcibly) {
    this.shutdown(intervalForcibly);

    if (this.isCleanupOver()) {
        try {
            this.fileChannel.close();
            log.info("close file channel " + this.fileName + " OK");

            long beginTime = System.currentTimeMillis();
            boolean result = this.file.delete();
            log.info("delete file[REF:" + this.getRefCount() + "] " + this.fileName
                + (result ? " OK, " : " Failed, ") + "W:" + this.getWrotePosition() + " M:"
                + this.getFlushedPosition() + ", "
                + UtilAll.computeElapsedTimeMilliseconds(beginTime));
        } catch (Exception e) {
            log.warn("close file channel " + this.fileName + " Failed. ", e);
        }

        return true;
    } else {
        log.warn("destroy mapped file[REF:" + this.getRefCount() + "] " + this.fileName
            + " Failed. cleanupOver: " + this.cleanupOver);
    }

    return false;
}
```

判断`maxPhyOffsetOfConsumeQueue`是否大于 processOffset，如果大于，需要删除 ConsumeQueue 中 processOffset 之后的数据

```java
if (maxPhyOffsetOfConsumeQueue >= processOffset) {
    log.warn("maxPhyOffsetOfConsumeQueue({}) >= processOffset({}), truncate dirty logic files", maxPhyOffsetOfConsumeQueue, processOffset);
    this.defaultMessageStore.truncateDirtyLogicFiles(processOffset);
}
```

```java
public void truncateDirtyLogicFiles(long phyOffset) {
    ConcurrentMap<String, ConcurrentMap<Integer, ConsumeQueue>> tables = DefaultMessageStore.this.consumeQueueTable;

    for (ConcurrentMap<Integer, ConsumeQueue> maps : tables.values()) {
        for (ConsumeQueue logic : maps.values()) {
            logic.truncateDirtyLogicFiles(phyOffset);
        }
    }
}
```
