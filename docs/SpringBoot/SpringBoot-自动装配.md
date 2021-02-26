# Spring Boot 自动装配

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring-boot](https://github.com/SourceHot/spring-boot-read)

- `org.springframework.boot.autoconfigure.SpringBootApplication`

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@SpringBootConfiguration
@EnableAutoConfiguration
@ComponentScan(excludeFilters = { @Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class),
		@Filter(type = FilterType.CUSTOM, classes = AutoConfigurationExcludeFilter.class) })
public @interface SpringBootApplication {

	@AliasFor(annotation = EnableAutoConfiguration.class)
	Class<?>[] exclude() default {};

	@AliasFor(annotation = EnableAutoConfiguration.class)
	String[] excludeName() default {};

	@AliasFor(annotation = ComponentScan.class, attribute = "basePackages")
	String[] scanBasePackages() default {};

	@AliasFor(annotation = ComponentScan.class, attribute = "basePackageClasses")
	Class<?>[] scanBasePackageClasses() default {};

	@AliasFor(annotation = Configuration.class)
	boolean proxyBeanMethods() default true;

}

```

## EnableAutoConfiguration

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@AutoConfigurationPackage
@Import(AutoConfigurationImportSelector.class)
public @interface EnableAutoConfiguration {

}
```

## AutoConfigurationImportSelector

- 类图

![image-20200320150642022](../../images/SpringBoot/image-20200320150642022.png)

## getAutoConfigurationMetadata()

```java
		@Override
		public void process(AnnotationMetadata annotationMetadata, DeferredImportSelector deferredImportSelector) {
			Assert.state(deferredImportSelector instanceof AutoConfigurationImportSelector,
					() -> String.format("Only %s implementations are supported, got %s",
							AutoConfigurationImportSelector.class.getSimpleName(),
							deferredImportSelector.getClass().getName()));
			AutoConfigurationEntry autoConfigurationEntry = ((AutoConfigurationImportSelector) deferredImportSelector)
					.getAutoConfigurationEntry(
							// 加载配置元数据
							getAutoConfigurationMetadata(), annotationMetadata);
			this.autoConfigurationEntries.add(autoConfigurationEntry);
			for (String importClassName : autoConfigurationEntry.getConfigurations()) {
				this.entries.putIfAbsent(importClassName, annotationMetadata);
			}
		}


		private AutoConfigurationMetadata getAutoConfigurationMetadata() {
			if (this.autoConfigurationMetadata == null) {
				// 加载配置信息
				this.autoConfigurationMetadata = AutoConfigurationMetadataLoader.loadMetadata(this.beanClassLoader);
			}
			return this.autoConfigurationMetadata;
		}

```

- `org.springframework.boot.autoconfigure.AutoConfigurationMetadataLoader#loadMetadata(java.lang.ClassLoader)`

  ```java
  	static AutoConfigurationMetadata loadMetadata(ClassLoader classLoader, String path) {
  		try {

  		    // 获取资源路径
  			Enumeration<URL> urls = (classLoader != null) ? classLoader.getResources(path)
  					: ClassLoader.getSystemResources(path);
  			Properties properties = new Properties();
  			while (urls.hasMoreElements()) {
  				properties.putAll(PropertiesLoaderUtils.loadProperties(new UrlResource(urls.nextElement())));
  			}
  			return loadMetadata(properties);
  		}
  		catch (IOException ex) {
  			throw new IllegalArgumentException("Unable to load @ConditionalOnClass location [" + path + "]", ex);
  		}
  	}

  ```

  ![image-20200320160423991](../../images/SpringBoot/image-20200320160423991.png)

- `protected static final String PATH = "META-INF/spring-autoconfigure-metadata.properties";`

  注意： 这个文件在**target**编译后的文件夹中

  相关 Issues : https://github.com/spring-projects/spring-boot/issues/11282

- 自动装配

  `spring-boot-project/spring-boot-autoconfigure/src/main/resources/META-INF/spring.factories`

  该文件内存有:

  ```
  # Auto Configure
  org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
  org.springframework.boot.autoconfigure.admin.SpringApplicationAdminJmxAutoConfiguration,\
  org.springframework.boot.autoconfigure.aop.AopAutoConfiguration,\
  org.springframework.boot.autoconfigure.amqp.RabbitAutoConfiguration,\
  org.springframework.boot.autoconfigure.batch.BatchAutoConfiguration,\
  org.springframework.boot.autoconfigure.cache.CacheAutoConfiguration,\
  ```

