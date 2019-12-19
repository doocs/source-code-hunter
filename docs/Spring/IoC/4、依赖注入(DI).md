前面我们主要分析了 FileSystemXmlApplicationContext 这个具体的 IoC 容器的初始化源码实现，在 IoC 容器中建立了 BeanDefinition 的数据映射，将其和 beanName 一起绑定在一个 ConcurrentHashMap 中。现在我们来看一下 spring 是如何将 IoC 容器中的 Bean 根据配置关联在一起的。
 
Spring 中触发 IoC 容器“依赖注入”的方式有两种，一个是通过 getBean() 向容器索要 bean 时触发依赖注入；另一个是给 bean 配置 lazy-init 属性，spring 会自动调用此 bean 的 getBean() 方法，提前完成依赖注入。总的来说，想提高运行时获取 bean 的效率，可以考虑配置此属性。

下面我将分别解读这两种依赖注入的触发方式，先看 getBean() 的，因为 lazy-init 最后也是通过调用 getBean 完成的依赖注入。
	
（PS：可以结合我 GitHub 上对 spring 框架源码的阅读及个人理解一起看，会更有助于各位开发姥爷理解，地址：

spring-beans	 https://github.com/AmyliaY/spring-beans-reading

spring-context  https://github.com/AmyliaY/spring-context-reading
）
## 1、AbstractBeanFactory 中的 getBean() 系列方法及 doGetBean() 具体实现
```java
	//---------------------------------------------------------------------
	// BeanFactory 接口的实现，下列的 getBean() 方法不论是哪种重载，最后都会走
	// doGetBean(final String name, final Class<T> requiredType, final Object[] args, boolean typeCheckOnly) 的具体实现
	//---------------------------------------------------------------------

	// 获取 IOC 容器中指定名称的 Bean
	public Object getBean(String name) throws BeansException {
		return doGetBean(name, null, null, false);
	}

	// 获取 IOC 容器中指定名称和类型的 Bean
	public <T> T getBean(String name, Class<T> requiredType) throws BeansException {
		return doGetBean(name, requiredType, null, false);
	}

	// 获取 IOC 容器中指定名称和参数的 Bean
	public Object getBean(String name, Object... args) throws BeansException {
		return doGetBean(name, null, args, false);
	}

	// 获取 IOC 容器中指定名称、类型和参数的 Bean
	public <T> T getBean(String name, Class<T> requiredType, Object... args) throws BeansException {
		return doGetBean(name, requiredType, args, false);
	}

	// 真正实现向 IOC 容器获取 Bean 的功能，也是触发依赖注入 (DI) 功能的地方
	@SuppressWarnings("unchecked")
	protected <T> T doGetBean(final String name, final Class<T> requiredType, final Object[] args, 
			boolean typeCheckOnly) throws BeansException {

		// 根据用户指定的名称获取 IoC 容器中与 BeanDefinition 对应的 beanName
	    // 如果指定的是别名，则将别名转换为规范的 beanName
		final String beanName = transformedBeanName(name);
		Object bean;

		// 先查看缓存中是否有对应的，已创建的单例 Bean，对于单例 Bean，整个 IOC 容器中只创建一次
		Object sharedInstance = getSingleton(beanName);
		if (sharedInstance != null && args == null) {
			if (logger.isDebugEnabled()) {
				if (isSingletonCurrentlyInCreation(beanName)) {
					logger.debug("Returning eagerly cached instance of singleton bean '" + beanName +
							"' that is not fully initialized yet - a consequence of a circular reference");
				}
				else {
					logger.debug("Returning cached instance of singleton bean '" + beanName + "'");
				}
			}
		    // 获取给定 Bean 的实例对象，主要是完成 FactoryBean 的相关处理  
            // 注意：BeanFactory 本质上是一个 IoC 容器，而 FactoryBean 是 IoC 容器中一种特殊的工厂 bean
            // 能够生产其他对象，注意两者之间的区别
			bean = getObjectForBeanInstance(sharedInstance, name, beanName, null);
		}

		else {
			if (isPrototypeCurrentlyInCreation(beanName)) {
				throw new BeanCurrentlyInCreationException(beanName);
			}

			// 获取当前容器的父容器
			BeanFactory parentBeanFactory = getParentBeanFactory();
			// 如果当前容器中没有指定的 bean，且当前容器的父容器不为空
			// 则从父容器中去找，如果父容器也没有，则沿着当前容器的继承体系一直向上查找
			if (parentBeanFactory != null && !containsBeanDefinition(beanName)) {
				// 解析指定 Bean 名称的原始名称
				String nameToLookup = originalBeanName(name);
				if (args != null) {
					// 委派父级容器根据指定名称和显式的参数查找
					return (T) parentBeanFactory.getBean(nameToLookup, args);
				}
				else {
					// 委派父容器根据指定名称和类型查找
					return parentBeanFactory.getBean(nameToLookup, requiredType);
				}
			}

			// 创建的 Bean 是否需要进行类型验证，一般不需要
			if (!typeCheckOnly) {
				// 向容器标记指定的 Bean 已经被创建
				markBeanAsCreated(beanName);
			}

			try {
		        // 根据 beanName 获取对应的 RootBeanDefinition
				final RootBeanDefinition mbd = getMergedLocalBeanDefinition(beanName);
				checkMergedBeanDefinition(mbd, beanName, args);

				// 获取当前 Bean 依赖的所有 Bean，下面的 getBean(dependsOnBean) 方法会触发 getBean() 的递归调用，
				// 直到取到一个不依赖任何其它 bean 的 bean 为止
				String[] dependsOn = mbd.getDependsOn();
				if (dependsOn != null) {
					for (String dependsOnBean : dependsOn) {
						// 递归调用 getBean() 方法，获取当前 Bean 所依赖的 bean
						getBean(dependsOnBean);
						// 把当前 bean 所依赖的 bean 进行注入
						//（也就是通过 setter 或构造方法将依赖的 bean 赋值给当前 bean 对应的属性）
						registerDependentBean(dependsOnBean, beanName);
					}
				}

				// 创建单例模式 bean 的实例对象
				if (mbd.isSingleton()) {
					// 这里使用了一个匿名内部类，创建 Bean 实例对象，并且注册给所依赖的对象
					sharedInstance = getSingleton(beanName, new ObjectFactory<Object>() {
						public Object getObject() throws BeansException {
							try {
								// 创建一个指定 Bean 实例对象，如果有父级继承，则合并子类和父类的定义
								return createBean(beanName, mbd, args);
							}
							catch (BeansException ex) {
								destroySingleton(beanName);
								throw ex;
							}
						}
					});
					// 获取给定 Bean 的实例对象
					bean = getObjectForBeanInstance(sharedInstance, name, beanName, mbd);
				}

				// IoC 容器创建原型模式 Bean 实例对象
				else if (mbd.isPrototype()) {
					// 原型模式 (Prototype) 是每次都会创建一个新的对象
					Object prototypeInstance = null;
					try {
						// 回调 beforePrototypeCreation 方法，默认的功能是注册当前创建的原型对象
						beforePrototypeCreation(beanName);
						// 创建指定 Bean 对象实例
						prototypeInstance = createBean(beanName, mbd, args);
					}
					finally {
						// 回调 afterPrototypeCreation 方法，默认的功能告诉 IoC 容器指定 Bean 的原型对象不再创建了
						afterPrototypeCreation(beanName);
					}
					// 获取给定 Bean 的实例对象
					bean = getObjectForBeanInstance(prototypeInstance, name, beanName, mbd);
				}

				// 要创建的 Bean 既不是单例模式，也不是原型模式，则根据 Bean 定义资源中  
		        // 配置的生命周期范围，选择实例化 Bean 的合适方法，这种在 Web 应用程序中  
		        // 比较常用，如：request、session、application 等的生命周期 
				else {
					// 获取此 bean 生命周期的范围
					String scopeName = mbd.getScope();
					final Scope scope = this.scopes.get(scopeName);
					// Bean 定义资源中没有配置生命周期范围，则 Bean 定义不合法
					if (scope == null) {
						throw new IllegalStateException("No Scope registered for scope '" + scopeName + "'");
					}
					try {
						// 这里又使用了一个匿名内部类，获取一个指定生命周期范围的实例
						Object scopedInstance = scope.get(beanName, new ObjectFactory<Object>() {
							public Object getObject() throws BeansException {
								beforePrototypeCreation(beanName);
								try {
									return createBean(beanName, mbd, args);
								}
								finally {
									afterPrototypeCreation(beanName);
								}
							}
						});
						// 获取给定 Bean 的实例对象
						bean = getObjectForBeanInstance(scopedInstance, name, beanName, mbd);
					}
					catch (IllegalStateException ex) {
						throw new BeanCreationException(beanName,
								"Scope '" + scopeName + "' is not active for the current thread; " +
								"consider defining a scoped proxy for this bean if you intend to refer to it from a singleton",
								ex);
					}
				}
			}
			catch (BeansException ex) {
				cleanupAfterBeanCreationFailure(beanName);
				throw ex;
			}
		}

		// 对创建的 bean 实例对象进行非空验证和类型检查，如果没问题就返回这个已经完成依赖注入的 bean
		if (requiredType != null && bean != null && !requiredType.isAssignableFrom(bean.getClass())) {
			try {
				return getTypeConverter().convertIfNecessary(bean, requiredType);
			}
			catch (TypeMismatchException ex) {
				if (logger.isDebugEnabled()) {
					logger.debug("Failed to convert bean '" + name + "' to required type [" +
							ClassUtils.getQualifiedName(requiredType) + "]", ex);
				}
				throw new BeanNotOfRequiredTypeException(name, requiredType, bean.getClass());
			}
		}
		return (T) bean;
	}
```
总的来说，getBean() 方法是依赖注入的起点，之后会调用 createBean()，根据 BeanDefinition 的定义生成 bean 对象，下面我们看看 AbstractBeanFactory 的子类 AbstractAutowireCapableBeanFactory 中对 createBean() 的具体实现。

