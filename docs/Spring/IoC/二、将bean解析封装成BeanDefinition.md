接着上一篇的BeanDefinition资源定位开始讲。Spring IoC容器BeanDefinition解析过程就是把用户在配置文件中定义好的bean，解析并封装成容器可以装载的BeanDefinition，BeanDefinition是spring定义的基本数据结构，也是为了方便对bean进行管理和操作。
（PS：可以结合我GitHub上对spring框架源码的阅读及个人理解一起看，会更有助于各位开发大佬理解。
spring-beans	 https://github.com/AmyliaY/spring-beans-reading
spring-context  https://github.com/AmyliaY/spring-context-reading
）
## 1、先看一下AbstractRefreshableApplicationContext中refreshBeanFactory()方法的loadBeanDefinitions(beanFactory)

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
			// 载入BeanDefinition，当前类中只定义了抽象的loadBeanDefinitions方法，具体的实现调用子类容器
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
## 2、实现类AbstractXmlApplicationContext中的loadBeanDefinitions(DefaultListableBeanFactory beanFactory)
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
		// 为beanDefinition读取器设置 资源加载器，由于本类的太爷爷类AbstractApplicationContext
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
## 3、loadBeanDefinitions(XmlBeanDefinitionReader reader)
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
## 4、AbstractBeanDefinitionReader对loadBeanDefinitions()方法的三重重载
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
## 5、XmlBeanDefinitionReader读取器中的方法执行流，按代码的先后顺序
```java
	// XmlBeanDefinitionReader加载资源的入口方法
	public int loadBeanDefinitions(Resource resource) throws BeanDefinitionStoreException {
		// 调用本类的重载方法，通过new EncodedResource(resource)获得的
		// EncodedResource对象能够将资源与读取资源所需的编码组合在一起
		return loadBeanDefinitions(new EncodedResource(resource));
	}

	// 通过encodedResource进行资源解析，encodedResource对象持有resource对象和encoding编码格式
	public int loadBeanDefinitions(EncodedResource encodedResource) throws BeanDefinitionStoreException {
		Assert.notNull(encodedResource, "EncodedResource must not be null");
		if (logger.isInfoEnabled()) {
			logger.info("Loading XML bean definitions from " + encodedResource.getResource());
		}

		Set<EncodedResource> currentResources = this.resourcesCurrentlyBeingLoaded.get();
		if (currentResources == null) {
			currentResources = new HashSet<EncodedResource>(4);
			this.resourcesCurrentlyBeingLoaded.set(currentResources);
		}
		if (!currentResources.add(encodedResource)) {
			throw new BeanDefinitionStoreException(
					"Detected cyclic loading of " + encodedResource + " - check your import definitions!");
		}
		try {
			// 从resource中获取输入流，对resource中的内容进行读取
			InputStream inputStream = encodedResource.getResource().getInputStream();
			try {
				// 实例化一个"XML实体的单个输入源"，将inputStream作为自己的属性
				InputSource inputSource = new InputSource(inputStream);
				// 如果encodedResource中的encoding属性不为空，就为inputSource设置读取XML的编码格式
				if (encodedResource.getEncoding() != null) {
					inputSource.setEncoding(encodedResource.getEncoding());
				}
				// 这里是具体的读取过程
				return doLoadBeanDefinitions(inputSource, encodedResource.getResource());
			}
			finally {
				// 关闭从Resource中得到的IO流
				inputStream.close();
			}
		}
		catch (IOException ex) {
			throw new BeanDefinitionStoreException(
					"IOException parsing XML document from " + encodedResource.getResource(), ex);
		}
		finally {
			currentResources.remove(encodedResource);
			if (currentResources.isEmpty()) {
				this.resourcesCurrentlyBeingLoaded.remove();
			}
		}
	}

	// 从指定XML文件中实际载入BeanDefinition资源的方法
	protected int doLoadBeanDefinitions(InputSource inputSource, Resource resource)
			throws BeanDefinitionStoreException {
		try {
			int validationMode = getValidationModeForResource(resource);
			// 通过documentLoader获取XML文件的Document对象
			Document doc = this.documentLoader.loadDocument(
					inputSource, getEntityResolver(), this.errorHandler, validationMode, isNamespaceAware());
			// 启动对BeanDefinition的详细解析过程，该解析过程会用到Spring的Bean配置规则
			return registerBeanDefinitions(doc, resource);
		}
		catch (BeanDefinitionStoreException ex) {
			throw ex;
		}
		catch (SAXParseException ex) {
			throw new XmlBeanDefinitionStoreException(resource.getDescription(),
					"Line " + ex.getLineNumber() + " in XML document from " + resource + " is invalid", ex);
		}
		catch (SAXException ex) {
			throw new XmlBeanDefinitionStoreException(resource.getDescription(),
					"XML document from " + resource + " is invalid", ex);
		}
		catch (ParserConfigurationException ex) {
			throw new BeanDefinitionStoreException(resource.getDescription(),
					"Parser configuration exception parsing XML from " + resource, ex);
		}
		catch (IOException ex) {
			throw new BeanDefinitionStoreException(resource.getDescription(),
					"IOException parsing XML document from " + resource, ex);
		}
		catch (Throwable ex) {
			throw new BeanDefinitionStoreException(resource.getDescription(),
					"Unexpected exception parsing XML document from " + resource, ex);
		}
	}

	// 按照Spring的Bean语义要求将BeanDefinition资源解析并转换为容器内部数据结构
	public int registerBeanDefinitions(Document doc, Resource resource) throws BeanDefinitionStoreException {
		// 得到BeanDefinitionDocumentReader来对xml格式的BeanDefinition解析
		BeanDefinitionDocumentReader documentReader = createBeanDefinitionDocumentReader();
		documentReader.setEnvironment(this.getEnvironment());
		// 获得容器中注册的Bean数量
		int countBefore = getRegistry().getBeanDefinitionCount();
		// 解析过程入口，这里使用了委派模式，BeanDefinitionDocumentReader只是个接口，
		// 具体的解析实现过程由实现类DefaultBeanDefinitionDocumentReader完成
		documentReader.registerBeanDefinitions(doc, createReaderContext(resource));
		// 统计解析的Bean数量
		return getRegistry().getBeanDefinitionCount() - countBefore;
	}
```
## 6、文档解析器DefaultBeanDefinitionDocumentReader对配置文件中元素的解析
```java
	// 根据Spring对Bean的定义规则进行解析
	public void registerBeanDefinitions(Document doc, XmlReaderContext readerContext) {
		// 获得XML描述符
		this.readerContext = readerContext;
		logger.debug("Loading bean definitions");
		// 获得Document的根元素
		Element root = doc.getDocumentElement();
		// 解析的具体实现
		doRegisterBeanDefinitions(root);
	}


	/**
	 * Register each bean definition within the given root {@code <beans/>} element.
	 * 依次注册BeanDefinition，使用给定的根元素
	 */
	protected void doRegisterBeanDefinitions(Element root) {
		String profileSpec = root.getAttribute(PROFILE_ATTRIBUTE);
		if (StringUtils.hasText(profileSpec)) {
			Assert.state(this.environment != null, "Environment must be set for evaluating profiles");
			String[] specifiedProfiles = StringUtils.tokenizeToStringArray(
					profileSpec, BeanDefinitionParserDelegate.MULTI_VALUE_ATTRIBUTE_DELIMITERS);
			if (!this.environment.acceptsProfiles(specifiedProfiles)) {
				return;
			}
		}

		// 具体的解析过程由BeanDefinitionParserDelegate实现，  
	    // BeanDefinitionParserDelegate中定义了Spring Bean定义XML文件的各种元素 
		BeanDefinitionParserDelegate parent = this.delegate;
		this.delegate = createDelegate(this.readerContext, root, parent);

		
		// 在解析BeanDefinition之前，进行自定义的解析，增强解析过程的可扩展性
		preProcessXml(root);
		// 从Document的根元素开始进行Bean定义的Document对象
		parseBeanDefinitions(root, this.delegate);
		// 在解析Bean定义之后，进行自定义的解析，增加解析过程的可扩展性
		postProcessXml(root);

		this.delegate = parent;
	}
	
	// 使用Spring的Bean规则从Document的根元素开始进行Bean	Definition的解析
	protected void parseBeanDefinitions(Element root, BeanDefinitionParserDelegate delegate) {
		// Bean定义的Document对象是否使用了Spring默认的XML命名空间
		if (delegate.isDefaultNamespace(root)) {
			// 获取root根元素的所有子节点
			NodeList nl = root.getChildNodes();
			for (int i = 0; i < nl.getLength(); i++) {
				Node node = nl.item(i);
				if (node instanceof Element) {
					Element ele = (Element) node;
					// 如果ele定义的Document的元素节点使用的是Spring默认的XML命名空间 
					if (delegate.isDefaultNamespace(ele)) {
						// 使用Spring的Bean规则解析元素节点
						parseDefaultElement(ele, delegate);
					}
					else {
						// 没有使用Spring默认的XML命名空间，则使用用户自定义的解
						// 析规则解析元素节点
						delegate.parseCustomElement(ele);
					}
				}
			}
		}
		else {
			// Document的根节点没有使用Spring默认的命名空间，则使用用户自定义的  
		    // 解析规则解析Document根节点
			delegate.parseCustomElement(root);
		}
	}

	// 使用Spring的Bean规则解析Document元素节点
	private void parseDefaultElement(Element ele, BeanDefinitionParserDelegate delegate) {
		// 如果元素节点是<Import>导入元素，进行导入解析
		if (delegate.nodeNameEquals(ele, IMPORT_ELEMENT)) {
			importBeanDefinitionResource(ele);
		}
		// 如果元素节点是<Alias>别名元素，进行别名解析
		else if (delegate.nodeNameEquals(ele, ALIAS_ELEMENT)) {
			processAliasRegistration(ele);
		}
		// 元素节点既不是导入元素，也不是别名元素，即普通的<Bean>元素，  
		// 按照Spring的Bean规则解析元素
		else if (delegate.nodeNameEquals(ele, BEAN_ELEMENT)) {
			processBeanDefinition(ele, delegate);
		}
		// 如果被解析的元素是beans，则递归调用doRegisterBeanDefinitions(Element root)方法
		else if (delegate.nodeNameEquals(ele, NESTED_BEANS_ELEMENT)) {
			doRegisterBeanDefinitions(ele);
		}
	}

	
	// 解析<Import>导入元素，从给定的导入路径加载Bean定义资源到Spring IoC容器中
	protected void importBeanDefinitionResource(Element ele) {
		// 获取给定的导入元素的location属性
		String location = ele.getAttribute(RESOURCE_ATTRIBUTE);
		// 如果导入元素的location属性值为空，则没有导入任何资源，直接返回
		if (!StringUtils.hasText(location)) {
			getReaderContext().error("Resource location must not be empty", ele);
			return;
		}

		// 使用系统变量值解析location属性值
		location = environment.resolveRequiredPlaceholders(location);

		Set<Resource> actualResources = new LinkedHashSet<Resource>(4);

		// 标识给定的导入元素的location是否是绝对路径
		boolean absoluteLocation = false;
		try {
			absoluteLocation = ResourcePatternUtils.isUrl(location) || ResourceUtils.toURI(location).isAbsolute();
		}
		catch (URISyntaxException ex) {
			// 给定的导入元素的location不是绝对路径
		}

		// 给定的导入元素的location是绝对路径
		if (absoluteLocation) {
			try {
				// 使用资源读入器加载给定路径的Bean定义资源
				int importCount = getReaderContext().getReader().loadBeanDefinitions(location, actualResources);
				if (logger.isDebugEnabled()) {
					logger.debug("Imported " + importCount + " bean definitions from URL location [" + location + "]");
				}
			} 
			catch (BeanDefinitionStoreException ex) {
				getReaderContext().error(
						"Failed to import bean definitions from URL location [" + location + "]", ele, ex);
			}
		}
		else {
			// 给定的导入元素的location是相对路径
			try {
				int importCount;
				// 将给定导入元素的location封装为相对路径资源
				Resource relativeResource = getReaderContext().getResource().createRelative(location);
				// 封装的相对路径资源存在
				if (relativeResource.exists()) {
					// 使用资源读入器加载Bean定义资源
					importCount = getReaderContext().getReader().loadBeanDefinitions(relativeResource);
					actualResources.add(relativeResource);
				}
				// 封装的相对路径资源不存在
				else {
					// 获取Spring IOC容器资源读入器的基本路径 
					String baseLocation = getReaderContext().getResource().getURL().toString();
					// 根据Spring IoC容器资源读入器的基本路径加载给定导入路径的资源
					importCount = getReaderContext().getReader().loadBeanDefinitions(
							StringUtils.applyRelativePath(baseLocation, location), actualResources);
				}
				if (logger.isDebugEnabled()) {
					logger.debug("Imported " + importCount + " bean definitions from relative location [" + location + "]");
				}
			}
			catch (IOException ex) {
				getReaderContext().error("Failed to resolve current resource location", ele, ex);
			}
			catch (BeanDefinitionStoreException ex) {
				getReaderContext().error("Failed to import bean definitions from relative location [" + location + "]",
						ele, ex);
			}
		}
		Resource[] actResArray = actualResources.toArray(new Resource[actualResources.size()]);
		// 在解析完<Import>元素之后，发送容器导入其他资源处理完成事件
		getReaderContext().fireImportProcessed(location, actResArray, extractSource(ele));
	}

	/**
	 * Process the given alias element, registering the alias with the registry.
	 */
	
	// 解析<Alias>别名元素，为Bean向Spring IoC容器注册别名
	protected void processAliasRegistration(Element ele) {
		// 获取<Alias>别名元素中name的属性值
		String name = ele.getAttribute(NAME_ATTRIBUTE);
		// 获取<Alias>别名元素中alias的属性值
		String alias = ele.getAttribute(ALIAS_ATTRIBUTE);
		boolean valid = true;
		// <alias>别名元素的name属性值为空
		if (!StringUtils.hasText(name)) {
			getReaderContext().error("Name must not be empty", ele);
			valid = false;
		}
		// <alias>别名元素的alias属性值为空
		if (!StringUtils.hasText(alias)) {
			getReaderContext().error("Alias must not be empty", ele);
			valid = false;
		}
		if (valid) {
			try {
				// 向容器的资源读入器注册别名
				getReaderContext().getRegistry().registerAlias(name, alias);
			}
			catch (Exception ex) {
				getReaderContext().error("Failed to register alias '" + alias +
						"' for bean with name '" + name + "'", ele, ex);
			}
			// 在解析完<Alias>元素之后，发送容器别名处理完成事件
			getReaderContext().fireAliasRegistered(name, alias, extractSource(ele));
		}
	}

	// 解析Bean定义资源Document对象的普通元素
	protected void processBeanDefinition(Element ele, BeanDefinitionParserDelegate delegate) {
		
		// BeanDefinitionHolder是对BeanDefinition的封装，即BeanDefinition的封装类  
		// 对Document对象中<Bean>元素的解析由BeanDefinitionParserDelegate实现
		BeanDefinitionHolder bdHolder = delegate.parseBeanDefinitionElement(ele);
		if (bdHolder != null) {
			// 对bdHolder进行包装处理
			bdHolder = delegate.decorateBeanDefinitionIfRequired(ele, bdHolder);
			try {
				/**
				 * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
				 * 向Spring IoC容器注册解析BeanDefinition，这是BeanDefinition向IoC容器注册的入口
				 * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
				 */
				BeanDefinitionReaderUtils.registerBeanDefinition(bdHolder, getReaderContext().getRegistry());
			}
			catch (BeanDefinitionStoreException ex) {
				getReaderContext().error("Failed to register bean definition with name '" +
						bdHolder.getBeanName() + "'", ele, ex);
			}
			// 在完成向Spring IOC容器注册解析得到的Bean定义之后，发送注册事件
			getReaderContext().fireComponentRegistered(new BeanComponentDefinition(bdHolder));
		}
	}
```
## 7、看一下BeanDefinitionParserDelegate中对bean元素的详细解析过程
```java
	// 解析<Bean>元素的入口
	public BeanDefinitionHolder parseBeanDefinitionElement(Element ele) {
		return parseBeanDefinitionElement(ele, null);
	}

	// 解析BeanDefinition资源文件中的<Bean>元素，这个方法中主要处理<Bean>元素的id，name和别名属性
	public BeanDefinitionHolder parseBeanDefinitionElement(Element ele, BeanDefinition containingBean) {
		// 获取<Bean>元素中的id属性值
		String id = ele.getAttribute(ID_ATTRIBUTE);
		
		// 获取<Bean>元素中的name属性值
		String nameAttr = ele.getAttribute(NAME_ATTRIBUTE);

		// 获取<Bean>元素中的alias属性值
		List<String> aliases = new ArrayList<String>();
		
		// 将<Bean>元素中的所有name属性值存放到别名中
		if (StringUtils.hasLength(nameAttr)) {
			String[] nameArr = StringUtils.tokenizeToStringArray(nameAttr, MULTI_VALUE_ATTRIBUTE_DELIMITERS);
			aliases.addAll(Arrays.asList(nameArr));
		}

		String beanName = id;
		// 如果<Bean>元素中没有配置id属性时，将别名中的第一个值赋值给beanName
		if (!StringUtils.hasText(beanName) && !aliases.isEmpty()) {
			beanName = aliases.remove(0);
			if (logger.isDebugEnabled()) {
				logger.debug("No XML 'id' specified - using '" + beanName +
						"' as bean name and " + aliases + " as aliases");
			}
		}

		// 检查<Bean>元素所配置的id或者name的唯一性，containingBean标识<Bean>  
	    // 元素中是否包含子<Bean>元素
		if (containingBean == null) {
			// 检查<Bean>元素所配置的id、name或者别名是否重复
			checkNameUniqueness(beanName, aliases, ele);
		}

		// 详细对<Bean>元素中配置的Bean定义进行解析的地方
		AbstractBeanDefinition beanDefinition = parseBeanDefinitionElement(ele, beanName, containingBean);
		if (beanDefinition != null) {
			if (!StringUtils.hasText(beanName)) {
				try {
					if (containingBean != null) {
						// 如果<Bean>元素中没有配置id、别名或者name，且没有包含子元素
						// <Bean>元素，为解析的Bean生成一个唯一beanName并注册
						beanName = BeanDefinitionReaderUtils.generateBeanName(
								beanDefinition, this.readerContext.getRegistry(), true);
					}
					else {
						// 如果<Bean>元素中没有配置id、别名或者name，且包含了子元素
						// <Bean>元素，为解析的Bean使用别名向IOC容器注册
						beanName = this.readerContext.generateBeanName(beanDefinition);
	                    // 为解析的Bean使用别名注册时，为了向后兼容
						// Spring1.2/2.0，给别名添加类名后缀
						String beanClassName = beanDefinition.getBeanClassName();
						if (beanClassName != null &&
								beanName.startsWith(beanClassName) && beanName.length() > beanClassName.length() &&
								!this.readerContext.getRegistry().isBeanNameInUse(beanClassName)) {
							aliases.add(beanClassName);
						}
					}
					if (logger.isDebugEnabled()) {
						logger.debug("Neither XML 'id' nor 'name' specified - " +
								"using generated bean name [" + beanName + "]");
					}
				}
				catch (Exception ex) {
					error(ex.getMessage(), ele);
					return null;
				}
			}
			String[] aliasesArray = StringUtils.toStringArray(aliases);
			return new BeanDefinitionHolder(beanDefinition, beanName, aliasesArray);
		}
		// 当解析出错时，返回null
		return null;
	}
	
	// 详细对<Bean>元素中配置的Bean定义其他属性进行解析，由于上面的方法中已经对
	// Bean的id、name和别名等属性进行了处理，该方法中主要处理除这三个以外的其他属性数据  
	public AbstractBeanDefinition parseBeanDefinitionElement(
			Element ele, String beanName, BeanDefinition containingBean) {

		// 记录解析的<Bean>
		this.parseState.push(new BeanEntry(beanName));

		// 这里只读取<Bean>元素中配置的class名字，然后载入到BeanDefinition中去  
	    // 只是记录配置的class名字，不做实例化，对象的实例化在依赖注入时完成
		String className = null;
		if (ele.hasAttribute(CLASS_ATTRIBUTE)) {
			className = ele.getAttribute(CLASS_ATTRIBUTE).trim();
		}

		try {
			String parent = null;
			// 如果<Bean>元素中配置了parent属性，则获取parent属性的值
			if (ele.hasAttribute(PARENT_ATTRIBUTE)) {
				parent = ele.getAttribute(PARENT_ATTRIBUTE);
			}
			
			// 根据<Bean>元素配置的class名称和parent属性值创建BeanDefinition  
	        // 为载入Bean定义信息做准备
			AbstractBeanDefinition bd = createBeanDefinition(className, parent);

			// 对当前的<Bean>元素中配置的一些属性进行解析和设置，如配置的单态(singleton)属性等
			parseBeanDefinitionAttributes(ele, beanName, containingBean, bd);
			// 为<Bean>元素解析的Bean设置description信息
			bd.setDescription(DomUtils.getChildElementValueByTagName(ele, DESCRIPTION_ELEMENT));

			// 对<Bean>元素的meta(元信息)属性解析
			parseMetaElements(ele, bd);
			// 对<Bean>元素的lookup-method属性解析
			parseLookupOverrideSubElements(ele, bd.getMethodOverrides());
			// 对<Bean>元素的replaced-method属性解析
			parseReplacedMethodSubElements(ele, bd.getMethodOverrides());

			// 解析<Bean>元素的构造方法属性
			parseConstructorArgElements(ele, bd);
			// 解析<Bean>元素所有的<property>属性
			parsePropertyElements(ele, bd);
			// 解析<Bean>元素的qualifier属性
			parseQualifierElements(ele, bd);

			//为当前解析的Bean设置所需的资源和依赖对象
			bd.setResource(this.readerContext.getResource());
			bd.setSource(extractSource(ele));

			return bd;
		}
		catch (ClassNotFoundException ex) {
			error("Bean class [" + className + "] not found", ele, ex);
		}
		catch (NoClassDefFoundError err) {
			error("Class that bean class [" + className + "] depends on not found", ele, err);
		}
		catch (Throwable ex) {
			error("Unexpected failure during bean definition parsing", ele, ex);
		}
		finally {
			this.parseState.pop();
		}
		// 解析<Bean>元素出错时，返回null
		return null;
	}
```
## 8、对bean的部分子元素进行解析的具体实现
```java
	// 解析<Bean>元素中所有的<property>子元素
	public void parsePropertyElements(Element beanEle, BeanDefinition bd) {
		// 获取对应bean元素中所有的<property>子元素，逐一解析
		NodeList nl = beanEle.getChildNodes();
		for (int i = 0; i < nl.getLength(); i++) {
			Node node = nl.item(i);
			// 对<property>子元素进行详细解析
			if (isCandidateElement(node) && nodeNameEquals(node, PROPERTY_ELEMENT)) {
				parsePropertyElement((Element) node, bd);
			}
		}
	}
	
	// 详细解析<property>元素
	public void parsePropertyElement(Element ele, BeanDefinition bd) {
		// 获取<property>元素的名字
		String propertyName = ele.getAttribute(NAME_ATTRIBUTE);
		if (!StringUtils.hasLength(propertyName)) {
			error("Tag 'property' must have a 'name' attribute", ele);
			return;
		}
		this.parseState.push(new PropertyEntry(propertyName));
		try {
			// 如果一个Bean中已经有同名的property存在，则不进行解析，直接返回。  
	        // 即如果在同一个Bean中配置同名的property，则只有第一个起作用
			if (bd.getPropertyValues().contains(propertyName)) {
				error("Multiple 'property' definitions for property '" + propertyName + "'", ele);
				return;
			}
			// 解析获取property的值，返回的对象对应 对bean定义的property属性设置的
			// 解析结果，这个解析结果会封装到PropertyValue对象中，然后设置到BeanDefinitionHolder中去
			Object val = parsePropertyValue(ele, bd, propertyName);
			// 根据property的名字和值创建property实例
			PropertyValue pv = new PropertyValue(propertyName, val);
			// 解析<property>元素中的属性
			parseMetaElements(ele, pv);
			pv.setSource(extractSource(ele));
			bd.getPropertyValues().addPropertyValue(pv);
		}
		finally {
			this.parseState.pop();
		}
	}
	
	// 解析获取property值
	public Object parsePropertyValue(Element ele, BeanDefinition bd, String propertyName) {
		String elementName = (propertyName != null) ?
						"<property> element for property '" + propertyName + "'" :
						"<constructor-arg> element";

		// 获取<property>的所有子元素，只能是其中一种类型:ref,value,list等
		NodeList nl = ele.getChildNodes();
		Element subElement = null;
		for (int i = 0; i < nl.getLength(); i++) {
			Node node = nl.item(i);
			// 如果子元素不是description和meta属性
			if (node instanceof Element && !nodeNameEquals(node, DESCRIPTION_ELEMENT) &&
					!nodeNameEquals(node, META_ELEMENT)) {
				// Child element is what we're looking for.
				if (subElement != null) {
					error(elementName + " must not contain more than one sub-element", ele);
				}
				else {// 当前<property>元素包含有子元素
					subElement = (Element) node;
				}
			}
		}

		// 判断property的属性值是ref还是value，不允许既是ref又是value 
		boolean hasRefAttribute = ele.hasAttribute(REF_ATTRIBUTE);
		boolean hasValueAttribute = ele.hasAttribute(VALUE_ATTRIBUTE);
		if ((hasRefAttribute && hasValueAttribute) ||
				((hasRefAttribute || hasValueAttribute) && subElement != null)) {
			error(elementName +
					" is only allowed to contain either 'ref' attribute OR 'value' attribute OR sub-element", ele);
		}

		// 如果属性是ref，创建一个ref的数据对象RuntimeBeanReference
	    // 这个对象封装了ref信息
		if (hasRefAttribute) {
			String refName = ele.getAttribute(REF_ATTRIBUTE);
			if (!StringUtils.hasText(refName)) {
				error(elementName + " contains empty 'ref' attribute", ele);
			}
			// 一个指向运行时所依赖对象的引用
			RuntimeBeanReference ref = new RuntimeBeanReference(refName);
			// 设置这个ref的数据对象是被当前的property对象所引用
			ref.setSource(extractSource(ele));
			return ref;
		}
		// 如果属性是value，创建一个value的数据对象TypedStringValue
	    // 这个对象封装了value信息
		else if (hasValueAttribute) {
			// 一个持有String类型值的对象
			TypedStringValue valueHolder = new TypedStringValue(ele.getAttribute(VALUE_ATTRIBUTE));
			// 设置这个value数据对象是被当前的property对象所引用
			valueHolder.setSource(extractSource(ele));
			return valueHolder;
		}
		// 如果当前<property>元素还有子元素
		else if (subElement != null) {
			// 解析<property>的子元素
			return parsePropertySubElement(subElement, bd);
		}
		else {
			// propery属性中既不是ref，也不是value属性，解析出错返回null
			error(elementName + " must specify a ref or value", ele);
			return null;
		}
	}

	// 解析<property>元素中ref,value或者集合等子元素
	public Object parsePropertySubElement(Element ele, BeanDefinition bd) {
		return parsePropertySubElement(ele, bd, null);
	}

	public Object parsePropertySubElement(Element ele, BeanDefinition bd, String defaultValueType) {
		// 如果<property>没有使用Spring默认的命名空间，则使用用户自定义的规则解析
		// 内嵌元素
		if (!isDefaultNamespace(ele)) {
			return parseNestedCustomElement(ele, bd);
		}
		// 如果子元素是bean，则使用解析<Bean>元素的方法解析
		else if (nodeNameEquals(ele, BEAN_ELEMENT)) {
			BeanDefinitionHolder nestedBd = parseBeanDefinitionElement(ele, bd);
			if (nestedBd != null) {
				nestedBd = decorateBeanDefinitionIfRequired(ele, nestedBd, bd);
			}
			return nestedBd;
		}
		// 如果子元素是ref，ref中只能有以下3个属性：bean、local、parent
		else if (nodeNameEquals(ele, REF_ELEMENT)) {
			// 获取<property>元素中的bean属性值，引用其他解析的Bean的名称  
	        // 可以不再同一个Spring配置文件中，具体请参考Spring对ref的配置规则
			String refName = ele.getAttribute(BEAN_REF_ATTRIBUTE);
			boolean toParent = false;
			if (!StringUtils.hasLength(refName)) {
				// 获取<property>元素中的local属性值，引用同一个Xml文件中配置  
                // 的Bean的id，local和ref不同，local只能引用同一个配置文件中的Bean
				refName = ele.getAttribute(LOCAL_REF_ATTRIBUTE);
				if (!StringUtils.hasLength(refName)) {
					// 获取<property>元素中parent属性值，引用父级容器中的Bean
					refName = ele.getAttribute(PARENT_REF_ATTRIBUTE);
					toParent = true;
					
					if (!StringUtils.hasLength(refName)) {
						error("'bean', 'local' or 'parent' is required for <ref> element", ele);
						return null;
					}
				}
			}
			
			// 没有配置ref的目标属性值 
			if (!StringUtils.hasText(refName)) {
				error("<ref> element contains empty target attribute", ele);
				return null;
			}
			// 创建ref类型数据，指向被引用的对象
			RuntimeBeanReference ref = new RuntimeBeanReference(refName, toParent);
			// 设置引用类型值是被当前子元素所引用
			ref.setSource(extractSource(ele));
			return ref;
		}
		// 如果子元素是<idref>，使用解析ref元素的方法解析
		else if (nodeNameEquals(ele, IDREF_ELEMENT)) {
			return parseIdRefElement(ele);
		}
		// 如果子元素是<value>，使用解析value元素的方法解析
		else if (nodeNameEquals(ele, VALUE_ELEMENT)) {
			return parseValueElement(ele, defaultValueType);
		}
		//如果子元素是null，为<property>设置一个封装null值的字符串数据
		else if (nodeNameEquals(ele, NULL_ELEMENT)) {
			TypedStringValue nullHolder = new TypedStringValue(null);
			nullHolder.setSource(extractSource(ele));
			return nullHolder;
		}
		// 如果子元素是<array>，使用解析array集合子元素的方法解析
		else if (nodeNameEquals(ele, ARRAY_ELEMENT)) {
			return parseArrayElement(ele, bd);
		}
		// 如果子元素是<list>，使用解析list集合子元素的方法解析
		else if (nodeNameEquals(ele, LIST_ELEMENT)) {
			return parseListElement(ele, bd);
		}
		// 如果子元素是<set>，使用解析set集合子元素的方法解析
		else if (nodeNameEquals(ele, SET_ELEMENT)) {
			return parseSetElement(ele, bd);
		}
		// 如果子元素是<map>，使用解析map集合子元素的方法解析
		else if (nodeNameEquals(ele, MAP_ELEMENT)) {
			return parseMapElement(ele, bd);
		}
		// 如果子元素是<props>，使用解析props集合子元素的方法解析
		else if (nodeNameEquals(ele, PROPS_ELEMENT)) {
			return parsePropsElement(ele);
		}
		// 既不是ref，又不是value，也不是集合，则子元素配置错误，返回null
		else {
			error("Unknown property sub-element: [" + ele.getNodeName() + "]", ele);
			return null;
		}
	}

	// 解析<list>集合子元素
	public List parseListElement(Element collectionEle, BeanDefinition bd) {
		// 获取<list>元素中的value-type属性，即获取集合元素的数据类型
		String defaultElementType = collectionEle.getAttribute(VALUE_TYPE_ATTRIBUTE);
		// 获取<list>集合元素中的所有子节点
		NodeList nl = collectionEle.getChildNodes();
		// Spring中将List封装为ManagedList
		ManagedList<Object> target = new ManagedList<Object>(nl.getLength());
		target.setSource(extractSource(collectionEle));
		// 设置集合目标数据类型
		target.setElementTypeName(defaultElementType);
		target.setMergeEnabled(parseMergeAttribute(collectionEle));
		// 具体的<list>元素解析
		parseCollectionElements(nl, target, bd, defaultElementType);
		return target;
	}
	
	// 具体解析<list>集合元素，<array>、<list>和<set>都使用该方法解析
	protected void parseCollectionElements(NodeList elementNodes, Collection<Object> target, 
			BeanDefinition bd, String defaultElementType) {
		
		// 遍历集合所有节点
		for (int i = 0; i < elementNodes.getLength(); i++) {
			Node node = elementNodes.item(i);
			// 节点不是description节点
			if (node instanceof Element && !nodeNameEquals(node, DESCRIPTION_ELEMENT)) {
				// 将解析的元素加入集合中，递归调用下一个子元素 
				target.add(parsePropertySubElement((Element) node, bd, defaultElementType));
			}
		}
	}
```
经过这样逐层地解析，我们在配置文件中定义的Bean就被整个解析成了可以被IoC容器装载和使用的BeanDefinition，这种数据结构可以让IoC容器执行索引、查询等操作。经过上述解析得到的BeanDefinition，接下来我们就可以将它注册到IoC容器中咯。










