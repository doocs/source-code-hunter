# netty的FastThreadLocal源码解析
该文中涉及到的netty源码版本为4.1.6。
## netty的FastThreadLocal是什么
> A special variant of ThreadLocal that yields higher access performance when accessed from a FastThreadLocalThread.   
Internally, a FastThreadLocal uses a constant index in an array, instead of using hash code and hash table, to look for a variable. Although seemingly very subtle, it yields slight performance advantage over using a hash table, and it is useful when accessed frequently.  
To take advantage of this thread-local variable, your thread must be a FastThreadLocalThread or its subtype. By default, all threads created by DefaultThreadFactory are FastThreadLocalThread due to this reason.  
Note that the fast path is only possible on threads that extend FastThreadLocalThread, because it requires a special field to store the necessary state. An access by any other kind of thread falls back to a regular ThreadLocal. 

以上是netty官方文档中关于FastThreadLocal的介绍。

简而言之，FastThreadLocal是在ThreadLocal实现上的一种变种，相比ThreadLocal内部通过将自身hash的方式在hashTable上定位需要的变量存储位置，FastThreadLocal选择在数组上的一个固定的常量位置来存放线程本地变量，这样的操作看起来并没有太大区别，但是相比ThreadLocal的确体现了性能上的优势，尤其是在读操作频繁的场景下。  

## 如何使用FastThreadLocal
如果想要得到FastThreadLocal的速度优势，必须通过FastThreadLocalThread 或者其子类的线程，才可以使用，因为这个原因，netty的DefaultThreadFactory，其内部默认线程工厂的newThread()方法就是直接初始化一个FastThreadLocalThread ，以便期望在ThreadLocal的操作中，得到其性能上带来的优势。
```
    protected Thread newThread(Runnable r, String name) {
        return new FastThreadLocalThread(threadGroup, r, name);
    }
```

## FastThreadLocal的源码实现
### FastThreadLocal被访问的入口
当需要用到FastThreadLocal的时候，想必和jdk原生的ThreadLocal的api类似，都是通过初始化一个新的FastThreadLocal之后，通过其set()方法初始化并放入一个变量作为线程本地变量存储。
```
    public final void set(V value) {
        if (value != InternalThreadLocalMap.UNSET) {
            set(InternalThreadLocalMap.get(), value);
        } else {
            remove();
        }
    }
```
因此，在FastThreadLocal的set()方法中，可以看到，存储本地线程变量的数据结构是一个InternalThreadLocalMap。  
```
 private InternalThreadLocalMap threadLocalMap;
```
在FastThreadLocalThread 中，因为本身threadLocalMap就是其中的一个成员，能够快速得到返回。而其他线程实现，就将面临没有这个成员的尴尬，netty也给出了相应的兼容。
```
    public static InternalThreadLocalMap get() {
        Thread thread = Thread.currentThread();
        if (thread instanceof FastThreadLocalThread) {
            return fastGet((FastThreadLocalThread) thread);
        } else {
            return slowGet();
        }
    }
```
InternalThreadLocalMap的get()方法中，当前线程如果是FastThreadLocalThread 或是其子类的实现，变直接返回其InternalThreadLocalMap进行操作，但对于不属于上述条件的线程，netty通过slowGet()的方式，也将返回一个InternalThreadLocalMap。   
```
    private static InternalThreadLocalMap slowGet() {
        ThreadLocal<InternalThreadLocalMap> slowThreadLocalMap = UnpaddedInternalThreadLocalMap.slowThreadLocalMap;
        InternalThreadLocalMap ret = slowThreadLocalMap.get();
        if (ret == null) {
            ret = new InternalThreadLocalMap();
            slowThreadLocalMap.set(ret);
        }
        return ret;
    }
```
在slowGet()方法中，当前线程对应的InternalThreadLocalMap会通过原生jdk下ThreadLocal的方式存储并通过ThreadLocal返回，因此，在这个场景下，使用的还是jdk原生的ThreadLocal，但是只占用了原生ThreadLocal下的Entry[]数组的一个位置，具体的变量还是存放在专门为FastThreadLocal服务的InternalThreadLocalMap中。  
在此，随着InternalThreadLocalMap的得到并返回，针对FastThreadLocal的get和set操作，也将变为操作InternalThreadLocalMap来达到目的，FastThreadLocal性能优越的原因，也在InternalThreadLocalMap当中。

### InternalThreadLocalMap的内部构造
```
    static final AtomicInteger nextIndex = new AtomicInteger();

    Object[] indexedVariables;
```
InternalThreadlocalMap主要由以上两个成员组成，其中indexedVariables作为一个Object[]数组，直接用来存放FastThreadLocal对应的value，每个FastThreadLocal对象都会在相应的线程的ThreadLocalMap中被分配到对应的index，而这里的具体下标，则由以上的nextIndex成员在每个FastThreadLocal初始化的时候分配。
```
    private final int index;

    public FastThreadLocal() {
        index = InternalThreadLocalMap.nextVariableIndex();
    }
```
每个FastThreadLocal在构造方法的过程中，都会通过InternalThreadlocalMap的nextVariableIndex()返回nextIndex 自加后的结果作为其在InternalThreadlocalMap上的下标。后续该FastThreadLocal在操作变量的时候可以直接通过该index定位到Object[]数组上的位置。    
```
    private static final int variablesToRemoveIndex = InternalThreadLocalMap.nextVariableIndex();
```
而数组上的下标有一个特殊位，一般在其首位也就是0的位置，这个位置在FastThreadLocal类被加载的时候作为静态变量被设置。在这个位置上，存放的是一个FastThreadLocal对象集合，每个存放到InternalThreadlocalMap中的FastThreadLocal都会被保存在首位的集合中。    
```
    public static final Object UNSET = new Object();
```
另外，为了具体区分保存的变量是null还是不存在当前变量，InternalThreadLocalMap中定义了一个为NULL的成员变量，以便区分上述情况，在一开始，InternalThreadLocalMap中的indexedVariables数组都是NULL。