## 2、AbstractAutowireCapableBeanFactory 中的 createBean() 和 doCreateBean() 具体实现
```java
	// 创建指定的 bean 实例对象
	@Override
	protected Object createBean(final String beanName, final RootBeanDefinition mbd, final Object[] args)
			throws BeanCreationException {

		if (logger.isDebugEnabled()) {
			logger.debug("Creating instance of bean '" + beanName + "'");
		}
		// 判断需要创建的 Bean 是否可以实例化，是否可以通过当前的类加载器加载
		resolveBeanClass(mbd, beanName);

		try {
			// 校验和准备 Bean 中的方法覆盖
			mbd.prepareMethodOverrides();
		}
		catch (BeanDefinitionValidationException ex) {
			throw new BeanDefinitionStoreException(mbd.getResourceDescription(),
					beanName, "Validation of method overrides failed", ex);
		}

		try {
			// 如果 Bean 配置了后置处理器 PostProcessor，则这里返回一个 proxy 代理对象
			Object bean = resolveBeforeInstantiation(beanName, mbd);
			if (bean != null) {
				return bean;
			}
		}
		catch (Throwable ex) {
			throw new BeanCreationException(mbd.getResourceDescription(), beanName,
					"BeanPostProcessor before instantiation of bean failed", ex);
		}

		// 创建 Bean 实例对象的具体实现
		Object beanInstance = doCreateBean(beanName, mbd, args);
		if (logger.isDebugEnabled()) {
			logger.debug("Finished creating instance of bean '" + beanName + "'");
		}
		return beanInstance;
	}

	// 创建 Bean 实例对象的具体实现，spring 中以 do 开头的都是方法的具体实现
	protected Object doCreateBean(final String beanName, final RootBeanDefinition mbd, final Object[] args) {
		
		// 封装被创建的 Bean 对象
		BeanWrapper instanceWrapper = null;
		// 如果这个 bean 是单例的，则从缓存中获取这个 BeanWrapper 实例并清除
		if (mbd.isSingleton()) {
			instanceWrapper = this.factoryBeanInstanceCache.remove(beanName);
		}
		if (instanceWrapper == null) {
			
			/**
			 * ！！！！！！！！！！！！！
			 * 创建实例对象
			 * ！！！！！！！！！！！！！
			 */
			instanceWrapper = createBeanInstance(beanName, mbd, args);
		}
		
		// 获取实例化对象和其类型
		final Object bean = (instanceWrapper != null ? instanceWrapper.getWrappedInstance() : null);
		Class<?> beanType = (instanceWrapper != null ? instanceWrapper.getWrappedClass() : null);

		// 调用 PostProcessor 后置处理器
		synchronized (mbd.postProcessingLock) {
			if (!mbd.postProcessed) {
				applyMergedBeanDefinitionPostProcessors(mbd, beanType, beanName);
				mbd.postProcessed = true;
			}
		}

		// 向容器中缓存单例模式的 Bean 对象，以防循环引用
		boolean earlySingletonExposure = (mbd.isSingleton() && this.allowCircularReferences &&
				isSingletonCurrentlyInCreation(beanName));
		if (earlySingletonExposure) {
			if (logger.isDebugEnabled()) {
				logger.debug("Eagerly caching bean '" + beanName +
						"' to allow for resolving potential circular references");
			}
			// 这里是一个匿名内部类，为了防止循环引用，尽早持有对象的引用
			addSingletonFactory(beanName, new ObjectFactory<Object>() {
				public Object getObject() throws BeansException {
					return getEarlyBeanReference(beanName, mbd, bean);
				}
			});
		}

		// Bean 对象的初始化，依赖注入在此触发  
	    // 这个 exposedObject 在初始化完成之后，将返回作为依赖注入完成后的 Bean
		Object exposedObject = bean;
		try {
			/**
			 * ！！！！！！！！！！！！！！！！！！！！！！！！！！！
			 * 把生成的 bean 对象的依赖关系设置好，完成整个依赖注入过程
			 * ！！！！！！！！！！！！！！！！！！！！！！！！！！！
			 */
			populateBean(beanName, mbd, instanceWrapper);
			if (exposedObject != null) {
				// 初始化 Bean 对象 
				// 在对 Bean 实例对象生成和依赖注入完成以后，开始对 Bean 实例对象  
	            // 进行初始化 ，为 Bean 实例对象应用 BeanPostProcessor 后置处理器
				exposedObject = initializeBean(beanName, exposedObject, mbd);
			}
		}
		catch (Throwable ex) {
			if (ex instanceof BeanCreationException && beanName.equals(((BeanCreationException) ex).getBeanName())) {
				throw (BeanCreationException) ex;
			}
			else {
				throw new BeanCreationException(mbd.getResourceDescription(), beanName, "Initialization of bean failed", ex);
			}
		}

		if (earlySingletonExposure) {
			// 获取指定名称的已注册的单例模式 Bean 对象
			Object earlySingletonReference = getSingleton(beanName, false);
			if (earlySingletonReference != null) {
				// 如果根据名称获取的已注册的 Bean 和正在实例化的 Bean 是同一个
				if (exposedObject == bean) {
					// 当前实例化的 Bean 初始化完成
					exposedObject = earlySingletonReference;
				}
				// 如果当前 Bean 依赖其他 Bean，并且当发生循环引用时不允许新创建实例对象
				else if (!this.allowRawInjectionDespiteWrapping && hasDependentBean(beanName)) {
					String[] dependentBeans = getDependentBeans(beanName);
					Set<String> actualDependentBeans = new LinkedHashSet<String>(dependentBeans.length);
					// 获取当前 Bean 所依赖的其他 Bean 
					for (String dependentBean : dependentBeans) {
						// 对依赖 Bean 进行类型检查
						if (!removeSingletonIfCreatedForTypeCheckOnly(dependentBean)) {
							actualDependentBeans.add(dependentBean);
						}
					}
					if (!actualDependentBeans.isEmpty()) {
						throw new BeanCurrentlyInCreationException(beanName,
								"Bean with name '" + beanName + "' has been injected into other beans [" +
								StringUtils.collectionToCommaDelimitedString(actualDependentBeans) +
								"] in its raw version as part of a circular reference, but has eventually been " +
								"wrapped. This means that said other beans do not use the final version of the " +
								"bean. This is often the result of over-eager type matching - consider using " +
								"'getBeanNamesOfType' with the 'allowEagerInit' flag turned off, for example.");
					}
				}
			}
		}

		try {
			// 注册完成依赖注入的 Bean
			registerDisposableBeanIfNecessary(beanName, bean, mbd);
		}
		catch (BeanDefinitionValidationException ex) {
			throw new BeanCreationException(mbd.getResourceDescription(), beanName, "Invalid destruction signature", ex);
		}

		// 为应用返回所需要的实例对象
		return exposedObject;
	}

```
从源码中可以看到 createBeanInstance() 和 populateBean() 这两个方法与依赖注入的实现非常密切，createBeanInstance() 方法中生成了 Bean 所包含的 Java 对象，populateBean() 方法对这些生成的 bean 对象之间的依赖关系进行了处理。下面我们先看一下 createBeanInstance() 方法的实现。

