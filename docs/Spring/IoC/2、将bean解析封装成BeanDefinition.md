## 前言

接着上一篇的 BeanDefinition 资源定位开始讲。Spring IoC 容器 BeanDefinition 解析过程就是把用户在配置文件中配置的 bean，解析并封装成 IoC 容器可以装载的 BeanDefinition 对象，BeanDefinition 是 Spring 定义的基本数据结构，其中的属性与配置文件中 bean 的属性相对应。

（PS：可以结合我 GitHub 上对 Spring 框架源码的阅读及个人理解一起看，会更有助于各位开发大佬理解。地址如下。  
spring-beans https://github.com/AmyliaY/spring-beans-reading  
spring-context https://github.com/AmyliaY/spring-context-reading ）

## 正文

首先看一下 AbstractRefreshableApplicationContext 的 refreshBeanFactory() 方法，这是一个模板方法，其中调用的 loadBeanDefinitions() 方法是一个抽象方法，交由子类实现。

```java
/**
 * 在这里完成了容器的初始化，并赋值给自己私有的 beanFactory 属性，为下一步调用做准备
 * 从父类 AbstractApplicationContext 继承的抽象方法，自己做了实现
 */
@Override
protected final void refreshBeanFactory() throws BeansException {
    // 如果已经建立了 IoC 容器，则销毁并关闭容器
    if (hasBeanFactory()) {
        destroyBeans();
        closeBeanFactory();
    }
    try {
        // 创建 IoC 容器，DefaultListableBeanFactory 实现了 ConfigurableListableBeanFactory 接口
        DefaultListableBeanFactory beanFactory = createBeanFactory();
        beanFactory.setSerializationId(getId());
        // 对 IoC 容器进行定制化，如设置启动参数，开启注解的自动装配等
        customizeBeanFactory(beanFactory);
        // 载入 BeanDefinition，当前类中只定义了抽象的 loadBeanDefinitions() 方法，具体的实现调用子类容器
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

下面看一下 AbstractRefreshableApplicationContext 的子类 AbstractXmlApplicationContext 对 loadBeanDefinitions() 方法的实现。

```java
@Override
protected void loadBeanDefinitions(DefaultListableBeanFactory beanFactory) throws BeansException, IOException {
    // DefaultListableBeanFactory 实现了 BeanDefinitionRegistry 接口，所以在初始化 XmlBeanDefinitionReader 时
    // 将该 beanFactory 传入 XmlBeanDefinitionReader 的构造方法中。
    // 从名字也能看出来它的功能，这是一个用于从 .xml文件 中读取 BeanDefinition 的读取器
    XmlBeanDefinitionReader beanDefinitionReader = new XmlBeanDefinitionReader(beanFactory);

    beanDefinitionReader.setEnvironment(this.getEnvironment());
    // 为 beanDefinition 读取器设置 资源加载器，由于本类的基类 AbstractApplicationContext
    // 继承了 DefaultResourceLoader，因此，本容器自身也是一个资源加载器
    beanDefinitionReader.setResourceLoader(this);
    // 为 beanDefinitionReader 设置用于解析的 SAX 实例解析器，SAX（simple API for XML）是另一种XML解析方法。
    // 相比于DOM，SAX速度更快，占用内存更小。它逐行扫描文档，一边扫描一边解析。相比于先将整个XML文件扫描进内存，
    // 再进行解析的DOM，SAX可以在解析文档的任意时刻停止解析，但操作也比DOM复杂。
    beanDefinitionReader.setEntityResolver(new ResourceEntityResolver(this));

    // 初始化 beanDefinition 读取器，该方法同时启用了 XML 的校验机制
    initBeanDefinitionReader(beanDefinitionReader);
    // 用传进来的 XmlBeanDefinitionReader 读取器读取 .xml 文件中配置的 bean
    loadBeanDefinitions(beanDefinitionReader);
}
```

接着看一下上面最后一个调用的方法 loadBeanDefinitions(XmlBeanDefinitionReader reader)。

```java
/**
 * 读取并解析 .xml 文件中配置的 bean，然后封装成 BeanDefinition 对象
 */
