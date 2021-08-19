## 前言

之前一直想系统的拜读一下 spring 的源码，看看它到底是如何吸引身边的大神们对它的设计赞不绝口，虽然每天工作很忙，每天下班后总感觉脑子内存溢出，想去放松一下，但总是以此为借口，恐怕会一直拖下去。所以每天下班虽然有些疲惫，但还是按住自己啃下这块硬骨头。

spring 源码这种东西真的是一回生二回熟，第一遍会被各种设计模式和繁杂的方法调用搞得晕头转向，不知道看到的这些方法调用的是哪个父类的实现（IoC 相关的类图实在太复杂咯，继承体系又深又广），但当你耐下心来多走几遍，会发现越看越熟练，每次都能 get 到新的点。

另外，对于第一次看 spring 源码的同学，建议先在 B 站上搜索相关视频看一下，然后再结合计文柯老师的《spring 技术内幕》深入理解，最后再输出自己的理解（写博文或部门内部授课）加强印象。

首先对于我们新手来说，还是从我们最常用的两个 IoC 容器开始分析，这次我们先分析 FileSystemXmlApplicationContext 这个 IoC 容器的具体实现，ClassPathXmlApplicationContext 留着下次讲解。

（PS：可以结合我 GitHub 上对 Spring 框架源码的翻译注释一起看，会更有助于各位同学的理解。地址：  
spring-beans https://github.com/AmyliaY/spring-beans-reading  
spring-context https://github.com/AmyliaY/spring-context-reading  
）

## 正文

当我们传入一个 Spring 配置文件去实例化 FileSystemXmlApplicationContext 时，可以看一下它的构造方法都做了什么。

```java
/**
 * 下面这 4 个构造方法都调用了第 5 个构造方法
 * @param configLocation
 * @throws BeansException
 */

// configLocation 包含了 BeanDefinition 所在的文件路径
public FileSystemXmlApplicationContext(String configLocation) throws BeansException {
    this(new String[] {configLocation}, true, null);
}

// 可以定义多个 BeanDefinition 所在的文件路径
public FileSystemXmlApplicationContext(String... configLocations) throws BeansException {
    this(configLocations, true, null);
}

// 在定义多个 BeanDefinition 所在的文件路径 的同时，还能指定自己的双亲 IoC 容器
public FileSystemXmlApplicationContext(String[] configLocations, ApplicationContext parent) throws BeansException {
    this(configLocations, true, parent);
}

public FileSystemXmlApplicationContext(String[] configLocations, boolean refresh) throws BeansException {
    this(configLocations, refresh, null);
}

/**
 * 如果应用直接使用 FileSystemXmlApplicationContext 进行实例化，则都会进到这个构造方法中来
 */
public FileSystemXmlApplicationContext(String[] configLocations, boolean refresh, ApplicationContext parent)
        throws BeansException {

    // 动态地确定用哪个加载器去加载我们的配置文件
    super(parent);
    // 告诉读取器 配置文件放在哪里，该方法继承于爷类 AbstractRefreshableConfigApplicationContext
    setConfigLocations(configLocations);
    if (refresh) {
        // 容器初始化
        refresh();
    }
}


/**
 * 实例化一个 FileSystemResource 并返回，以便后续对资源的 IO 操作
 * 本方法是在其父类 DefaultResourceLoader 的 getResource 方法中被调用的，
 */
@Override
protected Resource getResourceByPath(String path) {
    if (path != null && path.startsWith("/")) {
        path = path.substring(1);
    }
    return new FileSystemResource(path);
}
```

看看其父类 AbstractApplicationContext 实现的 refresh() 方法，该方法就是 IoC 容器初始化的入口类

```java
/**
 * 容器初始化的过程：BeanDefinition 的 Resource 定位、BeanDefinition 的载入、BeanDefinition 的注册。
 * BeanDefinition 的载入和 bean 的依赖注入是两个独立的过程，依赖注入一般发生在 应用第一次通过
 * getBean() 方法从容器获取 bean 时。
 *
 * 另外需要注意的是，IoC 容器有一个预实例化的配置（即，将 AbstractBeanDefinition 中的 lazyInit 属性
 * 设为 true），使用户可以对容器的初始化过程做一个微小的调控，lazyInit 设为 false 的 bean
 * 将在容器初始化时进行依赖注入，而不会等到 getBean() 方法调用时才进行
 */
public void refresh() throws BeansException, IllegalStateException {
    synchronized (this.startupShutdownMonitor) {
        // 调用容器准备刷新，获取容器的当前时间，同时给容器设置同步标识
        prepareRefresh();

        // 告诉子类启动 refreshBeanFactory() 方法，BeanDefinition 资源文件的载入从子类的 refreshBeanFactory() 方法启动开始
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

            // 初始化 Bean，并对 lazy-init 属性进行处理
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
```

看看 obtainFreshBeanFactory() 方法，该方法告诉了子类去刷新内部的 beanFactory