## 3、createBeanInstance() 方法的具体实现
```java
	// 创建 Bean 的实例对象
	protected BeanWrapper createBeanInstance(String beanName, RootBeanDefinition mbd, Object[] args) {
		
		// 检查确认 Bean 是可实例化的
		Class<?> beanClass = resolveBeanClass(mbd, beanName);
		if (beanClass != null && !Modifier.isPublic(beanClass.getModifiers()) && !mbd.isNonPublicAccessAllowed()) {
			throw new BeanCreationException(mbd.getResourceDescription(), beanName,
					"Bean class isn't public, and non-public access not allowed: " + beanClass.getName());
		}

		// 使用工厂方法对 Bean 进行实例化
		if (mbd.getFactoryMethodName() != null)  {
			return instantiateUsingFactoryMethod(beanName, mbd, args);
		}

		// 使用容器的自动装配方法进行实例化
		boolean resolved = false;
		boolean autowireNecessary = false;
		if (args == null) {
			synchronized (mbd.constructorArgumentLock) {
				if (mbd.resolvedConstructorOrFactoryMethod != null) {
					resolved = true;
					autowireNecessary = mbd.constructorArgumentsResolved;
				}
			}
		}
		if (resolved) {
			if (autowireNecessary) {
				// 配置了自动装配属性，使用容器的自动装配实例化，
				// 即，根据参数类型匹配 Bean 的构造方法
				return autowireConstructor(beanName, mbd, null, null);
			}
			else {
				// 使用默认的无参构造方法进行实例化
				return instantiateBean(beanName, mbd);
			}
		}

		// 使用 Bean 的构造方法进行实例化
		Constructor<?>[] ctors = determineConstructorsFromBeanPostProcessors(beanClass, beanName);
		if (ctors != null ||
				mbd.getResolvedAutowireMode() == RootBeanDefinition.AUTOWIRE_CONSTRUCTOR ||
				mbd.hasConstructorArgumentValues() || !ObjectUtils.isEmpty(args))  {
			// 使用容器的自动装配特性，调用匹配的构造方法实例化 
			return autowireConstructor(beanName, mbd, ctors, args);
		}

		return instantiateBean(beanName, mbd);
	}
	
	// 使用默认的无参构造方法实例化 Bean 对象
	protected BeanWrapper instantiateBean(final String beanName, final RootBeanDefinition mbd) {
		try {
			Object beanInstance;
			final BeanFactory parent = this;
			// 获取系统的安全管理接口，JDK 标准的安全管理 API
			if (System.getSecurityManager() != null) {
				// 这里是一个匿名内置类，根据实例化策略创建实例对象
				beanInstance = AccessController.doPrivileged(new PrivilegedAction<Object>() {
					public Object run() {
						return getInstantiationStrategy().instantiate(mbd, beanName, parent);
					}
				}, getAccessControlContext());
			}
			else {
				
				/**
				 * ！！！！！！！！！！！！！！
				 * 使用初始化策略实例化 Bean 对象
				 * ！！！！！！！！！！！！！！
				 */
				beanInstance = getInstantiationStrategy().instantiate(mbd, beanName, parent);
			}
			BeanWrapper bw = new BeanWrapperImpl(beanInstance);
			initBeanWrapper(bw);
			return bw;
		}
		catch (Throwable ex) {
			throw new BeanCreationException(mbd.getResourceDescription(), beanName, "Instantiation of bean failed", ex);
		}
	}

```
从源码中我们可以看到其调用了 SimpleInstantiationStrategy 实现类来生成 bean 对象，这个类是 spring 用来生成 bean 对象的默认类，它提供了两种策略来实例化 bean 对象，一种是利用 Java 的反射机制，另一种是直接使用 CGLIB。
## 4、SimpleInstantiationStrategy 中的 instantiate() 方法实现
```java
	// 使用初始化策略实例化 Bean 对象
	public Object instantiate(RootBeanDefinition beanDefinition, String beanName, BeanFactory owner) {
		// 如果 Bean 定义中没有方法覆盖，则使用 Java 的反射机制实例化对象，否则使用 CGLIB
		if (beanDefinition.getMethodOverrides().isEmpty()) {
			Constructor<?> constructorToUse;
			synchronized (beanDefinition.constructorArgumentLock) {
				// 获取对象的构造方法或生成对象的工厂方法对 bean 进行实例化
				constructorToUse = (Constructor<?>) beanDefinition.resolvedConstructorOrFactoryMethod;
				
				// 如果前面没有获取到构造方法，则通过反射获取
				if (constructorToUse == null) {
					// 使用 JDK 的反射机制，判断要实例化的 Bean 是否是接口
					final Class clazz = beanDefinition.getBeanClass();
					// 如果 clazz 是一个接口，直接抛出异常
					if (clazz.isInterface()) {
						throw new BeanInstantiationException(clazz, "Specified class is an interface");
					}
					try {
						if (System.getSecurityManager() != null) {
							// 这里是一个匿名内置类，使用反射机制获取 Bean 的构造方法
							constructorToUse = AccessController.doPrivileged(new PrivilegedExceptionAction<Constructor>() {
								public Constructor run() throws Exception {
									return clazz.getDeclaredConstructor((Class[]) null);
								}
							});
						}
						else {
							constructorToUse =	clazz.getDeclaredConstructor((Class[]) null);
						}
						beanDefinition.resolvedConstructorOrFactoryMethod = constructorToUse;
					}
					catch (Exception ex) {
						throw new BeanInstantiationException(clazz, "No default constructor found", ex);
					}
				}
			}
			// 使用 BeanUtils 实例化，通过反射机制调用”构造方法.newInstance(arg)”来进行实例化
			return BeanUtils.instantiateClass(constructorToUse);
		}
		else {
			/**
			 * ！！！！！！！！！！！！！！
			 * 使用 CGLIB 来实例化对象
			 * 调用了 CglibSubclassingInstantiationStrategy 中的实现
			 * ！！！！！！！！！！！！！！
			 */
			return instantiateWithMethodInjection(beanDefinition, beanName, owner);
		}
	}

```
在 SimpleInstantiationStrategy 的子类 CglibSubclassingInstantiationStrategy 中可以看到使用 CGLIB 进行实例化的源码实现。
## 5、CglibSubclassingInstantiationStrategy 中使用 CGLIB 进行实例化的源码实现
```java
	// 下面两个方法都通过实例化自己的私有静态内部类 CglibSubclassCreator，
	// 然后调用该内部类对象的实例化方法 instantiate() 完成实例化
	protected Object instantiateWithMethodInjection(
			RootBeanDefinition beanDefinition, String beanName, BeanFactory owner) {

		// 必须生成 cglib 子类
		return new CglibSubclassCreator(beanDefinition, owner).instantiate(null, null);
	}

	@Override
	protected Object instantiateWithMethodInjection(
			RootBeanDefinition beanDefinition, String beanName, BeanFactory owner,
			Constructor ctor, Object[] args) {

		return new CglibSubclassCreator(beanDefinition, owner).instantiate(ctor, args);
	}

	/**
	 * 为避免 3.2 之前的 Spring 版本中的外部 cglib 依赖而创建的内部类。
	 */
	private static class CglibSubclassCreator {

		private static final Log logger = LogFactory.getLog(CglibSubclassCreator.class);

		private final RootBeanDefinition beanDefinition;

		private final BeanFactory owner;

		public CglibSubclassCreator(RootBeanDefinition beanDefinition, BeanFactory owner) {
			this.beanDefinition = beanDefinition;
			this.owner = owner;
		}

		// 使用 CGLIB 进行 Bean 对象实例化
		public Object instantiate(Constructor ctor, Object[] args) {
			// 实例化 Enhancer 对象，并为 Enhancer 对象设置父类，生成 Java 对象的参数，比如：基类、回调方法等
			Enhancer enhancer = new Enhancer();
			// 将 Bean 本身作为其父类
			enhancer.setSuperclass(this.beanDefinition.getBeanClass());
			enhancer.setCallbackFilter(new CallbackFilterImpl());
			enhancer.setCallbacks(new Callback[] {
					NoOp.INSTANCE,
					new LookupOverrideMethodInterceptor(),
					new ReplaceOverrideMethodInterceptor()
			});

			// 使用 CGLIB 的 create 方法生成实例对象
			return (ctor == null) ? enhancer.create() : enhancer.create(ctor.getParameterTypes(), args);
		}
}

```
至此，完成了 bean 对象的实例化，然后就可以根据解析得到的 BeanDefinition 完成对各个属性的赋值处理，也就是依赖注入。这个实现方法就是前面 AbstractAutowireCapableBeanFactory 类中的 populateBean() 方法。
## 6、AbstractAutowireCapableBeanFactory 中的 populateBean()，完成依赖注入
```java
	// 为属性赋值，完成依赖注入
	protected void populateBean(String beanName, RootBeanDefinition mbd, BeanWrapper bw) {
		// 获取 BeanDefinition 中设置的 property，这些 property 来自对 BeanDefinition 的解析
		PropertyValues pvs = mbd.getPropertyValues();

		// 如果实例对象为 null，而要注入的属性值不为空，则抛出下述异常
		if (bw == null) {
			if (!pvs.isEmpty()) {
				throw new BeanCreationException(
						mbd.getResourceDescription(), beanName, "Cannot apply property values to null instance");
			}
			else {
				// 实例对象为 null，属性值也为空，不需要设置属性值，直接返回 
				return;
			}
		}

		// 在设置属性之前调用 Bean 的 PostProcessor 后置处理器
		boolean continueWithPropertyPopulation = true;

		if (!mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
			for (BeanPostProcessor bp : getBeanPostProcessors()) {
				if (bp instanceof InstantiationAwareBeanPostProcessor) {
					InstantiationAwareBeanPostProcessor ibp = (InstantiationAwareBeanPostProcessor) bp;
					if (!ibp.postProcessAfterInstantiation(bw.getWrappedInstance(), beanName)) {
						continueWithPropertyPopulation = false;
						break;
					}
				}
			}
		}

		if (!continueWithPropertyPopulation) {
			return;
		}

		// 依赖注入开始，首先处理 autowire 自动装配的注入
		if (mbd.getResolvedAutowireMode() == RootBeanDefinition.AUTOWIRE_BY_NAME ||
				mbd.getResolvedAutowireMode() == RootBeanDefinition.AUTOWIRE_BY_TYPE) {
			MutablePropertyValues newPvs = new MutablePropertyValues(pvs);

			// 对 autowire 自动装配的处理，根据 Bean 名称自动装配注入
			if (mbd.getResolvedAutowireMode() == RootBeanDefinition.AUTOWIRE_BY_NAME) {
				autowireByName(beanName, mbd, bw, newPvs);
			}

			// 根据 Bean 类型自动装配注入
			if (mbd.getResolvedAutowireMode() == RootBeanDefinition.AUTOWIRE_BY_TYPE) {
				autowireByType(beanName, mbd, bw, newPvs);
			}

			pvs = newPvs;
		}

		// 检查容器是否持有用于处理单例模式 Bean 关闭时的后置处理器
		boolean hasInstAwareBpps = hasInstantiationAwareBeanPostProcessors();
		// Bean 实例对象没有依赖，即没有继承基类
		boolean needsDepCheck = (mbd.getDependencyCheck() != RootBeanDefinition.DEPENDENCY_CHECK_NONE);

		if (hasInstAwareBpps || needsDepCheck) {
			// 从实例对象中提取属性描述符
			PropertyDescriptor[] filteredPds = filterPropertyDescriptorsForDependencyCheck(bw, mbd.allowCaching);
			if (hasInstAwareBpps) {
				for (BeanPostProcessor bp : getBeanPostProcessors()) {
					if (bp instanceof InstantiationAwareBeanPostProcessor) {
						InstantiationAwareBeanPostProcessor ibp = (InstantiationAwareBeanPostProcessor) bp;
						// 使用 BeanPostProcessor 处理器处理属性值
						pvs = ibp.postProcessPropertyValues(pvs, filteredPds, bw.getWrappedInstance(), beanName);
						if (pvs == null) {
							return;
						}
					}
				}
			}
			if (needsDepCheck) {
				// 为要设置的属性进行依赖检查
				checkDependencies(beanName, mbd, filteredPds, pvs);
			}
		}
		/**
		 * ！！！！！！！！！！！
		 * 对属性进行依赖注入
		 * ！！！！！！！！！！！
		 */
		applyPropertyValues(beanName, mbd, bw, pvs);
	}
	
	// 解析并注入依赖属性的过程
	protected void applyPropertyValues(String beanName, BeanDefinition mbd, BeanWrapper bw, PropertyValues pvs) {
		if (pvs == null || pvs.isEmpty()) {
			return;
		}

		// 封装属性值
		MutablePropertyValues mpvs = null;
		List<PropertyValue> original;

		if (System.getSecurityManager()!= null) {
			if (bw instanceof BeanWrapperImpl) {
				// 设置安全上下文，JDK 安全机制
				((BeanWrapperImpl) bw).setSecurityContext(getAccessControlContext());
			}
		}

		if (pvs instanceof MutablePropertyValues) {
			mpvs = (MutablePropertyValues) pvs;
			// 如果属性值已经转换
			if (mpvs.isConverted()) {
				try {
					// 为实例化对象设置属性值
					bw.setPropertyValues(mpvs);
					return;
				}
				catch (BeansException ex) {
					throw new BeanCreationException(
							mbd.getResourceDescription(), beanName, "Error setting property values", ex);
				}
			}
			// 获取属性值对象的原始类型值
			original = mpvs.getPropertyValueList();
		}
		else {
			original = Arrays.asList(pvs.getPropertyValues());
		}

		// 获取用户自定义的类型转换
		TypeConverter converter = getCustomTypeConverter();
		if (converter == null) {
			converter = bw;
		}
		// 创建一个 BeanDefinition 属性值解析器，将 Bean 定义中的属性值解析为 Bean 实例对象的实际值
		BeanDefinitionValueResolver valueResolver = new BeanDefinitionValueResolver(this, beanName, mbd, converter);

		// 为属性的解析值创建一个副本，最后将属性值注入到实例对象中
		List<PropertyValue> deepCopy = new ArrayList<PropertyValue>(original.size());
		boolean resolveNecessary = false;
		for (PropertyValue pv : original) {
			// 如果属性值已经转换，直接添加到 deepCopy 列表中
			if (pv.isConverted()) {
				deepCopy.add(pv);
			}
			// 如果属性值需要转换
			else {
				String propertyName = pv.getName();
				// 原始的属性值，即转换之前的属性值
				Object originalValue = pv.getValue();
				/**
				 * ！！！！！！！！！！！！！！！！！！！
				 * 解析属性值，对注入类型进行转换
				 * ！！！！！！！！！！！！！！！！！！！
				 */
				Object resolvedValue = valueResolver.resolveValueIfNecessary(pv, originalValue);
				// 转换之后的属性值
				Object convertedValue = resolvedValue;
				// 属性值是否可以转换
				boolean convertible = bw.isWritableProperty(propertyName) &&
						!PropertyAccessorUtils.isNestedOrIndexedProperty(propertyName);
				if (convertible) {
					// 使用用户自定义的类型转换器转换属性值
					convertedValue = convertForProperty(resolvedValue, propertyName, bw, converter);
				}
				// 存储转换后的属性值，避免每次属性注入时的转换工作
				if (resolvedValue == originalValue) {
					if (convertible) {
						// 设置属性转换之后的值
						pv.setConvertedValue(convertedValue);
					}
					deepCopy.add(pv);
				}
				// 如果：属性是可转换的，且属性原始值是字符串类型，且属性的原始类型值不是  
	            // 动态生成的字符串，且属性的原始值不是集合或者数组类型
				else if (convertible && originalValue instanceof TypedStringValue &&
						!((TypedStringValue) originalValue).isDynamic() &&
						!(convertedValue instanceof Collection || ObjectUtils.isArray(convertedValue))) {
					pv.setConvertedValue(convertedValue);
					deepCopy.add(pv);
				}
				else {
					resolveNecessary = true;
					// 重新封装属性的值
					deepCopy.add(new PropertyValue(pv, convertedValue));
				}
			}
		}
		if (mpvs != null && !resolveNecessary) {
			// 标记属性值已经转换过
			mpvs.setConverted();
		}

		// 进行属性依赖注入
		try {
			/**
			 * ！！！！！！！！！！！！！！！！！！！！！
			 * 完成 bean 的属性值注入的入口
			 * 走 AbstractPropertyAccessor 中的实现方法
			 * ！！！！！！！！！！！！！！！！！！！！！
			 */
			bw.setPropertyValues(new MutablePropertyValues(deepCopy));
		}
		catch (BeansException ex) {
			throw new BeanCreationException(
					mbd.getResourceDescription(), beanName, "Error setting property values", ex);
		}
	}

```

