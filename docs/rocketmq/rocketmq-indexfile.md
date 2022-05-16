该文所涉及的 RocketMQ 源码版本为 4.9.3。

# RocketMQ IndexFile 详解

首先明确一下 IndexFile 的文件结构

Index header + 哈希槽，每个槽下面挂载 index 索引,类似哈希表的结构

一个 Index 文件默认包含 500 万个哈希槽，一个哈希槽最多存储 4 个 index，也就是一个 IndexFile 默认最多包含 2000 万个 index

Index header：

40byte Index header = 8byte 的 beginTimestamp（IndexFile 对应第一条消息的存储时间） + 8byte 的 endTimestamp (IndexFile 对应最后一条消息的存储时间) + 8byte 的 beginPhyoffset（IndexFile 对应第一条消息在 CommitLog 的物理偏移量） + 8byte 的 endPhyoffset（IndexFile 对应最后一条消息在 CommitLog 的物理偏移量）+ 4byte 的 hashSlotCount（已有 index 的槽个数）+ 4byte 的 indexCount（索引个数）

哈希槽：

每个哈希槽占用 4 字节，存储当前槽下面最新的 index 的序号

Index：

20byte 的 index = 4byte 的 keyHash（key 的哈希码） + 8byte 的 phyOffset（消息在文件中的物理偏移量）+ 4byte 的 timeDiff（该索引对应消息的存储时间与当前索引文件第一条消息的存储时间的差值）+ 4byte 的 preIndexNo（该条目的前一个 Index 的索引值）

1、将消息索引键与消息偏移量的映射关系写入 indexFile

org.apache.rocketmq.store.index.IndexFile#putKey

当前已使用的 Index 大于等于允许的最大个数时，返回 false，表示当前 Index 文件已满。

如果当前 Index 文件未满，则根据 key 计算出哈希码，然后对槽数量取余定位到某一个哈希槽位置，

哈希槽的物理偏移量 = IndexHeader 的大小（默认 40Byte） + 哈希槽位置 * 每个哈希槽的大小（4 字节）

```java
int keyHash = indexKeyHashMethod(key);
int slotPos = keyHash % this.hashSlotNum;
int absSlotPos = IndexHeader.INDEX_HEADER_SIZE+ slotPos * hashSlotSize;
```

读取哈希槽中的数据，如果哈希槽中的数据小于 0 或者大于 index 的个数，则为无效索引，将 slotValue 置为 0

```java
int slotValue = this.mappedByteBuffer.getInt(absSlotPos);
if (slotValue <=invalidIndex|| slotValue > this.indexHeader.getIndexCount()) {
    slotValue =invalidIndex;
}
```

计算本次存储消息的时间戳与 indexFile 第一条消息存储时间戳的差值并转换为秒

```java
long timeDiff = storeTimestamp - this.indexHeader.getBeginTimestamp();

timeDiff = timeDiff / 1000;

if (this.indexHeader.getBeginTimestamp() <= 0) {
    timeDiff = 0;
} else if (timeDiff > Integer.MAX_VALUE) {
    timeDiff = Integer.MAX_VALUE;
} else if (timeDiff < 0) {
    timeDiff = 0;
}
```

新添加的消息 index 的物理偏移量 = IndexHeader 大小（40Byte） + Index 文件哈希槽的数量 * 哈希槽的大小（4Byte ） + Index 文件索引数量 * 索引大小（20Byte）

将消息哈希码、消息物理偏移量、消息存储时间戳与 Index 文件第一条消息的时间戳的差值、当前哈希槽的值、当前 Indexfile 的索引个数存入 mappedByteBuffer

```java
int absIndexPos = IndexHeader.INDEX_HEADER_SIZE+ this.hashSlotNum *hashSlotSize
+ this.indexHeader.getIndexCount() *indexSize;

this.mappedByteBuffer.putInt(absIndexPos, keyHash);
this.mappedByteBuffer.putLong(absIndexPos + 4, phyOffset);
this.mappedByteBuffer.putInt(absIndexPos + 4 + 8, (int) timeDiff);
this.mappedByteBuffer.putInt(absIndexPos + 4 + 8 + 4, slotValue);

this.mappedByteBuffer.putInt(absSlotPos, this.indexHeader.getIndexCount());
```

更新 IndexHeader 信息：

如果该 IndexFile 哈希槽中消息的数量小于等于 1，更新 IndexHeader 的 beginPhyOffset 和 beginTimesttamp

每次添加消息之后更新 IndexCount、endPhyOffset、endTimestamp

```java
if (this.indexHeader.getIndexCount() <= 1) {
    this.indexHeader.setBeginPhyOffset(phyOffset);
    this.indexHeader.setBeginTimestamp(storeTimestamp);
}

if (invalidIndex== slotValue) {
    this.indexHeader.incHashSlotCount();
}
this.indexHeader.incIndexCount();
this.indexHeader.setEndPhyOffset(phyOffset);
this.indexHeader.setEndTimestamp(storeTimestamp);
```

2、根据 key 查找消息

org.apache.rocketmq.store.index.IndexFile#selectPhyOffset

参数如下：

`List<Long> phyOffsets`： 查询到的物理偏移量

`String key: 索引key`

`int maxNum`：本次查找的最大消息条数

`long begin`：开始时间戳

long end: 结束时间戳

根据 key 计算哈希码，哈希码与哈希槽的数量取余得到哈希槽的索引

哈希槽的物理地址 = IndexHeader（40byte） + 哈希槽索引 * 每个哈希槽的大小（4byte）

```java
int keyHash = indexKeyHashMethod(key);
int slotPos = keyHash % this.hashSlotNum;
int absSlotPos = IndexHeader.INDEX_HEADER_SIZE+ slotPos * hashSlotSize;
```

`从mappedByteBuffer`获取哈希槽的值，如果值小于等于 0 或者值大于 IndexCount

或者 IndexCount 的 值小于等于 1 则表示没有有效的结果数据

如果查询返回的结果数量大于等于要查询的最大消息条数，终止循环

```java
if (slotValue <=invalidIndex|| slotValue > this.indexHeader.getIndexCount()
    || this.indexHeader.getIndexCount() <= 1) {
} else {
    for (int nextIndexToRead = slotValue; ; ) {
        if (phyOffsets.size() >= maxNum) {
            break;
        }
```

如果存储的时间戳小于 0，结束查找，如果哈希码匹配并且存储时间在要查找的开始时间戳和结束时间戳之间，将结果偏移量加入返回结果中

```java
if (timeDiff < 0) {
    break;
}

timeDiff *= 1000L;

long timeRead = this.indexHeader.getBeginTimestamp() + timeDiff;
boolean timeMatched = (timeRead >= begin) && (timeRead <= end);

if (keyHash == keyHashRead && timeMatched) {
    phyOffsets.add(phyOffsetRead);
}
```

校验该 index 的上一个 index，如果上一个 index 的索引大于 0 并且小于等于 indexCount，时间戳大于等于要查找的开始时间戳，则继续查找

```java
if (prevIndexRead <=invalidIndex || prevIndexRead > this.indexHeader.getIndexCount()
    || prevIndexRead == nextIndexToRead || timeRead < begin) {
    break;
}

nextIndexToRead = prevIndexRead;
```
