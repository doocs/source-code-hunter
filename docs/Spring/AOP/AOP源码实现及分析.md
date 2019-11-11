理论性的文字，我觉得就没必要再扯一遍咯，大道理讲这么多，越听越迷糊。不如直接看源码+注解来的明白痛快。所以话不多说，直接上源码。

## 1、主要的接口
#### 1.1、Advice通知
定义了切面的增强方式，如：前置增强BeforeAdvice，后置增强AfterAdvice，异常增强ThrowsAdvice等。下面看两个主要的子接口的源码。
```java
public interface MethodBeforeAdvice extends BeforeAdvice {

	/**
	 * 目标方法method要开始执行时，AOP会回调此方法
	 */
	void before(Method method, Object[] args, Object target) throws Throwable;

}

public interface AfterReturningAdvice extends AfterAdvice {

	/**
	 * 目标方法method执行后，AOP会回调此方法，注意，它还传入了method的返回值
	 */
	void afterReturning(Object returnValue, Method method, Object[] args, Object target) throws Throwable;

}
```
#### 1.2、Pointcut方法的横切面
用来定义需要增强的目标方法的集合，一般使用正则表达式去匹配筛选指定范围内的所有满足条件的目标方法。Pointcut接口有很多实现，我们主要看一下JdkRegexpMethodPointcut和NameMatchMethodPointcut的实现原理，前者主要通过正则表达式对方法名进行匹配，后者则通过匹配方法名进行匹配。
```java
	//JdkRegexpMethodPointcut的实现源码
	private Pattern[] compiledPatterns = new Pattern[0];

	protected boolean matches(String pattern, int patternIndex) {
		Matcher matcher = this.compiledPatterns[patternIndex].matcher(pattern);
		return matcher.matches();
	}

	//NameMatchMethodPointcut的实现源码
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
#### 1.3、Advisor通知器
将Pointcut和Advice有效地结合在一起。它定义了在哪些方法（Pointcut）上执行哪些动作（Advice）。下面看一下DefaultPointcutAdvisor的源码实现，它通过持有Pointcut和Advice属性来将两者有效地结合在一起。
```java
public class DefaultPointcutAdvisor extends AbstractGenericPointcutAdvisor implements Serializable {

	private Pointcut pointcut = Pointcut.TRUE;

	public DefaultPointcutAdvisor() {
	}

	public DefaultPointcutAdvisor(Advice advice) {
		this(Pointcut.TRUE, advice);
	}

	/**
	 * 自己定义了Pointcut，Advice则使用父类中的定义
	 */
	public DefaultPointcutAdvisor(Pointcut pointcut, Advice advice) {
		this.pointcut = pointcut;
		setAdvice(advice);
	}
}

public abstract class AbstractGenericPointcutAdvisor extends AbstractPointcutAdvisor {