## 7、BeanDefinitionValueResolver 中解析属性值，对注入类型进行转换的具体实现
```java
	// 解析属性值，对注入类型进行转换
	public Object resolveValueIfNecessary(Object argName, Object value) {
		// 对引用类型的属性进行解析，RuntimeBeanReference 是在对
		// BeanDefinition 进行解析时生成的数据对象
		if (value instanceof RuntimeBeanReference) {
			RuntimeBeanReference ref = (RuntimeBeanReference) value;
			/**
			 * ！！！！！！！！！！！！！！！！
			 * 解析引用类型的属性值
			 * ！！！！！！！！！！！！！！！！
			 */
			return resolveReference(argName, ref);
		}
		
		// 对属性值是引用容器中另一个 Bean 名称的解析
		else if (value instanceof RuntimeBeanNameReference) {
			String refName = ((RuntimeBeanNameReference) value).getBeanName();
			refName = String.valueOf(evaluate(refName));
			if (!this.beanFactory.containsBean(refName)) {
				throw new BeanDefinitionStoreException(
						"Invalid bean name '" + refName + "' in bean reference for " + argName);
			}
			return refName;
		}
		// 对 BeanDefinitionHolder 类型属性的解析，主要是 Bean 中的内部类
		else if (value instanceof BeanDefinitionHolder) {
			BeanDefinitionHolder bdHolder = (BeanDefinitionHolder) value;
			return resolveInnerBean(argName, bdHolder.getBeanName(), bdHolder.getBeanDefinition());
		}
		else if (value instanceof BeanDefinition) {
			BeanDefinition bd = (BeanDefinition) value;
			return resolveInnerBean(argName, "(inner bean)", bd);
		}
		// 对集合数组类型的属性解析
		else if (value instanceof ManagedArray) {
			ManagedArray array = (ManagedArray) value;
			// 获取数组的类型
			Class<?> elementType = array.resolvedElementType;
			if (elementType == null) {
				 // 获取数组元素的类型
				String elementTypeName = array.getElementTypeName();
				if (StringUtils.hasText(elementTypeName)) {
					try {
						// 使用反射机制创建指定类型的对象
						elementType = ClassUtils.forName(elementTypeName, this.beanFactory.getBeanClassLoader());
						array.resolvedElementType = elementType;
					}
					catch (Throwable ex) {
						throw new BeanCreationException(
								this.beanDefinition.getResourceDescription(), this.beanName,
								"Error resolving array type for " + argName, ex);
					}
				}
				// 没有获取到数组的类型，也没有获取到数组元素的类型 
	            // 则直接设置数组的类型为 Object
				else {
					elementType = Object.class;
				}
			}
			// 创建指定类型的数组
			return resolveManagedArray(argName, (List<?>) value, elementType);
		}
		// 解析 list 类型的属性值
		else if (value instanceof ManagedList) {
			// May need to resolve contained runtime references.
			return resolveManagedList(argName, (List<?>) value);
		}
		// 解析 set 类型的属性值
		else if (value instanceof ManagedSet) {
			// May need to resolve contained runtime references.
			return resolveManagedSet(argName, (Set<?>) value);
		}
		// 解析 map 类型的属性值
		else if (value instanceof ManagedMap) {
			// May need to resolve contained runtime references.
			return resolveManagedMap(argName, (Map<?, ?>) value);
		}
		// 解析 Properties 类型的属性值，Properties 其实就是 key 和 value 均为字符串的 map
		else if (value instanceof ManagedProperties) {
			Properties original = (Properties) value;
			// 创建一个拷贝，用于作为解析后的返回值
			Properties copy = new Properties();
			for (Map.Entry propEntry : original.entrySet()) {
				Object propKey = propEntry.getKey();
				Object propValue = propEntry.getValue();
				if (propKey instanceof TypedStringValue) {
					propKey = evaluate((TypedStringValue) propKey);
				}
				if (propValue instanceof TypedStringValue) {
					propValue = evaluate((TypedStringValue) propValue);
				}
				copy.put(propKey, propValue);
			}
			return copy;
		}
		// 解析字符串类型的属性值
		else if (value instanceof TypedStringValue) {
			TypedStringValue typedStringValue = (TypedStringValue) value;
			Object valueObject = evaluate(typedStringValue);
			try {
				// 获取属性的目标类型
				Class<?> resolvedTargetType = resolveTargetType(typedStringValue);
				if (resolvedTargetType != null) {
					// 对目标类型的属性进行解析，递归调用
					return this.typeConverter.convertIfNecessary(valueObject, resolvedTargetType);
				}
				// 没有获取到属性的目标对象，则按 Object 类型返回
				else {
					return valueObject;
				}
			}
			catch (Throwable ex) {
				throw new BeanCreationException(
						this.beanDefinition.getResourceDescription(), this.beanName,
						"Error converting typed String value for " + argName, ex);
			}
		}
		else {
			return evaluate(value);
		}
	}

	// 解析引用类型的属性值
	private Object resolveReference(Object argName, RuntimeBeanReference ref) {
		try {
			// 获取引用的 BeanName
			String refName = ref.getBeanName();
			refName = String.valueOf(evaluate(refName));
			// 如果引用的对象在父容器中，则从父容器中获取指定的引用对象
			if (ref.isToParent()) {
				if (this.beanFactory.getParentBeanFactory() == null) {
					throw new BeanCreationException(
							this.beanDefinition.getResourceDescription(), this.beanName,
							"Can't resolve reference to bean '" + refName +
							"' in parent factory: no parent factory available");
				}
				return this.beanFactory.getParentBeanFactory().getBean(refName);
			}
			// 从当前的容器中获取指定的引用 Bean 对象，如果指定的 Bean 没有被实例化  
	        // 则会递归触发引用 Bean 的初始化和依赖注入
			else {
				Object bean = this.beanFactory.getBean(refName);
				// 为 refName 对应的 BeanDefinition 注入依赖的 Bean
				this.beanFactory.registerDependentBean(refName, this.beanName);
				return bean;
			}
		}
		catch (BeansException ex) {
			throw new BeanCreationException(
					this.beanDefinition.getResourceDescription(), this.beanName,
					"Cannot resolve reference to bean '" + ref.getBeanName() + "' while setting " + argName, ex);
		}
	}
	
	// 解析 array 类型的属性
	private Object resolveManagedArray(Object argName, List<?> ml, Class<?> elementType) {
		// 创建一个指定类型的数组，用于存放和返回解析后的数组
		Object resolved = Array.newInstance(elementType, ml.size());
		for (int i = 0; i < ml.size(); i++) {
			// 递归解析 array 的每一个元素，并将解析后的值设置到 resolved 数组中，索引为 i
			Array.set(resolved, i,
					resolveValueIfNecessary(new KeyedArgName(argName, i), ml.get(i)));
		}
		return resolved;
	}

	// 解析 list 类型的属性
	private List resolveManagedList(Object argName, List<?> ml) {
		List<Object> resolved = new ArrayList<Object>(ml.size());
		for (int i = 0; i < ml.size(); i++) {
			// 递归解析 list 的每一个元素
			resolved.add(
					resolveValueIfNecessary(new KeyedArgName(argName, i), ml.get(i)));
		}
		return resolved;
	}

	// 解析 set 类型的属性
	private Set resolveManagedSet(Object argName, Set<?> ms) {
		Set<Object> resolved = new LinkedHashSet<Object>(ms.size());
		int i = 0;
		// 递归解析 set 的每一个元素
		for (Object m : ms) {
			resolved.add(resolveValueIfNecessary(new KeyedArgName(argName, i), m));
			i++;
		}
		return resolved;
	}

	// 解析 map 类型的属性
	private Map resolveManagedMap(Object argName, Map<?, ?> mm) {
		Map<Object, Object> resolved = new LinkedHashMap<Object, Object>(mm.size());
		// 递归解析 map 中每一个元素的 key 和 value
		for (Map.Entry entry : mm.entrySet()) {
			Object resolvedKey = resolveValueIfNecessary(argName, entry.getKey());
			Object resolvedValue = resolveValueIfNecessary(
					new KeyedArgName(argName, entry.getKey()), entry.getValue());
			resolved.put(resolvedKey, resolvedValue);
		}
		return resolved;
	}

```
至此，已经为依赖注入做好了准备，下面就该将 bean 对象设置到它所依赖的另一个 bean 的属性中去。AbstractPropertyAccessor 和其子类 BeanWrapperImpl 完成了依赖注入的详细过程。
## 8、AbstractPropertyAccessor 中的实现
```java
	public void setPropertyValues(PropertyValues pvs) throws BeansException {
		setPropertyValues(pvs, false, false);
	}

	public void setPropertyValues(PropertyValues pvs, boolean ignoreUnknown, boolean ignoreInvalid)
			throws BeansException {

		List<PropertyAccessException> propertyAccessExceptions = null;
		List<PropertyValue> propertyValues = (pvs instanceof MutablePropertyValues ?
				((MutablePropertyValues) pvs).getPropertyValueList() : Arrays.asList(pvs.getPropertyValues()));
		for (PropertyValue pv : propertyValues) {
			try {
				/**
				 * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
				 * 走 BeanWrapperImpl 中的实现，也是 bean 属性值注入具体实现的入口
				 * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
				 */
				setPropertyValue(pv);
			}
			catch (NotWritablePropertyException ex) {
				if (!ignoreUnknown) {
					throw ex;
				}
			}
			catch (NullValueInNestedPathException ex) {
				if (!ignoreInvalid) {
					throw ex;
				}
			}
			catch (PropertyAccessException ex) {
				if (propertyAccessExceptions == null) {
					propertyAccessExceptions = new LinkedList<PropertyAccessException>();
				}
				propertyAccessExceptions.add(ex);
			}
		}

		// 如果遇到个别异常，则抛出复合异常
		if (propertyAccessExceptions != null) {
			PropertyAccessException[] paeArray =
					propertyAccessExceptions.toArray(new PropertyAccessException[propertyAccessExceptions.size()]);
			throw new PropertyBatchUpdateException(paeArray);
		}
	}

```