protected void loadBeanDefinitions(XmlBeanDefinitionReader reader) throws BeansException, IOException {
    /**
     * ClassPathXmlApplicationContext 与 FileSystemXmlApplicationContext
     * 在这里的调用出现分歧，各自按不同的方式加载解析 Resource 资源
     * 最后在具体的解析和 BeanDefinition 定位上又会殊途同归
     */

    // 获取存放了 BeanDefinition 的所有 Resource，FileSystemXmlApplicationContext 中未对
    // getConfigResources() 进行重写，所以调用父类的，return null。
    // 而 ClassPathXmlApplicationContext 对该方法进行了重写，返回设置的值
    Resource[] configResources = getConfigResources();
    if (configResources != null) {
        // 这里调用的是其父类 AbstractBeanDefinitionReader 中的方法，解析加载 BeanDefinition对象
        reader.loadBeanDefinitions(configResources);
    }
    // 调用其父类 AbstractRefreshableConfigApplicationContext 中的实现，优先返回
    // FileSystemXmlApplicationContext 构造方法中调用 setConfigLocations() 方法设置的资源路径
    String[] configLocations = getConfigLocations();
    if (configLocations != null) {
        // 这里调用其父类 AbstractBeanDefinitionReader 的方法从配置位置加载 BeanDefinition
        reader.loadBeanDefinitions(configLocations);
    }
}
```

AbstractBeanDefinitionReader 对 loadBeanDefinitions() 方法的三重重载。

```java
/**
 * loadBeanDefinitions() 方法的重载方法之一，调用了另一个重载方法 loadBeanDefinitions(String location)
 */
public int loadBeanDefinitions(String... locations) throws BeanDefinitionStoreException {
    Assert.notNull(locations, "Location array must not be null");
    // 计数器，统计加载了多少个配置文件
    int counter = 0;
    for (String location : locations) {
        counter += loadBeanDefinitions(location);
    }
    return counter;
}

/**
 * 重载方法之一，调用了下面的 loadBeanDefinitions(String location, Set<Resource> actualResources) 方法
 */
public int loadBeanDefinitions(String location) throws BeanDefinitionStoreException {
    return loadBeanDefinitions(location, null);
}

/**
 * 获取在 IoC 容器初始化过程中设置的资源加载器
 */
