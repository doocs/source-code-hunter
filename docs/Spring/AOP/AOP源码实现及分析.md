理论性的文字，我觉得就没必要再扯一遍咯，大道理讲这么多，越听越迷糊。不如直接看源码加注释来的明白痛快。所以话不多说，直接上源码。

## 1 主要的接口

### 1.1 Advice 通知

本接口定义了切面的增强方式，如：前置增强 BeforeAdvice，后置增强 AfterAdvice，异常增强 ThrowsAdvice 等。下面看两个主要的子接口的源码。

```java
public interface MethodBeforeAdvice extends BeforeAdvice {

    /**
     * 目标方法 method 开始执行前，AOP 会回调此方法
     */
    void before(Method method, Object[] args, Object target) throws Throwable;
}

public interface AfterReturningAdvice extends AfterAdvice {

    /**
     * 目标方法 method 执行后，AOP 会回调此方法，注意，它还传入了 method 的返回值
     */
    void afterReturning(Object returnValue, Method method, Object[] args, Object target) throws Throwable;
}
```

### 1.2 Pointcut 方法的横切面

本接口用来定义需要增强的目标方法的集合，一般使用正则表达式去匹配筛选指定范围内的所有满足条件的目标方法。Pointcut 接口有很多实现，我们主要看一下 JdkRegexpMethodPointcut 和 NameMatchMethodPointcut 的实现原理，前者主要通过正则表达式对方法名进行匹配，后者则通过匹配方法名进行匹配。

```java
    // JdkRegexpMethodPointcut 的实现源码
    private Pattern[] compiledPatterns = new Pattern[0];

    protected boolean matches(String pattern, int patternIndex) {
        Matcher matcher = this.compiledPatterns[patternIndex].matcher(pattern);
        return matcher.matches();
    }

    // NameMatchMethodPointcut 的实现源码
    private List<String> mappedNames = new LinkedList<String>();

    public boolean matches(Method method, Class targetClass) {
        for (String mappedName : this.mappedNames) {
            if (mappedName.equals(method.getName()) || isMatch(method.getName(), mappedName)) {
                return true;
            }
        }
        return false;
    }
```

### 1.3 Advisor 通知器

将 Pointcut 和 Advice 有效地结合在一起。它定义了在哪些方法（Pointcut）上执行哪些动作（Advice）。下面看一下 DefaultPointcutAdvisor 的源码实现，它通过持有 Pointcut 和 Advice 属性来将两者有效地结合在一起。

```java
public class DefaultPointcutAdvisor extends AbstractGenericPointcutAdvisor implements Serializable {

    private Pointcut pointcut = Pointcut.TRUE;

    public DefaultPointcutAdvisor() {
    }

    public DefaultPointcutAdvisor(Advice advice) {
        this(Pointcut.TRUE, advice);
    }

    /**
     * 自己定义了 Pointcut属性，而 Advice属性 则使用父类中的定义
     */
    public DefaultPointcutAdvisor(Pointcut pointcut, Advice advice) {
        this.pointcut = pointcut;
        setAdvice(advice);
    }
}

public abstract class AbstractGenericPointcutAdvisor extends AbstractPointcutAdvisor {

    //本类是一个抽象类，其持有 Advice 的引用，而对 Pointcut 的引用，则在具体的子类中持有
    private Advice advice;

    public void setAdvice(Advice advice) {
        this.advice = advice;
    }

    public Advice getAdvice() {
        return this.advice;
    }

    @Override
    public String toString() {
        return getClass().getName() + ": advice [" + getAdvice() + "]";
    }
}
```

## 2 Spring AOP 的设计与实现

AOP 的实现代码中，主要使用了 JDK 动态代理，在特定场景下（被代理对象没有 implements 的接口）也用到了 CGLIB 生成代理对象。通过 AOP 的源码设计可以看到，其先为目标对象建立了代理对象，这个代理对象的生成可以使用 JDK 动态代理或 CGLIB 完成。然后启动为代理对象配置的拦截器，对横切面（目标方法集合）进行相应的增强，将 AOP 的横切面设计和 Proxy 模式有机地结合起来，实现了在 AOP 中定义好的各种织入方式。

### 2.1 ProxyFactoryBean

这里我们主要以 ProxyFactoryBean 的实现为例，对 AOP 的实现原理进行分析。ProxyFactoryBean 主要持有目标对象 target 的代理对象 aopProxy，和 Advisor 通知器，而 Advisor 持有 Advice 和 Pointcut，这样就可以判断 aopProxy 中的方法 是否是某个指定的切面 Pointcut，然后根据其配置的织入方向（前置增强/后置增强），通过反射为其织入相应的增强行为 Advice。先看一下 ProxyFactoryBean 的配置和使用。

```xml
<!-- 定义自己的 Advisor 实现，其中包含了 Pointcut 和 Advice -->
<bean id="myAdvisor" class="com.shuitu.MyAdvisor"/>

<bean id="myAOP" class="org.springframework.aop.framework.ProxyFactoryBean">
	<!-- 代理类实现的接口 -->
	<property name="proxyInterface"><value>com.shuitu.ProxyInterface</value></property>
	<!-- 被代理的对象 -->
	<property name="target">
		<bean class="com.shuitu.MyTarget"/>
	</property>
	<!-- 配置相应的 Advisor -->
	<property name="interceptorNames">
		<list><value>myAdvisor</value></list>
	</property>
</bean>
```

### 2.2 为配置的 target 生成 AopProxy 代理对象

ProxyFactoryBean 的 getObject() 方法先对通知器链进行了初始化，然后根据被代理对象类型的不同，生成代理对象。

