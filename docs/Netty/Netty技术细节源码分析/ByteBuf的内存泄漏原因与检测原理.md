该文所涉及的netty源码版本为4.1.6。      

## Netty中的ByteBuf为什么会发生内存泄漏
在Netty中，ByetBuf并不是只采用可达性分析来对ByteBuf底层的byte[]数组来进行垃圾回收，而同时采用引用计数法来进行回收，来保证堆外内存的准确时机的释放。    
在每个ByteBuf中都维护着一个refCnt用来对ByteBuf的被引用数进行记录，当ByteBuf的retain()方法被调用时，将会增加refCnt的计数，而其release()方法被调用时将会减少其被引用数计数。     
```Java
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
当调用了ByteBuf的release()方法的时候，最后在上方的release0()方法中将会为ByteBuf的引用计数减一，当引用计数归于0的时候，将会调用deallocate()方法对其对应的底层存储数组进行释放(在池化的ByteBuf中，在deallocate()方法里会把该ByteBuf的byte[]回收到底层内存池中，以确保byte[]可以重复利用)。     
由于Netty中的ByteBuf并不是随着申请之后会马上使其引用计数归0而进行释放，往往在这两个操作之间还有许多操作，如果在这其中如果发生异常抛出导致引用没有及时释放，在使用池化ByetBuffer的情况下内存泄漏的问题就会产生。      
当采用了池化的ByteBuffer的时候，比如PooledHeapByteBuf和PooledDirectByteBuf，其deallocate()方法一共主要分为两个步骤。   
```Java
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
- 将其底层的byte[]通过free()方法回收到内存池中等待下一次使用。   
- 通过recycle()方法将其本身回收到对象池中等待下一次使用。   
关键在第一步的内存回收到池中，如果其引用计数未能在ByteBuf对象被回收之前归0，将会导致其底层占用byte[]无法回收到内存池PoolArena中，导致该部分无法被重复利用，下一次将会申请新的内存进行操作，从而产生内存泄漏。         
而非池化的ByteBuffer即使引用计数没有在对象被回收的时候被归0，因为其使用的是单独一块byte[]内存，因此也会随着java对象被回收使得底层byte[]被释放（由JDK的Cleaner来保证）。     

## Netty进行内存泄漏检测的原理
在Netty对于ByteBuf的检测中，一共包含4个级别。
```Java
        if (level.ordinal() < Level.PARANOID.ordinal()) {
            if (leakCheckCnt ++ % samplingInterval == 0) {
                reportLeak(level);
                return new DefaultResourceLeak(obj);
            } else {
                return null;
            }
        }
```
以默认的SIMPLE级别为例，在这个级别下，Netty将会根据以ByteBuf创建的序列号与113进行取模来判断是否需要进行内存泄漏的检测追踪。当取模成功的时候，将会为这个ByteBuf产生一个对应的DefaultResourceLeak对象，DefaultResourceLeak是一个PhantomReference虚引用的子类，并有其对应的ReferenceQueue。之后通过SimpleLeakAwareByteBuf类来将被追踪的ByteBuf和DefaultResourceLeak包装起来。
```Java
    @Override
    public boolean release(int decrement) {
        boolean deallocated = super.release(decrement);
        if (deallocated) {
            leak.close();
        }
        return deallocated;
    }
```
在包装类中，如果该ByteBuf成功deallocated释放掉了其持有的byte[]数组将会调用DefaultResourceLeak的close()方法来已通知当前ByteBuf已经释放了其持有的内存。      
正是这个虚引用使得该DefaultResourceLeak对象被回收的时候将会被放入到与这个虚引用所对应的ReferenceQueue中。
```Java
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
Netty会在下一次ByteBuf的采样中通过reportLeak()方法将ReferenceQueue中的DefaultResourceLeak取出并判断其对应的ByteBuf是否已经在其回收前调用过其close()方法，如果没有，显然在池化ByteBuf的场景下内存泄漏已经产生，将会以ERROR日志的方式进行日志打印。   

以上内容可以结合JVM堆外内存的资料进行阅读。