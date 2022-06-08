## 1 设计原理与基本过程

在使用 Spring 声明式事务处理 的时候，一种常用的方法是结合 IoC 容器 和 Spring 已有的 TransactionProxyFactoryBean 对事务管理进行配置，比如，可以在这个 TransactionProxyFactoryBean 中为事务方法配置传播行为、并发事务隔离级别等事务处理属性，从而对声明式事务的处理提供指导。具体来说，在对声明式事务处理的原理分析中，声明式事务处理的实现大致可以分为以下几个部分:

- 读取和处理在 IoC 容器 中配置的事务处理属性，并转化为 Spring 事务处理 需要的内部数据结构，这里涉及的类是 TransactionAttributeSourceAdvisor，从名字可以看出，它是一个 AOP 通知器，Spring 使用这个通知器来完成对事务处理属性值的处理。处理的结果是，在 IoC 容器 中配置的事务处理属性信息，会被读入并转化成 TransactionAttribute 表示的数据对象，这个数据对象是 Spring 对事务处理属性值的数据抽象，对这些属性的处理是和 TransactionProxyFactoryBean 拦截下来的事务方法的处理结合起来的。
- Spring 事务处理模块 实现统一的事务处理过程。这个通用的事务处理过程包含处理事务配置属性，以及与线程绑定完成事务处理的过程，Spring 通过 TransactionInfo 和 TransactionStatus 这两个数据对象，在事务处理过程中记录和传递相关执行场景。
- 底层的事务处理实现。对于底层的事务操作，Spring 委托给具体的事务处理器来完成，这些具体的事务处理器，就是在 IoC 容器 中配置声明式事务处理时，配置的 PlatformTransactionManager 的具体实现，比如 DataSourceTransactionManager 和 HibernateTransactionManager 等。

## 2 实现分析

### 2.1 事务处理拦截器的配置

和前面的思路一样，从声明式事务处理的基本用法入手，来了解它的基本实现原理。在使用声明式事务处理的时候，需要在 IoC 容器 中配置 TransactionProxyFactoryBean，见名知义，这是一个 FactoryBean，有一个 getObject()方法。在 IoC 容器 进行注入的时候，会创建 TransactionInterceptor 对象，而这个对象会创建一个 TransactionAttributePointcut，为读取 TransactionAttribute 做准备。在容器初始化的过程中，由于实现了 InitializingBean 接口，因此 AbstractSingletonProxyFactoryBean 会实现 afterPropertiesSet()方法，正是在这个方法实例化了一个 ProxyFactory，建立起 Spring AOP 的应用，在这里，会为这个 ProxyFactory 设置通知、目标对象，并最终返回 Proxy 代理对象。在 Proxy 代理对象 建立起来以后，在调用其代理方法的时候，会调用相应的 TransactionInterceptor 拦截器，在这个调用中，会根据 TransactionAttribute 配置的事务属性进行配置，从而为事务处理做好准备。

从 TransactionProxyFactoryBean 入手，通过代码实现来了解 Spring 是如何通过 AOP 功能 来完成事务管理配置的，Spring 为声明式事务处理的实现所做的一些准备工作：包括为 AOP 配置基础设施，这些基础设施包括设置 拦截器 TransactionInterceptor、通知器 DefaultPointcutAdvisor 或 TransactionAttributeSourceAdvisor。同时，在 TransactionProxyFactoryBean 的实现中， 还可以看到注人进来的 PlatformTransactionManager 和 事务处理属性 TransactionAttribute 等。