```java
    /**
     * 返回一个代理对象，当用户从 FactoryBean 中获取 bean 时调用，
     * 创建此工厂要返回的 AOP 代理的实例，该实例将作为一个单例被缓存
     */
    public Object getObject() throws BeansException {
        // 初始化通知器链
        initializeAdvisorChain();
        // 这里对 Singleton 和 prototype 的类型进行区分，生成对应的 proxy
        if (isSingleton()) {
            return getSingletonInstance();
        }
        else {
            if (this.targetName == null) {
                logger.warn("Using non-singleton proxies with singleton targets is often undesirable. " +
                        "Enable prototype proxies by setting the 'targetName' property.");
            }
            return newPrototypeInstance();
        }
    }
```

### 2.3 初始化 Advisor 链

```java
    /**
     * 初始化 Advisor 链，可以发现，其中有通过对 IoC 容器的 getBean() 方法的调用来获取配置好的 advisor 通知器
     */
    private synchronized void initializeAdvisorChain() throws AopConfigException, BeansException {
        // 如果通知器链已经完成初始化，则直接返回
        if (this.advisorChainInitialized) {
            return;
        }

        if (!ObjectUtils.isEmpty(this.interceptorNames)) {
            if (this.beanFactory == null) {
                throw new IllegalStateException("No BeanFactory available anymore (probably due to serialization) " +
                        "- cannot resolve interceptor names " + Arrays.asList(this.interceptorNames));
            }

            if (this.interceptorNames[this.interceptorNames.length - 1].endsWith(GLOBAL_SUFFIX) &&
                    this.targetName == null && this.targetSource == EMPTY_TARGET_SOURCE) {
                throw new AopConfigException("Target required after globals");
            }

            // 这里添加了 Advisor 链的调用，下面的 interceptorNames 是在配置文件中
            // 通过 interceptorNames 进行配置的。由于每一个 Advisor 都是被配置为 bean 的，
            // 所以通过遍历 interceptorNames 得到的 name，其实就是 bean 的 id，通过这个 name（id）
            // 我们就可以从 IoC 容器中获取对应的实例化 bean
            for (String name : this.interceptorNames) {
                if (logger.isTraceEnabled()) {
                    logger.trace("Configuring advisor or advice '" + name + "'");
                }
                if (name.endsWith(GLOBAL_SUFFIX)) {
                    if (!(this.beanFactory instanceof ListableBeanFactory)) {
                        throw new AopConfigException(
                                "Can only use global advisors or interceptors with a ListableBeanFactory");
                    }
                    addGlobalAdvisor((ListableBeanFactory) this.beanFactory,
                            name.substring(0, name.length() - GLOBAL_SUFFIX.length()));
                }
                else {
                    // 对当前的 factoryBean 进行类型判断，是属于单例 bean 还是原型 bean
                    Object advice;
                    if (this.singleton || this.beanFactory.isSingleton(name)) {
                        // 通过 beanFactory 的 getBean() 方法获取 advisor，
                        // 这个 name 是从 interceptorNames 中获取的
                        advice = this.beanFactory.getBean(name);
                    }
                    else {
                        // 如果是原型 bean
                        advice = new PrototypePlaceholderAdvisor(name);
                    }
                    addAdvisorOnChainCreation(advice, name);
                }
            }
        }
        this.advisorChainInitialized = true;
    }
```

生成 singleton 的代理对象在 getSingletonInstance 方法中完成，这是 ProxyFactoryBean 生成 AopProxy 代理对象的调用入口。代理对象会封装对 target 对象的调用，针对 target 对象的方法调用会被这里生成的代理对象所拦截。

### 2.4 生成单例代理对象

```java
    /**
     * 返回此类代理对象的单例实例，如果尚未创建该实例，则单例地创建它
     */
    private synchronized Object getSingletonInstance() {
        if (this.singletonInstance == null) {
            this.targetSource = freshTargetSource();
            if (this.autodetectInterfaces && getProxiedInterfaces().length == 0 && !isProxyTargetClass()) {
                // 根据 AOP 框架来判断需要代理的接口
                Class targetClass = getTargetClass();
                if (targetClass == null) {
                    throw new FactoryBeanNotInitializedException("Cannot determine target class for proxy");
                }
                // 设置代理对象的接口
                setInterfaces(ClassUtils.getAllInterfacesForClass(targetClass, this.proxyClassLoader));
            }
            super.setFrozen(this.freezeProxy);
            // 这里会通过 AopProxy 来得到代理对象
            this.singletonInstance = getProxy(createAopProxy());
        }
        return this.singletonInstance;
    }

    /**
     * 通过 createAopProxy()方法 返回的 aopProxy 获取代理对象
     */
    protected Object getProxy(AopProxy aopProxy) {
        return aopProxy.getProxy(this.proxyClassLoader);
    }
```

上面的 createAopProxy() 方法，调用了 ProxyFactoryBean 的父类 ProxyCreatorSupport 中的实现。

```java
public class ProxyCreatorSupport extends AdvisedSupport {

    private AopProxyFactory aopProxyFactory;

    public ProxyCreatorSupport() {
        // 注意这里实例化的是一个 DefaultAopProxyFactory，所以下面的 createAopProxy() 方法
        // 中调用的也是 DefaultAopProxyFactory 的实现
        this.aopProxyFactory = new DefaultAopProxyFactory();
    }

    protected final synchronized AopProxy createAopProxy() {
        if (!this.active) {
            activate();
        }
        //调用的是 DefaultAopProxyFactory 的实现
        return getAopProxyFactory().createAopProxy(this);
    }

    public AopProxyFactory getAopProxyFactory() {
        return this.aopProxyFactory;
    }
}
```

下面看一下 AopProxyFactory 接口的实现类 DefaultAopProxyFactory 的 createAopProxy(AdvisedSupport config)方法。

