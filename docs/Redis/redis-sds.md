# 深挖 Redis 6.0 源码——SDS

**SDS（Simple Dynamic Strings, 简单动态字符串）是 Redis 的一种基本数据结构，主要是用于存储字符串和整数。** 这篇文章里，我们就来探讨一下 Redis SDS 这种数据结构的底层实现原理。

学习之前，首先我们要明确，Redis 是一个**使用 C 语言编写的键值对存储系统**。

## 前置思考

我们首先考虑一个问题，如何实现一个二进制安全的字符串？

在 C 语言中，`\0` 表示字符串结束，如果字符串中本身就包含 `\0` 字符，那么字符串就会在 `\0` 处被截断，即非二进制安全；若通过使用一个 len 属性，来判断字符串是否结束，就可以保证读写字符串时不受到 `\0` 的影响，则是二进制安全。同时 len 属性也能保证在 O(1) 时间内获取字符串的长度。

## Redis 3.2 以前的 SDS 实现

在 Redis 3.2 版本以前，SDS 的结构如下：

```c
struct sdshdr {
    unsigned int len;
    unsigned int free;
    char buf[];
};
```

其中，**buf 表示数据空间，用于存储字符串；len 表示 buf 中已占用的字节数，也即字符串长度；free 表示 buf 中剩余可用字节数。**

字段 len 和 free 各占 4 字节，紧接着存放字符串。

这样做有以下几个好处：

- 用单独的变量 len 和 free，可以**方便地获取字符串长度和剩余空间**；
- 内容存储在动态数组 buf 中，**SDS 对上层暴露的指针指向 buf，而不是指向结构体 SDS**。因此，上层可以像读取 C 字符串一样读取 SDS 的内容，兼容 C 语言处理字符串的各种函数，同时也能通过 buf 地址的偏移，方便地获取其他变量；
- 读写字符串不依赖于 `\0`，保证**二进制安全**。

但其实以上的设计是存在一些问题的，对于不同长度的字符串，是否有必要使用 len 和 free 这 2 个 4 字节的变量？4 字节的 len，可表示的字符串长度为 `2^32`，而在实际应用中，存放于 Redis 中的字符串往往没有这么长，因此，空间的使用上能否进一步压缩？

那么接下来，我们就来看看最新的 Redis 是**如何根据字符串的长度，使用不同的数据结构进行存储的**。

## Redis SDS [v6.0]

在 Redis 3.2 版本之后（v3.2 - v6.0），Redis 将 SDS 划分为 5 种类型：

- sdshdr5：长度小于 1 字节
- sdshdr8：长度 1 字节
- sdshdr16：长度 2 字节
- sdshdr32：长度 4 字节
- sdshdr64：长度 8 字节

Redis 增加了一个 flags 字段来标识类型，用一个字节(8 位)来存储。

其中：前 3 位表示字符串的类型；剩余 5 位，可以用来存储长度小于 32 的短字符串。

```c
struct __attribute__ ((__packed__)) sdshdr5 {
    unsigned char flags; /* 前3位存储类型，后5位存储长度 */
    char buf[]; /* 动态数组，存放字符串 */
};
```

而对于长度大于 31 的字符串，仅仅靠 flags 的后 5 位来存储长度明显是不够的，需要用另外的变量来存储。sdshdr8、sdshdr16、sdshdr32、sdshdr64 的数据结构定义如下，其中 len 表示已使用的长度，alloc 表示总长度，buf 存储实际内容，而 flags 的前 3 位依然存储类型，后 5 位则预留。

```c
struct __attribute__ ((__packed__)) sdshdr8 {
    uint8_t len; /* 已使用长度，1字节 */
    uint8_t alloc; /* 总长度，1字节 */
    unsigned char flags; /* 前3位存储类型，后5位预留 */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr16 {
    uint16_t len; /* 已使用长度，2字节 */
    uint16_t alloc; /* 总长度，2字节 */
    unsigned char flags; /* 前3位存储类型，后5位预留 */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr32 {
    uint32_t len; /* 已使用长度，4字节 */
    uint32_t alloc; /* 总长度，4字节 */
    unsigned char flags; /* 前3位存储类型，后5位预留 */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr64 {
    uint64_t len; /* 已使用长度，8字节 */
    uint64_t alloc; /* 总长度，8字节 */
    unsigned char flags; /* 前3位存储类型，后5位预留 */
    char buf[];
};
```