```java
/**
 * 代理工厂bean 用于简化声明式事务处理,这是标准 AOP 的一个方便的替代方案
 * 使用单独的TransactionInterceptor定义。
 */
@SuppressWarnings("serial")
public class TransactionProxyFactoryBean extends AbstractSingletonProxyFactoryBean
		implements BeanFactoryAware {

    /** 事务拦截器，通过 AOP 来发挥作用，Spring 在此拦截器中封装了事务处理实现 */
    private final TransactionInterceptor transactionInterceptor = new TransactionInterceptor();

    /** 切面 */
    private Pointcut pointcut;


    /**
     * 通过依赖注入的事务属性以 properties的形式 出现
     * 把从 beandefinition 中读到的事务管理的属性信息注入到 transactionInterceptor
     */
    public void setTransactionManager(PlatformTransactionManager transactionManager) {
        this.transactionInterceptor.setTransactionManager(transactionManager);
    }

    /**
     * 创建 AOP 对事务处理的 advisor
     * 本方法在 IoC容器 完成 Bean的依赖注入时，通过 initializeBean()方法 被调用
     */
    @Override
    protected Object createMainInterceptor() {
        this.transactionInterceptor.afterPropertiesSet();
        if (this.pointcut != null) {
            // 如果自己定义了切面，就使用默认的通知器，并为其配置事务处理拦截器
            return new DefaultPointcutAdvisor(this.pointcut, this.transactionInterceptor);
        }
        else {
            // 如果没定义，则使用 Spring默认的切面，使用 TransactionAttributeSourceAdvisor
            // 作为通知器，并配置拦截器
            return new TransactionAttributeSourceAdvisor(this.transactionInterceptor);
        }
    }

    public void setTransactionAttributes(Properties transactionAttributes) {
        this.transactionInterceptor.setTransactionAttributes(transactionAttributes);
    }

    public void setTransactionAttributeSource(TransactionAttributeSource transactionAttributeSource) {
        this.transactionInterceptor.setTransactionAttributeSource(transactionAttributeSource);
    }

    public void setPointcut(Pointcut pointcut) {
        this.pointcut = pointcut;
    }

    public void setBeanFactory(BeanFactory beanFactory) {
        this.transactionInterceptor.setBeanFactory(beanFactory);
    }
}
```

以上代码完成了 AOP 配置，对于用户来说，一个值得关心的问题是，Spring 的 TransactionInterceptor 配置 是在什么时候被启动并成为 Advisor 通知器 的一部分的呢？从对 createMainInterceptor()方法 的调用分析中可以看到，这个 createMainInterceptor()方法 在 IoC 容器 完成 Bean 的依赖注入时，通过 initializeBean()方法 被调用，具体的调用过程如下图所示。

![avatar](<../../../images/springTransaction/createMainInterceptor()方法的调用链.png>)

在 TransactionProxyFactoryBean 的父类 AbstractSingletonProxyFactoryBean 中的 afterPropertiesSet()方法，是 Spring 事务处理 完成 AOP 配置 的地方，在建立 TransactionProxyFactoryBean 的事务处理拦截器的时候，首先需要对 ProxyFactoryBean 的 目标 Bean 设置进行检查，如果这个 目标 Bean 的设置是正确的，就会创建一个 ProxyFactory 对象，从而实现 AOP 的使用。在 afterPropertiesSet() 的方法实现中，可以看到为 ProxyFactory 生成代理对象、配置通知器、设置代理接口方法等。

