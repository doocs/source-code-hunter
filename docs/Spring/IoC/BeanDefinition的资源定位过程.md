## 前言
之前一直想系统的拜读一下spring的源码，看看它到底是如何吸引身边的大神们对它的设计赞不绝口，虽然每天工作很忙，每天下班后总感觉脑子内存溢出，想去放松一下，但总是以此为借口，恐怕会一直拖下去。所以每天下班虽然有些疲惫，但还是按住自己啃下这块硬骨头。
spring源码这种东西真的是一回生二回熟，第一遍会被各种设计模式和繁杂的方法调用搞得晕头转向，不知道这个方法调用的是哪个父类的实现，另一个方法又调的是哪个子类的实现，但当你耐下心来多走几遍，会发现越看越熟练，每次都能get到新的点。
另外，对于第一次看spring源码的同学，建议先在B站上搜索相关视频看一下，然后再结合计文柯老师的《spring技术内幕》深入理解，最后再输出自己的理解加强印象。
首先对于我们新手来说，还是从我们最常用的两个IoC容器开始分析，这次我们先分析FileSystemXmlApplicationContext这个IoC容器的具体实现，ClassPathXmlApplicationContext留着下次讲解。
（PS：可以结合我GitHub上对spring框架源码的翻译注解一起看，会更有助于各位开发姥爷的理解。
地址：
spring-beans	 https://github.com/AmyliaY/spring-beans-reading
spring-context   https://github.com/AmyliaY/spring-context-reading
）
## FileSystemXmlApplicationContext的构造方法
当我们传入一个spring配置文件去实例化FileSystemXmlApplicationContext()时，可以看一下它的构造方法都做了什么。
```java
	/**
	 * 下面这4个构造方法都调用了第5个构造方法
	 * @param configLocation
	 * @throws BeansException
	 */
	
	// configLocation包含了BeanDefinition所在的文件路径
	public FileSystemXmlApplicationContext(String configLocation) throws BeansException {
		this(new String[] {configLocation}, true, null);
	}

	// 可以定义多个BeanDefinition所在的文件路径
	public FileSystemXmlApplicationContext(String... configLocations) throws BeansException {
		this(configLocations, true, null);
	}

	// 在定义多个BeanDefinition所在的文件路径 的同时，还能指定自己的双亲IoC容器
	public FileSystemXmlApplicationContext(String[] configLocations, ApplicationContext parent) throws BeansException {
		this(configLocations, true, parent);
	}

	public FileSystemXmlApplicationContext(String[] configLocations, boolean refresh) throws BeansException {
		this(configLocations, refresh, null);
	}

	/**
	 * 如果应用直接使用FileSystemXmlApplicationContext进行实例化，则都会进到这个构造方法中来
	 * @param configLocations
	 * @param refresh
	 * @param parent
	 * @throws BeansException
	 */
	public FileSystemXmlApplicationContext(String[] configLocations, boolean refresh, ApplicationContext parent)
			throws BeansException {

		//动态地确定用哪个加载器去加载我们的配置文件
		super(parent);
		//告诉读取器 配置文件放在哪里，该方法继承于爷类AbstractRefreshableApplicationContext
		setConfigLocations(configLocations);
		if (refresh) {
			//容器初始化
			refresh();
		}
	}


	/**
	 * 实例化一个FileSystemResource并返回，以便后续对资源的IO操作
	 * 本方法是在其父类DefaultResourceLoader的getResource方法中被调用的，
	 */
	@Override
	protected Resource getResourceByPath(String path) {
		if (path != null && path.startsWith("/")) {
			path = path.substring(1);
		}
		return new FileSystemResource(path);
	}
```
## 看看其父类AbstractApplicationContext实现的refresh()方法，该方法就是IoC容器初始化的入口类
```java
	/**
	 * 容器初始化的过程：BeanDefinition的Resource定位、BeanDefinition的载入、BeanDefinition的注册。
	 * BeanDefinition的载入和bean的依赖注入是两个独立的过程，依赖注入一般发生在 应用第一次通过getBean()方法从容器获取bean时。
	 * 
	 * 另外需要注意的是，IoC容器有一个预实例化的配置（即，将AbstractBeanDefinition中的lazyInit属性设为true），使用户可以对容器的初始化
	 * 过程做一个微小的调控，lazyInit设为false的bean将在容器初始化时进行依赖注入，而不会等到getBean()方法调用时才进行
	 */
	public void refresh() throws BeansException, IllegalStateException {
		synchronized (this.startupShutdownMonitor) {
			// 调用容器准备刷新的方法，获取容器的当前时间，同时给容器设置同步标识
			prepareRefresh();

			// 告诉子类启动refreshBeanFactory()方法，Bean定义资源文件的载入从子类的refreshBeanFactory()方法启动开始
			ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();

			// 为BeanFactory配置容器特性，例如类加载器、事件处理器等
			prepareBeanFactory(beanFactory);

			try {
				// 为容器的某些子类指定特殊的BeanPost事件处理器
				postProcessBeanFactory(beanFactory);

				// 调用所有注册的BeanFactoryPostProcessor的Bean
				invokeBeanFactoryPostProcessors(beanFactory);

				// 为BeanFactory注册BeanPost事件处理器.  
		        // BeanPostProcessor是Bean后置处理器，用于监听容器触发的事件 
				registerBeanPostProcessors(beanFactory);

				// 初始化信息源，和国际化相关.
				initMessageSource();

				// 初始化容器事件传播器
				initApplicationEventMulticaster();

				// 调用子类的某些特殊Bean初始化方法
				onRefresh();

				// 为事件传播器注册事件监听器.
				registerListeners();

				// 初始化Bean，并对lazy-init属性进行处理
				finishBeanFactoryInitialization(beanFactory);

				// 初始化容器的生命周期事件处理器，并发布容器的生命周期事件
				finishRefresh();
			}

			catch (BeansException ex) {
				// 销毁以创建的单态Bean
				destroyBeans();

				// 取消refresh操作，重置容器的同步标识.
				cancelRefresh(ex);

				throw ex;
			}
		}
	}
```
## 看看obtainFreshBeanFactory方法，该方法告诉了子类去刷新内部的beanFactory
```java
	/**
	 * Tell the subclass to refresh the internal bean factory.
	 * 告诉子类去刷新内部的beanFactory
	 */
	protected ConfigurableListableBeanFactory obtainFreshBeanFactory() {
		// 自己定义了抽象的refreshBeanFactory()方法，具体实现交给了自己的子类
		refreshBeanFactory();
		// getBeanFactory()也是一个抽象方法，委派给子类实现
		ConfigurableListableBeanFactory beanFactory = getBeanFactory();
		if (logger.isDebugEnabled()) {
			logger.debug("Bean factory for " + getDisplayName() + ": " + beanFactory);
		}
		return beanFactory;
	}
```
## AbstractRefreshableApplicationContext中对refreshBeanFactory()方法的实现
FileSystemXmlApplicationContext从上层体系的各抽象类中继承了大量的方法实现，抽象类中抽取大量公共行为进行具体实现，留下abstract的个性化方法交给具体的子类实现，这是一个很好的OOP编程设计，我们在自己编码时也可以尝试这样设计自己的类图。理清FileSystemXmlApplicationContext的上层体系设计，就不易被各种设计模式搞晕咯。
```java
	// 在这里完成了容器的初始化，并赋值给自己private的beanFactory属性，为下一步调用做准备
	// 从父类AbstractApplicationContext继承的抽象方法，自己做了实现
	@Override
	protected final void refreshBeanFactory() throws BeansException {
		// 如果已经建立了IoC容器，则销毁并关闭容器
		if (hasBeanFactory()) {
			destroyBeans();
			closeBeanFactory();
		}
		try {
			// 创建IoC容器，DefaultListableBeanFactory类实现了ConfigurableListableBeanFactory接口
			DefaultListableBeanFactory beanFactory = createBeanFactory();
			beanFactory.setSerializationId(getId());
			// 对IoC容器进行定制化，如设置启动参数，开启注解的自动装配等
			customizeBeanFactory(beanFactory);
			// 载入BeanDefinition，在当前类中只定义了抽象的loadBeanDefinitions方法，具体实现 调用子类容器
			loadBeanDefinitions(beanFactory);
			synchronized (this.beanFactoryMonitor) {
				// 给自己的属性赋值
				this.beanFactory = beanFactory;
			}
		}
		catch (IOException ex) {
			throw new ApplicationContextException("I/O error parsing bean definition source for " + getDisplayName(), ex);
		}
	}
```
## AbstractXmlApplicationContext中对loadBeanDefinitions(DefaultListableBeanFactory beanFactory)的实现
```java
	/*
	 * 实现了爷类AbstractRefreshableApplicationContext的抽象方法
	 */
	@Override
	protected void loadBeanDefinitions(DefaultListableBeanFactory beanFactory) throws BeansException, IOException {
		// DefaultListableBeanFactory实现了BeanDefinitionRegistry接口，在初始化XmlBeanDefinitionReader时
		// 将BeanDefinition注册器注入该BeanDefinition读取器
		// 创建 用于从Xml中读取BeanDefinition的读取器，并通过回调设置到IoC容器中去，容器使用该读取器读取BeanDefinition资源
		XmlBeanDefinitionReader beanDefinitionReader = new XmlBeanDefinitionReader(beanFactory);

		beanDefinitionReader.setEnvironment(this.getEnvironment());
		// 为beanDefinition读取器设置 资源加载器，由于本类的基类AbstractApplicationContext
		// 继承了DefaultResourceLoader，因此，本容器自身也是一个资源加载器
		beanDefinitionReader.setResourceLoader(this);
		// 设置SAX解析器，SAX（simple API for XML）是另一种XML解析方法。相比于DOM，SAX速度更快，占用内存更小。
		// 它逐行扫描文档，一边扫描一边解析。相比于先将整个XML文件扫描近内存，再进行解析的DOM，SAX可以在解析文档的任意时刻停止解析，但操作也比DOM复杂。
		beanDefinitionReader.setEntityResolver(new ResourceEntityResolver(this));

		// 初始化beanDefinition读取器，该方法同时启用了Xml的校验机制
		initBeanDefinitionReader(beanDefinitionReader);
		// Bean读取器真正实现加载的方法
		loadBeanDefinitions(beanDefinitionReader);
	}
```
## 继续看AbstractXmlApplicationContext中loadBeanDefinitions的重载方法
```java
	// 用传进来的XmlBeanDefinitionReader读取器加载Xml文件中的BeanDefinition
	protected void loadBeanDefinitions(XmlBeanDefinitionReader reader) throws BeansException, IOException {
		
		/**
		 * ClassPathXmlApplicationContext与FileSystemXmlApplicationContext
		 * 在这里的调用出现分歧，各自按不同的方式加载解析Resource资源
		 * 最后在具体的解析和BeanDefinition定位上又会殊途同归
		 */
		// 获取存放了BeanDefinition的所有Resource，
		// FileSystemXmlApplicationContext类未对getConfigResources()进行重新，
		// 所以调用父类的，return null。
		// 而ClassPathXmlApplicationContext对该方法进行了重写，返回设置的值
		Resource[] configResources = getConfigResources();
		if (configResources != null) {
			// Xml Bean读取器调用其父类AbstractBeanDefinitionReader读取定位的Bean定义资源
			reader.loadBeanDefinitions(configResources);
		}
		// 调用父类AbstractRefreshableConfigApplicationContext实现的返回值为String[]的getConfigLocations()方法，
		// 优先返回FileSystemXmlApplicationContext构造方法中调用setConfigLocations()方法设置的资源
		String[] configLocations = getConfigLocations();
		if (configLocations != null) {
			// XmlBeanDefinitionReader读取器调用其父类AbstractBeanDefinitionReader的方法从配置位置加载BeanDefinition
			reader.loadBeanDefinitions(configLocations);
		}
	}
```
## AbstractBeanDefinitionReader中对loadBeanDefinitions方法的各种重载及调用
```java
    // loadBeanDefinitions()方法的重载方法之一，调用了另一个重载方法loadBeanDefinitions(String)
	public int loadBeanDefinitions(String... locations) throws BeanDefinitionStoreException {
		Assert.notNull(locations, "Location array must not be null");
		// 计数 加载了多少个配置文件
		int counter = 0;
		for (String location : locations) {
			counter += loadBeanDefinitions(location);
		}
		return counter;
	}

	// 重载方法之一，调用了下面的loadBeanDefinitions(String, Set<Resource>)方法 
	public int loadBeanDefinitions(String location) throws BeanDefinitionStoreException {
		return loadBeanDefinitions(location, null);
	}

	// 获取在IoC容器初始化过程中设置的资源加载器
	public int loadBeanDefinitions(String location, Set<Resource> actualResources) throws BeanDefinitionStoreException {
		// 在实例化XmlBeanDefinitionReader后IoC容器将自己注入进该读取器作为resourceLoader属性
		ResourceLoader resourceLoader = getResourceLoader();
		if (resourceLoader == null) {
			throw new BeanDefinitionStoreException(
					"Cannot import bean definitions from location [" + location + "]: no ResourceLoader available");
		}

		if (resourceLoader instanceof ResourcePatternResolver) {
			try {
				// 将指定位置的BeanDefinition资源文件解析为IoC容器封装的资源  
	            // 加载多个指定位置的BeanDefinition资源文件  
				Resource[] resources = ((ResourcePatternResolver) resourceLoader).getResources(location);
				// 委派调用其子类XmlBeanDefinitionReader的方法，实现加载功能 
				int loadCount = loadBeanDefinitions(resources);
				if (actualResources != null) {
					for (Resource resource : resources) {
						actualResources.add(resource);
					}
				}
				if (logger.isDebugEnabled()) {
					logger.debug("Loaded " + loadCount + " bean definitions from location pattern [" + location + "]");
				}
				return loadCount;
			}
			catch (IOException ex) {
				throw new BeanDefinitionStoreException(
						"Could not resolve bean definition resource pattern [" + location + "]", ex);
			}
		}
		else {
			/**
			 * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
			 * AbstractApplicationContext继承了DefaultResourceLoader，所以AbstractApplicationContext
			 * 及其子类都会调用DefaultResourceLoader中的实现，将指定位置的资源文件解析为Resource，
			 * 至此完成了对BeanDefinition的资源定位
			 * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
			 */
			Resource resource = resourceLoader.getResource(location);
			// 从resource中加载BeanDefinition，loadCount为加载的BeanDefinition个数
			// 该loadBeanDefinitions()方法来自其implements的BeanDefinitionReader接口，
			// 且本类是一个抽象类，并未对该方法进行实现。而是交由子类进行实现，如果是用xml文件进行
			// IoC容器初始化的，则调用XmlBeanDefinitionReader中的实现
			int loadCount = loadBeanDefinitions(resource);
			if (actualResources != null) {
				actualResources.add(resource);
			}
			if (logger.isDebugEnabled()) {
				logger.debug("Loaded " + loadCount + " bean definitions from location [" + location + "]");
			}
			return loadCount;
		}
	}
```
## resourceLoader的getResource()方法有多种实现，看清FileSystemXmlApplicationContext的继承体系就可以明确，其走的是DefaultResourceLoader中的实现
```java
	// 获取Resource的具体实现方法
	public Resource getResource(String location) {
		Assert.notNull(location, "Location must not be null");
		// 如果location是类路径的方式，返回ClassPathResource类型的文件资源对象
		if (location.startsWith(CLASSPATH_URL_PREFIX)) {
			return new ClassPathResource(location.substring(CLASSPATH_URL_PREFIX.length()), getClassLoader());
		}
		else {
			try {
				// 如果是URL方式，返回UrlResource类型的文件资源对象，
				// 否则将抛出的异常进入catch代码块，返回另一种资源对象
				URL url = new URL(location);
				return new UrlResource(url);
			}
			catch (MalformedURLException ex) {
				// 如果既不是classpath标识，又不是URL标识的Resource定位，则调用  
		        // 容器本身的getResourceByPath方法获取Resource 
				// 根据实例化的子类对象，调用其子类对象中重写的此方法，
				// 如FileSystemXmlApplicationContext子类中对此方法的重新
				return getResourceByPath(location);
			}
		}
	}
```
## 其中的getResourceByPath(location)方法的实现则是在FileSystemXmlApplicationContext中完成的
```java
	/**
	 * 实例化一个FileSystemResource并返回，以便后续对资源的IO操作
	 * 本方法是在DefaultResourceLoader的getResource方法中被调用的，
	 */
	@Override
	protected Resource getResourceByPath(String path) {
		if (path != null && path.startsWith("/")) {
			path = path.substring(1);
		}
		return new FileSystemResource(path);
	}
```
至此，我们可以看到，FileSystemXmlApplicationContext的getResourceByPath()方法返回了一个FileSystemResource对象，接下来spring就可以对这个对象进行相关的I/O操作，进行BeanDefinition的读取和载入了。