```java
    public AopProxy createAopProxy(AdvisedSupport config) throws AopConfigException {
        // AopProxy 代理对象的生成过程：
        // 首先从 AdvisedSupport 对象中获取配置的 target 目标对象的类型 targetClass，
        // 然后根据 targetClass 是否为接口采取不同的生成代理对象的策略
        if (config.isOptimize() || config.isProxyTargetClass() || hasNoUserSuppliedProxyInterfaces(config)) {
            Class targetClass = config.getTargetClass();
            if (targetClass == null) {
                throw new AopConfigException("TargetSource cannot determine target class: " +
                        "Either an interface or a target is required for proxy creation.");
            }

            /**
             * ！！！！！！！！！！！！！！！！！！！！！！！！！！
             * 如果目标类是接口，则使用 JDK 动态代理，否则使用 CGLIB
             * ！！！！！！！！！！！！！！！！！！！！！！！！！！
             */
            if (targetClass.isInterface()) {
                return new JdkDynamicAopProxy(config);
            }
            return CglibProxyFactory.createCglibProxy(config);
        }
        else {
            return new JdkDynamicAopProxy(config);
        }
    }
```

可以看到其根据目标对象是否实现了接口，而决定是使用 JDK 动态代理 还是 CGLIB 去生成代理对象，而 AopProxy 接口的实现类也只有 JdkDynamicAopProxy 和 CglibAopProxy 这两个。

### 2.5 JDK 动态代理 生成 AopProxy 代理对象

```java
/**
 * 可以看到，其实现了 InvocationHandler 接口，所以肯定也定义了一个 使用 java.lang.reflect.Proxy
 * 动态生成代理对象的方法，并在实现的 invoke() 方法中为代理对象织入增强方法
 */
final class JdkDynamicAopProxy implements AopProxy, InvocationHandler, Serializable {

    /** AdvisedSupport 持有一个 List<Advisor>属性 */
    private final AdvisedSupport advised;

    public JdkDynamicAopProxy(AdvisedSupport config) throws AopConfigException {
        Assert.notNull(config, "AdvisedSupport must not be null");
        if (config.getAdvisors().length == 0 && config.getTargetSource() == AdvisedSupport.EMPTY_TARGET_SOURCE) {
            throw new AopConfigException("No advisors and no TargetSource specified");
        }
        // 这个 advised 是一个 AdvisedSupport 对象，可以通过它获取被代理对象 target
        // 这样，当 invoke()方法 被 代理对象aopProxy 调用时，就可以调用 target 的目标方法了
        this.advised = config;
    }

    public Object getProxy() {
        return getProxy(ClassUtils.getDefaultClassLoader());
    }

    public Object getProxy(ClassLoader classLoader) {
        if (logger.isDebugEnabled()) {
            logger.debug("Creating JDK dynamic proxy: target source is " + this.advised.getTargetSource());
        }

        // 获取代理类要实现的接口
        Class[] proxiedInterfaces = AopProxyUtils.completeProxiedInterfaces(this.advised);
        findDefinedEqualsAndHashCodeMethods(proxiedInterfaces);

        // 通过 java.lang.reflect.Proxy 生成代理对象并返回
        return Proxy.newProxyInstance(classLoader, proxiedInterfaces, this);
    }
}
```

通过 JdkDynamicAopProxy 的源码可以非常清楚地看到，其使用了 JDK 动态代理 的方式生成了 代理对象。JdkDynamicAopProxy 实现了 InvocationHandler 接口，并通过 java.lang.reflect.Proxy 的 newProxyInstance()静态方法 生成代理对象并返回。

### 2.6 CGLIB 生成 AopProxy 代理对象

```java
final class CglibAopProxy implements AopProxy, Serializable {

    /** AdvisedSupport 持有一个 List<Advisor>属性 */
    protected final AdvisedSupport advised;

    public Object getProxy(ClassLoader classLoader) {
        if (logger.isDebugEnabled()) {
            logger.debug("Creating CGLIB proxy: target source is " + this.advised.getTargetSource());
        }

        try {
            Class<?> rootClass = this.advised.getTargetClass();
            Assert.state(rootClass != null, "Target class must be available for creating a CGLIB proxy");

            Class<?> proxySuperClass = rootClass;
            if (ClassUtils.isCglibProxyClass(rootClass)) {
                proxySuperClass = rootClass.getSuperclass();
                Class<?>[] additionalInterfaces = rootClass.getInterfaces();
                for (Class<?> additionalInterface : additionalInterfaces) {
                    this.advised.addInterface(additionalInterface);
                }
            }

            validateClassIfNecessary(proxySuperClass);

            // 创建并配置 Enhancer对象，Enhancer 是 CGLIB 中主要的操作类
            Enhancer enhancer = createEnhancer();
            if (classLoader != null) {
                enhancer.setClassLoader(classLoader);
                if (classLoader instanceof SmartClassLoader &&
                        ((SmartClassLoader) classLoader).isClassReloadable(proxySuperClass)) {
                    enhancer.setUseCache(false);
                }
            }
            enhancer.setSuperclass(proxySuperClass);
            enhancer.setStrategy(new MemorySafeUndeclaredThrowableStrategy(UndeclaredThrowableException.class));
            enhancer.setInterfaces(AopProxyUtils.completeProxiedInterfaces(this.advised));
            enhancer.setInterceptDuringConstruction(false);

            Callback[] callbacks = getCallbacks(rootClass);
            enhancer.setCallbacks(callbacks);
            enhancer.setCallbackFilter(new ProxyCallbackFilter(
                    this.advised.getConfigurationOnlyCopy(), this.fixedInterceptorMap, this.fixedInterceptorOffset));

            Class<?>[] types = new Class[callbacks.length];
            for (int x = 0; x < types.length; x++) {
                types[x] = callbacks[x].getClass();
            }
            enhancer.setCallbackTypes(types);

            // 通过 enhancer 生成代理对象
            Object proxy;
            if (this.constructorArgs != null) {
                proxy = enhancer.create(this.constructorArgTypes, this.constructorArgs);
            }
            else {
                proxy = enhancer.create();
            }

            return proxy;
        }
        catch (CodeGenerationException ex) {
            throw new AopConfigException("Could not generate CGLIB subclass of class [" +
                    this.advised.getTargetClass() + "]: " +
                    "Common causes of this problem include using a final class or a non-visible class",
                    ex);
        }
        catch (IllegalArgumentException ex) {
            throw new AopConfigException("Could not generate CGLIB subclass of class [" +
                    this.advised.getTargetClass() + "]: " +
                    "Common causes of this problem include using a final class or a non-visible class",
                    ex);
        }
        catch (Exception ex) {
            // TargetSource.getTarget() failed
            throw new AopConfigException("Unexpected AOP exception", ex);
        }
    }
```