```java
public abstract class AbstractSingletonProxyFactoryBean extends ProxyConfig
		implements FactoryBean<Object>, BeanClassLoaderAware, InitializingBean {

    private Object target;

    private Class<?>[] proxyInterfaces;

    private Object[] preInterceptors;

    private Object[] postInterceptors;

    /** Default is global AdvisorAdapterRegistry */
    private AdvisorAdapterRegistry advisorAdapterRegistry = GlobalAdvisorAdapterRegistry.getInstance();

    private transient ClassLoader proxyClassLoader;

    private Object proxy;

    /**
     * 处理完成 AOP配置，创建 ProxyFactory对象，为其生成代理对象
     * 配置通知器、设置代理接口方法
     */
    public void afterPropertiesSet() {

        // 校验target（目标对象）
        if (this.target == null) {
            throw new IllegalArgumentException("Property 'target' is required");
        }
        if (this.target instanceof String) {
            throw new IllegalArgumentException("'target' needs to be a bean reference, not a bean name as value");
        }
        if (this.proxyClassLoader == null) {
            this.proxyClassLoader = ClassUtils.getDefaultClassLoader();
        }

        // 使用 ProxyFactory 完成 AOP的基本功能，ProxyFactory 提供 proxy对象
        // 并将 TransactionIntercepter 设为 target方法调用的拦截器
        ProxyFactory proxyFactory = new ProxyFactory();

        if (this.preInterceptors != null) {
            for (Object interceptor : this.preInterceptors) {
                proxyFactory.addAdvisor(this.advisorAdapterRegistry.wrap(interceptor));
            }
        }

        // 加入 Advisor通知器，可以加入两种通知器，分别是：
        // DefaultPointcutAdvisor、TransactionAttributeSourceAdvisor
        // 这里通过调用 TransactionProxyFactoryBean实例 的 createMainInterceptor()方法
        // 来生成需要的 Advisors。在 ProxyFactory 的基类 AdvisedSupport 中维护了一个持有 Advisor
        // 的链表LinkedList<Advisor>，通过对这个链表中的元素执行增、删、改等操作，用来管理
        // 配置给 ProxyFactory 的通知器
        proxyFactory.addAdvisor(this.advisorAdapterRegistry.wrap(createMainInterceptor()));

        if (this.postInterceptors != null) {
            for (Object interceptor : this.postInterceptors) {
                proxyFactory.addAdvisor(this.advisorAdapterRegistry.wrap(interceptor));
            }
        }

        proxyFactory.copyFrom(this);

        // 这里创建 AOP 的目标源，与在其它地方使用 ProxyFactory 没什么差别
        TargetSource targetSource = createTargetSource(this.target);
        proxyFactory.setTargetSource(targetSource);

        if (this.proxyInterfaces != null) {
            proxyFactory.setInterfaces(this.proxyInterfaces);
        }
        else if (!isProxyTargetClass()) {
            // 需要根据 AOP 基础设施来确定使用哪个接口作为代理
            proxyFactory.setInterfaces(
                    ClassUtils.getAllInterfacesForClass(targetSource.getTargetClass(), this.proxyClassLoader));
        }

        // 设置代理对象
        this.proxy = proxyFactory.getProxy(this.proxyClassLoader);
    }
}
```

DefaultAopProxyFactory 创建 AOP Proxy 的过程在前面分析 AOP 的实现原理 时已分析过，这里就不再重复了。可以看到，通过以上的一系列步骤，Spring 为实现事务处理而设计的 拦截器 TransctionInterceptor 已经设置到 ProxyFactory 生成的 AOP 代理对象 中去了，这里的 TransactionInterceptor 是作为 AOP Advice 的拦截器来实现它的功能的。在 IoC 容器 中，配置其他与事务处理有关的属性，比如，比较熟悉的 transactionManager 和事务处理的属性，也同样会被设置到已经定义好的 TransactionInterceptor 中去。这些属性配置在 TransactionInterceptor，对事务方法进行拦截时会起作用。在 AOP 配置 完成以后，可以看到，在 Spring 声明式事务处理实现 中的一些重要的类已经悄然登场，比如 TransactionAttributeSourceAdvisor 和 TransactionInterceptor，正是这些类通过 AOP 封装了 Spring 对事务处理的基本实现。

### 2.2 事务处理配置的读入

在 AOP 配置 完成的基础上，以 TransactionAttributeSourceAdvisor 的实现 为入口，了解具体的事务属性配置是如何读入的。