![image-20200320162835665](../../images/SpringBoot/image-20200320162835665.png)

同样找一下 redis

![image-20200320163001728](../../images/SpringBoot/image-20200320163001728.png)

- 仔细看`org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration`类

先说注解

```java
@Configuration(proxyBeanMethods = false)
@ConditionalOnClass(RedisOperations.class)
@EnableConfigurationProperties(RedisProperties.class)
@Import({ LettuceConnectionConfiguration.class, JedisConnectionConfiguration.class })
```

### EnableConfigurationProperties

`自动映射一个POJO到Spring Boot配置文件（默认是application.properties文件）的属性集。`

- `org.springframework.boot.autoconfigure.data.redis.RedisProperties`
- 部分 redis 配置属性

```java
@ConfigurationProperties(prefix = "spring.redis")
public class RedisProperties {

	/**
	 * Database index used by the connection factory.
	 */
	private int database = 0;

	/**
	 * Connection URL. Overrides host, port, and password. User is ignored. Example:
	 * redis://user:password@example.com:6379
	 */
	private String url;

	/**
	 * Redis server host.
	 */
	private String host = "localhost";

	/**
	 * Login password of the redis server.
	 */
	private String password;

	/**
	 * Redis server port.
	 */
	private int port = 6379;

	/**
	 * Whether to enable SSL support.
	 */
	private boolean ssl;

	/**
	 * Connection timeout.
	 */
	private Duration timeout;

	/**
	 * Client name to be set on connections with CLIENT SETNAME.
	 */
	private String clientName;



}
```

- 找到一个我们用相同方式去寻找到别的一些属性处理如`org.springframework.boot.autoconfigure.jdbc.JdbcProperties` 具体展开请各位读者自行了解了

### AnnotationMetadata

回过头继续我们的主要流程

- `org.springframework.boot.autoconfigure.AutoConfigurationImportSelector.AutoConfigurationGroup#process`

  ![image-20200320163806852](../../images/SpringBoot/image-20200320163806852.png)

再此之前我们看过了`getAutoConfigurationMetadata()`的相关操作

关注 `AnnotationMetadata annotationMetadata` 存储了一些什么

![image-20200320164145286](../../images/SpringBoot/image-20200320164145286.png)

这里简单理解

1.  mergedAnnotations 类相关的注解信息
2.  annotationTypes 在启动类上的注解列表

### getAutoConfigurationEntry

```java
	protected AutoConfigurationEntry getAutoConfigurationEntry(AutoConfigurationMetadata autoConfigurationMetadata,
			AnnotationMetadata annotationMetadata) {
		if (!isEnabled(annotationMetadata)) {
			return EMPTY_ENTRY;
		}
		// 获取注解属性值
		AnnotationAttributes attributes = getAttributes(annotationMetadata);
		// 获取候选配置信息
		List<String> configurations = getCandidateConfigurations(annotationMetadata, attributes);
		// 删除重复配置
		configurations = removeDuplicates(configurations);
		// 获取 exclude 属性
		Set<String> exclusions = getExclusions(annotationMetadata, attributes);
		// 校验 exclude 类
		checkExcludedClasses(configurations, exclusions);
		// 配置中删除 exclude 的属性值
		configurations.removeAll(exclusions);
		// 过滤
		configurations = filter(configurations, autoConfigurationMetadata);
		// 触发自动配置事件
		fireAutoConfigurationImportEvents(configurations, exclusions);
		// 返回
		return new AutoConfigurationEntry(configurations, exclusions);
	}

```

### getAttributes

```java
	protected AnnotationAttributes getAttributes(AnnotationMetadata metadata) {
	    // name = org.springframework.boot.autoconfigure.EnableAutoConfiguration , 这是一个固定的值
		String name = getAnnotationClass().getName();
		// 获取注解的属性
		AnnotationAttributes attributes = AnnotationAttributes.fromMap(metadata.getAnnotationAttributes(name, true));
		Assert.notNull(attributes, () -> "No auto-configuration attributes found. Is " + metadata.getClassName()
				+ " annotated with " + ClassUtils.getShortName(name) + "?");
		return attributes;
	}

```

![image-20200320171138431](../../images/SpringBoot/image-20200320171138431.png)

### getCandidateConfigurations

- 读取`spring.factories`数据