	//本类是一个抽象类，其持有Advice的引用，而对Pointcut的引用，则在具体的子类中持有
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
## 2、spring AOP的设计与实现
AOP的实现代码中，主要使用了JDK动态代理，在特定场景下（被代理对象无implements的接口）也用到了CGLIB生成代理对象。通过AOP的源码设计可以看到，其先为目标对象建立了代理对象，这个代理对象的生成可以使用JDK动态代理或CGLIB完成。然后启动为代理对象配置的拦截器，对横切面（目标方法集合）进行相应的增强，将AOP的横切面设计和Proxy模式有机地结合起来，实现了在AOP中定义好的各种织入方式。
#### 2.1、ProxyFactoryBean
这里我们主要以ProxyFactoryBean的实现为例，对AOP的实现原理进行分析。ProxyFactoryBean主要持有目标对象target的代理对象aopProxy，和Advisor通知器，而Advisor持有Advice和Pointcut，这样就可以判断aopProxy中的方法 是否是某个指定的切面Pointcut，然后根据其配置的织入方向（前置增强/后置增强），通过反射为其织入相应的增强行为Advice。
	先看一下ProxyFactoryBean的配置和使用。
```xml
<!-- 定义自己的Advisor实现，其中包含了Pointcut和Advice -->
<bean id="myAdvisor" class="com.shuitu.MyAdvisor"/>

<bean id="myAOP" class="org.springframework.aop.framework.ProxyFactoryBean">
	<!-- 代理类实现的接口 -->
	<property name="proxyInterface"><value>com.shuitu.ProxyInterface</value></property>
	<!-- 被代理的对象 -->
	<property name="target">
		<bean class="com.shuitu.MyTarget"/>
	</property>
	<!-- 配置相应的Advisor -->
	<property name="interceptorNames">
		<list><value>myAdvisor</value></list>
	</property>
</bean>
```
#### 2.2、ProxyFactoryBean为配置的target生成AopProxy代理对象
ProxyFactoryBean的getObject()方法先对通知器链进行了初始化，然后根据被代理对象类型的不同，生成代理对象。
```java
	/**
	 * 返回一个代理对象，当用户从FactoryBean中获取bean时调用，
	 * 创建此工厂要返回的AOP代理的实例，该实例将作为一个单例被缓存
	 */
	public Object getObject() throws BeansException {
		//初始化通知器链
		initializeAdvisorChain();
		//这里对Singleton和prototype的类型进行区分，生成对应的proxy
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
#### 2.3、initializeAdvisorChain()初始化Advisor链
```java
	/**
	 * 初始化Advisor链，可以发现，其中有通过对IoC容器的getBean()方法的调用来获取配置好的advisor通知器
	 */
	private synchronized void initializeAdvisorChain() throws AopConfigException, BeansException {
		//如果通知器链已经完成初始化，则直接返回
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

			//这里添加了Advisor链的调用，下面的interceptorNames是在配置文件中
			//通过interceptorNames进行配置的。由于每一个Advisor都是被配置为bean的，
			//所以通过遍历interceptorNames得到的name，其实就是bean的id，通过这个name（id）
			//我们就可以从IoC容器中获取对应的实例化bean
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
					//对当前的factoryBean进行类型判断，是属于单例bean还是原型bean
					Object advice;
					if (this.singleton || this.beanFactory.isSingleton(name)) {
						//通过beanFactory的getBean()方法获取advisor，
						//这个name是从interceptorNames中获取的
						advice = this.beanFactory.getBean(name);
					}
					else {
						//如果是原型bean
						advice = new PrototypePlaceholderAdvisor(name);
					}
					addAdvisorOnChainCreation(advice, name);
				}
			}
		}

		this.advisorChainInitialized = true;
	}
```
生成singleton的代理对象在getSingletonInstance方法中完成，这是ProxyFactoryBean生成AopProxy代理对象的调用入口。代理对象会封装对target对象的调用，针对target对象的方法调用会被这里生成的代理对象所拦截。
#### 2.4、getSingletonInstance()生成单例代理对象
```java
	/**
	 * 返回此类代理对象的单例实例，如果尚未创建该实例，则使用单例模式的懒汉式 创建它
	 */
	private synchronized Object getSingletonInstance() {
		if (this.singletonInstance == null) {
			this.targetSource = freshTargetSource();
			if (this.autodetectInterfaces && getProxiedInterfaces().length == 0 && !isProxyTargetClass()) {
				//根据AOP框架来判断需要代理的接口
				Class targetClass = getTargetClass();
				if (targetClass == null) {
					throw new FactoryBeanNotInitializedException("Cannot determine target class for proxy");
				}
				//设置代理对象的接口
				setInterfaces(ClassUtils.getAllInterfacesForClass(targetClass, this.proxyClassLoader));
			}
			super.setFrozen(this.freezeProxy);
			//这里会通过AopProxy来得到代理对象
			this.singletonInstance = getProxy(createAopProxy());
		}
		return this.singletonInstance;
	}
	
	/**
	 * 通过createAopProxy()方法返回的aopProxy获取代理对象
	 */
	protected Object getProxy(AopProxy aopProxy) {
		return aopProxy.getProxy(this.proxyClassLoader);
	}
```
上面的createAopProxy()方法，调用了ProxyFactoryBean的父类ProxyCreatorSupport中的实现。
```java
public class ProxyCreatorSupport extends AdvisedSupport {

	private AopProxyFactory aopProxyFactory;
	
	public ProxyCreatorSupport() {
		//注意这里实例化的是一个DefaultAopProxyFactory，所以下面的createAopProxy()方法
		//中调用的也是DefaultAopProxyFactory的实现
		this.aopProxyFactory = new DefaultAopProxyFactory();
	}

	protected final synchronized AopProxy createAopProxy() {
		if (!this.active) {
			activate();
		}
		//调用的是DefaultAopProxyFactory的实现
		return getAopProxyFactory().createAopProxy(this);
	}
	