```java
public class TransactionAttributeSourceAdvisor extends AbstractPointcutAdvisor {

    /**
     * 与其它 Advisor 一样，同样需要定义 AOP 中用到的 Interceptor 和 Pointcut
     */
    private TransactionInterceptor transactionInterceptor;

    /**
     * 对于 切面Pointcut，这里使用了一个匿名内部类
     */
    private final TransactionAttributeSourcePointcut pointcut = new TransactionAttributeSourcePointcut() {
        /**
         * 通过 transactionInterceptor 来得到事务的配置属性，在对 Proxy的方法 进行匹配调用时，
         * 会使用到这些配置属性
         */
        @Override
        protected TransactionAttributeSource getTransactionAttributeSource() {
            return (transactionInterceptor != null ? transactionInterceptor.getTransactionAttributeSource() : null);
        }
    };
}
```

在声明式事务处理中，通过对目标对象的方法调用进行拦截来实现事务处理的织入，这个拦截通过 AOP 发挥作用。在 AOP 中，对于拦截的启动，首先需要对方法调用是否需要拦截进行判断，而判断的依据是那些在 TransactionProxyFactoryBean 中为目标对象设置的事务属性。也就是说，需要判断当前的目标方法调用是不是一个配置好的并且需要进行事务处理的方法调用。具体来说，这个匹配判断在 TransactionAttributeSourcePointcut 的 matches()方法 中完成，该方法实现 首先把事务方法的属性配置读取到 TransactionAttributeSource 对象 中，有了这些事务处理的配置以后，根据当前方法调用的 Method 对象 和 目标对象，对是否需要启动事务处理拦截器进行判断。

```java
abstract class TransactionAttributeSourcePointcut extends StaticMethodMatcherPointcut implements Serializable {

    public boolean matches(Method method, Class targetClass) {
        TransactionAttributeSource tas = getTransactionAttributeSource();
        return (tas == null || tas.getTransactionAttribute(method, targetClass) != null);
    }
}
```

在 Pointcut 的 matches()判断过程 中，会用到 TransactionAttributeSource 对象，这个 TransactionAttributeSource 对象 是在对 TransactionInterceptor 进行依赖注入时就配置好的。它的设置是在 TransactionInterceptor 的基类 TransactionAspectSupport 中完成的，配置的是一个 NameMatchTransactionAttributeSource 对象。

```java
public abstract class TransactionAspectSupport implements BeanFactoryAware, InitializingBean {
    /**
     * 设置事务属性，以方法名为 key，事务属性描述符为 value
     * 例如：key = "myMethod", value = "PROPAGATION_REQUIRED,readOnly"
     */
    public void setTransactionAttributes(Properties transactionAttributes) {
        // 可以看到这是一个 NameMatchTransactionAttributeSource 的实现
        NameMatchTransactionAttributeSource tas = new NameMatchTransactionAttributeSource();
        tas.setProperties(transactionAttributes);
        this.transactionAttributeSource = tas;
    }
}
```

在以上的代码实现中可以看到，NameMatchTransactionAttributeSource 作为 TransactionAttributeSource 的具体实现，是实际完成事务处理属性读入和匹配的地方。在对 事务属性 TransactionAttributes 进行设置时，会从事务处理属性配置中读取事务方法名和配置属性，在得到配置的事务方法名和属性以后，会把它们作为键值对加入到一个 nameMap 中。

在应用调用目标方法的时候，因为这个目标方法已经被 TransactionProxyFactoryBean 代理，所以 TransactionProxyFactoryBean 需要判断这个调用方法是否是事务方法。这个判断的实现，是通过在 NameMatchTransactionAttributeSource 中能否为这个调用方法返回事务属性来完成的。具体的实现过程是这样的：首先，以调用方法名为索引在 nameMap 中查找相应的事务处理属性值，如果能够找到，那么就说明该调用方法和事务方法是直接对应的，如果找不到，那么就会遍历整个 nameMap，对保存在 nameMap 中的每一个方法名，使用 PatternMatchUtils 的 simpleMatch()方法 进行命名模式上的匹配。这里使用 PatternMatchUtils 进行匹配的原因是，在设置事务方法的时候，可以不需要为事务方法设置一个完整的方法名，而可以通过设置方法名的命名模式来完成，比如可以通过对 通配符\* 的使用等。所以，如果直接通过方法名没能够匹配上，而通过方法名的命名模式能够匹配上，这个方法也是需要进行事务处理的，相对应地，它所配置的事务处理属性也会从 nameMap 中取出来，从而触发事务处理拦截器的拦截。