### FastThreadLocal的set()方法的源码分析
相比FastThreadLocal的set操作，get方法的过程与逻辑都要简单的多，因此此处主要以其set方法为主。    
```
    public final void set(V value) {
        if (value != InternalThreadLocalMap.UNSET) {
            set(InternalThreadLocalMap.get(), value);
        } else {
            remove();
        }
    }

    public final void set(InternalThreadLocalMap threadLocalMap, V value) {
        if (value != InternalThreadLocalMap.UNSET) {
            if (threadLocalMap.setIndexedVariable(index, value)) {
                addToVariablesToRemove(threadLocalMap, this);
            }
        } else {
            remove(threadLocalMap);
        }
    }
```
在其set()方法中，首先会判断set的值是否是InternalThreadLocalMap中的NULL对象来判断是set操作还是remove操作，如果不是，会通过InternalThreadLocalMap.get()方法获取当前线程对应的InternalThreadLocalMap，获取的过程在前文已经描述过。
之后的主要流程主要分为两步：
-  调用InternalThreadLocalMap的setIndexedVariable()方法，将该FastThreadLocal成员在构造方法中获得到的InternalThreadLocalMap上的下标作为入参传入。   
```
    public boolean setIndexedVariable(int index, Object value) {
        Object[] lookup = indexedVariables;
        if (index < lookup.length) {
            Object oldValue = lookup[index];
            lookup[index] = value;
            return oldValue == UNSET;
        } else {
            expandIndexedVariableTableAndSet(index, value);
            return true;
        }
    }
```
在InternalThreadLocalMap的setIndexedVariable()方法过程中，set的过程并不复杂，找到对应的下标，并将对应的值放到InternalThreadLocalMap数组下标对应的位置上即宣告结束。但是，因为FastThreadLocal在构造过程中虽然预先获得了对应的下标，但是实际上的数组大小可能完全还没有达到相应的大小，就要在此处通过expandIndexedVariableTableAndSet()方法进行扩容，由于是数组的缘故，只需要扩容后将原来的值复制过去，并将剩余的值用NULL对象填满即可。
-  如果上一步set成功，通过addToVariablesToRemove()方法将该FastThreadLocal对象放入到InternalThreadLocalMap的数组中的首位集合中。在这个集合中，对于FastThreadLocal是一个强引用。

这样，对于FastThreadLocal的一次set操作即宣告结束。

## 相比ThreadLocal，FastThreadLocal到底快在哪里
- FastThreadLocal在具体的定位的过程中，只需要根据在构造方法里获取得到的具体下标就可以定位到具体的数组位置进行变量的存取，而在jdk原生的ThreadLocal中，具体位置的下标获取不仅需要计算ThreadLocal的hash值，并需要在hashTable上根据key定位的结果，一旦定位之后的结果上已经存在其他ThreadLocal的变量，那么则是通过线性探测法，在hashTable上寻找下一个位置进行，相比FastThreadLocal定位的过程要复杂的多。
- FastThreadLocal由于采取数组的方式，当面对扩容的时候，只需要将原数组中的内容复制过去，并用NULL对象填满剩余位置即可，而在ThreadLocal中，由于hashTable的缘故，在扩容后还需要进行一轮rehash，在这过程中，仍旧存在hash冲突的可能。
- 在FastThreadLocal中，遍历当前线程的所有本地变量，只需要将数组首位的集合即可，不需要遍历数组上的每一个位置。
- 在原生的ThreadLocal中，由于可能存在ThreadLocal被回收，但是当前线程仍旧存活的情况导致ThreadLocal对应的本地变量内存泄漏的问题，因此在ThreadLocal的每次操作后，都会进行启发式的内存泄漏检测，防止这样的问题产生，但也在每次操作后花费了额外的开销。而在FastThreadLocal的场景下，由于数组首位的FastThreadLocal集合中保持着所有FastThreadLocal对象的引用，因此当外部的FastThreadLocal的引用被置为null，该FastThreadLocal对象仍旧保持着这个集合的引用，不会被回收掉，只需要在线程当前业务操作后，手动调用FastThreadLocal的removeAll()方法，将会遍历数组首位集合，回收掉所有FastThreadLocal的变量，避免内存泄漏的产生，也减少了原生ThreadLocal的启发式检测开销。
```
    private static final class DefaultRunnableDecorator implements Runnable {

        private final Runnable r;

        DefaultRunnableDecorator(Runnable r) {
            this.r = r;
        }

        @Override
        public void run() {
            try {
                r.run();
            } finally {
                FastThreadLocal.removeAll();
            }
        }
    }
```
在netty的DefaultThreadFactory中，每个线程在执行为任务后都会调用FastThreadLocal的removeAll()方法。