```java
/**
 * Tell the subclass to refresh the internal bean factory.
 * 告诉子类去刷新内部的 beanFactory
 */
protected ConfigurableListableBeanFactory obtainFreshBeanFactory() {
    // 自己定义了抽象的 refreshBeanFactory() 方法，具体实现交给了自己的子类
    refreshBeanFactory();
    // getBeanFactory() 也是一个抽象方法，交由子类实现
    // 看到这里是不是很容易想起 “模板方法模式”，父类在模板方法中定义好流程，定义好抽象方法
    // 具体实现交由子类完成
    ConfigurableListableBeanFactory beanFactory = getBeanFactory();
    if (logger.isDebugEnabled()) {
        logger.debug("Bean factory for " + getDisplayName() + ": " + beanFactory);
    }
    return beanFactory;
}
```

下面看一下 AbstractRefreshableApplicationContext 中对 refreshBeanFactory() 方法的实现。FileSystemXmlApplicationContext 从上层体系的各抽象类中继承了大量的方法实现，抽象类中抽取大量公共行为进行具体实现，留下 abstract 的个性化方法交给具体的子类实现，这是一个很好的 OOP 编程设计，我们在自己编码时也可以尝试这样设计自己的类图。理清 FileSystemXmlApplicationContext 的上层体系设计，就不易被各种设计模式搞晕咯。

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
        // 创建 IoC 容器，DefaultListableBeanFactory 类实现了 ConfigurableListableBeanFactory 接口
        DefaultListableBeanFactory beanFactory = createBeanFactory();
        beanFactory.setSerializationId(getId());
        // 对 IoC 容器进行定制化，如设置启动参数，开启注解的自动装配等
        customizeBeanFactory(beanFactory);
        // 载入 BeanDefinition，在当前类中只定义了抽象的 loadBeanDefinitions() 方法，具体实现 调用子类容器
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

AbstractXmlApplicationContext 中对 loadBeanDefinitions(DefaultListableBeanFactory beanFactory) 的实现。

```java
/*
 * 实现了基类 AbstractRefreshableApplicationContext 的抽象方法
 */
@Override
protected void loadBeanDefinitions(DefaultListableBeanFactory beanFactory) throws BeansException, IOException {
    // DefaultListableBeanFactory 实现了 BeanDefinitionRegistry 接口，在初始化 XmlBeanDefinitionReader 时
    // 将 BeanDefinition 注册器注入该 BeanDefinition 读取器
    // 创建用于从 Xml 中读取 BeanDefinition 的读取器，并通过回调设置到 IoC 容器中去，容器使用该读取器读取 BeanDefinition 资源
    XmlBeanDefinitionReader beanDefinitionReader = new XmlBeanDefinitionReader(beanFactory);

    beanDefinitionReader.setEnvironment(this.getEnvironment());
    // 为 beanDefinition 读取器设置 资源加载器，由于本类的基类 AbstractApplicationContext
    // 继承了 DefaultResourceLoader，因此，本容器自身也是一个资源加载器
    beanDefinitionReader.setResourceLoader(this);
    // 设置 SAX 解析器，SAX（simple API for XML）是另一种 XML 解析方法。相比于 DOM，SAX 速度更快，占用内存更小。
    // 它逐行扫描文档，一边扫描一边解析。相比于先将整个 XML 文件扫描近内存，再进行解析的 DOM，SAX 可以在解析文档的
    // 任意时刻停止解析，但操作也比 DOM 复杂。
    beanDefinitionReader.setEntityResolver(new ResourceEntityResolver(this));

    // 初始化 beanDefinition 读取器，该方法同时启用了 Xml 的校验机制
    initBeanDefinitionReader(beanDefinitionReader);
    // Bean 读取器真正实现加载的方法
    loadBeanDefinitions(beanDefinitionReader);
}
```

继续看 AbstractXmlApplicationContext 中 loadBeanDefinitions() 的重载方法。

```java
/**
 * 用传进来的 XmlBeanDefinitionReader 读取器加载 Xml 文件中的 BeanDefinition
 */
protected void loadBeanDefinitions(XmlBeanDefinitionReader reader) throws BeansException, IOException {

    /**
     * ClassPathXmlApplicationContext 与 FileSystemXmlApplicationContext 在这里的调用出现分歧，
     * 各自按不同的方式加载解析 Resource 资源，最后在具体的解析和 BeanDefinition 定位上又会殊途同归。
     */

    // 获取存放了 BeanDefinition 的所有 Resource，FileSystemXmlApplicationContext 类未对
    // getConfigResources() 进行重写，所以调用父类的，return null。
    // 而 ClassPathXmlApplicationContext 对该方法进行了重写，返回设置的值
    Resource[] configResources = getConfigResources();
    if (configResources != null) {
        // XmlBeanDefinitionReader 调用其父类 AbstractBeanDefinitionReader 的方法加载 BeanDefinition
        reader.loadBeanDefinitions(configResources);
    }
    // 调用父类 AbstractRefreshableConfigApplicationContext 的实现，
    // 优先返回 FileSystemXmlApplicationContext 构造方法中调用 setConfigLocations() 方法设置的资源
    String[] configLocations = getConfigLocations();
    if (configLocations != null) {
        // XmlBeanDefinitionReader 调用其父类 AbstractBeanDefinitionReader 的方法从配置位置加载 BeanDefinition
        reader.loadBeanDefinitions(configLocations);
    }
}
```