## 9、BeanWrapperImpl 中的实现
```java
	@Override
	public void setPropertyValue(PropertyValue pv) throws BeansException {
		// PropertyTokenHolder 是一个用于内部使用的内部类
		PropertyTokenHolder tokens = (PropertyTokenHolder) pv.resolvedTokens;
		if (tokens == null) {
			String propertyName = pv.getName();
			BeanWrapperImpl nestedBw;
			try {
				nestedBw = getBeanWrapperForPropertyPath(propertyName);
			}
			catch (NotReadablePropertyException ex) {
				throw new NotWritablePropertyException(getRootClass(), this.nestedPath + propertyName,
						"Nested property in path '" + propertyName + "' does not exist", ex);
			}
			tokens = getPropertyNameTokens(getFinalPath(nestedBw, propertyName));
			if (nestedBw == this) {
				pv.getOriginalPropertyValue().resolvedTokens = tokens;
			}
			
			/**
			 * ！！！！！！！！！！！！！！！
			 * 进入 bean 属性值注入的具体实现
			 * ！！！！！！！！！！！！！！！
			 */
			nestedBw.setPropertyValue(tokens, pv);
		}
		else {
			setPropertyValue(tokens, pv);
		}
	}

	/**
	 * ！！！！！！！！！！！！！！！！
	 * 实现属性值依赖注入的具体实现
	 * ！！！！！！！！！！！！！！！！
	 */
	@SuppressWarnings("unchecked")
	private void setPropertyValue(PropertyTokenHolder tokens, PropertyValue pv) throws BeansException {
		// PropertyTokenHolder 主要保存属性的名称、路径、以及集合的 size 等信息
		String propertyName = tokens.canonicalName;
		String actualName = tokens.actualName;

		// 对集合类型的属性注入
		// keys 是用来保存集合类型属性的 size
		if (tokens.keys != null) {
			// 将属性信息从 tokens 拷贝到 getterTokens
			PropertyTokenHolder getterTokens = new PropertyTokenHolder();
			getterTokens.canonicalName = tokens.canonicalName;
			getterTokens.actualName = tokens.actualName;
			getterTokens.keys = new String[tokens.keys.length - 1];
			System.arraycopy(tokens.keys, 0, getterTokens.keys, 0, tokens.keys.length - 1);
			Object propValue;
			try {
	            // 通过反射机制，调用属性的 getter 方法获取属性值 
				propValue = getPropertyValue(getterTokens);
			}
			catch (NotReadablePropertyException ex) {
				throw new NotWritablePropertyException(getRootClass(), this.nestedPath + propertyName,
						"Cannot access indexed value in property referenced " +
						"in indexed property path '" + propertyName + "'", ex);
			}
			// 获取集合类型属性的长度
			String key = tokens.keys[tokens.keys.length - 1];
			if (propValue == null) {
				if (this.autoGrowNestedPaths) {
					int lastKeyIndex = tokens.canonicalName.lastIndexOf('[');
					getterTokens.canonicalName = tokens.canonicalName.substring(0, lastKeyIndex);
					propValue = setDefaultValue(getterTokens);
				}
				else {
					throw new NullValueInNestedPathException(getRootClass(), this.nestedPath + propertyName,
							"Cannot access indexed value in property referenced " +
							"in indexed property path '" + propertyName + "': returned null");
				}
			}
			// 如果属性值是 Array 数组类型的，则注入 array 类型的属性值
			if (propValue.getClass().isArray()) {
				// 获取属性的描述符
				PropertyDescriptor pd = getCachedIntrospectionResults().getPropertyDescriptor(actualName);
				// 获取数组的类型
				Class requiredType = propValue.getClass().getComponentType();
				// 获取数组的长度
				int arrayIndex = Integer.parseInt(key);
				Object oldValue = null;
				try {
					// 获取数组以前初始化的值
					if (isExtractOldValueForEditor() && arrayIndex < Array.getLength(propValue)) {
						oldValue = Array.get(propValue, arrayIndex);
					}
					// 将属性的值赋值给数组中的元素
					Object convertedValue = convertIfNecessary(propertyName, oldValue, pv.getValue(),
							requiredType, TypeDescriptor.nested(property(pd), tokens.keys.length));
					Array.set(propValue, arrayIndex, convertedValue);
				}
				catch (IndexOutOfBoundsException ex) {
					throw new InvalidPropertyException(getRootClass(), this.nestedPath + propertyName,
							"Invalid array index in property path '" + propertyName + "'", ex);
				}
			}
			// 如果属性值是 List 类型的，则注入 list 类型的属性值
			else if (propValue instanceof List) {
				PropertyDescriptor pd = getCachedIntrospectionResults().getPropertyDescriptor(actualName);
				// 获取 list 集合中元素的类型
				Class requiredType = GenericCollectionTypeResolver.getCollectionReturnType(
						pd.getReadMethod(), tokens.keys.length);
				List list = (List) propValue;
				
				int index = Integer.parseInt(key);
				Object oldValue = null;
				if (isExtractOldValueForEditor() && index < list.size()) {
					oldValue = list.get(index);
				}
				// 获取 list 解析后的属性值
				Object convertedValue = convertIfNecessary(propertyName, oldValue, pv.getValue(),
						requiredType, TypeDescriptor.nested(property(pd), tokens.keys.length));
				// 获取 list 集合的 size
				int size = list.size();
				// 如果 list 的长度大于属性值的长度，则多余的元素赋值为 null 
				if (index >= size && index < this.autoGrowCollectionLimit) {
					for (int i = size; i < index; i++) {
						try {
							list.add(null);
						}
						catch (NullPointerException ex) {
							throw new InvalidPropertyException(getRootClass(), this.nestedPath + propertyName,
									"Cannot set element with index " + index + " in List of size " +
									size + ", accessed using property path '" + propertyName +
									"': List does not support filling up gaps with null elements");
						}
					}
					list.add(convertedValue);
				}
				else {
					try {
						// 为 list 属性赋值
						list.set(index, convertedValue);
					}
					catch (IndexOutOfBoundsException ex) {
						throw new InvalidPropertyException(getRootClass(), this.nestedPath + propertyName,
								"Invalid list index in property path '" + propertyName + "'", ex);
					}
				}
			}
			// 如果属性值是 Map 类型的，则注入 Map 类型的属性值
			else if (propValue instanceof Map) {
				PropertyDescriptor pd = getCachedIntrospectionResults().getPropertyDescriptor(actualName);
				// 获取 map 集合 key 的类型
				Class mapKeyType = GenericCollectionTypeResolver.getMapKeyReturnType(
						pd.getReadMethod(), tokens.keys.length);
				// 获取 map 集合 value 的类型
				Class mapValueType = GenericCollectionTypeResolver.getMapValueReturnType(
						pd.getReadMethod(), tokens.keys.length);
				Map map = (Map) propValue;
				TypeDescriptor typeDescriptor = (mapKeyType != null ?
						TypeDescriptor.valueOf(mapKeyType) : TypeDescriptor.valueOf(Object.class));
				// 解析 map 类型属性 key 值
				Object convertedMapKey = convertIfNecessary(null, null, key, mapKeyType, typeDescriptor);
				Object oldValue = null;
				if (isExtractOldValueForEditor()) {
					oldValue = map.get(convertedMapKey);
				}
				// 解析 map 类型属性 value 值
				Object convertedMapValue = convertIfNecessary(propertyName, oldValue, pv.getValue(),
						mapValueType, TypeDescriptor.nested(property(pd), tokens.keys.length));
				// 将解析后的 key 和 value 值赋值给 map 集合属性
				map.put(convertedMapKey, convertedMapValue);
			}
			else {
				throw new InvalidPropertyException(getRootClass(), this.nestedPath + propertyName,
						"Property referenced in indexed property path '" + propertyName +
						"' is neither an array nor a List nor a Map; returned value was [" + pv.getValue() + "]");
			}
		}
		// 对非集合类型的属性注入
		else {
			PropertyDescriptor pd = pv.resolvedDescriptor;
			if (pd == null || !pd.getWriteMethod().getDeclaringClass().isInstance(this.object)) {
				pd = getCachedIntrospectionResults().getPropertyDescriptor(actualName);
				// 如果无法获取到属性名或者属性没有提供 setter 赋值方法
				if (pd == null || pd.getWriteMethod() == null) {
					// 如果属性值是可选的，即不是必须的，则忽略该属性值
					if (pv.isOptional()) {
						logger.debug("Ignoring optional value for property '" + actualName +
								"' - property not found on bean class [" + getRootClass().getName() + "]");
						return;
					}
					// 如果属性值是必须的，则抛出无法给属性赋值，因为没提供 setter 方法的异常
					else {
						PropertyMatches matches = PropertyMatches.forProperty(propertyName, getRootClass());
						throw new NotWritablePropertyException(
								getRootClass(), this.nestedPath + propertyName,
								matches.buildErrorMessage(), matches.getPossibleMatches());
					}
				}
				pv.getOriginalPropertyValue().resolvedDescriptor = pd;
			}

			Object oldValue = null;
			try {
				Object originalValue = pv.getValue();
				Object valueToApply = originalValue;
				if (!Boolean.FALSE.equals(pv.conversionNecessary)) {
					if (pv.isConverted()) {
						valueToApply = pv.getConvertedValue();
					}
					else {
						if (isExtractOldValueForEditor() && pd.getReadMethod() != null) {
							// 获取属性的 getter 方法
							final Method readMethod = pd.getReadMethod();
							// 如果属性的 getter 方法无法访问，则使用 Java 的反射机制强行访问 (暴力读取属性值) 
							if (!Modifier.isPublic(readMethod.getDeclaringClass().getModifiers()) &&
									!readMethod.isAccessible()) {
								if (System.getSecurityManager()!= null) {
									// 匿名内部类，根据权限修改属性的读取控制限制 
									AccessController.doPrivileged(new PrivilegedAction<Object>() {
										public Object run() {
											readMethod.setAccessible(true);
											return null;
										}
									});
								}
								else {
									readMethod.setAccessible(true);
								}
							}
							try {
								 // 属性没有提供 getter 方法时，调用潜在的读取属性值的方法，获取属性值 
								if (System.getSecurityManager() != null) {
									oldValue = AccessController.doPrivileged(new PrivilegedExceptionAction<Object>() {
										public Object run() throws Exception {
											return readMethod.invoke(object);
										}
									}, acc);
								}
								else {
									oldValue = readMethod.invoke(object);
								}
							}
							catch (Exception ex) {
								if (ex instanceof PrivilegedActionException) {
									ex = ((PrivilegedActionException) ex).getException();
								}
								if (logger.isDebugEnabled()) {
									logger.debug("Could not read previous value of property '" +
											this.nestedPath + propertyName + "'", ex);
								}
							}
						}
						// 设置属性的注入值
						valueToApply = convertForProperty(propertyName, oldValue, originalValue, pd);
					}
					pv.getOriginalPropertyValue().conversionNecessary = (valueToApply != originalValue);
				}
				// 根据 Java 的内省机制，获取属性的 setter(写方法) 方法
				final Method writeMethod = (pd instanceof GenericTypeAwarePropertyDescriptor ?
						((GenericTypeAwarePropertyDescriptor) pd).getWriteMethodForActualAccess() :
						pd.getWriteMethod());
				// 如果属性的 setter 方法无法访问，则强行设置 setter 方法可访问 (暴力为属性赋值)  
				if (!Modifier.isPublic(writeMethod.getDeclaringClass().getModifiers()) && !writeMethod.isAccessible()) {
					if (System.getSecurityManager()!= null) {
						AccessController.doPrivileged(new PrivilegedAction<Object>() {
							public Object run() {
								writeMethod.setAccessible(true);
								return null;
							}
						});
					}
					else {
						writeMethod.setAccessible(true);
					}
				}
				final Object value = valueToApply;
				 // 如果使用了 Java 的安全机制，则需要权限验证 
				if (System.getSecurityManager() != null) {
					try {
						AccessController.doPrivileged(new PrivilegedExceptionAction<Object>() {
							public Object run() throws Exception {
								// 将属性值设置到属性上去 
								writeMethod.invoke(object, value);
								return null;
							}
						}, acc);
					}
					catch (PrivilegedActionException ex) {
						throw ex.getException();
					}
				}
				else {
					// 将属性值设置到属性上去 
					writeMethod.invoke(this.object, value);
				}
			}
			catch (TypeMismatchException ex) {
				throw ex;
			}
			catch (InvocationTargetException ex) {
				PropertyChangeEvent propertyChangeEvent =
						new PropertyChangeEvent(this.rootObject, this.nestedPath + propertyName, oldValue, pv.getValue());
				if (ex.getTargetException() instanceof ClassCastException) {
					throw new TypeMismatchException(propertyChangeEvent, pd.getPropertyType(), ex.getTargetException());
				}
				else {
					throw new MethodInvocationException(propertyChangeEvent, ex.getTargetException());
				}
			}
			catch (Exception ex) {
				PropertyChangeEvent pce =
						new PropertyChangeEvent(this.rootObject, this.nestedPath + propertyName, oldValue, pv.getValue());
				throw new MethodInvocationException(pce, ex);
			}
		}
	}

```
终于完成了对 bean 的各种属性的依赖注入，在 bean 的实例化和依赖注入的过程中，需要依据 BeanDefinition 中的信息来递归地完成依赖注入。另外，在此过程中存在许多递归调用，一个递归是在上下文体系中查找需要的 bean 和创建 bean 的递归调用；另一个是在依赖注入时，通过递归调用容器的 getBean 方法，得到当前 bean 的依赖 bean，同时也触发对依赖 bean 的创建和注入；在对 bean 的属性进行依赖注入时，解析的过程也是递归的。这样，根据依赖关系，一层一层地完成 bean 的创建和注入，直到最后完成当前 bean 的创建。