	public AopProxyFactory getAopProxyFactory() {
		return this.aopProxyFactory;
	}
	
	public AopProxyFactory getAopProxyFactory() {
		return this.aopProxyFactory;
	}

}
```
下面看一下AopProxyFactory接口的实现类DefaultAopProxyFactory的代码。
```java
	public AopProxy createAopProxy(AdvisedSupport config) throws AopConfigException {
		//AopProxy代理对象的生成过程：
		//首先从AdvisedSupport对象中获取配置的target目标对象的类型targetClass，
		//然后根据targetClass是否为接口采取不同的生成代理对象的策略
		if (config.isOptimize() || config.isProxyTargetClass() || hasNoUserSuppliedProxyInterfaces(config)) {
			Class targetClass = config.getTargetClass();
			if (targetClass == null) {
				throw new AopConfigException("TargetSource cannot determine target class: " +
						"Either an interface or a target is required for proxy creation.");
			}
			
			/**
			 * ！！！！！！！！！！！！！！！！！！！！！！！！！！
			 * 如果目标类是接口，则使用JDK动态代理，否则使用CGLIB
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
可以看到其根据目标对象是否实现了接口，而决定是使用JDK动态代理还是CGLIB去生成代理对象，而AopProxy接口的实现类也只有JdkDynamicAopProxy和CglibAopProxy这两个。
#### 2.5、JDK生成AopProxy代理对象
```java
final class JdkDynamicAopProxy implements AopProxy, InvocationHandler, Serializable {

	public JdkDynamicAopProxy(AdvisedSupport config) throws AopConfigException {
		Assert.notNull(config, "AdvisedSupport must not be null");
		if (config.getAdvisors().length == 0 && config.getTargetSource() == AdvisedSupport.EMPTY_TARGET_SOURCE) {
			throw new AopConfigException("No advisors and no TargetSource specified");
		}
		//这个advised是一个AdvisedSupport对象，可以通过它获取被代理对象target
		//这样，当invoke()方法被代理对象aopProxy调用时，就可以调用target的目标方法了
		this.advised = config;
	}

	public Object getProxy() {
		return getProxy(ClassUtils.getDefaultClassLoader());
	}

	public Object getProxy(ClassLoader classLoader) {
		if (logger.isDebugEnabled()) {
			logger.debug("Creating JDK dynamic proxy: target source is " + this.advised.getTargetSource());
		}
		
		//获取代理类要实现的接口
		Class[] proxiedInterfaces = AopProxyUtils.completeProxiedInterfaces(this.advised);
		findDefinedEqualsAndHashCodeMethods(proxiedInterfaces);
		
		//通过Proxy生成代理对象并返回
		return Proxy.newProxyInstance(classLoader, proxiedInterfaces, this);
	}
}
```
通过JdkDynamicAopProxy的源码可以非常清楚地看到，其使用了JDK动态代理的方式生成了代理对象。JdkDynamicAopProxy实现了InvocationHandler接口，并通过Proxy.newProxyInstance()方法生成代理对象并返回。
#### 2.6、CGLIB生成AopProxy代理对象（CglibAopProxy）
```java
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

			//创建并配置Enhancer对象，Enhancer是CGLIB中主要的操作类
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

			//通过enhancer生成代理对象
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
为目标对象target生成代理对象之后，在调用代理对象的目标方法时，目标方法会进行invoke()回调或callbacks()回调，然后就可以在回调方法中对目标对象的目标方法进行拦截和增强处理了。

## 3、spring AOP拦截器调用的实现
在spring AOP通过JDK的Proxy类生成代理对象时，相关的拦截器已经配置到了代理对象持有的InvocationHandler(即，ProxyBeanFactory)的invoke()方法中，拦截器最后起作用，是通过调用代理对象的目标方法时，在代理类中触发了InvocationHandler的invoke()回调。通过CGLIB实现的AOP，原理与此相似。
#### 3.1、JdkDynamicAopProxy的invoke()拦截
前面已经通过两种不同的方式生成了AopProxy代理对象，下面我们先看一下JdkDynamicAopProxy中的invoke()回调方法中对拦截器调用的实现。
```java
	public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
		MethodInvocation invocation;
		Object oldProxy = null;
		boolean setProxyContext = false;

		//通过targetSource可以获取被代理对象
		TargetSource targetSource = this.advised.targetSource;
		Class targetClass = null;
		Object target = null;

		try {
			//如果目标对象调用的是Obejct类中的基本方法，如：equals、hashCode则进行相应的处理
			if (!this.equalsDefined && AopUtils.isEqualsMethod(method)) {
				//如果目标对象没有重写Object类的基本方法：equals(Object other)
				return equals(args[0]);
			}
			if (!this.hashCodeDefined && AopUtils.isHashCodeMethod(method)) {
				//如果目标对象没有重写Object类的基本方法：hashCode()
				return hashCode();
			}
			if (!this.advised.opaque && method.getDeclaringClass().isInterface() &&
					method.getDeclaringClass().isAssignableFrom(Advised.class)) {
				//使用代理配置对ProxyConfig进行服务调用
				return AopUtils.invokeJoinpointUsingReflection(this.advised, method, args);
			}

			Object retVal;

			if (this.advised.exposeProxy) {
				//如果有必要，可以援引
				oldProxy = AopContext.setCurrentProxy(proxy);
				setProxyContext = true;
			}

			//获取目标对象，为目标方法的调用做准备
			target = targetSource.getTarget();
			if (target != null) {
				targetClass = target.getClass();
			}

			//获取定义好的拦截器链
			List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);

			//如果没有配置拦截器，就直接调用目标对象target的method方法，并获取返回值
			if (chain.isEmpty()) {
				retVal = AopUtils.invokeJoinpointUsingReflection(target, method, args);
			}
			else {
				//如果有拦截器链，则需要先调用拦截器链中的拦截器，再调用目标的对应方法
				//这里通过构造ReflectiveMethodInvocation来实现
				invocation = new ReflectiveMethodInvocation(proxy, target, method, args, targetClass, chain);
				//沿着拦截器链继续向下处理
				retVal = invocation.proceed();
			}

			//获取method返回值的类型
			Class<?> returnType = method.getReturnType();
			if (retVal != null && retVal == target && returnType.isInstance(proxy) &&
					!RawTargetAccess.class.isAssignableFrom(method.getDeclaringClass())) {
				//特殊提醒：它返回“this”，方法的返回类型与类型兼容。
				//注意，如果target在另一个返回的对象中设置了对自身的引用，spring将无法处理
				retVal = proxy;
			} else if (retVal == null && returnType != Void.TYPE && returnType.isPrimitive()) {
				throw new AopInvocationException("Null return value from advice does not match primitive return type for: " + method);
			}
			return retVal;
		}
		finally {
			if (target != null && !targetSource.isStatic()) {
				//必须来自TargetSource.
				targetSource.releaseTarget(target);
			}
			if (setProxyContext) {
				//存储旧的proxy.
				AopContext.setCurrentProxy(oldProxy);
			}
		}
	}
```
#### 3.2、CglibAopProxy的intercept()拦截
CglibAopProxy的intercept()回调方法实现和JdkDynamicAopProxy的invoke()非常相似，只是在CglibAopProxy中构造CglibMethodInvocation对象来完成拦截器链的调用，而在JdkDynamicAopProxy中则是通过构造ReflectiveMethodInvocation对象来完成的。
```java
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
			//从adviced对象中获取配置好的拦截器链，advised是一个AdvisedSupport对象，
			//而AdvisedSupport也是ProxyFactoryBean的父类之一。
			List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);
			Object retVal;
			//如果没有配置AOP通知，那么直接使用CGLIB的MethodProxy对象完成对目标方法的调用
			if (chain.isEmpty() && Modifier.isPublic(method.getModifiers())) {
				retVal = methodProxy.invoke(target, args);
			}
			else {
				//通过CglibMethodInvocation来启动advice通知，
				//CglibMethodInvocation是ReflectiveMethodInvocation的子类
				//最终还是调用的ReflectiveMethodInvocation对象的proceed()方法
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
```
#### 3.3、目标对象中目标方法的调用
对目标对象中目标方法的调用，是在AopUtils工具类中利用反射机制完成的。具体代码如下：
```java
public abstract class AopUtils {

	/**
	 * 使用spring的反射机制，调用目标方法method的invoke方法
	 */
	public static Object invokeJoinpointUsingReflection(Object target, Method method, Object[] args)
			throws Throwable {

		try {
			//如果method是private等不可访问状态，则设置为public公开可访问
			ReflectionUtils.makeAccessible(method);
			//最后利用反射完成调用
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
#### 3.4、AOP拦截器链的调用
JdkDynamicAopProxy和CglibAopProxy虽然使用了不同的代理对象，但对AOP拦截的处理却是相同的，都是通过ReflectiveMethodInvocation的proceed()方法实现的。
```java
	public Object proceed() throws Throwable {
		//从拦截器链中按顺序依次调用拦截器，直到所有的拦截器调用完毕，开始调用目标方法，
		//对目标方法的调用是在invokeJoinpoint()中通过AopUtils的invokeJoinpointUsingReflection()方法完成的
		if (this.currentInterceptorIndex == this.interceptorsAndDynamicMethodMatchers.size() - 1) {
			//invokeJoinpoint()直接通过AopUtils进行目标方法的调用
			return invokeJoinpoint();
		}

		//这里沿着定义好的interceptorsAndDynamicMethodMatchers拦截器链进行处理，
		//它是一个List，也没有定义泛型，interceptorOrInterceptionAdvice是其中的一个元素，
		Object interceptorOrInterceptionAdvice =
				this.interceptorsAndDynamicMethodMatchers.get(++this.currentInterceptorIndex);
		if (interceptorOrInterceptionAdvice instanceof InterceptorAndDynamicMethodMatcher) {
			//这里通过拦截器的方法匹配器methodMatcher进行方法匹配，
			//如果目标类的目标方法和配置的Pointcut匹配，那么这个增强行为advice将会被执行，
			//Pointcut定义了切面，advice定义了增强的行为
			InterceptorAndDynamicMethodMatcher dm = (InterceptorAndDynamicMethodMatcher) interceptorOrInterceptionAdvice;
			//目标类的目标方法是否为Pointcut所定义的切面
			if (dm.methodMatcher.matches(this.method, this.targetClass, this.arguments)) {
				//执行增强方法
				return dm.interceptor.invoke(this);
			}
			else {
				//如果不匹配，那么process()方法会被递归调用，直到所有的拦截器都被运行过为止
				return proceed();
			}
		}
		else {
			//如果interceptorOrInterceptionAdvice是一个MethodInterceptor
			//则直接调用其对应的方法
			return ((MethodInterceptor) interceptorOrInterceptionAdvice).invoke(this);
		}
	}
```
#### 3.5、配置通知器
AdvisedSupport中实现了获取拦截器链的方法，并使用了缓存。
```java
	/**
	 * 获取拦截器链，为提高效率，同时设置了缓存
	 */
	public List<Object> getInterceptorsAndDynamicInterceptionAdvice(Method method, Class targetClass) {
		//这里使用了缓存cached，如果缓存中有就从缓存中获取拦截器链
		//没有，则调用(DefaultAdvisorChainFactory)advisorChainFactory的
		//getInterceptorsAndDynamicInterceptionAdvice()方法进行获取，并缓存到cached
		MethodCacheKey cacheKey = new MethodCacheKey(method);
		List<Object> cached = this.methodCache.get(cacheKey);
		if (cached == null) {
			//缓存中没有，则从AdvisorChainFactory中获取，然后放进缓存
			cached = this.advisorChainFactory.getInterceptorsAndDynamicInterceptionAdvice(
					this, method, targetClass);
			this.methodCache.put(cacheKey, cached);
		}
		return cached;
	}
```
获取拦截器链的工作是由AdvisorChainFactory完成的，他是一个拦截器链的生成工厂。由于AdvisorChainFactory接口只有一个实现类DefaultAdvisorChainFactory，所以我们直接看这个类中的实现就行咯。
```java
public class DefaultAdvisorChainFactory implements AdvisorChainFactory, Serializable {

	public List<Object> getInterceptorsAndDynamicInterceptionAdvice(
			Advised config, Method method, Class targetClass) {
		
		//advisor链已经在传进来的config中持有了，这里可以直接使用
		//advisor中持有切面 和 增强行为的引用
		List<Object> interceptorList = new ArrayList<Object>(config.getAdvisors().length);
		//判断config中的Advisors是否符合配置要求
		boolean hasIntroductions = hasMatchingIntroductions(config, targetClass);
		
		//获取注册器，这是一个单例模式的实现
		AdvisorAdapterRegistry registry = GlobalAdvisorAdapterRegistry.getInstance();
		for (Advisor advisor : config.getAdvisors()) {
			//advisor如果是PointcutAdvisor的实例
			if (advisor instanceof PointcutAdvisor) {
				PointcutAdvisor pointcutAdvisor = (PointcutAdvisor) advisor;
				if (config.isPreFiltered() || pointcutAdvisor.getPointcut().getClassFilter().matches(targetClass)) {
					//拦截器链是通过AdvisorAdapterRegistry的实例对象registry来加入的，
					//AdvisorAdapterRegistry对advisor的织入起到了很大的作用
					MethodInterceptor[] interceptors = registry.getInterceptors(advisor);
					//从pointcutAdvisor中获取切面的方法匹配器
					MethodMatcher mm = pointcutAdvisor.getPointcut().getMethodMatcher();
					//使用MethodMatchers的matches()方法对目标类的目标方法进行匹配判断
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
			//advisor如果是IntroductionAdvisor的实例
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
	 * 判断config中的Advisors是否符合配置要求
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
这里的advisor通知器是从AdvisedSupport中获取的，而advisor的初始化则是在ProxyFactoryBean的getObject()方法中完成的。
```java
	/**
	 * 返回一个代理对象，当用户从FactoryBean中获取bean时调用，
	 * 创建此工厂要返回的AOP代理的实例，该实例将作为一个单例被缓存
	 */
	public Object getObject() throws BeansException {
		//初始化通知器链
		initializeAdvisorChain();
		//这里对Singleton和prototype的类型进行区分，生成对应的proxy
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
	 * 初始化Advisor链，可以发现，其中有通过对IoC容器的getBean()方法的调用来获取配置好的advisor通知器
	 */
	private synchronized void initializeAdvisorChain() throws AopConfigException, BeansException {
		//如果通知器链已经完成初始化，则直接返回
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

			//这里添加了Advisor链的调用，下面的interceptorNames是在配置文件中
			//通过interceptorNames进行配置的。由于每一个Advisor都是被配置为bean的，
			//所以通过遍历interceptorNames得到的name，其实就是bean的id，通过这个name（id）
			//我们就可以从IoC容器中获取对应的实例化bean
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
					//对当前的factoryBean进行类型判断，是属于单例bean还是原型bean
					Object advice;
					if (this.singleton || this.beanFactory.isSingleton(name)) {
						//advisor在文件中配置为bean，所以这里通过beanFactory的getBean()方法
						//获取advisor，这个name是从interceptorNames中获取的
						advice = this.beanFactory.getBean(name);
					}
					else {
						//如果是原型bean
						advice = new PrototypePlaceholderAdvisor(name);
					}
					//把从IoC容器中获取的advice放进advisors拦截器链，这个拦截器链是由ProxyFactoryBean
					//的父类AdvisedSupport持有的
					addAdvisorOnChainCreation(advice, name);
				}
			}
		}

		this.advisorChainInitialized = true;
	}
```
注意，Advisor本身就被配置为bean，所以它的获取也是通过IoC容器获得的。
#### 3.6、Advice通知的实现
从DefaultAdvisorChainFactory类中的getInterceptorsAndDynamicInterceptionAdvice()方法我们可以看到，其通过AdvisorAdapterRegistry实例对象的getInterceptors()方法，利用配置的advisor完成了对拦截器的适配和注册。
```java
	public List<Object> getInterceptorsAndDynamicInterceptionAdvice(
			Advised config, Method method, Class targetClass) {
		
		//advisor链已经在传进来的config中持有了，这里可以直接使用
		//advisor中持有切面 和 增强行为的引用
		List<Object> interceptorList = new ArrayList<Object>(config.getAdvisors().length);
		//判断config中的Advisors是否符合配置要求
		boolean hasIntroductions = hasMatchingIntroductions(config, targetClass);
		
		//获取注册器，这是一个单例模式的实现
		AdvisorAdapterRegistry registry = GlobalAdvisorAdapterRegistry.getInstance();
		for (Advisor advisor : config.getAdvisors()) {
			//advisor如果是PointcutAdvisor的实例
			if (advisor instanceof PointcutAdvisor) {
				PointcutAdvisor pointcutAdvisor = (PointcutAdvisor) advisor;
				if (config.isPreFiltered() || pointcutAdvisor.getPointcut().getClassFilter().matches(targetClass)) {
					//拦截器链是通过AdvisorAdapterRegistry的实例对象registry来加入的，
					//AdvisorAdapterRegistry对advisor的织入起到了很大的作用
					MethodInterceptor[] interceptors = registry.getInterceptors(advisor);
					//从pointcutAdvisor中获取切面的方法匹配器
					MethodMatcher mm = pointcutAdvisor.getPointcut().getMethodMatcher();
					//使用MethodMatchers的matches()方法对目标类的目标方法进行匹配判断
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
			//advisor如果是IntroductionAdvisor的实例
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
```
DefaultAdvisorAdapterRegistry的getInterceptors()方法封装了advice织入实现的入口。
```java
public class DefaultAdvisorAdapterRegistry implements AdvisorAdapterRegistry, Serializable {

	//持有AdvisorAdapter的list，这个list中的AdvisorAdapter与
	//实现spring AOP的advice增强功能相对应
	private final List<AdvisorAdapter> adapters = new ArrayList<AdvisorAdapter>(3);

	/**
	 * 将已实现的AdviceAdapter加入list
	 */
	public DefaultAdvisorAdapterRegistry() {
		registerAdvisorAdapter(new MethodBeforeAdviceAdapter());
		registerAdvisorAdapter(new AfterReturningAdviceAdapter());
		registerAdvisorAdapter(new ThrowsAdviceAdapter());
	}

	/**
	 * 如果adviceObject是Advisor的实例，则将adviceObject转换成Advisor类型并返回
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
		
		//从Advisor通知器中获取配置的Advice
		Advice advice = advisor.getAdvice();
		
		//如果advice是MethodInterceptor类型的，直接加进interceptors，不用适配
		if (advice instanceof MethodInterceptor) {
			interceptors.add((MethodInterceptor) advice);
		}
		
		//对通知进行适配，使用已经配置好的三种AdvisorAdapter，然后从对应的
		//adapter中取出封装好的AOP编织功能的拦截器
		for (AdvisorAdapter adapter : this.adapters) {
			//adapter.supportsAdvice(advice)方法中对advice的
			//类型进行校验
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
从DefaultAdvisorAdapterRegistry的实现中可以看到，其使用了一系列的AdviceAdapter适配器，如：MethodBeforeAdviceAdapter、AfterReturningAdviceAdapter、ThrowsAdviceAdapter，它们完全和advice的类型一一对应，它们都是实现了AdviceAdapter接口的同一层次类，各自承担着不同的适配任务，一对一地服务于不同的advice实现。下面我们以MethodBeforeAdviceAdapter为例，看一下其源码实现。
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
可以看到，其中的getInterceptor()方法把advice从advisor中取出来，然后创建了一个MethodBeforeAdviceInterceptor对象，并返回，这个对象中持有对advice的引用。下面我们看一下MethodBeforeAdviceInterceptor拦截器的源码实现。
```java
public class MethodBeforeAdviceInterceptor implements MethodInterceptor, Serializable {

	private MethodBeforeAdvice advice;

	/**
	 * 为指定的advice创建对应的MethodBeforeAdviceInterceptor对象
	 */
	public MethodBeforeAdviceInterceptor(MethodBeforeAdvice advice) {
		Assert.notNull(advice, "Advice must not be null");
		this.advice = advice;
	}

	/**
	 * 这个invoke方法是拦截器的回调方法，会在代理对象的方法被调用时触发回调
	 */
	public Object invoke(MethodInvocation mi) throws Throwable {
		//首先触发了advice的before()方法的回调
		//然后才是MethodInvocation的process()方法回调
		this.advice.before(mi.getMethod(), mi.getArguments(), mi.getThis() );
		return mi.proceed();
	}

}
```
可以看到，MethodBeforeAdviceInterceptor 的invoke()方法先是触发了advice的before()方法，然后才是MethodInvocation的proceed()方法调用。

回顾一下之前的代码，在AopProxy代理对象触发的ReflectiveMethodInvocation的proceed()中，在取得拦截器interceptor后调用了其invoke()方法。按照AOP的配置规则，ReflectiveMethodInvocation触发的拦截器invoke()回调，最终会根据advice类型的不同，触发spring对不同的advice的拦截器封装，比如MethodBeforeAdvice最终会触发MethodBeforeAdviceInterceptor的invoke()回调，其它两个以此类推，这里就不逐一分析咯。

另外，可以结合我GitHub上对spring框架源码的阅读及个人理解一起看，会更有助于各位开发大佬理解，如果对你们有帮助的，还望各位老爷watch，star，fork，素质三连一波，地址：

spring-aop-reading    https://github.com/AmyliaY/spring-aop-reading

