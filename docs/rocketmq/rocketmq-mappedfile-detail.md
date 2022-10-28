该文所涉及的 RocketMQ 源码版本为 4.9.3。

# RocketMQ MappedFile 内存映射文件详解

1、MappedFile 初始化

```java
private void init(final String fileName, final int fileSize) throws IOException {
    this.fileName = fileName;
    this.fileSize = fileSize;
    this.file = new File(fileName);
    this.fileFromOffset = Long.parseLong(this.file.getName());
    boolean ok = false;

    ensureDirOK(this.file.getParent());

    try {
        this.fileChannel = new RandomAccessFile(this.file, "rw").getChannel();
        this.mappedByteBuffer = this.fileChannel.map(MapMode.READ_WRITE, 0, fileSize);
        TOTAL_MAPPED_VIRTUAL_MEMORY.addAndGet(fileSize);
        TOTAL_MAPPED_FILES.incrementAndGet();
        ok = true;
    } catch (FileNotFoundException e) {
        log.error("Failed to create file " + this.fileName, e);
        throw e;
    } catch (IOException e) {
        log.error("Failed to map file " + this.fileName, e);
        throw e;
    } finally {
        if (!ok && this.fileChannel != null) {
            this.fileChannel.close();
        }
    }
}
```

初始化`fileFromOffset`,因为 commitLog 文件夹下的文件都是以偏移量为命名的，所以转成了 long 类型

确认文件目录是否存在，不存在则创建

```java
public static void ensureDirOK(final String dirName) {
    if (dirName != null) {
        if (dirName.contains(MessageStoreConfig.MULTI_PATH_SPLITTER)) {
            String[] dirs = dirName.trim().split(MessageStoreConfig.MULTI_PATH_SPLITTER);
            for (String dir : dirs) {
                createDirIfNotExist(dir);
            }
        } else {
            createDirIfNotExist(dirName);
        }
    }
}
```

通过`RandomAccessFile`设置 fileChannel

`this.fileChannel = new RandomAccessFile(this.file, "rw").getChannel();`

使用 NIO 内存映射将文件映射到内存中

`this.mappedByteBuffer = this.fileChannel.map(MapMode.*READ_WRITE*, 0, fileSize);`

2、MappedFile 提交

```java
public int commit(final int commitLeastPages) {
    if (writeBuffer == null) {
        //no need to commit data to file channel, so just regard wrotePosition as committedPosition.
        return this.wrotePosition.get();
    }
    if (this.isAbleToCommit(commitLeastPages)) {
        if (this.hold()) {
            commit0();
            this.release();
        } else {
            log.warn("in commit, hold failed, commit offset = " + this.committedPosition.get());
        }
    }

    // All dirty data has been committed to FileChannel.
    if (writeBuffer != null && this.transientStorePool != null && this.fileSize == this.committedPosition.get()) {
        this.transientStorePool.returnBuffer(writeBuffer);
        this.writeBuffer = null;
    }

    return this.committedPosition.get();
}
```

如果 wroteBuffer 为空，直接返回 wrotePosition

```java
if (writeBuffer == null) {
    //no need to commit data to file channel, so just regard wrotePosition as committedPosition.
    return this.wrotePosition.get();
}
```

判断是否执行 commit 操作：

如果文件已满，返回 true

```java
if (this.isFull()) {
    return true;
}
```

```java
public boolean isFull() {
    return this.fileSize == this.wrotePosition.get();
}
```

commitLeastPages 为本次提交的最小页数，如果 commitLeastPages 大于 0，计算当前写指针（`wrotePosition`）与上一次提交的指针`committedPosition`的差值 除以页*`OS_PAGE_SIZE`*的大小得到脏页数量，如果大于 commitLeastPages，就可以提交。如果 commitLeastPages 小于 0，则存在脏页就提交

```java
if (commitLeastPages > 0) {
    return ((write /OS_PAGE_SIZE) - (flush /OS_PAGE_SIZE)) >= commitLeastPages;
}

return write > flush;
```

MapperFile 具体的提交过程，首先创建 `writeBuffer`的共享缓存区，设置 position 为上一次提交的位置`committedPosition` ，设置 limit 为`wrotePosition`当前写指针，接着将 committedPosition 到 wrotePosition 的数据写入到 FileChannel 中，最后更新 committedPosition 指针为 wrotePosition

```java
protected void commit0() {
    int writePos = this.wrotePosition.get();
    int lastCommittedPosition = this.committedPosition.get();

    if (writePos - lastCommittedPosition > 0) {
        try {
            ByteBuffer byteBuffer = writeBuffer.slice();
            byteBuffer.position(lastCommittedPosition);
            byteBuffer.limit(writePos);
            this.fileChannel.position(lastCommittedPosition);
            this.fileChannel.write(byteBuffer);
            this.committedPosition.set(writePos);
        } catch (Throwable e) {
            log.error("Error occurred when commit data to FileChannel.", e);
        }
    }
}
```

3、MappedFile 刷盘

判断是否要进行刷盘

文件是否已满

```java
if (this.isFull()) {
    return true;
}
```

```java
public boolean isFull() {
    return this.fileSize == this.wrotePosition.get();
}
```

如果`flushLeastPages`大于 0，判断写数据指针位置-上次刷盘的指针位置， 然后除以*`OS_PAGE_SIZE 是否大于等于`*`flushLeastPages`

如果 flushLeastPages 小于等于 0，判断是否有要刷盘的数据

```java
if (flushLeastPages > 0) {
    return ((write /OS_PAGE_SIZE) - (flush /OS_PAGE_SIZE)) >= flushLeastPages;
}

return write > flush;
```

获取最大读指针

```java
public int getReadPosition() {
    return this.writeBuffer == null ? this.wrotePosition.get() : this.committedPosition.get();
}
```

将数据刷出到磁盘

如果`writeBuffer`不为空或者通道的 position 不等于 0，通过 fileChannel 将数据刷新到磁盘

否则通过 MappedByteBuffer 将数据刷新到磁盘

4、MappedFile 销毁

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

1> 关闭 MappedFile

第一次调用时 this.`available为true`，设置 available 为 false，设置第一次关闭的时间戳为当前时间戳，调用 release()释放资源，只有在引用次数小于 1 的时候才会释放资源,如果引用次数大于 0，判断当前时间与 firstShutdownTimestamp 的差值是否大于最大拒绝存活期`intervalForcibly`,如果大于等于最大拒绝存活期，将引用数减少 1000，直到引用数小于 0 释放资源

```java
public void shutdown(final long intervalForcibly) {
    if (this.available) {
        this.available = false;
        this.firstShutdownTimestamp = System.currentTimeMillis();
        this.release();
    } else if (this.getRefCount() > 0) {
        if ((System.currentTimeMillis() - this.firstShutdownTimestamp) >= intervalForcibly) {
            this.refCount.set(-1000 - this.getRefCount());
            this.release();
        }
    }
}
```

2> 判断是否清理完成

是否清理完成的标准是引用次数小于等于 0 并且清理完成标记 cleanupOver 为 true

```java
public boolean isCleanupOver() {
    return this.refCount.get() <= 0 && this.cleanupOver;
}
```

3> 关闭文件通道 fileChannel

`this.fileChannel.close();`