## 最后补充一下通过 lazy-init 属性触发的依赖注入
lazy-init 触发的预实例化和依赖注入，发生在 IoC 容器完成对 BeanDefinition 的定位、载入、解析和注册之后。虽然会影响 IoC 容器初始化的性能，但确能有效提高应用第一次获取该 bean 的效率。
	lazy-init 实现的入口方法在我们前面解读过的 AbstractApplicationContext 的 refresh() 中，它是 IoC 容器正式启动的标志。
```java
	/**
	 * 容器初始化的过程：BeanDefinition 的 Resource 定位、BeanDefinition 的载入、BeanDefinition 的注册。
	 * BeanDefinition 的载入和 bean 的依赖注入是两个独立的过程，依赖注入一般发生在 应用第一次通过 getBean() 方法从容器获取 bean 时。
	 * 
	 * 另外需要注意的是，IoC 容器有一个预实例化的配置（即，将 AbstractBeanDefinition 中的 lazyInit 属性设为 true），使用户可以对容器的初始化
	 * 过程做一个微小的调控，lazyInit 设为 true 的 bean 将在容器初始化时进行依赖注入，而不会等到 getBean() 方法调用时才进行
	 */
	public void refresh() throws BeansException, IllegalStateException {
		synchronized (this.startupShutdownMonitor) {
			// 调用容器准备刷新的方法，获取容器的当前时间，同时给容器设置同步标识
			prepareRefresh();

			// 告诉子类启动 refreshBeanFactory() 方法，Bean 定义资源文件的载入从子类的 refreshBeanFactory() 方法启动开始
			ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();

			// 为 BeanFactory 配置容器特性，例如类加载器、事件处理器等
			prepareBeanFactory(beanFactory);

			try {
				// 为容器的某些子类指定特殊的 BeanPost 事件处理器
				postProcessBeanFactory(beanFactory);

				// 调用所有注册的 BeanFactoryPostProcessor 的 Bean
				invokeBeanFactoryPostProcessors(beanFactory);

				// 为 BeanFactory 注册 BeanPost 事件处理器.  
		        // BeanPostProcessor 是 Bean 后置处理器，用于监听容器触发的事件 
				registerBeanPostProcessors(beanFactory);

				// 初始化信息源，和国际化相关.
				initMessageSource();

				// 初始化容器事件传播器
				initApplicationEventMulticaster();

				// 调用子类的某些特殊 Bean 初始化方法
				onRefresh();

				// 为事件传播器注册事件监听器.
				registerListeners();

				/**
				 * ！！！！！！！！！！！！！！！！！！！！！
				 * 初始化 Bean，并对 lazy-init 属性进行处理
				 * ！！！！！！！！！！！！！！！！！！！！！
				 */
				finishBeanFactoryInitialization(beanFactory);

				// 初始化容器的生命周期事件处理器，并发布容器的生命周期事件
				finishRefresh();
			}

			catch (BeansException ex) {
				// 销毁以创建的单态 Bean
				destroyBeans();

				// 取消 refresh 操作，重置容器的同步标识.
				cancelRefresh(ex);

				throw ex;
			}
		}
	}

	// 对配置了 lazy-init 属性的 Bean 进行预实例化处理 
	protected void finishBeanFactoryInitialization(ConfigurableListableBeanFactory beanFactory) {
		// 这是 Spring3 以后新加的代码，为容器指定一个转换服务 (ConversionService)  
	    // 在对某些 Bean 属性进行转换时使用  
		if (beanFactory.containsBean(CONVERSION_SERVICE_BEAN_NAME) &&
				beanFactory.isTypeMatch(CONVERSION_SERVICE_BEAN_NAME, ConversionService.class)) {
			beanFactory.setConversionService(
					/**
					 * ！！！！！！！！！！！！！！！！！！！！
					 * 在这里调用了 getBean() 方法，触发依赖注入
					 * ！！！！！！！！！！！！！！！！！！！！
					 */
					beanFactory.getBean(CONVERSION_SERVICE_BEAN_NAME, ConversionService.class));
		}

		String[] weaverAwareNames = beanFactory.getBeanNamesForType(LoadTimeWeaverAware.class, false, false);
		for (String weaverAwareName : weaverAwareNames) {
			getBean(weaverAwareName);
		}

		// 为了类型匹配，停止使用临时的类加载器  
		beanFactory.setTempClassLoader(null);

		// 缓存容器中所有注册的 BeanDefinition 元数据，以防被修改
		beanFactory.freezeConfiguration();

		// 对配置了 lazy-init 属性的单态模式 Bean 进行预实例化处理
		beanFactory.preInstantiateSingletons();
	}

```