注意，一般情况下，结构体会按照所有变量大小的最小公倍数做字节对齐，而用 `packed` 修饰后，结构体则变为 1 字节对齐。这样做的好处有二：一是**节省内存**，比如 sdshdr32 可节约 3 个字节；二是 **SDS 返回给上层的是指向 buf 的指针，此时按 1 字节对齐，所以可在创建 SDS 后，通过 `(char*)sh+hdrlen` 得到 buf 指针地址，也可以通过 `buf[-1]` 找到 flags**。

以上，Redis 根据字符串长度的不同，选择对应的数据结构进行存储。接下来，我们就来看看 Redis 字符串的相关 API 实现。

## SDS API 实现

### 1. 创建字符串

```c
sds sdsnewlen(const void *init, size_t initlen) {
    void *sh;
    sds s;

    // 根据字符串长度计算相应类型
    char type = sdsReqType(initlen);

    // 如果创建的是""字符串，强转为SDS_TYPE_8
    if (type == SDS_TYPE_5 && initlen == 0) type = SDS_TYPE_8;

    // 根据类型计算头部所需长度（头部包含 len、alloc、flags）
    int hdrlen = sdsHdrSize(type);

    // 指向flags的指针
    unsigned char *fp;

    // 检查长度是否溢出
    assert(initlen + hdrlen + 1 > initlen);

    // 创建字符串，+1是因为 `\0` 结束符
    // sh指向header首字节
    sh = s_malloc(hdrlen+initlen+1);
    if (sh == NULL) return NULL;
    if (init==SDS_NOINIT)
        init = NULL;
    else if (!init)
        memset(sh, 0, hdrlen+initlen+1);

    // s指向buf
    s = (char*)sh+hdrlen;

    // s减1得到flags
    fp = ((unsigned char*)s)-1;

    // 赋值len, alloc, flags
    ...


    // 赋值buf[]
    if (initlen && init)
        memcpy(s, init, initlen);

    // 在s末尾添加\0结束符
    s[initlen] = '\0';

    // 返回指向buf的指针s
    return s;
}
```

创建 SDS 的大致流程是这样的：首先根据字符串长度计算得到 type，根据 type 计算头部所需长度，然后动态分配内存空间。通过计算出指向 header 的指针 sh，指向 buf 的指针 s，对结构体各字段进行赋值。

注意：

1. 创建空字符串时，`SDS_TYPE_5` 被强制转换为 `SDS_TYPE_8`（原因是创建空字符串后，内容可能会频繁更新而引发扩容操作，故直接创建为 sdshdr8）
2. 长度计算有 `+1` 操作，因为结束符 `\0` 会占用一个长度的空间。
3. 返回的是指向 buf 的指针 s。
4. 创建时分配到字节数 initlen+initlen+1，基本等于结构体头部长度+字符数组长度，没有预留多余空间。

### 2. 清空字符串

SDS 提供了两种清空字符串的方法。

一种是通过 s 偏移得到结构体的地址，然后调用 `s_free` 直接释放内存。

```c
void sdsfree(sds s) {
    if (s == NULL) return;

    // s减去头部的大小得到结构体的地址
    s_free((char*)s-sdsHdrSize(s[-1]));
}
```

另一种是通过重置 len 属性值而达到清空字符串的目的，本质上 buf 并没有被真正清除，新的数据会直接覆盖 buf 中原有的数据，无需申请新的内存空间。

```c
void sdsclear(sds s) {

    // 将len属性置为0
    sdssetlen(s, 0);
    s[0] = '\0';
}
```

### 3. 更新 len

因为 sdsnewlen 函数返回的是 char\* 类型的 buf，所以兼容了 c 语言操作字符串的函数，
那么当 `s = ['a', 'b', 'c', '\0']` 时， 再操作`s[2] = '\0'`, 这个时候`sdslen(s)`得到的结果是 3，因为 len 字段没有更新，如果直接更新`'\0'`，需要调用以下函数更新 len

```c
void sdsupdatelen(sds s) {
    size_t reallen = strlen(s);
    sdssetlen(s, reallen);
}
```