```java
	protected List<String> getCandidateConfigurations(AnnotationMetadata metadata, AnnotationAttributes attributes) {
	    // 读取 org.springframework.boot.autoconfigure.EnableAutoConfiguration 相关配置
		List<String> configurations = SpringFactoriesLoader.loadFactoryNames(getSpringFactoriesLoaderFactoryClass(),
				getBeanClassLoader());
		Assert.notEmpty(configurations, "No auto configuration classes found in META-INF/spring.factories. If you "
				+ "are using a custom packaging, make sure that file is correct.");
		return configurations;
	}

```

![image-20200320171734270](../../images/SpringBoot/image-20200320171734270.png)

- 第一个是我自己写的一个测试用

  ```properties
  org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
    org.sourcehot.service.HelloServiceAutoConfiguration
  ```

### removeDuplicates

- new 两个对象直接做数据转换，去重

```java
	protected final <T> List<T> removeDuplicates(List<T> list) {
		return new ArrayList<>(new LinkedHashSet<>(list));
	}

```

### getExclusions

```java
	protected Set<String> getExclusions(AnnotationMetadata metadata, AnnotationAttributes attributes) {
		Set<String> excluded = new LinkedHashSet<>();
		// 获取属性 exclude 值转换成list
		excluded.addAll(asList(attributes, "exclude"));
      // 获取属性 excludeName 值转换成list
		excluded.addAll(Arrays.asList(attributes.getStringArray("excludeName")));
		// 获取 SpringBoot 本身的忽略配置属性
		excluded.addAll(getExcludeAutoConfigurationsProperty());
		return excluded;
	}

```

### getExcludeAutoConfigurationsProperty

```java
	private List<String> getExcludeAutoConfigurationsProperty() {
		if (getEnvironment() instanceof ConfigurableEnvironment) {
			Binder binder = Binder.get(getEnvironment());
			// 取出 "spring.autoconfigure.exclude" 转换成list
			return binder.bind(PROPERTY_NAME_AUTOCONFIGURE_EXCLUDE, String[].class).map(Arrays::asList)
					.orElse(Collections.emptyList());
		}
		String[] excludes = getEnvironment().getProperty(PROPERTY_NAME_AUTOCONFIGURE_EXCLUDE, String[].class);
		return (excludes != null) ? Arrays.asList(excludes) : Collections.emptyList();
	}

```

![image-20200323080611527](../../images/SpringBoot/image-20200323080611527.png)

- 修改启动类

  ```java
  @SpringBootApplication(excludeName =  { "org.sourcehot.service.HelloServiceAutoConfiguration" })

  ```

  ![image-20200323081009823](../../images/SpringBoot/image-20200323081009823.png)

### checkExcludedClasses

```java
	private void checkExcludedClasses(List<String> configurations, Set<String> exclusions) {
		List<String> invalidExcludes = new ArrayList<>(exclusions.size());
		for (String exclusion : exclusions) {
			//
			if (ClassUtils.isPresent(exclusion, getClass().getClassLoader()) && !configurations.contains(exclusion)) {
				invalidExcludes.add(exclusion);
			}
		}
		if (!invalidExcludes.isEmpty()) {
			// 处理忽略的类
			handleInvalidExcludes(invalidExcludes);
		}
	}

```

- `configurations.removeAll(exclusions)`

  移除忽略的类

### filter

```java
	private List<String> filter(List<String> configurations, AutoConfigurationMetadata autoConfigurationMetadata) {
		long startTime = System.nanoTime();
		String[] candidates = StringUtils.toStringArray(configurations);
		boolean[] skip = new boolean[candidates.length];
		boolean skipped = false;
		// 获取 AutoConfigurationImportFilter 相关配置
		for (AutoConfigurationImportFilter filter : getAutoConfigurationImportFilters()) {
		    // 执行 aware 相关接口
			invokeAwareMethods(filter);
			// 比较
			boolean[] match = filter.match(candidates, autoConfigurationMetadata);
			for (int i = 0; i < match.length; i++) {
				if (!match[i]) {
					skip[i] = true;
					candidates[i] = null;
					skipped = true;
				}
			}
		}
		if (!skipped) {
			return configurations;
		}
		List<String> result = new ArrayList<>(candidates.length);
		for (int i = 0; i < candidates.length; i++) {
			if (!skip[i]) {
				result.add(candidates[i]);
			}
		}
		if (logger.isTraceEnabled()) {
			int numberFiltered = configurations.size() - result.size();
			logger.trace("Filtered " + numberFiltered + " auto configuration class in "
					+ TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startTime) + " ms");
		}
		return new ArrayList<>(result);
	}

```

- `getAutoConfigurationImportFilters()` 从`spring.factories` 获取 `AutoConfigurationImportFilter`的接口