```java
public class NameMatchTransactionAttributeSource implements TransactionAttributeSource, Serializable {

    /** key 是方法名，value 是事务属性 */
    private Map<String, TransactionAttribute> nameMap = new HashMap<String, TransactionAttribute>();

    /**
     * 将给定 属性transactionAttributes 解析为 <名称, 属性> 的Map对象。以 方法名称 为 key，
     * 字符串属性定义 为 value，可通过 TransactionAttributeEditor 解析为 TransactionAttribute实例。
     */
    public void setProperties(Properties transactionAttributes) {
        TransactionAttributeEditor tae = new TransactionAttributeEditor();
        Enumeration propNames = transactionAttributes.propertyNames();
        while (propNames.hasMoreElements()) {
            String methodName = (String) propNames.nextElement();
            String value = transactionAttributes.getProperty(methodName);
            tae.setAsText(value);
            TransactionAttribute attr = (TransactionAttribute) tae.getValue();
            addTransactionalMethod(methodName, attr);
        }
    }

    /**
     * 为事务方法添加属性
     */
    public void addTransactionalMethod(String methodName, TransactionAttribute attr) {
        if (logger.isDebugEnabled()) {
            logger.debug("Adding transactional method [" + methodName + "] with attribute [" + attr + "]");
        }
        this.nameMap.put(methodName, attr);
    }

    /**
     * 对调用的方法进行判断，判断它是否是事务方法，如果是事务方法，则取出相应的事务配置属性
     */
    public TransactionAttribute getTransactionAttribute(Method method, Class<?> targetClass) {
        // 直接通过 方法名 匹配
        String methodName = method.getName();
        TransactionAttribute attr = this.nameMap.get(methodName);

        if (attr == null) {
            // 查找最具体的名称匹配
            String bestNameMatch = null;
            for (String mappedName : this.nameMap.keySet()) {
                if (isMatch(methodName, mappedName) &&
                        (bestNameMatch == null || bestNameMatch.length() <= mappedName.length())) {
                    attr = this.nameMap.get(mappedName);
                    bestNameMatch = mappedName;
                }
            }
        }

        return attr;
    }

    /**
     * 如果给定的方法名与映射的名称匹配，则返回
     */
    protected boolean isMatch(String methodName, String mappedName) {
        return PatternMatchUtils.simpleMatch(mappedName, methodName);
    }
}
```

通过以上过程可以得到与目标对象调用方法相关的 TransactionAttribute 对象，在这个对象中，封装了事务处理的配置。具体来说，在前面的匹配过程中，如果匹配返回的结果是 null，那么说明当前的调用方法不是一个事务方法，不需要纳入 Spring 统一的事务管理中，因为它并没有配置在 TransactionProxyFactoryBean 的事务处理设置中。如果返回的 TransactionAttribute 对象 不是 null,那么这个返回的 TransactionAttribute 对象 就已经包含了对事务方法的配置信息，对应这个事务方法的具体事务配置也已经读入到 TransactionAttribute 对象 中了，为 TransactionInterceptor 做好了对调用的目标方法添加事务处理的准备。

### 2.3 事务处理拦截器的设计与实现

在完成以上的准备工作后，经过 TransactionProxyFactoryBean 的 AOP 包装， 此时如果对目标对象进行方法调用，起作用的对象实际上是一个 Proxy 代理对象，对目标对象方法的调用，不会直接作用在 TransactionProxyFactoryBean 设置的目标对象上，而会被设置的事务处理拦截器拦截。而在 TransactionProxyFactoryBean 的 AOP 实现 中，获取 Proxy 对象 的过程并不复杂，TransactionProxyFactoryBean 作为一个 FactoryBean，对这个 Bean 的对象的引用是通过调用其父类 AbstractSingletonProxyFactoryBean 的 getObject()方法 来得到的。