### 4. 拼接字符串

SDS 拼接字符串的实现如下：

```c
sds sdscatsds(sds s, const sds t) {
    return sdscatlen(s, t, sdslen(t));
}
```

可以看到 `sdscatsds` 内部调用的是 `sdscatlen`。

而 `sdscatlen` 内部的实现相对复杂一些，由于拼接字符串可能涉及 SDS 的扩容，因此 `sdscatlen` 内部调用 `sdsMakeRoomFor` 对拼接的字符串做检查：若无需扩容，直接返回 s；若需要扩容，则返回扩容好的新字符串 s。

```c
sds sdscatlen(sds s, const void *t, size_t len) {
    // 计算当前字符串长度
    size_t curlen = sdslen(s);

    // 确保s的剩余空间足以拼接上t
    s = sdsMakeRoomFor(s,len);
    if (s == NULL) return NULL;

    // 拼接s、t
    memcpy(s+curlen, t, len);

    // 更新s的len属性
    sdssetlen(s, curlen+len);

    // s末尾添加\0结束符
    s[curlen+len] = '\0';

    return s;
}

```

SDS 的扩容策略是这样的：

1. 若 SDS 中剩余空闲长度 avail 大于或等于新增内容的长度 addlen，无需扩容。
2. 若 SDS 中剩余空闲长度 avail 小于或等于 addlen，则分情况讨论：新增后总长度 `len+addlen < 1MB` 的，按新长度的 2 倍扩容；新增后总长度 `len+addlen >= 1MB` 的，按新长度加上 `1MB` 扩容。

```c
sds sdsMakeRoomFor(sds s, size_t addlen) {
    void *sh, *newsh;
    // 当前剩余长度
    size_t avail = sdsavail(s);

    size_t len, newlen;
    char type, oldtype = s[-1] & SDS_TYPE_MASK;
    int hdrlen;

    /* 剩余长度>=新增字符串长度，直接返回 */
    if (avail >= addlen) return s;

    // 计算当前字符串长度len
    len = sdslen(s);

    sh = (char*)s-sdsHdrSize(oldtype);

    // 计算新长度
    newlen = (len+addlen);

    // 检查长度是否溢出
    assert(newlen > len);

    // 新长度<1MB，按新长度的2倍扩容
    if (newlen < SDS_MAX_PREALLOC)
        newlen *= 2;
    // 否则按新长度+1MB扩容
    else
        newlen += SDS_MAX_PREALLOC;

    // 计算新长度所属类型
    type = sdsReqType(newlen);

    /* type5不支持扩容，强转为type8 */
    if (type == SDS_TYPE_5) type = SDS_TYPE_8;

    hdrlen = sdsHdrSize(type);

    // 检查长度是否溢出
    assert(hdrlen + newlen + 1 > len);

    if (oldtype==type) {
        // 类型没变，直接通过realloc扩大动态数组即可。
        newsh = s_realloc(sh, hdrlen+newlen+1);
        if (newsh == NULL) return NULL;
        s = (char*)newsh+hdrlen;
    } else {
        // 类型改变了，则说明头部长度也发生了变化，不进行realloc操作，而是直接重新开辟内存
        newsh = s_malloc(hdrlen+newlen+1);
        if (newsh == NULL) return NULL;

        // 原内存拷贝到新的内存地址上
        memcpy((char*)newsh+hdrlen, s, len+1);

        // 释放原先空间
        s_free(sh);
        s = (char*)newsh+hdrlen;

        // 为flags赋值
        s[-1] = type;

        // 为len属性赋值
        sdssetlen(s, len);
    }

    // 为alloc属性赋值
    sdssetalloc(s, newlen);
    return s;
}
```

## 总结

1. SDS 返回的是指向 buf 的指针，同时以`\0`结尾，所以兼容了 C 语言操作字符串的函数，读取内容时，通过 len 属性来限制读取的长度，不受 `\0` 影响，从而保证二进制安全；
2. Redis 根据字符串长度的不同，定义了多种数据结构，包括：sdshdr5/sdshdr8/sdshdr16/sdshdr32/sdshdr64。
3. SDS 在设计字符串修改出会调用 `sdsMakeRoomFor` 函数进行检查，根据不同情况进行扩容。
