## 1 设计原理与基本过程
在使用Spring声明式事务处理的时候，一种常用的方法是结合IoC容器和Spring已有的TransactionProxyFactoryBean对事务管理进行配置，比如，可以在这个TransactionProxyFactoryBean中为事务方法配置传播行为、并发事务隔离级别等事务处理属性，从而对声明式事务的处理提供指导。具体来说，在对声明式事务处理的原理分析中，声明式事务处理的实现大致可以分为以下几个部分:

 - 读取和处理在IoC容器中配置的事务处理属性，并转化为Spring事务处理需要的内部数据结构，这里涉及的类是TransactionAttributeSourceAdvisor，从名字可以看出，它是一个AOP通知器，Spring使用这个通知器来完成对事务处理属性值的处理。处理的结果是，在IoC容器中配置的事务处理属性信息，会被读入并转化成TransactionAttribute表示的数据对象，这个数据对象是Spring对事物处理属性值的数据抽象，对这些属性的处理是和TransactionProxyFactoryBean拦截下来的事务方法的处理结合起来的。
 - Spring事务处理模块实现统一的事务处理过程。这个通用的事务处理过程包含处理事务配置属性，以及与线程绑定完成事务处理的过程，Spring通过TransactionInfo和TransactionStatus这两个数据对象，在事务处理过程中记录和传递相关执行场景。
 - 底层的事务处理实现。对于底层的事务操作，Spring委托给具体的事务处理器来完成，这些具体的事务处理器，就是在IoC容器中配置声明式事务处理时，配置的PlatformTransactionManager的具体实现，比如DataSourceTransactionManager和HibernateTransactionManager等。

## 2 实现分析
### 2.1 事务处理拦截器的配置
和前面的思路一样，从声明式事务处理的基本用法入手，来了解它的基本实现原理。在使用声明式事务处理的时候，需要在IoC容器中配置TransactionProxyFactoryBean，见名知义，这是一个FactoryBean，有一个getObject()方法。在IoC容器进行注入的时候，会创建TransactionInterceptor对象，而这个对象会创建一个TransactionAttributePointcut，为读取TransactionAttribute做准备。在容器初始化的过程中，由于实现了InitializingBean接口，因此AbstractSingletonProxyFactoryBean会实现afterPropertiesSet()方法，正是在这个方法实例化了一个ProxyFactory，建立起Spring AOP的应用，在这里，会为这个ProxyFactory设置通知、目标对象，并最终返回Proxy代理对象。在Proxy代理对象建立起来以后，在调用其代理方法的时候，会调用相应的TransactionInterceptor拦截器，在这个调用中，会根据TransactionAttribute配置的事务属性进行配置，从而为事务处理做好准备。