为 目标对象 target 生成 代理对象 之后，在调用 代理对象 的目标方法时，目标方法会进行 invoke()回调（JDK 动态代理） 或 callbacks()回调（CGLIB），然后就可以在回调方法中对目标对象的目标方法进行拦截和增强处理了。

## 3 Spring AOP 拦截器调用的实现

在 Spring AOP 通过 JDK 的 Proxy 类 生成代理对象时，相关的拦截器已经配置到了代理对象持有的 InvocationHandler(即，ProxyBeanFactory) 的 invoke() 方法中，拦截器最后起作用，是通过调用代理对象的目标方法时，在代理类中触发了 InvocationHandler 的 invoke() 回调。通过 CGLIB 实现的 AOP，原理与此相似。

### 3.1 JdkDynamicAopProxy 的 invoke() 拦截

前面已经通过两种不同的方式生成了 AopProxy 代理对象，下面我们先看一下 JdkDynamicAopProxy 中的 invoke()回调方法 中对拦截器调用的实现。

```java
final class JdkDynamicAopProxy implements AopProxy, InvocationHandler, Serializable {

    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        MethodInvocation invocation;
        Object oldProxy = null;
        boolean setProxyContext = false;

        //通过 targetSource 可以获取被代理对象
        TargetSource targetSource = this.advised.targetSource;
        Class targetClass = null;
        Object target = null;

        try {
            // 如果目标对象调用的是 Obejct类 中的基本方法，如：equals()、hashCode() 则进行相应的处理
            if (!this.equalsDefined && AopUtils.isEqualsMethod(method)) {
                // 如果目标对象没有重写 Object类 的基本方法：equals(Object other)
                return equals(args[0]);
            }
            if (!this.hashCodeDefined && AopUtils.isHashCodeMethod(method)) {
                // 如果目标对象没有重写 Object类 的基本方法：hashCode()
                return hashCode();
            }
            if (!this.advised.opaque && method.getDeclaringClass().isInterface() &&
                    method.getDeclaringClass().isAssignableFrom(Advised.class)) {
                // 使用代理配置对 ProxyConfig 进行服务调用
                return AopUtils.invokeJoinpointUsingReflection(this.advised, method, args);
            }

            Object retVal;

            if (this.advised.exposeProxy) {
                // 如果有必要，可以援引
                oldProxy = AopContext.setCurrentProxy(proxy);
                setProxyContext = true;
            }

            // 获取目标对象，为目标方法的调用做准备
            target = targetSource.getTarget();
            if (target != null) {
                targetClass = target.getClass();
            }

            // 获取定义好的拦截器链，即 Advisor列表
            List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);

            // 如果没有配置拦截器，就直接通过反射调用目标对象 target 的 method对象，并获取返回值
            if (chain.isEmpty()) {
                retVal = AopUtils.invokeJoinpointUsingReflection(target, method, args);
            }
            else {
                // 如果有拦截器链，则需要先调用拦截器链中的拦截器，再调用目标的对应方法
                // 这里通过构造 ReflectiveMethodInvocation 来实现
                invocation = new ReflectiveMethodInvocation(proxy, target, method, args, targetClass, chain);
                // 沿着拦截器链继续向下处理
                retVal = invocation.proceed();
            }

            // 获取 method 返回值的类型
            Class<?> returnType = method.getReturnType();
            if (retVal != null && retVal == target && returnType.isInstance(proxy) &&
                    !RawTargetAccess.class.isAssignableFrom(method.getDeclaringClass())) {
                // 特殊提醒：它返回“this”，方法的返回类型与类型兼容。
                // 注意，如果 target 在另一个返回的对象中设置了对自身的引用，Spring 将无法处理
                retVal = proxy;
            } else if (retVal == null && returnType != Void.TYPE && returnType.isPrimitive()) {
                throw new AopInvocationException("Null return value from advice does not match primitive return type for: " + method);
            }
            return retVal;
        }
        finally {
            if (target != null && !targetSource.isStatic()) {
                // 必须来自 TargetSource.
                targetSource.releaseTarget(target);
            }
            if (setProxyContext) {
                // 存储旧的 proxy.
                AopContext.setCurrentProxy(oldProxy);
            }
        }
    }
}
```

### 3.2 CglibAopProxy 的 intercept() 拦截

CglibAopProxy 的 intercept() 回调方法实现和 JdkDynamicAopProxy 的 invoke() 非常相似，只是在 CglibAopProxy 中构造 CglibMethodInvocation 对象来完成拦截器链的调用，而在 JdkDynamicAopProxy 中则是通过构造 ReflectiveMethodInvocation 对象来完成的。