```java
public abstract class AbstractSingletonProxyFactoryBean extends ProxyConfig
		implements FactoryBean<Object>, BeanClassLoaderAware, InitializingBean {

    private Object proxy;
    // 返回的是一个 proxy代理对象，这个 proxy 是 ProxyFactory 生成的 AOP代理，
    // 已经封装了对事务处理的拦截器配置
    public Object getObject() {
        if (this.proxy == null) {
            throw new FactoryBeanNotInitializedException();
        }
        return this.proxy;
    }
}
```

InvocationHandler 的实现类中有一个非常重要的方法 invoke()，该方法是 proxy 代理对象 的回调方法，在调用 proxy 对象 的代理方法时触发这个回调。事务处理拦截器 TransactionInterceptor 中实现了 InvocationHandler 的 invoke()方法，其过程是，首先获得调用方法的事务处理配置；在得到事务处理配置以后，会取得配置的 PlatformTransactionManager，由这个事务处理器来实现事务的创建、提交、回滚操作。

```java
public class TransactionInterceptor extends TransactionAspectSupport implements MethodInterceptor, Serializable {

    public Object invoke(final MethodInvocation invocation) throws Throwable {
        // 得到代理的目标对象，并将事务属性传递给目标对象
        Class<?> targetClass = (invocation.getThis() != null ? AopUtils.getTargetClass(invocation.getThis()) : null);

        // 在其父类 TransactionAspectSupport 中进行后续的事务处理
        return invokeWithinTransaction(invocation.getMethod(), targetClass, new InvocationCallback() {
            public Object proceedWithInvocation() throws Throwable {
                return invocation.proceed();
            }
        });
    }
}

public abstract class TransactionAspectSupport implements BeanFactoryAware, InitializingBean {

    private static final ThreadLocal<TransactionInfo> transactionInfoHolder =
            new NamedThreadLocal<TransactionInfo>("Current aspect-driven transaction");

    protected Object invokeWithinTransaction(Method method, Class targetClass, final InvocationCallback invocation)
            throws Throwable {

        // 获取事务属性，如果属性为空，则该方法是非事务性的
        final TransactionAttribute txAttr = getTransactionAttributeSource().getTransactionAttribute(method, targetClass);
        final PlatformTransactionManager tm = determineTransactionManager(txAttr);
        final String joinpointIdentification = methodIdentification(method, targetClass);

        // 这里区分不同类型的 PlatformTransactionManager，因为他们的调用方式不同，
        // 对 CallbackPreferringPlatformTransactionManager 来说，需要回调函数
        // 来实现事务的创建和提交，而非 CallbackPreferringPlatformTransactionManager
        // 则不需要
        if (txAttr == null || !(tm instanceof CallbackPreferringPlatformTransactionManager)) {
            // 这里创建事务，同时把创建事务过程中得到的信息放到 TransactionInfo 中，
            // TransactionInfo 是保存当前事务状态的对象
            TransactionInfo txInfo = createTransactionIfNecessary(tm, txAttr, joinpointIdentification);
            Object retVal = null;
            try {
                // 这里的调用使处理沿着拦截器链进行，使最后目标对象的方法得以调用
                retVal = invocation.proceedWithInvocation();
            }
            catch (Throwable ex) {
                // 如果在事务处理方法调用中出现了异常，事务如何进行处理需要
                // 根据具体情况考虑回滚或提交
                completeTransactionAfterThrowing(txInfo, ex);
                throw ex;
            }
            finally {
                // 这里把 与线程绑定的 TransactionInfo 设置为 oldTransactionInfo
                cleanupTransactionInfo(txInfo);
            }
            // 这里通过事务处理器来对事务进行提交
            commitTransactionAfterReturning(txInfo);
            return retVal;
        } else {
            // 使用回调的方式来使用事务处理器
            try {
                Object result = ((CallbackPreferringPlatformTransactionManager) tm).execute(txAttr,
                        new TransactionCallback<Object>() {
                            public Object doInTransaction(TransactionStatus status) {
                                TransactionInfo txInfo = prepareTransactionInfo(tm, txAttr, joinpointIdentification, status);
                                try {
                                    return invocation.proceedWithInvocation();
                                }
                                catch (Throwable ex) {
                                    if (txAttr.rollbackOn(ex)) {
                                        // RuntimeException 会导致事务回滚
                                        if (ex instanceof RuntimeException) {
                                            throw (RuntimeException) ex;
                                        }
                                        else {
                                            throw new ThrowableHolderException(ex);
                                        }
                                    }
                                    else {
                                        // 如果正常返回，则提交该事务
                                        return new ThrowableHolder(ex);
                                    }
                                }
                                finally {
                                    cleanupTransactionInfo(txInfo);
                                }
                            }
                        });

                // Check result: It might indicate a Throwable to rethrow.
                if (result instanceof ThrowableHolder) {
                    throw ((ThrowableHolder) result).getThrowable();
                }
                else {
                    return result;
                }
            }
            catch (ThrowableHolderException ex) {
                throw ex.getCause();
            }
        }
    }

    /**
     * 用于保存事务信息的不透明对象。子类必须将其传递回该类上的方法，但看不到其内部。
     */
    protected final class TransactionInfo {

        private final PlatformTransactionManager transactionManager;

        private final TransactionAttribute transactionAttribute;

        private final String joinpointIdentification;

        private TransactionStatus transactionStatus;

        private TransactionInfo oldTransactionInfo;

        public TransactionInfo(PlatformTransactionManager transactionManager,
                TransactionAttribute transactionAttribute, String joinpointIdentification) {
            this.transactionManager = transactionManager;
            this.transactionAttribute = transactionAttribute;
            this.joinpointIdentification = joinpointIdentification;
        }
    }
}
```