从TransactionProxyFactoryBean入手，通过代码实现来了解Spring是如何通过AOP功能来完成事务管理配置的，Spring为声明式事务处理的实现所做的一些准备工作：包括为AOP配置基础设施，这些基础设施包括设置拦截器TransactionInterceptor、通知器DefaultPointcutAdvisor或TransactionAttributeSourceAdvisor。同时，在TransactionProxyFactoryBean的实现中， 还可以看到注人进来的PlatformTransactionManager和事务处理属性TransactionAttribute等。
```java
/**
 * 代理工厂bean用于简化声明式事务处理,这是标准AOP的一个方便的替代方案
 * 使用单独的TransactionInterceptor定义。
 */
@SuppressWarnings("serial")
public class TransactionProxyFactoryBean extends AbstractSingletonProxyFactoryBean
		implements BeanFactoryAware {

	/** 事务拦截器，通过AOP来发挥作用，spring在此拦截器中封装了 事务处理实现 */
	private final TransactionInterceptor transactionInterceptor = new TransactionInterceptor();

	/** 切面 */
	private Pointcut pointcut;


	/**
	 * 通过依赖注入的事务属性以properties的形式出现
	 * 把从beandefinition中读到的事务管理的属性信息注入到transactionInterceptor
	 */
	public void setTransactionManager(PlatformTransactionManager transactionManager) {
		this.transactionInterceptor.setTransactionManager(transactionManager);
	}

	/**
	 * 创建AOP对事务处理的advisor
	 * 本方法在IoC容器完成Bean的依赖注入时，通过initializeBean方法被调用
	 */
	@Override
	protected Object createMainInterceptor() {
		this.transactionInterceptor.afterPropertiesSet();
		if (this.pointcut != null) {
			// 如果自己定义了切面，就使用默认的通知器，并为其配置事务处理拦截器
			return new DefaultPointcutAdvisor(this.pointcut, this.transactionInterceptor);
		}
		else {
			// 如果没定义，则使用spring默认的切面，使用TransactionAttributeSourceAdvisor
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
以上代码完成了AOP配置，对于用户来说，一个值得关心的问题是，Spring的TransactionInterceptor配置是在什么时候被启动并成为Advisor通知器的一部分的呢？从对createMainInterceptor()方法的调用分析中可以看到，这个createMainInterceptor()方法在IoC容器完成Bean的依赖注入时，通过initializeBean()方法被调用，具体的调用过程如下图所示。

![avatar](/images/springTransaction/createMainInterceptor()方法的调用链.png)

在TransactionProxyFactoryBean的父类AbstractSingletonProxyFactoryBean中的afterPropertiesSet()方法，是Spring事务处理完成AOP配置的地方，在建立TransactionProxyFactoryBean的事务处理拦截器的时候，首先需要对ProxyFactoryBean的目标Bean设置进行检查，如果这个目标Bean的设置是正确的，就会创建一个ProxyFactory对象，从而实现AOP的使用。在afterPropertiesSet()的方法实现中，可以看到为ProxyFactory生成代理对象、配置通知器、设置代理接口方法等。
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
	 * 处理完成AOP配置，创建ProxyFactory对象，为其生成代理对象
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

		// 使用ProxyFactory完成AOP的基本功能，ProxyFactory提供proxy对象
		// 并将TransactionIntercepter设为target方法调用的拦截器
		ProxyFactory proxyFactory = new ProxyFactory();

		if (this.preInterceptors != null) {
			for (Object interceptor : this.preInterceptors) {
				proxyFactory.addAdvisor(this.advisorAdapterRegistry.wrap(interceptor));
			}
		}

		// 加入Advisor通知器，可以加入两种通知器，分别是：
		// DefaultPointcutAdvisor、TransactionAttributeSourceAdvisor
		// 这里通过调用TransactionProxyFactoryBean实例的createMainInterceptor()方法
		// 来生成需要的Advisors。在ProxyFactory的基类AdvisedSupport中维护了一个持有Advisor
		// 的链表LinkedList<Advisor>，通过对这个链表中的元素执行增、删、改等操作，用来管理
		// 配置给ProxyFactory的通知器
		proxyFactory.addAdvisor(this.advisorAdapterRegistry.wrap(createMainInterceptor()));

		if (this.postInterceptors != null) {
			for (Object interceptor : this.postInterceptors) {
				proxyFactory.addAdvisor(this.advisorAdapterRegistry.wrap(interceptor));
			}
		}

		proxyFactory.copyFrom(this);

		// 这里创建AOP的目标源，与在其它地方使用ProxyFactory没什么差别
		TargetSource targetSource = createTargetSource(this.target);
		proxyFactory.setTargetSource(targetSource);

		if (this.proxyInterfaces != null) {
			proxyFactory.setInterfaces(this.proxyInterfaces);
		}
		else if (!isProxyTargetClass()) {
			// 需要根据AOP基础设施来确定使用哪个接口作为代理
			proxyFactory.setInterfaces(
					ClassUtils.getAllInterfacesForClass(targetSource.getTargetClass(), this.proxyClassLoader));
		}

		// 设置代理对象
		this.proxy = proxyFactory.getProxy(this.proxyClassLoader);
	}
}
```
DefaultAopProxyFactory创建AOP Proxy的过程在前面分析AOP的实现原理时已分析过，这里就不再重复了。可以看到，通过以上的一系列步骤，Spring为实现事务处理而设计的拦截器TransctionInterceptor已经设置到ProxyFactory生成的AOP代理对象中去了，这里的TransactionInterceptor是作为AOP Advice的拦截器来实现它的功能的。在IoC容器中，配置其他与事务处理有关的属性，比如，比较熟悉的transactionManager和事务处理的属性，也同样会被设置到已经定义好的TransactionInterceptor中去。这些属性配置在TransactionInterceptor对事务方法进行拦截时会起作用。在AOP配置完成以后，可以看到，在Spring声明式事务处理实现中的一些重要的类已经悄然登场，比如TransactionAttributeSourceAdvisor和TransactionInterceptor，正是这些类通过AOP封装了Spring对事务处理的基本实现。

