该文所涉及的 netty 源码版本为 4.1.6。

## Netty 中的 ByteBuf 为什么会发生内存泄漏

在 Netty 中，ByetBuf 并不是只采用可达性分析来对 ByteBuf 底层的 `byte[]` 数组来进行垃圾回收，而同时采用引用计数法来进行回收，来保证堆外内存的准确时机的释放。

在每个 ByteBuf 中都维护着一个 refCnt 用来对 ByteBuf 的被引用数进行记录，当 ByteBuf 的 `retain()` 方法被调用时，将会增加 refCnt 的计数，而其 `release()` 方法被调用时将会减少其被引用数计数。

```java
private boolean release0(int decrement) {
    for (;;) {
        int refCnt = this.refCnt;
        if (refCnt < decrement) {
            throw new IllegalReferenceCountException(refCnt, -decrement);
        }
        if (refCntUpdater.compareAndSet(this, refCnt, refCnt - decrement)) {
            if (refCnt == decrement) {
                deallocate();
                return true;
            }
            return false;
        }
    }
}
```

当调用了 ByteBuf 的 `release()` 方法的时候，最后在上方的 `release0()` 方法中将会为 ByteBuf 的引用计数减一，当引用计数归于 0 的时候，将会调用 `deallocate()` 方法对其对应的底层存储数组进行释放(在池化的 ByteBuf 中，在 `deallocate()` 方法里会把该 ByteBuf 的 `byte[]` 回收到底层内存池中，以确保 `byte[]` 可以重复利用)。

由于 Netty 中的 ByteBuf 并不是随着申请之后会马上使其引用计数归 0 而进行释放，往往在这两个操作之间还有许多操作，如果在这其中如果发生异常抛出导致引用没有及时释放，在使用池化 ByetBuffer 的情况下内存泄漏的问题就会产生。

当采用了池化的 ByteBuffer 的时候，比如 PooledHeapByteBuf 和 PooledDirectByteBuf，其 `deallocate()` 方法一共主要分为两个步骤。

```java
@Override
protected final void deallocate() {
	if (handle >= 0) {
		final long handle = this.handle;
		this.handle = -1;
		memory = null;
		chunk.arena.free(chunk, handle, maxLength);
		recycle();
	}
}
```

- 将其底层的 `byte[]` 通过 `free()` 方法回收到内存池中等待下一次使用。
- 通过 `recycle()` 方法将其本身回收到对象池中等待下一次使用。  
  关键在第一步的内存回收到池中，如果其引用计数未能在 ByteBuf 对象被回收之前归 0，将会导致其底层占用 `byte[]` 无法回收到内存池 PoolArena 中，导致该部分无法被重复利用，下一次将会申请新的内存进行操作，从而产生内存泄漏。  
  而非池化的 ByteBuffer 即使引用计数没有在对象被回收的时候被归 0，因为其使用的是单独一块 `byte[]` 内存，因此也会随着 java 对象被回收使得底层 `byte[]` 被释放（由 JDK 的 Cleaner 来保证）。

## Netty 进行内存泄漏检测的原理

在 Netty 对于 ByteBuf 的检测中，一共包含 4 个级别。

```java
if (level.ordinal() < Level.PARANOID.ordinal()) {
	if (leakCheckCnt ++ % samplingInterval == 0) {
		reportLeak(level);
		return new DefaultResourceLeak(obj);
	} else {
		return null;
	}
}
```

以默认的 SIMPLE 级别为例，在这个级别下，Netty 将会根据以 ByteBuf 创建的序列号与 113 进行取模来判断是否需要进行内存泄漏的检测追踪。当取模成功的时候，将会为这个 ByteBuf 产生一个对应的 DefaultResourceLeak 对象，DefaultResourceLeak 是一个 PhantomReference 虚引用的子类，并有其对应的 ReferenceQueue。之后通过 SimpleLeakAwareByteBuf 类来将被追踪的 ByteBuf 和 DefaultResourceLeak 包装起来。

```java
@Override
public boolean release(int decrement) {
	boolean deallocated = super.release(decrement);
	if (deallocated) {
		leak.close();
	}
	return deallocated;
}
```

在包装类中，如果该 ByteBuf 成功 deallocated 释放掉了其持有的 byte[]数组将会调用 DefaultResourceLeak 的 `close()` 方法来已通知当前 ByteBuf 已经释放了其持有的内存。  
正是这个虚引用使得该 DefaultResourceLeak 对象被回收的时候将会被放入到与这个虚引用所对应的 ReferenceQueue 中。

```java
DefaultResourceLeak ref = (DefaultResourceLeak) refQueue.poll();
if (ref == null) {
	break;
}

ref.clear();

if (!ref.close()) {
	continue;
}

String records = ref.toString();
if (reportedLeaks.putIfAbsent(records, Boolean.TRUE) == null) {
	if (records.isEmpty()) {
		logger.error("LEAK: {}.release() was not called before it's garbage-collected. " +
				"Enable advanced leak reporting to find out where the leak occurred. " +
				"To enable advanced leak reporting, " +
				"specify the JVM option '-D{}={}' or call {}.setLevel()",
				resourceType, PROP_LEVEL, Level.ADVANCED.name().toLowerCase(), simpleClassName(this));
	} else {
		logger.error(
				"LEAK: {}.release() was not called before it's garbage-collected.{}",
				resourceType, records);
	}
}
```

Netty 会在下一次 ByteBuf 的采样中通过 reportLeak()方法将 ReferenceQueue 中的 DefaultResourceLeak 取出并判断其对应的 ByteBuf 是否已经在其回收前调用过其 `close()` 方法，如果没有，显然在池化 ByteBuf 的场景下内存泄漏已经产生，将会以 ERROR 日志的方式进行日志打印。

以上内容可以结合 JVM 堆外内存的资料进行阅读。