AbstractBeanDefinitionReader 中对 loadBeanDefinitions 方法的各种重载及调用。

```java
/**
 * loadBeanDefinitions() 方法的重载方法之一，调用了另一个重载方法 loadBeanDefinitions(String)
 */
public int loadBeanDefinitions(String... locations) throws BeanDefinitionStoreException {
    Assert.notNull(locations, "Location array must not be null");
    // 计数器，统计加载了多少个BeanDefinition
    int counter = 0;
    for (String location : locations) {
        counter += loadBeanDefinitions(location);
    }
    return counter;
}

/**
 * 重载方法之一，调用了下面的 loadBeanDefinitions(String, Set<Resource>) 方法
 */
public int loadBeanDefinitions(String location) throws BeanDefinitionStoreException {
    return loadBeanDefinitions(location, null);
}

/**
 * 获取在 IoC 容器初始化过程中设置的资源加载器
 */
public int loadBeanDefinitions(String location, Set<Resource> actualResources) throws BeanDefinitionStoreException {
    // 在实例化 XmlBeanDefinitionReader 后 IoC 容器将自己注入进该读取器作为 resourceLoader 属性
    ResourceLoader resourceLoader = getResourceLoader();
    if (resourceLoader == null) {
        throw new BeanDefinitionStoreException(
                "Cannot import bean definitions from location [" + location + "]: no ResourceLoader available");
    }

    if (resourceLoader instanceof ResourcePatternResolver) {
        try {
            // 将指定位置的 BeanDefinition 资源文件解析为 IoC 容器封装的资源
            // 加载多个指定位置的 BeanDefinition 资源文件
            Resource[] resources = ((ResourcePatternResolver) resourceLoader).getResources(location);
            // 委派调用其子类 XmlBeanDefinitionReader 的方法，实现加载功能
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
         * 及其子类都会调用 DefaultResourceLoader 中的实现，将指定位置的资源文件解析为 Resource，
         * 至此完成了对 BeanDefinition 的资源定位
         * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
         */
        Resource resource = resourceLoader.getResource(location);
        // 从 resource 中加载 BeanDefinition，loadCount 为加载的 BeanDefinition 个数
        // 该 loadBeanDefinitions() 方法来自其实现的 BeanDefinitionReader 接口，
        // 且本类是一个抽象类，并未对该方法进行实现。而是交由子类进行实现，如果是用 xml 文件进行
        // IoC 容器的初始化，则调用 XmlBeanDefinitionReader 中的实现
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

resourceLoader 的 getResource() 方法有多种实现，看清 FileSystemXmlApplicationContext 的继承体系就可以明确，其走的是 DefaultResourceLoader 中的实现。

```java
/**
 * 获取 Resource 的具体实现方法
 */
public Resource getResource(String location) {
    Assert.notNull(location, "Location must not be null");
    // 如果 location 是类路径的方式，返回 ClassPathResource 类型的文件资源对象
    if (location.startsWith(CLASSPATH_URL_PREFIX)) {
        return new ClassPathResource(location.substring(CLASSPATH_URL_PREFIX.length()), getClassLoader());
    }
    else {
        try {
            // 如果是 URL 方式，返回 UrlResource 类型的文件资源对象，
            // 否则将抛出的异常进入 catch 代码块，返回另一种资源对象
            URL url = new URL(location);
            return new UrlResource(url);
        }
        catch (MalformedURLException ex) {
            // 如果既不是 classpath 标识，又不是 URL 标识的 Resource 定位，则调用容器本身的
            // getResourceByPath() 方法获取 Resource。根据实例化的子类对象，调用其子类对象中
            // 重写的此方法，如 FileSystemXmlApplicationContext 子类中对此方法的重写
            return getResourceByPath(location);
        }
    }
}
```

其中的 getResourceByPath(location) 方法的实现则是在 FileSystemXmlApplicationContext 中完成的。

```java
/**
 * 实例化一个 FileSystemResource 并返回，以便后续对资源的 IO 操作
 * 本方法是在 DefaultResourceLoader 的 getResource() 方法中被调用的，
 */
@Override
protected Resource getResourceByPath(String path) {
    if (path != null && path.startsWith("/")) {
        path = path.substring(1);
    }
    return new FileSystemResource(path);
}
```

至此，我们可以看到，FileSystemXmlApplicationContext 的 getResourceByPath() 方法返回了一个 FileSystemResource 对象，接下来 spring 就可以对这个对象进行相关的 I/O 操作，进行 BeanDefinition 的读取和载入了。