### 2.2 事务处理配置的读入
在AOP配置完成的基础上，以TransactionAttributeSourceAdvisor的实现为入 口，了解具体的事务属性配置是如何读入的。
```java
public class TransactionAttributeSourceAdvisor extends AbstractPointcutAdvisor {

	/**
	 * 与其它Advisor一样，同样需要定义AOP中用到的Interceptor和Pointcut
	 */
	private TransactionInterceptor transactionInterceptor;

	/**
	 * 对于切面pointcut，这里使用了一个匿名内部类
	 */
	private final TransactionAttributeSourcePointcut pointcut = new TransactionAttributeSourcePointcut() {
		/**
		 * 通过transactionInterceptor来得到事务的配置属性，在对Proxy的方法进行匹配调用时，
		 * 会使用到这些配置属性
		 */
		@Override
		protected TransactionAttributeSource getTransactionAttributeSource() {
			return (transactionInterceptor != null ? transactionInterceptor.getTransactionAttributeSource() : null);
		}
	};
}
```
在声明式事务处理中，通过对目标对象的方法调用进行拦截来实现事务处理的织入，这个拦截通过AOP发挥作用。在AOP中，对于拦截的启动，首先需要对方法调用是否需要拦截进行判断，而判断的依据是那些在TransactionProxyFactoryBean中为目标对象设置的事务属性。也就是说，需要判断当前的目标方法调用是不是一个配置好的并且需要进行事务处理的方法调用。具体来说，这个匹配判断在TransactionAttributeSourcePointcut的matches()方法中完成，该方法实现 首先把事务方法的属性配置读取到TransactionAttributeSource对象中，有了这些事务处理的配置以后，根据当前方法调用的Method对象和目标对象，对是否需要启动事务处理拦截器进行判断。
```java
abstract class TransactionAttributeSourcePointcut extends StaticMethodMatcherPointcut implements Serializable {

	public boolean matches(Method method, Class targetClass) {
		TransactionAttributeSource tas = getTransactionAttributeSource();
		return (tas == null || tas.getTransactionAttribute(method, targetClass) != null);
	}
}
```
在Pointcut的matches()判断过程中，会用到TransactionAttributeSource对象，这个TransactionAttributeSource对象是在对TransactionInterceptor进行依赖注入时就配置好的。它的设置是在TransactionInterceptor的基类TransactionAspectSupport中完成的，配置的是一个NameMatchTransactionAttributeSource对象。
```java
public abstract class TransactionAspectSupport implements BeanFactoryAware, InitializingBean {
	/**
	 * 设置事务属性，以方法名为key，事务属性描述符为value
	 * 例如：key = "myMethod", value = "PROPAGATION_REQUIRED,readOnly"
	 */
	public void setTransactionAttributes(Properties transactionAttributes) {
		// 可以看到这是一个NameMatchTransactionAttributeSource的实现
		NameMatchTransactionAttributeSource tas = new NameMatchTransactionAttributeSource();
		tas.setProperties(transactionAttributes);
		this.transactionAttributeSource = tas;
	}
}
```
在以上的代码实现中可以看到，NameMatchTransactionAttributeSource作为TransactionAttributeSource的具体实现，是实际完成事务处理属性读入和匹配的地方。在对事务属性TransactionAttributes进行设置时，会从事务处理属性配置中读取事务方法名和配置属性，在得到配置的事务方法名和属性以后，会把它们作为键值对加入到一个nameMap中。

在应用调用目标方法的时候，因为这个目标方法已经被TransactionProxyFactoryBean代理，所以TransactionProxyFactoryBean需要判断这个调用方法是否是事务方法。这个判断的实现，是通过在NameMatchTransactionAttributeSource中能否为这个调用方法返回事务属性来完成的。具体的实现过程是这样的：首先，以调用方法名为索引在nameMap中查找相应的事务处理属性值，如果能够找到，那么就说明该调用方法和事务方法是直接对应的，如果找不到，那么就会遍历整个nameMap，对保存在nameMap中的每一个方法名，使用PatternMatchUtils的simpleMatch()方法进行命名模式上的匹配。这里使用PatternMatchUtils进行匹配的原因是，在设置事务方法的时候，可以不需要为事务方法设置一个完整的方法名，而可以通过设置方法名的命名模式来完成，比如可以通过对通配符*的使用等。所以，如果直接通过方法名没能够匹配上，而通过方法名的命名模式能够匹配上，这个方法也是需要进行事务处理的，相对应地，它所配置的事务处理属性也会从nameMap中取出来，从而触发事务处理拦截器的拦截。
```java
public class NameMatchTransactionAttributeSource implements TransactionAttributeSource, Serializable {

	/** key是方法名，value是事务属性 */
	private Map<String, TransactionAttribute> nameMap = new HashMap<String, TransactionAttribute>();

	/**
	 * 将给定属性transactionAttributes解析为名称/属性的map对象。以 方法名称 为键，
	 * 字符串属性定义 为值，可通过TransactionAttributeEditor解析为TransactionAttribute实例。
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
```
通过以上过程可以得到与目标对象调用方法相关的TransactionAttribute对象，在这个对象中，封装了事务处理的配置。具体来说，在前面的匹配过程中，如果匹配返回的结果是null，那么说明当前的调用方法不是一个事务方法，不需要纳入Spring统一的事务管理中，因为它并没有配置在TransactionProxyFactoryBean的事务处理设置中。如果返回的TransactionAttribute对象不是null,那么这个返回的TransactionAttribute对象就已经包含了对事务方法的配置信息，对应这个事务方法的具体事务配置也已经读入到TransactionAttribute对象中了，为TransactionInterceptor做好了对调用的目标方法添加事务处理的准备。

### 2.3 事务处理拦截器的设计与实现