![image-20200323081903145](../../images/SpringBoot/image-20200323081903145.png)

- 循环内执行`Aware`系列接口

`match`方法: `org.springframework.boot.autoconfigure.AutoConfigurationImportFilter#match`

- `filter.match(candidates, autoConfigurationMetadata)` 比较判断哪些是需要自动注入的类

![image-20200323082553595](../../images/SpringBoot/image-20200323082553595.png)

### fireAutoConfigurationImportEvents

```java
	private void fireAutoConfigurationImportEvents(List<String> configurations, Set<String> exclusions) {
		// 获取自动配置的监听器列表
		List<AutoConfigurationImportListener> listeners = getAutoConfigurationImportListeners();
		if (!listeners.isEmpty()) {
			// 创建 自动配置事件
			AutoConfigurationImportEvent event = new AutoConfigurationImportEvent(this, configurations, exclusions);
			for (AutoConfigurationImportListener listener : listeners) {
				// 执行 Aware 相关接口
				invokeAwareMethods(listener);
				// 监听器执行自动配置事件
				listener.onAutoConfigurationImportEvent(event);
			}
		}
	}

```

![image-20200323083149737](../../images/SpringBoot/image-20200323083149737.png)

- `AutoConfigurationImportEvent event = new AutoConfigurationImportEvent(this, configurations, exclusions);`

![image-20200323083247061](../../images/SpringBoot/image-20200323083247061.png)

- `org.springframework.boot.autoconfigure.AutoConfigurationImportListener#onAutoConfigurationImportEvent` 在执行自动配置时触发 , 实现类只有 **`ConditionEvaluationReportAutoConfigurationImportListener`**

  ```java
  	@Override
  	public void onAutoConfigurationImportEvent(AutoConfigurationImportEvent event) {
  		if (this.beanFactory != null) {
  			ConditionEvaluationReport report = ConditionEvaluationReport.get(this.beanFactory);
  			// 记录需要加载的配置
  			report.recordEvaluationCandidates(event.getCandidateConfigurations());
  			// 记录不需要加载的配置
  			report.recordExclusions(event.getExclusions());
  		}
  	}

  ```

![image-20200323083656670](../../images/SpringBoot/image-20200323083656670.png)

- 初始化完

## process

- `org.springframework.boot.autoconfigure.AutoConfigurationImportSelector.AutoConfigurationGroup#process`

![image-20200323084922159](../../images/SpringBoot/image-20200323084922159.png)

- 后续的一些行为相对简单，直接放个源码了.

```java
@Override
		public void process(AnnotationMetadata annotationMetadata, DeferredImportSelector deferredImportSelector) {
			Assert.state(deferredImportSelector instanceof AutoConfigurationImportSelector,
					() -> String.format("Only %s implementations are supported, got %s",
							AutoConfigurationImportSelector.class.getSimpleName(),
							deferredImportSelector.getClass().getName()));
			// 自动装配信息
			AutoConfigurationEntry autoConfigurationEntry = ((AutoConfigurationImportSelector) deferredImportSelector)
					.getAutoConfigurationEntry(
							// 加载配置元数据
							getAutoConfigurationMetadata(), annotationMetadata);
			this.autoConfigurationEntries.add(autoConfigurationEntry);
			// 循环需要自动注入的类
			for (String importClassName : autoConfigurationEntry.getConfigurations()) {
				// 继续放入k,v
				this.entries.putIfAbsent(importClassName, annotationMetadata);
			}
		}
```

## selectImports

```java
		@Override
		public Iterable<Entry> selectImports() {
			if (this.autoConfigurationEntries.isEmpty()) {
				return Collections.emptyList();
			}
			// 获取忽略的类
			Set<String> allExclusions = this.autoConfigurationEntries.stream()
					.map(AutoConfigurationEntry::getExclusions).flatMap(Collection::stream).collect(Collectors.toSet());

			// 获取需要注入的类
			Set<String> processedConfigurations = this.autoConfigurationEntries.stream()
					.map(AutoConfigurationEntry::getConfigurations).flatMap(Collection::stream)
					.collect(Collectors.toCollection(LinkedHashSet::new));

			// 把不需要自动注入的类从需要注入的类中移除
			processedConfigurations.removeAll(allExclusions);

			// 排序
			return sortAutoConfigurations(processedConfigurations, getAutoConfigurationMetadata()).stream()
					.map((importClassName) -> new Entry(this.entries.get(importClassName), importClassName))
					.collect(Collectors.toList());
		}

```

后续由 spring 进行不再继续跟踪