```java
final class CglibAopProxy implements AopProxy, Serializable {

    public Object intercept(Object proxy, Method method, Object[] args, MethodProxy methodProxy) throws Throwable {
        Object oldProxy = null;
        boolean setProxyContext = false;
        Class<?> targetClass = null;
        Object target = null;
        try {
            if (this.advised.exposeProxy) {
                oldProxy = AopContext.setCurrentProxy(proxy);
                setProxyContext = true;
            }
            target = getTarget();
            if (target != null) {
                targetClass = target.getClass();
            }
            // 从 adviced 对象中获取配置好的拦截器链，advised 是一个 AdvisedSupport对象，
            // 而 AdvisedSupport 也是 ProxyFactoryBean 的父类之一。
            List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);
            Object retVal;
            // 如果没有配置 AOP 通知，那么直接使用 CGLIB 的 MethodProxy 对象完成对目标方法的调用
            if (chain.isEmpty() && Modifier.isPublic(method.getModifiers())) {
                retVal = methodProxy.invoke(target, args);
            }
            else {
                // 通过 CglibMethodInvocation 来启动 advice 通知，
                // CglibMethodInvocation 是 ReflectiveMethodInvocation 的子类
                // 最终还是调用的 ReflectiveMethodInvocation 对象的 proceed()方法
                retVal = new CglibMethodInvocation(proxy, target, method, args, targetClass, chain, methodProxy).proceed();
            }
            retVal = processReturnType(proxy, target, method, retVal);
            return retVal;
        }
        finally {
            if (target != null) {
                releaseTarget(target);
            }
            if (setProxyContext) {
                // Restore old proxy.
                AopContext.setCurrentProxy(oldProxy);
            }
        }
    }
}
```

### 3.3 目标对象中目标方法的调用

对目标对象中目标方法的调用，是在 AopUtils 工具类中利用反射机制完成的，具体代码如下。

```java
public abstract class AopUtils {

    /**
     * 使用 spring 的反射机制，调用目标方法 method 的 invoke 方法
     */
    public static Object invokeJoinpointUsingReflection(Object target, Method method, Object[] args)
            throws Throwable {

        try {
            // 如果该 method 是 private的，则将其访问权限设为 public的
            ReflectionUtils.makeAccessible(method);
            // 最后利用反射完成调用
            return method.invoke(target, args);
        }
        catch (InvocationTargetException ex) {
            throw ex.getTargetException();
        }
        catch (IllegalArgumentException ex) {
            throw new AopInvocationException("AOP configuration seems to be invalid: tried calling method [" +
                    method + "] on target [" + target + "]", ex);
        }
        catch (IllegalAccessException ex) {
            throw new AopInvocationException("Could not access method [" + method + "]", ex);
        }
    }
}
```

### 3.4 AOP 拦截器链的调用

JdkDynamicAopProxy 和 CglibAopProxy 虽然使用了不同的代理对象，但对 AOP 拦截的处理却是相同的，都是通过 ReflectiveMethodInvocation 的 proceed() 方法实现的。

```java
public class ReflectiveMethodInvocation implements ProxyMethodInvocation, Cloneable {

    protected final Object proxy;

    protected final Object target;

    protected final Method method;

    protected Object[] arguments;

    private final Class targetClass;

    /** MethodInterceptor和InterceptorAndDynamicMethodMatcher的集合 */
    protected final List interceptorsAndDynamicMethodMatchers;

    private int currentInterceptorIndex = -1;

    protected ReflectiveMethodInvocation(Object proxy, Object target, Method method,
            Object[] arguments, Class targetClass,
            List<Object> interceptorsAndDynamicMethodMatchers) {

        this.proxy = proxy;
        this.target = target;
        this.targetClass = targetClass;
        this.method = BridgeMethodResolver.findBridgedMethod(method);
        this.arguments = arguments;
        this.interceptorsAndDynamicMethodMatchers = interceptorsAndDynamicMethodMatchers;
    }

    public Object proceed() throws Throwable {
        // 从拦截器链中按顺序依次调用拦截器，直到所有的拦截器调用完毕，开始调用目标方法，对目标方法的调用
        // 是在 invokeJoinpoint() 中通过 AopUtils 的 invokeJoinpointUsingReflection() 方法完成的
        if (this.currentInterceptorIndex == this.interceptorsAndDynamicMethodMatchers.size() - 1) {
            // invokeJoinpoint() 直接通过 AopUtils 进行目标方法的调用
            return invokeJoinpoint();
        }

        // 这里沿着定义好的 interceptorsAndDynamicMethodMatchers拦截器链 进行处理，
        // 它是一个 List，也没有定义泛型，interceptorOrInterceptionAdvice 是其中的一个元素
        Object interceptorOrInterceptionAdvice =
                this.interceptorsAndDynamicMethodMatchers.get(++this.currentInterceptorIndex);
        if (interceptorOrInterceptionAdvice instanceof InterceptorAndDynamicMethodMatcher) {
            // 这里通过拦截器的 方法匹配器methodMatcher 进行方法匹配，
            // 如果 目标类 的 目标方法 和配置的 Pointcut 匹配，那么这个 增强行为advice 将会被执行，
            // Pointcut 定义了切面方法（要进行增强的方法），advice 定义了增强的行为
            InterceptorAndDynamicMethodMatcher dm = (InterceptorAndDynamicMethodMatcher) interceptorOrInterceptionAdvice;
            // 目标类的目标方法是否为 Pointcut 所定义的切面
            if (dm.methodMatcher.matches(this.method, this.targetClass, this.arguments)) {
                // 执行当前这个 拦截器interceptor 的 增强方法
                return dm.interceptor.invoke(this);
            }
            else {
                // 如果不匹配，那么 process()方法 会被递归调用，直到所有的拦截器都被运行过为止
                return proceed();
            }
        }
        else {
            // 如果 interceptorOrInterceptionAdvice 是一个 MethodInterceptor
            // 则直接调用其对应的方法
            return ((MethodInterceptor) interceptorOrInterceptionAdvice).invoke(this);
        }
    }
}
```

### 3.5 配置通知器

AdvisedSupport 中实现了获取拦截器链的方法，并使用了缓存。

