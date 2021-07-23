## LongAdder 的原理

在 LongAdder 中，底层通过多个数值进行累加来得到最后的结果。当多个线程对同一个 LongAdder 进行更新的时候，将会对这一些列的集合进行动态更新，以避免多线程之间的资源竞争。当需要得到 LongAdder 的具体的值的时候，将会将一系列的值进行求和作为最后的结果。

在高并发的竞争下进行类似指标数据的收集的时候，LongAdder 通常会和 AtomicLong 进行比较，在低竞争的场景下，两者有着相似的性能表现。而当在高并发竞争的场景下，LongAdder 将会表现更高的性能，但是也会伴随更高的内存消耗。

## LongAdder 的代码实现

```java
transient volatile Cell[] cells;
transient volatile long base;
```

cells 是一个简单的 Cell 数组，当比如通过 LongAdder 的 `add()` 方法进行 LongAdder 内部的数据的更新的时候，将会根据每个线程的一个 hash 值与 cells 数组的长度进行取模而定位，并在定位上的位置进行数据更新。而 base 则是当针对 LongAdder 的数据的更新时，并没有线程竞争的时候，将会直接更新在 base 上，而不需要前面提到的 hash 再定位过程，当 LongAdder 的 `sum()` 方法被调用的时候，将会对 cells 的所有数据进行累加在加上 sum 的值进行返回。

```java
public long sum() {
    long sum = base;
    Cell[] as = cells;
    if (as != null) {
        int n = as.length;
        for (int i = 0; i < n; ++i) {
            Cell a = as[i];
            if (a != null) { sum += a.value; }
        }
    }
    return sum;
}
```

相比 `sum()` 方法，LongAdder 的 `add()` 方法要复杂得多。

```java
public void add(long x) {
    Cell[] as;
    long b, v;
    HashCode hc;
    Cell a;
    int n;
    if ((as = cells) != null || !casBase(b = base, b + x)) {
        boolean uncontended = true;
        int h = (hc = threadHashCode.get()).code;
        if (as == null || (n = as.length) < 1 ||
            (a = as[(n - 1) & h]) == null ||
            !(uncontended = a.cas(v = a.value, v + x))) { retryUpdate(x, hc, uncontended); }
    }
}
```

在 `add()` 方法的一开始，将会观察 cells 数组是否存在，如果不存在，将会尝试直接通过 `casBase()` 方法在 base 上通过 cas 更新，这是在低并发竞争下的 `add()` 流程，这一流程的前提是对于 LongAdder 的更新并没有遭遇别的线程的并发修改。

在当 cells 已经存在，而或者对于 base 的 cas 更新失败，都将会将数据的更新落在 cells 数组之上。首先，每个线程都会在其 ThreadLocal 中生成一个线程专有的随机数，并根据这个随机数与 cells 进行取模，定位到的位置进行 cas 修改。在这个流程下，由于根据线程专有的随机数进行 hash 而定位的流程，尽可能的避免了线程间的资源竞争。但是仍旧可能存在 hash 碰撞而导致两个线程定位到了同一个 cells 槽位的情况，这里就需要通过 `retryUpdate()` 方法进行进一步的解决。

`retryUpdate()` 方法的代码很长，但是逻辑很清晰，主要分为一下几个流程，其中的主流程是一个死循环，进入 `retryUpdate()` 方法后，将会不断尝试执行主要逻辑，直到对应的逻辑执行完毕：

1. 当进入 `retryUpdate()` 的时候，cells 数组还没有创建，将会尝试获取锁并初始化 cells 数组并直接在 cells 数组上进行修改，而别的线程在没创建的情况下进入并获取锁失败，将会直接尝试在 base 上进行更行。
2. 当进入 `retryUpdate()` 的时候，cells 数组已经创建，但是分配给其的数组槽位的 Cells 还没有进行初始化，那么将会尝试获取锁并对该槽位进行初始化。
3. 当进入 `retryUpdate()` 的时候，cells 数组已经创建，分配给其的槽位的 Cell 也已经完成了初始化，而是因为所定位到的槽位与别的线程发生了 hash 碰撞，那么将会加锁并扩容 cells 数组，之后对该线程持有的 hash 进行 rehash，在下一轮循环中对新定位的槽位数据进行更新。而别的线程在尝试扩容并获取锁失败的时候，将会直接对自己 rehash 并在下一轮的循环中重新在新的 cells 数组中进行定位更新。

## Cell 本身的内存填充

最后，提一下 cells 数组中的 Cell 对象。

```java
volatile long p0, p1, p2, p3, p4, p5, p6;
volatile long value;
volatile long q0, q1, q2, q3, q4, q5, q6;
```

每个 Cell 对象中具体存放的 value 前后都由 7 个 long 类型的字段进行内存填充以避免缓存行伪共享而导致的缓存失效。