public int loadBeanDefinitions(String location, Set<Resource> actualResources) throws BeanDefinitionStoreException {
    // 在实例化 XmlBeanDefinitionReader 时 曾将 IoC 容器注入该对象，作为 resourceLoader 属性
    ResourceLoader resourceLoader = getResourceLoader();
    if (resourceLoader == null) {
        throw new BeanDefinitionStoreException(
                "Cannot import bean definitions from location [" + location + "]: no ResourceLoader available");
    }

    if (resourceLoader instanceof ResourcePatternResolver) {
        try {
            // 将指定位置的 bean 配置文件解析为 BeanDefinition 对象
            // 加载多个指定位置的 BeanDefinition 资源
            Resource[] resources = ((ResourcePatternResolver) resourceLoader).getResources(location);
            // 调用其子类 XmlBeanDefinitionReader 的方法，实现加载功能
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
         * AbstractApplicationContext 继承了 DefaultResourceLoader，所以 AbstractApplicationContext
         * 及其子类都可以调用 DefaultResourceLoader 中的方法，将指定位置的资源文件解析为 Resource，
         * 至此完成了对 BeanDefinition 的资源定位
         * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
         */
        Resource resource = resourceLoader.getResource(location);
        // 从 resource 中加载 BeanDefinition，loadCount 为加载的 BeanDefinition 个数
        // 该 loadBeanDefinitions() 方法来自其 implements 的 BeanDefinitionReader 接口，
        // 且本类是一个抽象类，并未对该方法进行实现。而是交由子类进行实现，如果是用 xml 文件进行
        // IoC 容器初始化的，则调用 XmlBeanDefinitionReader 中的实现
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

XmlBeanDefinitionReader 读取器中的方法执行流，按代码的先后顺序。

```java
/**
 * XmlBeanDefinitionReader 加载资源的入口方法
 */
public int loadBeanDefinitions(Resource resource) throws BeanDefinitionStoreException {
    // 调用本类的重载方法，通过 new EncodedResource(resource) 获得的 EncodedResource 对象
    // 能够将资源与读取资源所需的编码组合在一起
    return loadBeanDefinitions(new EncodedResource(resource));
}

/**
 * 通过 encodedResource 进行资源解析，encodedResource 对象持有 resource 对象和 encoding 编码格式
 */
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
        // 从 resource 中获取输入流，对 resource 中的内容进行读取
        InputStream inputStream = encodedResource.getResource().getInputStream();
        try {
            // 实例化一个"XML 实体的单个输入源"，将 inputStream 作为自己的属性
            InputSource inputSource = new InputSource(inputStream);
            // 如果 encodedResource 中的 encoding 属性不为空，就为 inputSource 设置读取 XML 的编码格式
            if (encodedResource.getEncoding() != null) {
                inputSource.setEncoding(encodedResource.getEncoding());
            }
            // 这里是具体的读取过程
            return doLoadBeanDefinitions(inputSource, encodedResource.getResource());
        }
        finally {
            // 关闭 IO 流
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

/**
 * 从指定 XML 文件中解析 bean，封装成 BeanDefinition 对象的具体实现
 */
protected int doLoadBeanDefinitions(InputSource inputSource, Resource resource)
        throws BeanDefinitionStoreException {
    try {
        int validationMode = getValidationModeForResource(resource);
        // 通过 documentLoader 获取 XML 文件的 Document 对象
        Document doc = this.documentLoader.loadDocument(
                inputSource, getEntityResolver(), this.errorHandler, validationMode, isNamespaceAware());
        // 启动对 BeanDefinition 的详细解析过程，该解析过程会用到 Spring 的 Bean 配置规则
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

/**
 * 按照 Spring 对配置文件中 bean 元素的语义定义，将 bean 元素 解析成 BeanDefinition 对象
 */
public int registerBeanDefinitions(Document doc, Resource resource) throws BeanDefinitionStoreException {
    // 得到 BeanDefinitionDocumentReader，将 xml 中配置的 bean 解析成 BeanDefinition 对象
    // BeanDefinitionDocumentReader 只是个接口，这里实际上是一个 DefaultBeanDefinitionDocumentReader 对象
    BeanDefinitionDocumentReader documentReader = createBeanDefinitionDocumentReader();
    documentReader.setEnvironment(this.getEnvironment());
    // 获得容器中注册的 bean 数量
    int countBefore = getRegistry().getBeanDefinitionCount();
    // 解析过程入口
    documentReader.registerBeanDefinitions(doc, createReaderContext(resource));
    // 统计解析的 Bean 数量
    return getRegistry().getBeanDefinitionCount() - countBefore;
}
```

文档解析器 DefaultBeanDefinitionDocumentReader 对配置文件中元素的解析。

```java
// 根据 Spring 对 Bean 的定义规则进行解析
public void registerBeanDefinitions(Document doc, XmlReaderContext readerContext) {
    // 获得 XML 描述符
    this.readerContext = readerContext;
    logger.debug("Loading bean definitions");
    // 获得 Document 的根元素
    Element root = doc.getDocumentElement();
    // 解析的具体实现
    doRegisterBeanDefinitions(root);
}


/**
 * 依次注册 BeanDefinition，使用给定的根元素
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

    // 具体的解析过程由 BeanDefinitionParserDelegate 实现，
    // BeanDefinitionParserDelegate中定义了用于解析 bean 的各种属性及方法
    BeanDefinitionParserDelegate parent = this.delegate;
    this.delegate = createDelegate(this.readerContext, root, parent);


    // 前置解析处理，可以在解析 bean 之前进行自定义的解析，增强解析的可扩展性
    preProcessXml(root);
    // 从 Document 的根元素开始进行 Bean 定义的 Document 对象
    parseBeanDefinitions(root, this.delegate);
    // 后置解析处理，可以在解析 bean 之后进行自定义的解析，增加解析的可扩展性
    postProcessXml(root);

    this.delegate = parent;
}

/**
 * 根据 Spring 的 bean解析规则，从 Document 的根元素开始进行解析
 */
protected void parseBeanDefinitions(Element root, BeanDefinitionParserDelegate delegate) {
    // 根节点 root 是否使用了 Spring 默认的 XML 命名空间
    if (delegate.isDefaultNamespace(root)) {
        // 获取根元素的所有子节点
        NodeList nl = root.getChildNodes();
        for (int i = 0; i < nl.getLength(); i++) {
            Node node = nl.item(i);
            if (node instanceof Element) {
                Element ele = (Element) node;
                // 如果 ele 定义的 Document 的元素节点使用的是 Spring 默认的 XML 命名空间
                if (delegate.isDefaultNamespace(ele)) {
                    // 使用 Spring 的 bean解析规则 解析元素节点
                    parseDefaultElement(ele, delegate);
                }
                else {
                    // 若没有使用 Spring 默认的 XML 命名空间，则使用用户自定义的解析规则解析元素节点
                    delegate.parseCustomElement(ele);
                }
            }
        }
    }
    else {
        // 若 Document 的根节点没有使用 Spring 默认的命名空间，则使用用户自定义的解析规则
        // 解析 Document 根节点
        delegate.parseCustomElement(root);
    }
}

/**
 * 使用 Spring 的 bean解析规则 解析 Spring元素节点
 */
private void parseDefaultElement(Element ele, BeanDefinitionParserDelegate delegate) {
    // 解析 <Import> 元素
    if (delegate.nodeNameEquals(ele, IMPORT_ELEMENT)) {
        importBeanDefinitionResource(ele);
    }
    // 解析 <Alias> 元素
    else if (delegate.nodeNameEquals(ele, ALIAS_ELEMENT)) {
        processAliasRegistration(ele);
    }
    // 若元素节点既不是 <Import> 也不是 <Alias>，即普通的 <Bean> 元素，
    // 则按照 Spring 的 bean解析规则 解析元素
    else if (delegate.nodeNameEquals(ele, BEAN_ELEMENT)) {
        processBeanDefinition(ele, delegate);
    }
    // 如果被解析的元素是 beans，则递归调用 doRegisterBeanDefinitions(Element root) 方法进行解析
    else if (delegate.nodeNameEquals(ele, NESTED_BEANS_ELEMENT)) {
        doRegisterBeanDefinitions(ele);
    }
}

/**
 * 解析 <import> 元素
 */
protected void importBeanDefinitionResource(Element ele) {
    // 获取给定的导入元素的 location 属性
    String location = ele.getAttribute(RESOURCE_ATTRIBUTE);
    // 如果导入元素的 location 属性值为空，则没有导入任何资源，直接返回
    if (!StringUtils.hasText(location)) {
        getReaderContext().error("Resource location must not be empty", ele);
        return;
    }

    // 使用系统变量值解析 location 属性值
    location = environment.resolveRequiredPlaceholders(location);

    Set<Resource> actualResources = new LinkedHashSet<Resource>(4);

    // 标识给定的 <Import> 元素的 location 是否是绝对路径
    boolean absoluteLocation = false;
    try {
        absoluteLocation = ResourcePatternUtils.isUrl(location) || ResourceUtils.toURI(location).isAbsolute();
    }
    catch (URISyntaxException ex) {
    }

    if (absoluteLocation) {
        try {
            // 使用资源读取器加载给定路径的 bean
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
        // 给定的 <import> 元素的 location 是相对路径
        try {
            int importCount;
            // 将给定 <import> 元素的 location 封装为相对路径资源
            Resource relativeResource = getReaderContext().getResource().createRelative(location);
            // 封装的相对路径资源存在
            if (relativeResource.exists()) {
                // 使用资源读取器加载 bean
                importCount = getReaderContext().getReader().loadBeanDefinitions(relativeResource);
                actualResources.add(relativeResource);
            }
            // 封装的相对路径资源不存在
            else {
                // 获取 Spring IOC 容器资源读取器的基本路径
                String baseLocation = getReaderContext().getResource().getURL().toString();
                // 根据 Spring IoC 容器资源读取器的基本路径加载给定导入路径的资源
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
    // 在解析完 <Import> 元素之后，发送容器导入其他资源处理完成事件
    getReaderContext().fireImportProcessed(location, actResArray, extractSource(ele));
}

/**
 * 解析 <Alias> 元素
 */
protected void processAliasRegistration(Element ele) {
    // 获取 <Alias> 元素中的 name 属性值
    String name = ele.getAttribute(NAME_ATTRIBUTE);
    // 获取 <Alias> 元素中的 alias 属性值
    String alias = ele.getAttribute(ALIAS_ATTRIBUTE);
    boolean valid = true;
    // 若 <alias> 元素的 name 属性值为空
    if (!StringUtils.hasText(name)) {
        getReaderContext().error("Name must not be empty", ele);
        valid = false;
    }
    // 若 <alias> 元素的 alias 属性值为空
    if (!StringUtils.hasText(alias)) {
        getReaderContext().error("Alias must not be empty", ele);
        valid = false;
    }
    if (valid) {
        try {
            // 向容器的资源读取器 注册别名
            getReaderContext().getRegistry().registerAlias(name, alias);
        }
        catch (Exception ex) {
            getReaderContext().error("Failed to register alias '" + alias +
                    "' for bean with name '" + name + "'", ele, ex);
        }
        // 在解析完 <Alias> 元素之后，向容器发送别名处理完成事件
        getReaderContext().fireAliasRegistered(name, alias, extractSource(ele));
    }
}

/**
 * 解析 bean 元素
 */
protected void processBeanDefinition(Element ele, BeanDefinitionParserDelegate delegate) {

    // BeanDefinitionHolder 是对 BeanDefinition 的进一步封装，持有一个 BeanDefinition 对象 及其对应
    // 的 beanName、aliases别名。对 <Bean> 元素的解析由 BeanDefinitionParserDelegate 实现
    BeanDefinitionHolder bdHolder = delegate.parseBeanDefinitionElement(ele);
    if (bdHolder != null) {
        // 对 bdHolder 进行包装处理
        bdHolder = delegate.decorateBeanDefinitionIfRequired(ele, bdHolder);
        try {
            /**
             * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
             * 向 Spring IoC 容器注册解析完成的 BeanDefinition对象，这是 BeanDefinition 向 IoC 容器注册的入口
             * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
             */
            BeanDefinitionReaderUtils.registerBeanDefinition(bdHolder, getReaderContext().getRegistry());
        }
        catch (BeanDefinitionStoreException ex) {
            getReaderContext().error("Failed to register bean definition with name '" +
                    bdHolder.getBeanName() + "'", ele, ex);
        }
        // 在完成向 Spring IOC 容器注册 BeanDefinition对象 之后，发送注册事件
        getReaderContext().fireComponentRegistered(new BeanComponentDefinition(bdHolder));
    }
}
```

看一下 BeanDefinitionParserDelegate 中对 bean 元素的详细解析过程。

```java
/**
 * 解析 <bean> 元素的入口
 */
public BeanDefinitionHolder parseBeanDefinitionElement(Element ele) {
    return parseBeanDefinitionElement(ele, null);
}

/**
 * 解析 <bean> 元素，这个方法中主要处理 <bean> 元素的 id、name 和 alias 属性
 */
public BeanDefinitionHolder parseBeanDefinitionElement(Element ele, BeanDefinition containingBean) {
    // 获取 <bean> 元素中的 id 属性值
    String id = ele.getAttribute(ID_ATTRIBUTE);

    // 获取 <bean> 元素中的 name 属性值
    String nameAttr = ele.getAttribute(NAME_ATTRIBUTE);

    // 获取 <bean> 元素中的 alias 属性值
    List<String> aliases = new ArrayList<String>();

    // 将 <bean> 元素中的所有 name 属性值存放到别名中
    if (StringUtils.hasLength(nameAttr)) {
        String[] nameArr = StringUtils.tokenizeToStringArray(nameAttr, MULTI_VALUE_ATTRIBUTE_DELIMITERS);
        aliases.addAll(Arrays.asList(nameArr));
    }

    String beanName = id;
    // 如果 <bean> 元素中没有配置 id 属性，则将 别名alias 中的第一个值赋值给 beanName
    if (!StringUtils.hasText(beanName) && !aliases.isEmpty()) {
        beanName = aliases.remove(0);
        if (logger.isDebugEnabled()) {
            logger.debug("No XML 'id' specified - using '" + beanName +
                    "' as bean name and " + aliases + " as aliases");
        }
    }

    // 检查 <bean> 元素所配置的 id 或者 name 的唯一性
    // 元素中是否包含子 <bean> 元素
    if (containingBean == null) {
        // 检查 <bean> 元素所配置的 id、name 或者 别名alias 是否重复
        checkNameUniqueness(beanName, aliases, ele);
    }

    // 将 <bean> 元素解析成 BeanDefinition对象
    AbstractBeanDefinition beanDefinition = parseBeanDefinitionElement(ele, beanName, containingBean);
    if (beanDefinition != null) {
        if (!StringUtils.hasText(beanName)) {
            try {
                // 如果 <bean> 元素中没有配置 id、name 或者 alias，且没有包含子元素
                if (containingBean != null) {
                    // 为解析的 BeanDefinition 生成一个唯一的 beanName
                    beanName = BeanDefinitionReaderUtils.generateBeanName(
                            beanDefinition, this.readerContext.getRegistry(), true);
                }
                else {
                    beanName = this.readerContext.generateBeanName(beanDefinition);
                    // 在别名集合 aliases 中添加 bean 的类名
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
    // 当解析出错时，返回 null
    return null;
}

/**
 * 详细对 <bean> 元素中的其他属性进行解析，上面的方法中已经对 bean 的 id、name 及 alias 属性进行了处理
 */
public AbstractBeanDefinition parseBeanDefinitionElement(
        Element ele, String beanName, BeanDefinition containingBean) {

    // 记录解析的 <bean>
    this.parseState.push(new BeanEntry(beanName));

    // 这里只读取 <bean> 元素中配置的 class 名字，然后载入到 BeanDefinition 中去
    // 只是记录配置的 class 名字，不做实例化，对象的实例化在 getBean() 时发生
    String className = null;
    if (ele.hasAttribute(CLASS_ATTRIBUTE)) {
        className = ele.getAttribute(CLASS_ATTRIBUTE).trim();
    }

    try {
        String parent = null;
        // 如果 <bean> 元素中配置了 parent 属性，则获取 parent 属性的值
        if (ele.hasAttribute(PARENT_ATTRIBUTE)) {
            parent = ele.getAttribute(PARENT_ATTRIBUTE);
        }

        // 根据 <bean> 元素配置的 class 名称和 parent 属性值创建 BeanDefinition
        AbstractBeanDefinition bd = createBeanDefinition(className, parent);

        // 对当前的 <bean> 元素中配置的一些属性进行解析和设置，如配置的单例 (singleton) 属性等
        parseBeanDefinitionAttributes(ele, beanName, containingBean, bd);
        // 为 BeanDefinition对象 注入 description属性值
        bd.setDescription(DomUtils.getChildElementValueByTagName(ele, DESCRIPTION_ELEMENT));

        // 解析 <bean> 元素中的 meta 属性
        parseMetaElements(ele, bd);
        // 解析 <bean> 元素中的 lookup-method 属性
        parseLookupOverrideSubElements(ele, bd.getMethodOverrides());
        // 解析 <bean> 元素中的 replaced-method 属性
        parseReplacedMethodSubElements(ele, bd.getMethodOverrides());

        // 解析 <bean> 元素的构造方法
        parseConstructorArgElements(ele, bd);
        // 解析 <bean> 元素中的所有 <property> 元素
        parsePropertyElements(ele, bd);
        // 解析 <bean> 元素的 qualifier 属性
        parseQualifierElements(ele, bd);

        // 为当前BeanDefinition对象 设置所需的资源和依赖对象
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
    // 解析 <bean> 元素出错时，返回 null
    return null;
}
```

对 bean 的部分子元素进行解析的具体实现。

```java
/**
 * 解析 <bean> 元素中所有的 <property> 子元素
 */
public void parsePropertyElements(Element beanEle, BeanDefinition bd) {
    // 获取对应 <bean> 元素中所有的 <property> 子元素，逐一解析
    NodeList nl = beanEle.getChildNodes();
    for (int i = 0; i < nl.getLength(); i++) {
        Node node = nl.item(i);
        // 对 <property> 子元素进行详细解析
        if (isCandidateElement(node) && nodeNameEquals(node, PROPERTY_ELEMENT)) {
            parsePropertyElement((Element) node, bd);
        }
    }
}

/**
 * 详细解析 <property> 元素
 */
public void parsePropertyElement(Element ele, BeanDefinition bd) {
    // 获取 <property> 元素的名字
    String propertyName = ele.getAttribute(NAME_ATTRIBUTE);
    if (!StringUtils.hasLength(propertyName)) {
        error("Tag 'property' must have a 'name' attribute", ele);
        return;
    }
    this.parseState.push(new PropertyEntry(propertyName));
    try {
        // 如果一个 Bean 中已经有同名的 property 存在，则不进行解析，直接返回。
        // 即如果在同一个 Bean 中配置同名的 property，则只有第一个起作用
        if (bd.getPropertyValues().contains(propertyName)) {
            error("Multiple 'property' definitions for property '" + propertyName + "'", ele);
            return;
        }
        // 解析获取 propertyName 对应的 value值，propertyName 及其 value值会被封装到
        // PropertyValue 对象中，然后 set 到 BeanDefinition对象中去
        Object val = parsePropertyValue(ele, bd, propertyName);
        // 根据 property 的 名字propertyName 和 值val 创建 PropertyValue实例
        PropertyValue pv = new PropertyValue(propertyName, val);
        // 解析 <meta> 元素
        parseMetaElements(ele, pv);
        pv.setSource(extractSource(ele));
        // 为当前的 BeanDefinition对象设置 propertyValues 属性值
        bd.getPropertyValues().addPropertyValue(pv);
    }
    finally {
        this.parseState.pop();
    }
}

/**
 * 解析获取 <property> 元素的属性值 value
 */
public Object parsePropertyValue(Element ele, BeanDefinition bd, String propertyName) {
    String elementName = (propertyName != null) ?
                    "<property> element for property '" + propertyName + "'" :
                    "<constructor-arg> element";

    // 获取 <property> 的所有子元素，只能是其中一种类型:ref,value,list 等
    NodeList nl = ele.getChildNodes();
    Element subElement = null;
    for (int i = 0; i < nl.getLength(); i++) {
        Node node = nl.item(i);
        // 如果子元素不是 description 和 meta 属性
        if (node instanceof Element && !nodeNameEquals(node, DESCRIPTION_ELEMENT) &&
                !nodeNameEquals(node, META_ELEMENT)) {
            // Child element is what we're looking for.
            if (subElement != null) {
                error(elementName + " must not contain more than one sub-element", ele);
            }
            else {// 当前 <property> 元素包含有子元素
                subElement = (Element) node;
            }
        }
    }

    // 判断 property 的属性值是 ref 还是 value，不允许既是 ref 又是 value
    boolean hasRefAttribute = ele.hasAttribute(REF_ATTRIBUTE);
    boolean hasValueAttribute = ele.hasAttribute(VALUE_ATTRIBUTE);
    if ((hasRefAttribute && hasValueAttribute) ||
            ((hasRefAttribute || hasValueAttribute) && subElement != null)) {
        error(elementName +
                " is only allowed to contain either 'ref' attribute OR 'value' attribute OR sub-element", ele);
    }

    // 如果属性是 ref，创建一个 ref 的数据对象 RuntimeBeanReference
    // 这个对象封装了 ref 信息
    if (hasRefAttribute) {
        String refName = ele.getAttribute(REF_ATTRIBUTE);
        if (!StringUtils.hasText(refName)) {
            error(elementName + " contains empty 'ref' attribute", ele);
        }
        // 一个指向运行时所依赖对象的引用
        RuntimeBeanReference ref = new RuntimeBeanReference(refName);
        // 设置这个 ref 的数据对象是被当前的 property 对象所引用
        ref.setSource(extractSource(ele));
        return ref;
    }
    // 如果属性是 value，创建一个 value 的数据对象 TypedStringValue
    // 这个对象封装了 value 信息
    else if (hasValueAttribute) {
        // 一个持有 String 类型值的对象
        TypedStringValue valueHolder = new TypedStringValue(ele.getAttribute(VALUE_ATTRIBUTE));
        // 设置这个 value 数据对象是被当前的 property 对象所引用
        valueHolder.setSource(extractSource(ele));
        return valueHolder;
    }
    // 如果当前 <property> 元素还有子元素
    else if (subElement != null) {
        // 解析 <property> 的子元素
        return parsePropertySubElement(subElement, bd);
    }
    else {
        // propery 属性中既不是 ref，也不是 value 属性，解析出错返回 null
        error(elementName + " must specify a ref or value", ele);
        return null;
    }
}

/**
 * 解析 <property> 元素中 ref,value 或者集合等子元素
 */
public Object parsePropertySubElement(Element ele, BeanDefinition bd) {
    return parsePropertySubElement(ele, bd, null);
}

public Object parsePropertySubElement(Element ele, BeanDefinition bd, String defaultValueType) {
    // 如果 <property> 没有使用 Spring 默认的命名空间，则使用用户自定义的规则解析
    // 内嵌元素
    if (!isDefaultNamespace(ele)) {
        return parseNestedCustomElement(ele, bd);
    }
    // 如果子元素是 bean，则使用解析 <Bean> 元素的方法解析
    else if (nodeNameEquals(ele, BEAN_ELEMENT)) {
        BeanDefinitionHolder nestedBd = parseBeanDefinitionElement(ele, bd);
        if (nestedBd != null) {
            nestedBd = decorateBeanDefinitionIfRequired(ele, nestedBd, bd);
        }
        return nestedBd;
    }
    // 如果子元素是 ref，ref 中只能有以下 3 个属性：bean、local、parent
    else if (nodeNameEquals(ele, REF_ELEMENT)) {
        // 获取 <property> 元素中的 bean 属性值，引用其他解析的 Bean 的名称
        // 可以不再同一个 Spring 配置文件中，具体请参考 Spring 对 ref 的配置规则
        String refName = ele.getAttribute(BEAN_REF_ATTRIBUTE);
        boolean toParent = false;
        if (!StringUtils.hasLength(refName)) {
            // 获取 <property> 元素中的 local 属性值，引用同一个 Xml 文件中配置
            // 的 Bean 的 id，local 和 ref 不同，local 只能引用同一个配置文件中的 Bean
            refName = ele.getAttribute(LOCAL_REF_ATTRIBUTE);
            if (!StringUtils.hasLength(refName)) {
                // 获取 <property> 元素中 parent 属性值，引用父级容器中的 Bean
                refName = ele.getAttribute(PARENT_REF_ATTRIBUTE);
                toParent = true;

                if (!StringUtils.hasLength(refName)) {
                    error("'bean', 'local' or 'parent' is required for <ref> element", ele);
                    return null;
                }
            }
        }

        // 没有配置 ref 的目标属性值
        if (!StringUtils.hasText(refName)) {
            error("<ref> element contains empty target attribute", ele);
            return null;
        }
        // 创建 ref 类型数据，指向被引用的对象
        RuntimeBeanReference ref = new RuntimeBeanReference(refName, toParent);
        // 设置引用类型值是被当前子元素所引用
        ref.setSource(extractSource(ele));
        return ref;
    }
    // 如果子元素是 <idref>，使用解析 ref 元素的方法解析
    else if (nodeNameEquals(ele, IDREF_ELEMENT)) {
        return parseIdRefElement(ele);
    }
    // 如果子元素是 <value>，使用解析 value 元素的方法解析
    else if (nodeNameEquals(ele, VALUE_ELEMENT)) {
        return parseValueElement(ele, defaultValueType);
    }
    //如果子元素是 null，为 <property> 设置一个封装 null 值的字符串数据
    else if (nodeNameEquals(ele, NULL_ELEMENT)) {
        TypedStringValue nullHolder = new TypedStringValue(null);
        nullHolder.setSource(extractSource(ele));
        return nullHolder;
    }
    // 如果子元素是 <array>，使用解析 array 集合子元素的方法解析
    else if (nodeNameEquals(ele, ARRAY_ELEMENT)) {
        return parseArrayElement(ele, bd);
    }
    // 如果子元素是 <list>，使用解析 list 集合子元素的方法解析
    else if (nodeNameEquals(ele, LIST_ELEMENT)) {
        return parseListElement(ele, bd);
    }
    // 如果子元素是 <set>，使用解析 set 集合子元素的方法解析
    else if (nodeNameEquals(ele, SET_ELEMENT)) {
        return parseSetElement(ele, bd);
    }
    // 如果子元素是 <map>，使用解析 map 集合子元素的方法解析
    else if (nodeNameEquals(ele, MAP_ELEMENT)) {
        return parseMapElement(ele, bd);
    }
    // 如果子元素是 <props>，使用解析 props 集合子元素的方法解析
    else if (nodeNameEquals(ele, PROPS_ELEMENT)) {
        return parsePropsElement(ele);
    }
    // 既不是 ref，又不是 value，也不是集合，则子元素配置错误，返回 null
    else {
        error("Unknown property sub-element: [" + ele.getNodeName() + "]", ele);
        return null;
    }
}

/**
 * 解析 <list> 集合子元素
 */
public List parseListElement(Element collectionEle, BeanDefinition bd) {
    // 获取 <list> 元素中的 value-type 属性，即获取集合元素的数据类型
    String defaultElementType = collectionEle.getAttribute(VALUE_TYPE_ATTRIBUTE);
    // 获取 <list> 集合元素中的所有子节点
    NodeList nl = collectionEle.getChildNodes();
    // Spring 中将 List 封装为 ManagedList
    ManagedList<Object> target = new ManagedList<Object>(nl.getLength());
    target.setSource(extractSource(collectionEle));
    // 设置集合目标数据类型
    target.setElementTypeName(defaultElementType);
    target.setMergeEnabled(parseMergeAttribute(collectionEle));
    // 具体的 <list> 元素解析
    parseCollectionElements(nl, target, bd, defaultElementType);
    return target;
}

/**
 * 具体解析 <list> 集合元素，<array>、<list> 和 <set> 都使用该方法解析
 */
protected void parseCollectionElements(NodeList elementNodes, Collection<Object> target,
        BeanDefinition bd, String defaultElementType) {

    // 遍历集合所有节点
    for (int i = 0; i < elementNodes.getLength(); i++) {
        Node node = elementNodes.item(i);
        // 节点不是 description 节点
        if (node instanceof Element && !nodeNameEquals(node, DESCRIPTION_ELEMENT)) {
            // 将解析的元素加入集合中，递归调用下一个子元素
            target.add(parsePropertySubElement((Element) node, bd, defaultElementType));
        }
    }
}
```

经过这样逐层地解析，我们在配置文件中定义的 bean 就被整个解析成了 IoC 容器能够装载和使用的 BeanDefinition 对象，这种数据结构可以让 IoC 容器执行索引、查询等操作。经过上述解析，接下来我们就可以将得到的 BeanDefinition 对象 注册到 IoC 容器中咯。