```java
public class AdvisedSupport extends ProxyConfig implements Advised {

    /** TargetSource持有一个比较重要的属性，targetClass */
    TargetSource targetSource = EMPTY_TARGET_SOURCE;

    /** 缓存 Method对象 和其对应的 拦截器链列表List<Advisor> */
    private transient Map<MethodCacheKey, List<Object>> methodCache;

    /** The AdvisorChainFactory to use */
    AdvisorChainFactory advisorChainFactory = new DefaultAdvisorChainFactory();

    /**
     * 获取拦截器链，为提高效率，同时设置了缓存
     */
    public List<Object> getInterceptorsAndDynamicInterceptionAdvice(Method method, Class targetClass) {
        // 如果 缓存methodCache 中有就从缓存中获取 该Method对象 对应的拦截器链
        // 没有，则调用 (DefaultAdvisorChainFactory)advisorChainFactory 的
        // getInterceptorsAndDynamicInterceptionAdvice() 方法进行获取，并缓存到 methodCache 中
        MethodCacheKey cacheKey = new MethodCacheKey(method);
        List<Object> cached = this.methodCache.get(cacheKey);
        if (cached == null) {
            // 缓存中没有，则从 AdvisorChainFactory 中获取，然后放进缓存
            cached = this.advisorChainFactory.getInterceptorsAndDynamicInterceptionAdvice(
                    this, method, targetClass);
            this.methodCache.put(cacheKey, cached);
        }
        return cached;
    }
}
```

获取拦截器链的工作是由 AdvisorChainFactory 完成的，他是一个拦截器链的生成工厂。由于 AdvisorChainFactory 接口只有一个实现类 DefaultAdvisorChainFactory，所以我们直接看这个类中的实现就行咯。

```java
public class DefaultAdvisorChainFactory implements AdvisorChainFactory, Serializable {

    public List<Object> getInterceptorsAndDynamicInterceptionAdvice(
            Advised config, Method method, Class targetClass) {

        // Advisor链 已经在传进来的 config 中持有了，这里可以直接使用。
        // Advisor 中持有 切面Pointcut 和 增强行为Advice 两个重要属性
        List<Object> interceptorList = new ArrayList<Object>(config.getAdvisors().length);
        // 判断 config 中的 Advisors 是否符合配置要求
        boolean hasIntroductions = hasMatchingIntroductions(config, targetClass);

        // 获取注册器，这是一个单例模式的实现
        AdvisorAdapterRegistry registry = GlobalAdvisorAdapterRegistry.getInstance();
        for (Advisor advisor : config.getAdvisors()) {
            // advisor 如果是 PointcutAdvisor 的实例
            if (advisor instanceof PointcutAdvisor) {
                PointcutAdvisor pointcutAdvisor = (PointcutAdvisor) advisor;
                if (config.isPreFiltered() || pointcutAdvisor.getPointcut().getClassFilter().matches(targetClass)) {
                    // 拦截器链是通过 AdvisorAdapterRegistry 的实例对象 registry 来加入的，
                    // AdvisorAdapterRegistry 对 advisor 的织入起到了很大的作用
                    MethodInterceptor[] interceptors = registry.getInterceptors(advisor);
                    // 从 pointcutAdvisor 中获取切面的方法匹配器
                    MethodMatcher mm = pointcutAdvisor.getPointcut().getMethodMatcher();
                    // 使用 MethodMatchers 的 matches()方法 对目标类的目标方法进行匹配判断
                    if (MethodMatchers.matches(mm, method, targetClass, hasIntroductions)) {
                        if (mm.isRuntime()) {
                            for (MethodInterceptor interceptor : interceptors) {
                                interceptorList.add(new InterceptorAndDynamicMethodMatcher(interceptor, mm));
                            }
                        }
                        else {
                            interceptorList.addAll(Arrays.asList(interceptors));
                        }
                    }
                }
            }
            // advisor 如果是 IntroductionAdvisor 的实例
            else if (advisor instanceof IntroductionAdvisor) {
                IntroductionAdvisor ia = (IntroductionAdvisor) advisor;
                if (config.isPreFiltered() || ia.getClassFilter().matches(targetClass)) {
                    Interceptor[] interceptors = registry.getInterceptors(advisor);
                    interceptorList.addAll(Arrays.asList(interceptors));
                }
            }
            else {
                Interceptor[] interceptors = registry.getInterceptors(advisor);
                interceptorList.addAll(Arrays.asList(interceptors));
            }
        }
        return interceptorList;
    }

    /**
     * 判断 config 中的 Advisors 是否符合配置要求
     */
    private static boolean hasMatchingIntroductions(Advised config, Class targetClass) {
        for (int i = 0; i < config.getAdvisors().length; i++) {
            Advisor advisor = config.getAdvisors()[i];
            if (advisor instanceof IntroductionAdvisor) {
                IntroductionAdvisor ia = (IntroductionAdvisor) advisor;
                if (ia.getClassFilter().matches(targetClass)) {
                    return true;
                }
            }
        }
        return false;
    }
}
```

这里的 advisor 通知器是从 AdvisedSupport 中获取的，而 advisor 的初始化则是在 ProxyFactoryBean 的 getObject() 方法中完成的。

