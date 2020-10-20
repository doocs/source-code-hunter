该文所涉及的 netty 源码版本为 4.1.16。

## 在一开始需要明确的几个概念

在 Netty 的内存池的 PoolChunk 中，先要明确以下几个概念。

- page: page 是 chunk 中所能申请到的最小内存单位。
- chunk: 一个 chunk 是一组 page 的集合
- 在 PoolChunk 中，chunkSize 的大小是 `2^maxOrder * pageSize`，其中 2^maxOrder 是 PoolChunk 中的完全二叉树叶子结点的数量，pageSize 则是单个 page 的大小。

综合如上所述，举一个数字上的例子，默认情况下，单个 Page 的大小为 8192，也就是 8kb，maxOrder 默认情况下是 11，因此在这个情况下 PoolChunk 中的二叉树的叶子节点数量是 2048，chunkSize 的大小则是 2048\*8kb 为 16M。

## PoolChunk 的内部完全二叉树结构

PoolChunk 中的 page 通过一颗完全二叉树来达到快速访达及操作，而不需要通过 O(n)的时间复杂度来进行遍历，并耗费相当大的空间来记录各个 page 的使用情况。一颗完全二叉树的结构如下所示：

- 高度=0 1 个节点 (单个节点表示的大小为 chunkSize)
- 高度=1 2 个节点 (单个节点表示的大小为 chunkSize/2)
- ..
- ..
- 高度=d 2^d 个节点 (单个节点表示的大小为 chunkSize/2^d)
- ..
- 高度=maxOrder 2^maxOrder 个节点 (单个节点的大小为 chunkSize/2^maxOrder，也就是 pageSize)

在这棵树的帮助下，当我们要申请 x 大小的内存的时候 ，得到比 x 最接近的 chunkSize/2^k 的大小，也就是说只要从左开始找到 k 层第一个没有被使用的节点即可开始将其子树的叶子结点的 page 进行分配。

## PoolChunk 的二叉树使用状态

单依靠上述的完全二叉树是无法达到内存池设计的目的的，因为缺少了 page 的使用情况，仍旧需要一个数据结构来辅助记录各个节点的使用情况。  
PoolChunk 中还给出了一个 byte 数组 memoryMap，大小为完全二叉树所有节点的个数，在之前的例子中这个 byte 数组就为 4096。在初始情况下，这个数组每个位置上的初始指为该位置的节点在完全二叉树中的高度。因此，这个数组 memoryMap 就有了以下几种状态。

- 1. memoryMap[i] = i 节点在完全二叉树中的深度，代表当前节点下的子树都还没有被分配。
- 2. memoryMap[i] > i 节点在完全二叉树中的深度, 这个节点下的子树也就有节点被使用，但是仍有节点处于空闲状态。
- 3. memoryMap[i] = maxOrder + 1，这个节点下面的子树已经完全被使用。
     这个 Byte 数组，就相当于为这个完全二叉树准备了状态与索引存储，可以高效的在二叉树中选择定位所需要指定大小的子树进行分配。

## 业务逻辑展开

```java
private int allocateNode(int d) {
    int id = 1;
    int initial = - (1 << d); // has last d bits = 0 and rest all = 1
    byte val = value(id);
    if (val > d) { // unusable
        return -1;
    }
    while (val < d || (id & initial) == 0) { // id & initial == 1 << d for all ids at depth d, for < d it is 0
        id <<= 1;
        val = value(id);
        if (val > d) {
            id ^= 1;
            val = value(id);
        }
    }
    byte value = value(id);
    assert value == d && (id & initial) == 1 << d : String.format("val = %d, id & initial = %d, d = %d",
            value, id & initial, d);
    setValue(id, unusable); // mark as unusable
    updateParentsAlloc(id);
    return id;
}
```

allocateNode(int d)方法用来在完全二叉树中以从左开始的顺序获取一颗高度为 d 的没有被使用过的子树。具体顺序如下：

- 首先从根节点 1 开始，判断 memoryMap[1]的值，如果大于 d，则说明当前的二叉树已经不存在能够分配的节点了。如果小于 d，则可以继续往下分配。
- 如果其左节点在 memoryMap 的值小于 d，则继续从左节点往下寻找。如果大于，则从其右节点开始往下寻找。
- 在下一层的节点中持续进行上述的判断，直到在书中找到符合高度条件的子树。

```java
private long allocateRun(int normCapacity) {
    int d = maxOrder - (log2(normCapacity) - pageShifts);
    int id = allocateNode(d);
    if (id < 0) {
        return id;
    }
    freeBytes -= runLength(id);
    return id;
}
```

allocateRun()方法就是在上文的 allocateNode()的前提下，根据指定的大小的内存在二叉树上分配指定大小的子树。比如说在上述 16M 大小每个 page8kb 的 chunk 中寻求 64k 的内存的时候，需要 8 个 page 叶子结点，那么就是需要一个高度为 4 的完全二叉树，那么也就是只要在 PoolChunk 中通过 allocateNode()方法从完全二叉树的第 7 层开始从左往右找到一颗可以使用的子树即可。

```java
private long allocateSubpage(int normCapacity) {
    // Obtain the head of the PoolSubPage pool that is owned by the PoolArena and synchronize on it.
    // This is need as we may add it back and so alter the linked-list structure.
    PoolSubpage<T> head = arena.findSubpagePoolHead(normCapacity);
    synchronized (head) {
        int d = maxOrder; // subpages are only be allocated from pages i.e., leaves
        int id = allocateNode(d);
        if (id < 0) {
            return id;
        }

        final PoolSubpage<T>[] subpages = this.subpages;
        final int pageSize = this.pageSize;

        freeBytes -= pageSize;

        int subpageIdx = subpageIdx(id);
        PoolSubpage<T> subpage = subpages[subpageIdx];
        if (subpage == null) {
            subpage = new PoolSubpage<T>(head, this, id, runOffset(id), pageSize, normCapacity);
            subpages[subpageIdx] = subpage;
        } else {
            subpage.init(head, normCapacity);
        }
        return subpage.allocate();
    }
}
```

当向 PoolChunk 申请的内存大小小于 pageSize 的时候，将直接通过 allocateSubpage()方法尝试直接在叶子结点，也就是二叉树的最后一层选择一个空的还未使用的叶子结点，在选择的叶子结点中构造一个 PoolSubPage 来返回，而不需要耗费整整一个叶子结点导致内存占用浪费。