以事务提交为例，简要的说明下该过程。在调用代理的事务方法时，因为前面已经完成了一系列 AOP 配置，对事务方法的调用，最终启动
TransactionInterceptor 拦截器 的 invoke()方法。在这个方法中，首先会读取该事务方法的事务属性配置，然后根据事务属性配置以及具体事务处理器的配置来决定采用哪一个事务处理器，这个事务处理器实际上是一个 PlatformTransactionManager。在确定好具体的事务处理器之后，会根据事务的运行情况和事务配置来决定是不是需要创建新的事务。

对于 Spring 而言，事务的管理实际上是通过一个 TransactionInfo 对象 来完成的，在该对象中，封装了事务对象和事务处理的状态信息，这是事务处理的抽象。在这一步完成以后，会对拦截器链进行处理，因为有可能在该事务对象中还配置了除事务处理 AOP 之外的其他拦截器。在结束对拦截器链处理之后，会对 TransactionInfo 中的信息进行更新，以反映最近的事务处理情况，在这个时候，也就完成了事务提交的准备，通过调用 事务处理器 PlatformTransactionManager 的 commitTransactionAfterReturning()方法 来完成事务的提交。这个提交的处理过程已经封装在 PlatformTransactionManager 的事务处理器中了，而与具体数据源相关的处理过程，最终委托给相关的具体事务处理器来完成，比如 DataSourceTransactionManager、Hibermate'TransactionManager 等。

在这个 invoke()方法 的实现中，可以看到整个事务处理在 AOP 拦截器 中实现的全过程。同时，它也是 Spring 采用 AOP 封装事务处理和实现声明式事务处理的核心部分。这部分实现是一个桥梁，它胶合了具体的事务处理和 Spring AOP 框架，可以看成是一个 Spring AOP 应用，在这个桥梁搭建完成以后，Spring 事务处理 的实现就开始了。