```java
public class ProxyFactoryBean extends ProxyCreatorSupport
		implements FactoryBean<Object>, BeanClassLoaderAware, BeanFactoryAware {

    /**
     * 返回一个代理对象，当用户从 FactoryBean 中获取 bean 时调用，
     * 创建此工厂要返回的 AOP 代理的实例，该实例将作为一个单例被缓存
     */
    public Object getObject() throws BeansException {
        // 初始化通知器链
        initializeAdvisorChain();
        // 这里对 Singleton 和 Prototype 的类型进行区分，生成对应的 proxy
        if (isSingleton()) {
            return getSingletonInstance();
        }
        else {
            if (this.targetName == null) {
                logger.warn("Using non-singleton proxies with singleton targets is often undesirable. " +
                        "Enable prototype proxies by setting the 'targetName' property.");
            }
            return newPrototypeInstance();
        }
    }

    /**
     * 初始化 Advisor链，可以发现，其中有通过对 IoC容器 的 getBean() 方法的调用来获取配置好的 advisor 通知器
     */
    private synchronized void initializeAdvisorChain() throws AopConfigException, BeansException {
        // 如果通知器链已经完成初始化，则直接返回
        if (this.advisorChainInitialized) {
            return;
        }

        if (!ObjectUtils.isEmpty(this.interceptorNames)) {
            if (this.beanFactory == null) {
                throw new IllegalStateException("No BeanFactory available anymore (probably due to serialization) " +
                        "- cannot resolve interceptor names " + Arrays.asList(this.interceptorNames));
            }

            if (this.interceptorNames[this.interceptorNames.length - 1].endsWith(GLOBAL_SUFFIX) &&
                    this.targetName == null && this.targetSource == EMPTY_TARGET_SOURCE) {
                throw new AopConfigException("Target required after globals");
            }

            // 这里添加了 Advisor链 的调用，下面的 interceptorNames 是在配置文件中
            // 通过 interceptorNames 进行配置的。由于每一个 Advisor 都是被配置为 bean 的，
            // 所以通过遍历 interceptorNames 得到的 name，其实就是 bean（Advisor） 的 id，通过这个 name（id）
            // 我们就可以从 IoC 容器中获取对应的实例化 bean（Advisor）
            for (String name : this.interceptorNames) {
                if (logger.isTraceEnabled()) {
                    logger.trace("Configuring advisor or advice '" + name + "'");
                }

                if (name.endsWith(GLOBAL_SUFFIX)) {
                    if (!(this.beanFactory instanceof ListableBeanFactory)) {
                        throw new AopConfigException(
                                "Can only use global advisors or interceptors with a ListableBeanFactory");
                    }
                    addGlobalAdvisor((ListableBeanFactory) this.beanFactory,
                            name.substring(0, name.length() - GLOBAL_SUFFIX.length()));
                }

                else {
                    // 对当前的 factoryBean 进行类型判断，是属于 单例bean，还是 原型bean
                    Object advice;
                    if (this.singleton || this.beanFactory.isSingleton(name)) {
                        // advisor 在文件中配置为 bean，所以这里通过 beanFactory 的 getBean()方法
                        // 获取 advisor，这个 name 是从 interceptorNames 中获取的
                        advice = this.beanFactory.getBean(name);
                    }
                    else {
                        // 如果是 原型bean
                        advice = new PrototypePlaceholderAdvisor(name);
                    }
                    // 把从 IoC容器 中获取的 advice 放进 advisors 拦截器链，这个拦截器链是由 ProxyFactoryBean
                    // 的父类 AdvisedSupport 持有的
                    addAdvisorOnChainCreation(advice, name);
                }
            }
        }
        this.advisorChainInitialized = true;
    }
}
```

注意，Advisor 本身就被配置为 bean，所以它的获取也是通过 IoC 容器 获得的。

### 3.6 Advice 通知的实现

从 DefaultAdvisorChainFactory 类中的 getInterceptorsAndDynamicInterceptionAdvice() 方法我们可以看到，其通过 AdvisorAdapterRegistry 实例对象的 getInterceptors() 方法，利用配置的 advisor 完成了对拦截器的适配和注册。

```java
public class DefaultAdvisorChainFactory implements AdvisorChainFactory, Serializable {

    public List<Object> getInterceptorsAndDynamicInterceptionAdvice(
            Advised config, Method method, Class targetClass) {

        // Advisor链 已经在传进来的 config 中持有了，这里可以直接使用
        // Advisor 中持有 切面Pointcut 和 增强行为Advice 的引用
        List<Object> interceptorList = new ArrayList<Object>(config.getAdvisors().length);
        // 判断 config 中的 Advisors 是否符合配置要求
        boolean hasIntroductions = hasMatchingIntroductions(config, targetClass);

        // 获取注册器，这是一个单例模式的实现
        AdvisorAdapterRegistry registry = GlobalAdvisorAdapterRegistry.getInstance();
        for (Advisor advisor : config.getAdvisors()) {
            // advisor 如果是 PointcutAdvisor 的实例
            if (advisor instanceof PointcutAdvisor) {
                PointcutAdvisor pointcutAdvisor = (PointcutAdvisor) advisor;
                if (config.isPreFiltered() || pointcutAdvisor.getPointcut().getClassFilter().matches(targetClass)) {
                    // 拦截器链是通过 AdvisorAdapterRegistry 的实例对象 registry 来加入的，
                    // AdvisorAdapterRegistry 对 advisor 的织入起到了很大的作用
                    MethodInterceptor[] interceptors = registry.getInterceptors(advisor);
                    // 从 pointcutAdvisor 中获取切面的方法匹配器
                    MethodMatcher mm = pointcutAdvisor.getPointcut().getMethodMatcher();
                    // 使用 MethodMatchers 的 matches()方法 对目标类的目标方法进行匹配判断
                    if (MethodMatchers.matches(mm, method, targetClass, hasIntroductions)) {
                        if (mm.isRuntime()) {
                            for (MethodInterceptor interceptor : interceptors) {
                                interceptorList.add(new InterceptorAndDynamicMethodMatcher(interceptor, mm));
                            }
                        }
                        else {
                            interceptorList.addAll(Arrays.asList(interceptors));
                        }
                    }
                }
            }
            // advisor 如果是 IntroductionAdvisor 的实例
            else if (advisor instanceof IntroductionAdvisor) {
                IntroductionAdvisor ia = (IntroductionAdvisor) advisor;
                if (config.isPreFiltered() || ia.getClassFilter().matches(targetClass)) {
                    Interceptor[] interceptors = registry.getInterceptors(advisor);
                    interceptorList.addAll(Arrays.asList(interceptors));
                }
            }
            else {
                Interceptor[] interceptors = registry.getInterceptors(advisor);
                interceptorList.addAll(Arrays.asList(interceptors));
            }
        }
        return interceptorList;
    }
}
```

DefaultAdvisorAdapterRegistry 的 getInterceptors()方法 封装了 advice 织入实现的入口。

```java
public class DefaultAdvisorAdapterRegistry implements AdvisorAdapterRegistry, Serializable {

    // 持有 AdvisorAdapter 的 list，这个 list 中的 AdvisorAdapter 与
    // 实现 Spring AOP 的 advice 增强功能相对应
    private final List<AdvisorAdapter> adapters = new ArrayList<AdvisorAdapter>(3);

    /**
     * 将已实现的 AdviceAdapter 加入 list
     */
    public DefaultAdvisorAdapterRegistry() {
        registerAdvisorAdapter(new MethodBeforeAdviceAdapter());
        registerAdvisorAdapter(new AfterReturningAdviceAdapter());
        registerAdvisorAdapter(new ThrowsAdviceAdapter());
    }

    /**
     * 如果 adviceObject 是 Advisor 的实例，则将 adviceObject 转换成 Advisor 类型并返回
     */
    public Advisor wrap(Object adviceObject) throws UnknownAdviceTypeException {
        if (adviceObject instanceof Advisor) {
            return (Advisor) adviceObject;
        }
        if (!(adviceObject instanceof Advice)) {
            throw new UnknownAdviceTypeException(adviceObject);
        }
        Advice advice = (Advice) adviceObject;
        if (advice instanceof MethodInterceptor) {
            return new DefaultPointcutAdvisor(advice);
        }
        for (AdvisorAdapter adapter : this.adapters) {
            if (adapter.supportsAdvice(advice)) {
                return new DefaultPointcutAdvisor(advice);
            }
        }
        throw new UnknownAdviceTypeException(advice);
    }

    public MethodInterceptor[] getInterceptors(Advisor advisor) throws UnknownAdviceTypeException {
        List<MethodInterceptor> interceptors = new ArrayList<MethodInterceptor>(3);

        // 从 Advisor 通知器中获取配置的 Advice
        Advice advice = advisor.getAdvice();

        // 如果 advice 是 MethodInterceptor 类型的，直接加进 interceptors，不用适配
        if (advice instanceof MethodInterceptor) {
            interceptors.add((MethodInterceptor) advice);
        }

        // 对通知进行适配，使用已经配置好的三种 AdvisorAdapter，然后从对应的
        // adapter 中取出封装好的 AOP 编织功能的拦截器
        for (AdvisorAdapter adapter : this.adapters) {
            // adapter.supportsAdvice(advice) 方法中对 advice 的类型进行校验
            if (adapter.supportsAdvice(advice)) {
                interceptors.add(adapter.getInterceptor(advisor));
            }
        }
        if (interceptors.isEmpty()) {
            throw new UnknownAdviceTypeException(advisor.getAdvice());
        }
        return interceptors.toArray(new MethodInterceptor[interceptors.size()]);
    }
}
```

从 DefaultAdvisorAdapterRegistry 的实现中可以看到，其使用了一系列的 AdviceAdapter 适配器，如：MethodBeforeAdviceAdapter、AfterReturningAdviceAdapter、ThrowsAdviceAdapter，它们完全和 Advice 的类型一一对应，它们都是实现了 AdviceAdapter 接口的同一层次类，各自承担着不同的适配任务，一对一地服务于不同的 Advice 实现。下面我们以 MethodBeforeAdviceAdapter 为例，看一下其源码实现。

```java
class MethodBeforeAdviceAdapter implements AdvisorAdapter, Serializable {

    public boolean supportsAdvice(Advice advice) {
        return (advice instanceof MethodBeforeAdvice);
    }

    public MethodInterceptor getInterceptor(Advisor advisor) {
        MethodBeforeAdvice advice = (MethodBeforeAdvice) advisor.getAdvice();
        return new MethodBeforeAdviceInterceptor(advice);
    }
}
```

可以看到，其中的 getInterceptor()方法 把 Advice 从 Advisor 中取出来，然后创建了一个 MethodBeforeAdviceInterceptor 对象，并返回，这个对象中持有对 Advice 的引用。下面我们看一下 MethodBeforeAdviceInterceptor 拦截器的源码实现。

```java
public class MethodBeforeAdviceInterceptor implements MethodInterceptor, Serializable {

    private MethodBeforeAdvice advice;

    /**
     * 为指定的 advice 创建对应的 MethodBeforeAdviceInterceptor 对象
     */
    public MethodBeforeAdviceInterceptor(MethodBeforeAdvice advice) {
        Assert.notNull(advice, "Advice must not be null");
        this.advice = advice;
    }

    /**
     * 这个 invoke()方法 是拦截器的回调方法，会在代理对象的方法被调用时触发回调
     */
    public Object invoke(MethodInvocation mi) throws Throwable {
        // 首先触发了 advice对象 的 before()方法 的回调
        // 然后才是 MethodInvocation 的 process()方法 回调
        this.advice.before(mi.getMethod(), mi.getArguments(), mi.getThis() );
        return mi.proceed();
    }
}
```

可以看到，MethodBeforeAdviceInterceptor 的 invoke()方法 先是触发了 advice 的 before()方法，然后才是 MethodInvocation 的 proceed()方法调用。

回顾一下之前的代码，在 AopProxy 代理对象 触发的 ReflectiveMethodInvocation 的 proceed() 中，在取得 拦截器 interceptor 后调用了其 invoke()方法。按照 AOP 的配置规则，ReflectiveMethodInvocation 触发的拦截器 invoke()回调，最终会根据 Advice 类型的不同，触发 Spring 对不同的 Advice 的拦截器封装，比如 MethodBeforeAdvice 最终会触发 MethodBeforeAdviceInterceptor 的 invoke()回调，其它两个以此类推，这里就不逐一分析咯。

另外，可以结合我 GitHub 上对 Spring 框架源码 的阅读及个人理解一起看，会更有助于各位开发大佬理解，如果本内容对你们有帮助的，还望各位同学 watch，star，fork，素质三连一波，地址：  
https://github.com/AmyliaY/spring-aop-reading
