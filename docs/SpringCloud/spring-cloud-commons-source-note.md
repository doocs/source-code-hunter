# 说明

Author: [haitaoss](https://github.com/haitaoss)

源码阅读仓库: [spring-cloud-commons](https://github.com/haitaoss/spring-cloud-commons)

参考资料和需要掌握的知识：

- [SpringBoot 源码分析](https://github.com/haitaoss/spring-boot/blob/source-v2.7.8/note/springboot-source-note.md)
- [Spring 源码分析](https://github.com/haitaoss/spring-framework)
- [Spring Cloud 官网文档](https://docs.spring.io/spring-cloud/docs/2021.0.5/reference/html/)
- [Spring Cloud Commons 官网文档](https://docs.spring.io/spring-cloud-commons/docs/3.1.5/reference/html/)

# Spring Cloud 介绍

SpringCloud 是在 SpringBoot 的基础上构建的。Spring Cloud 以两个库的形式提供了许多特性：Spring Cloud Context 和 Spring Cloud Commons。Spring Cloud Context 为 SpringCloud 应用程序的 ApplicationContext 提供扩展机制（引导上下文、加密、刷新属性和环境端点）。Spring Cloud Commons 是一组抽象(服务注册、负载均衡、熔断器等 API) 和 通用类，用于不同的 Spring Cloud 实现（例如 Spring Cloud Netflix 和 Spring Cloud Consul）

是基于 Spring Boot 的自动装配原理实现的，其实就是定义了很多自动配置类，所以在 SpringCloud 的环境下 启动 SpringBoot 程序 会有很多功能。

# 核心功能源码分析

## BootstrapApplicationListener (bootstrap.properties 读取原理)

[前置知识：SprinBoot 加载 application.yml 的原理](https://github.com/haitaoss/spring-boot/blob/source-v2.7.8/note/springboot-source-note.md#%E5%B1%9E%E6%80%A7%E6%96%87%E4%BB%B6%E7%9A%84%E5%8A%A0%E8%BD%BD%E9%A1%BA%E5%BA%8F)

示例代码

```java
@EnableAutoConfiguration
public class Main {

	public static void main(String[] args) {
		// 是否创建 bootstrapContext
		System.setProperty("spring.cloud.bootstrap.enabled", "true");
		// 设置 bootstrapContext 中属性文件的搜索目录 或者是 属性文件
		System.setProperty("spring.cloud.bootstrap.location", "");
		System.setProperty("spring.cloud.bootstrap.additional-location",
				"optional:classpath:/config/haitao/,classpath:/haitao.properties");
		// 设置 bootstrapContext 默认属性文件的名字
		// System.setProperty("spring.cloud.bootstrap.name", "bootstrap-haitao");
		// 设置 profile
		// System.setProperty("spring.profiles.active", "haitao");
		// 测试读取属性
		ConfigurableApplicationContext context = SpringApplication.run(Main.class, args);
		ConfigurableEnvironment environment = context.getEnvironment();
		Stream.iterate(1, i -> i + 1).limit(5).map(i -> "p" + i).forEach(
				name -> System.out.println(String.format("key:%s \t valus: %s", name, environment.getProperty(name))));
	}

}
```

BootstrapApplicationListener 是用于完成 SpringCloud 的接入的，主要是完成 bootstrapContext 的创建、bootstrap 属性的加载、设置 bootstrapContext 为父容器。下面是 BootstrapApplicationListener 被触发的入口和核心逻辑

```java
/**
 * BootstrapApplicationListener 是用于完成 SpringCloud 的接入的，主要是完成 bootstrapContext的创建、bootstrap属性的加载、设置bootstrapContext为父容器。
 * 下面是 BootstrapApplicationListener 被触发的入口和核心逻辑
 *
 *
 * SpringBoot 启动的生命周期的配置Environment阶段，会发布 ApplicationEnvironmentPreparedEvent 事件，所以 BootstrapApplicationListener 会收到事件
 *      {@link SpringApplication#run(String...)}
 *      {@link SpringApplication#prepareEnvironment(SpringApplicationRunListeners, DefaultBootstrapContext, ApplicationArguments)}
 *      {@link EventPublishingRunListener#environmentPrepared(ConfigurableBootstrapContext, ConfigurableEnvironment)}
 *      {@link EnvironmentPostProcessorApplicationListener#onApplicationEvent(ApplicationEvent)}
 *      {@link BootstrapApplicationListener#onApplicationEvent(org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent)}
 *
 *      注：spring-cloud-context.jar!/META-INF/spring.factories 中声明了 BootstrapApplicationListener
 *
 * BootstrapApplicationListener#onApplicationEvent 的核心逻辑
 *  1. 属性 spring.cloud.bootstrap.enabled == false 就直接 return 不做处理
 *
 *  2. 构造出 bootstrap context, 拷贝 PropertySource、ApplicationContextInitializer 给当前 SpringApplication
 *      2.1 构造一个 bootstrapEnvironment，主要是设置这三个属性
 *         由 ${spring.cloud.bootstrap.name:bootstrap}       设置  spring.config.name                  属性的值
 *         由 ${spring.cloud.bootstrap.location}             设置  spring.config.location              属性的值
 *         由 ${spring.cloud.bootstrap.additional-location}  设置  spring.config.additional-location   属性的值
 *
 *         Tips：这三个属性是为了指定SpringBoot启动时应该读取那些目录下的属性文件，从而实现扩展 Environment
 *
 *      2.2 配置 SpringApplicationBuilder，最主要是设置 BootstrapImportSelectorConfiguration 作为源配置类
 *          `SpringApplicationBuilder builder = new SpringApplicationBuilder()
 *            .environment(bootstrapEnvironment)
 *            .sources(BootstrapImportSelectorConfiguration.class);`
 *
 *            注：BootstrapImportSelectorConfiguration 这个类会 @Import(BootstrapImportSelector.class),其作用是读取 META-INF/spring.factories 文件
 *              获取key为`BootstrapConfiguration.class.getName()`的值 和 属性 spring.cloud.bootstrap.sources 的值作为配置类导入到 BeanFactory 中
 *
 *      2.3 使用 SpringApplicationBuilder 构造出 Context，也就是又通过 SpringBoot 创建一个 context , 说白了就是利用 SpringBoot 加载 application.yml 的逻辑来加载 bootstrap.yml
 *          `ConfigurableApplicationContext bootstrapContext = builder.run();`
 *
 *      2.4 将 bootstrapContext 中的 Environment 追加到 event.getSpringApplication() 中，从而将 bootstrap.properties 属性内容 扩展到 event.getSpringApplication() 中
 *
 *      2.5 将 bootstrapContext 中的 ApplicationContextInitializer 追加到 event.getSpringApplication() 中
 *              - 有一个 PropertySourceBootstrapConfiguration ,这个是用来添加 PropertySource 到Environment中的，具体有哪些 PropertySource，
 *                  可以注册 PropertySourceLocator bean来自定义逻辑(比如 本地文件、网络资源 )
 *
 *              - 有一个 AncestorInitializer , 其作用是设置 bootstrapContext 作为 application 的父容器
 *
 *  Tips：说白了 bootstrapContext 的目的就是 加载bootstrap属性 和 生成 ApplicationContextInitializer，这两个东西都会设置给
 *        SpringApplication，从而实现对 SpringBoot 应用的定制化。可以把 bootstrapContext 理解成父容器，因为会通过 AncestorInitializer
 *        将 bootstrapContext 设置为IOC容器的父容器。
 * */
```

### BootstrapImportSelectorConfiguration

用来扩展 bootstrapContext 中的配置类

```java
// 类的声明如下
@Configuration(proxyBeanMethods = false)
@Import(BootstrapImportSelector.class)
public class BootstrapImportSelectorConfiguration {}
```

```java
/**
 * BootstrapImportSelectorConfiguration 会通过 @Import 导入 {@link BootstrapImportSelector}
 * 其回调方法 {@link BootstrapImportSelector#selectImports(AnnotationMetadata)} 的逻辑是
 *  1. 读取 META-INF/spring.factories 获取key为BootstrapConfiguration的值
 *  2. 获取属性 spring.cloud.bootstrap.sources 的值
 *  3. 合并第一第二的值，然后排序
 *  4. 会将值注册到容器中,作为容器的配置类
 *
 * 而
 * spring-cloud-context.jar!/META-INF/spring.factories 中定义了
 *  org.springframework.cloud.bootstrap.BootstrapConfiguration = org.springframework.cloud.bootstrap.config.PropertySourceBootstrapConfiguration
 *
 * 也就是 {@link PropertySourceBootstrapConfiguration} 会注册到 bootstrapContext 中，
 * 它是 ApplicationContextInitializer 类型的，最终会用来初始化 context
 * */
```

### PropertySourceBootstrapConfiguration

示例代码

```java
public class MyPropertySourceLocator implements PropertySourceLocator {

    public MyPropertySourceLocator() {
        System.out.println("MyPropertySourceLocator...构造器");
    }

    @Resource
    private ApplicationContext applicationContext;

    @Value("${dynamicConfigFile}")
    private String filePath;

    @Override
    public PropertySource<?> locate(Environment environment) {
        PropertySource<?> propertySource;
        try {
            // 也可以改成网络资源
            propertySource = new YamlPropertySourceLoader()
                    .load("haitao-propertySource", applicationContext.getResource(filePath)).get(0);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
        return propertySource;
    }

}
```

`META-INF/spring.factories`

```properties
org.springframework.cloud.bootstrap.BootstrapConfiguration=\
  cn.haitaoss.BootstrapProperties.BootstrapConfiguration.MyPropertySourceLocator
```

```java
/**
 * PropertySourceBootstrapConfiguration 是用来初始化IOC容器的，其初始化逻辑是扩展IOC容器的Environment，
 * 可以自定义 PropertySourceLocator 用来扩展 Environment
 *
 * {@link PropertySourceBootstrapConfiguration#initialize(ConfigurableApplicationContext)}
 *
 * 1. 通过依赖注入对属性赋值
 *     @Autowired(required = false)
 *     private List<PropertySourceLocator> propertySourceLocators = new ArrayList<>();
 *
 * 2. 排序
 *      AnnotationAwareOrderComparator.sort(this.propertySourceLocators);
 *
 * 3. 遍历 propertySourceLocators , 然后回调方法得到 PropertySource 收集起来
 *      for (PropertySourceLocator locator : this.propertySourceLocators) {
 *          Collection<PropertySource<?>> source = locator.locateCollection(environment);
 *          sourceList.addAll(source);
 *      }
 *
 * 4. 根据属性值决定插入到Environment的顺序
 *      spring.cloud.config.overrideSystemProperties 默认是 true
 *      spring.cloud.config.allowOverride 默认是 true
 *      spring.cloud.config.overrideNone 默认是 false
 *
 *       if !allowOverride || (!overrideNone && overrideSystemProperties)
 *          通过 PropertySourceLocator 得到的 PropertySource 会添加到最前面,也就是优先生效
 *       else if overrideNone
 *          通过 PropertySourceLocator 得到的 PropertySource 会添加到最后面,也就是兜底生效
 *       else if !overrideSystemProperties
 *          通过 PropertySourceLocator 得到的 PropertySource 会放在 systemEnvironment 的后面
 *       else if overrideSystemProperties
 *          通过 PropertySourceLocator 得到的 PropertySource 会放在 systemEnvironment 的前面
 *       else
 *          通过 PropertySourceLocator 得到的 PropertySource 会添加到最后面,也就是兜底生效
 *
 *      注：也就是可以通过这三个属性值，决定最终 Environment 属性的读取顺序
 *
 * */
```

## @RefreshScope 和 @ConfigurationProperties bean 的更新

示例代码

```java
@SpringBootApplication
public class Main {

	/**
	 * 总结用法:
	 *
	 * 可以通过属性 spring.cloud.refresh.refreshable spring.cloud.refresh.extraRefreshable
	 * 代替 @RefreshScope
	 *
	 * 可以设置属性 spring.cloud.refresh.enabled=false 取消 @RefreshScope 的自动注入 是
	 * spring.cloud.refresh.never-refreshable 属性记录的类就不重会新绑定属性
	 */
	public static void main(String[] args) {
		// TODOHAITAO: 2023/4/6 访问验证属性更新 GET http://127.0.0.1:8080/actuator/refresh
		// 启用 bootstrap 属性的加载
		System.setProperty("spring.cloud.bootstrap.enabled", "true");

        // 通过配置属性的方式，扩展bean为 refresh scope 的
		System.setProperty("spring.cloud.refresh.refreshable",
				Arrays.asList(RefreshScopeBean1.class.getName(), RefreshScopeBean2.class.getName()).stream()
						.collect(Collectors.joining(",")));
		System.setProperty("spring.cloud.refresh.extraRefreshable",
				Arrays.asList(Object.class.getName()).stream().collect(Collectors.joining(",")));

        // 设置 bootstrapContext 会默认加载的 bean
        System.setProperty("spring.cloud.bootstrap.sources","cn.haitaoss.RefreshScope.config.MyPropertySourceLocator");
	}

}
```

```java
/**
 * 只是列举了我觉得比较重要的，并不是全部内容
 * spring-cloud-context.jar!/META-INF/spring.factories
 *
 * org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
 * org.springframework.cloud.autoconfigure.ConfigurationPropertiesRebinderAutoConfiguration,\
 * org.springframework.cloud.autoconfigure.RefreshAutoConfiguration,\
 * org.springframework.cloud.autoconfigure.RefreshEndpointAutoConfiguration
 *
 * org.springframework.context.ApplicationListener=\
 * org.springframework.cloud.bootstrap.BootstrapApplicationListener
 *
 * org.springframework.cloud.bootstrap.BootstrapConfiguration=\
 * org.springframework.cloud.bootstrap.config.PropertySourceBootstrapConfiguration
 * */
```

### ConfigurationPropertiesRebinderAutoConfiguration

1. 记录 @ConfigurationProperties 的 bean
2. 接收 EnvironmentChangeEvent 事件，对记录的 bean 进行重新初始化从而完成属性的更新

```java
/**
 * ConfigurationPropertiesRebinderAutoConfiguration
 *      注册 ConfigurationPropertiesBeans :
 *          - 是 BeanPostProcessor 其作用是记录有 @ConfigurationProperties注解 标注的bean
 *
 *      注册 ConfigurationPropertiesRebinder :
 *          - 实现了 ApplicationListener<EnvironmentChangeEvent> 接口，还依赖 ConfigurationPropertiesBeans。
 *          收到事件的处理逻辑是，遍历 ConfigurationPropertiesBeans 记录的 bean 对其进行重新绑定。其实就是 回调bean的销毁方法，然后对bean重新初始化而已，
 *          而不是直接从BeanFactory中删除bean。
 *
 *          注：
 *              1. 会过滤掉是 refresh scope 的bean，因为 refresh 作用域的bean由其他类进行刷新
 *              2. 是 spring.cloud.refresh.never-refreshable 属性记录的类就不要重新绑定属性
 *
 *      实现了 SmartInitializingSingleton ，会在 单例bean实例化完后被回调，其回调方法的逻辑是使用 ConfigurationPropertiesRebinder 对父容器中的bean进行重新绑定
 *
 * */
```

### RefreshAutoConfiguration

1. 注册 refresh scope 到 BeanFactory 中
2. 接收 RefreshEvent 事件，更新 Environment 和 清空 refresh scope 中记录的 bean
3. 使用 @RefreshScope 标注的 bean，最终生成的是代理对象，每次执行代理对象的方法，都会从 refresh scope 中获取 bean 得到调用方法的对象，从而能保证更新之后，获取的对象也是新的

```java
/**
 * RefreshAutoConfiguration
 *      可以设置属性 spring.cloud.refresh.enabled=false 让这个自动配置类不生效
 *
 *      注册 RefreshScope :
 *          - 实现 ApplicationListener<ContextRefreshedEvent> 接口，收到事件的处理逻辑是对 refresh scope 的bean进行实例化(非懒加载的)
 *          - 实现 BeanFactoryPostProcessor 接口，接口方法的实现逻辑是 将当前scope注册到 BeanFactory 中
 *          - 实现 BeanDefinitionRegistryPostProcessor 接口，接口方法的实现逻辑是过滤出 beanClass 是 ScopedProxyFactoryBean 改成 LockedScopedProxyFactoryBean
 *              注：LockedScopedProxyFactoryBean 是用来生成代理对象的工具类，会默认添加一个 MethodInterceptor,该拦截器是先加 读锁 再执行方法，
 *              其目的是因为 RefreshScope 的刷新方法，会遍历域中的所有对象 上写锁之后在销毁bean，从而保证如果scope刷新时，方法的执行会被堵塞，
 *              而bean的创建是通过 synchronized 保证一致性。
 *
 *              注：@RefreshScope 标注的bean，会在解析BeanDefinition时，设置其beanClass为 ScopedProxyFactoryBean
 *
 *      注册 LoggingRebinder :
 *          - 实现 ApplicationListener<EnvironmentChangeEvent> 接口，收到事件的处理逻辑是获取属性前缀 logging.level 重新设置日志级别
 *
 *      注册 LegacyContextRefresher 或 ConfigDataContextRefresher :
 *          - 是 ContextRefresher 类型的，这两个bean是互斥的只会注册一个。
 *          1. 刷新 Environment。更新原理是 重新启动一个SpringBoot 从而实现属性文件的加载，然后将新生成 PropertySource 替换或者追加到 当前context的Environment中
 *              更新完会发布 EnvironmentChangeEvent 事件
 *          2. 刷新 refresh Scope 中的bean，其实就是情况作用域中的bean，然后会发布 RefreshScopeRefreshedEvent 事件
 *
 *
 *      注册 RefreshEventListener :
 *          - 其实现了 SmartApplicationListener 接口, 会接收 RefreshEvent 事件，收到事件的处理逻辑是回调 ContextRefresher#refresh 来
 *          更新 Environment，刷新 refresh 作用域
 *
 *      注册 RefreshScopeBeanDefinitionEnhancer :
 *          - 实现 BeanDefinitionRegistryPostProcessor 接口，接口的实现逻辑是过滤出 beanClass 在属性
 *              spring.cloud.refresh.refreshable 或者 spring.cloud.refresh.extraRefreshable 中
 *              就设置为 refresh scope ，并修改其beanClass为 ScopedProxyFactoryBean。也就是省略 @RefreshScope 的一种方式
 *
 *      Tips：要想实现自定义 Environment 和 refresh bean 的更新逻辑，可以自定注册 ContextRefresher
 * */
```

### RefreshEndpointAutoConfiguration

```java
/**
 * RefreshEndpointAutoConfiguration
 *      注册 RefreshEndpoint :
 *          只定义了一个 @WriteOperation , 该方法的逻辑是会执行 ContextRefresher#refresh 方法，从而 更新 Environment，刷新 refresh 作用域
 *          POST http://localhost:8080/actuator/refresh 可以触发该操作
 *
 *          注：得导入 spring-boot-starters-actuator 才会生效
 *
 *      ...还注册了很多 bean , 暂时不看了 , 用到再看吧
 * */
```

## @EnableDiscoveryClient

```java
/**
 * {@link EnableDiscoveryClient}
 *      @EnableDiscoveryClient(autoRegister=true)
 *      1. 的目的是将 META-INF/spring.factories 中 key 是 `EnableDiscoveryClient.class.getName()` 的类注册到 BeanFactory 中
 *      2. 若 autoRegister==true , 还会注册 AutoServiceRegistrationConfiguration 到 BeanFactory 中,
 *          这个类的目的很简单，就是注册 AutoServiceRegistrationProperties 到BeanFactory中
 *      3. 若 autoRegister==false, 会设置属性 spring.cloud.service-registry.auto-registration.enabled 为 false，
 *          这个为 false 就会导致 AutoServiceRegistrationAutoConfiguration 的 @conditional注解不匹配，从而不会生效
 *
 *      总结：注册 AutoServiceRegistrationProperties 和 META-INF/spring.factories 中的类 到容器中
 *
 *
 * 其实 @EnableDiscoveryClient 没啥用了，因为 spring-cloud-commons.jar!/META-INF/spring.factories 中声明了
 *      org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
 *          org.springframework.cloud.client.serviceregistry.AutoServiceRegistrationAutoConfiguration
 * 也就是 AutoServiceRegistrationAutoConfiguration 会自动注入。但是需要 DiscoveryClient 的bean能被发现，
 * 必须得自己注册到BeanFactory中，不能使用 META-INF/spring.factories 设置 key 是 `EnableDiscoveryClient.class.getName()`
 *
 * {@link AutoServiceRegistrationAutoConfiguration}
 *      通过 @PostConstruct 的方式让校验方法被调用，是用来校验 AutoServiceRegistration 类型的bean是否存在，但是默认是不会报错的
 *      可以设置 spring.cloud.service-registry.auto-registration.failFast=true 的方式,启用校验。
 *
 * 总结：@EnableDiscoveryClient 的核心功能是可以将声明在 META-INF/spring.factories 中的类注册到容器中（key是 `EnableDiscoveryClient.class.getName()`）
 * */
```

## @LoadBalanced

```java
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.METHOD })
@Retention(RetentionPolicy.RUNTIME)
@Qualifier
public @interface LoadBalanced {}
```

```java
/**
 * @LoadBalanced 的作用
 *  1. 其本质是一个 @Qualifier 。在依赖注入的过滤候选bean时会校验 @Qualifier 的值
 *  2. 作为标记注解，比如 LoadBalancerWebClientBuilderBeanPostProcessor 会过滤出有 @LoadBalanced 的bean进行处理
 * */
```

```java
public class Config {

    @Bean
    @LoadBalanced
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

    @Bean
    public RestTemplate restTemplate2() {
        return new RestTemplate();
    }
}

public class LoadBalancerAutoConfiguration {

   // 只会注入 restTemplate 不会注入 restTemplate2
   @LoadBalanced
   @Autowired(required = false)
   private List<RestTemplate> restTemplates = Collections.emptyList();

}
```

## @LoadBalancerClient 和@LoadBalancerClients

@LoadBalancerClient 映射成 LoadBalancerClientSpecification 然后注册到 BeanFactory 中。

@LoadBalancerClients 其实就是多个 @LoadBalancerClient

```java
@Configuration(proxyBeanMethods = false)
@Import(LoadBalancerClientConfigurationRegistrar.class)
public @interface LoadBalancerClient {

	@AliasFor("name")
	String value() default "";

	@AliasFor("value")
	String name() default "";

	Class<?>[] configuration() default {};
}
```

```java
/**
 * LoadBalancerClientConfigurationRegistrar 是 ImportBeanDefinitionRegistrar 的实现类，所以IOC容器解析到 @Import(LoadBalancerClientConfigurationRegistrar.class)
 * 会回调其方法
 * {@link LoadBalancerClientConfigurationRegistrar#registerBeanDefinitions(AnnotationMetadata, BeanDefinitionRegistry)}
 *  1. 获取注解的元数据信息
 *      Map<String, Object> client = metadata.getAnnotationAttributes(LoadBalancerClient.class.getName(), true);
 *
 *  2. 获取name，获取的是注解的value属性值或者是注解的name属性值
 *      String name = getClientName(client);
 *
 *  3. 映射成BeanDefinition然后注册到BeanFactory中
 *
 *      BeanDefinitionBuilder builder = BeanDefinitionBuilder
 *                .genericBeanDefinition(LoadBalancerClientSpecification.class);
 *      builder.addConstructorArgValue(name);
 *      builder.addConstructorArgValue(client.get("configuration"));
 *      registry.registerBeanDefinition(name + ".LoadBalancerClientSpecification", builder.getBeanDefinition());
 *
 * 注：LoadBalancerClientSpecification 是构造 LoadBalancerClientFactory 依赖的bean
 * */
```

## DiscoveryClient

`spring-cloud-commons.jar!/META-INF/spring.factories`的部分内容

```properties
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
    org.springframework.cloud.client.discovery.simple.SimpleDiscoveryClientAutoConfiguration,\
    org.springframework.cloud.client.discovery.composite.CompositeDiscoveryClientAutoConfiguration,\
```

DiscoveryClient 是用来获取注册中心注册了多少实例，单独看是没用的得结合 [负载均衡的实现逻辑](#LoadBalancerClient) 才能明白。

```java
/**
 * SimpleDiscoveryClientAutoConfiguration
 *      注册 SimpleDiscoveryProperties , 通过 @ConfigurationProperties 将配置文件中的信息绑定到属性中
 *      注册 SimpleDiscoveryClient 是 DiscoveryClient 接口的实现类, 其依赖 SimpleDiscoveryProperties , 其职责是根据 serviceId 返回 List<ServiceInstance>
 *
 * CompositeDiscoveryClientAutoConfiguration
 *      注册 CompositeDiscoveryClient 是 DiscoveryClient 的实现类，其作用是用来聚合 List<DiscoveryClient> 的
 **/
```

## LoadBalancerAutoConfiguration

`spring-cloud-commons.jar!/META-INF/spring.factories`的部分内容

```properties
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
   org.springframework.cloud.client.loadbalancer.LoadBalancerAutoConfiguration,\
```

> 这个配置类主要是定义了 LoadBalancerInterceptor 用来拦截 RestTemplate 的执行，其拦截逻辑是委托给
>
> [LoadBalancerClient](#LoadBalancerClient) 来做。又定义了 LoadBalancerRequestFactory 用于生成 LoadBalancerClient 的参数，
>
> 而 LoadBalancerRequestFactory 会使用 LoadBalancerRequestTransformer 对 HttpRequest 进行增强，
>
> 所以我们可以自定义 **LoadBalancerRequestTransformer** 的 bean 对 负载均衡的请求 进行修改。

```java
/**
 * org.springframework.cloud.client.loadbalancer.LoadBalancerAutoConfiguration
 *      满足这个条件 @ConditionalOnBean(LoadBalancerClient.class) 配置类才会生效，而 LoadBalancerClient 唯一的实现在
 *      spring-cloud-loadbalancer.jar 中。LoadBalancerClient 是用来执行请求的，让请求变成负载均衡的方式
 *
 *      注册 SmartInitializingSingleton，其逻辑是使用 RestTemplateCustomizer 对 @LoadBalanced的RestTemplate 进行自定义
 *
 *      注册 LoadBalancerRequestFactory，其依赖 LoadBalancerClient 和 List<LoadBalancerRequestTransformer>
 *          是用来生成 LoadBalancerRequest 的(其实就是使用 LoadBalancerRequestTransformer 对 HttpRequest 进行增强)
 *            `LoadBalancerRequest<ClientHttpResponse> request = requestFactory.createRequest(rawRequest, body, execution);
 *             LoadBalancerClient.execute(serviceName, request);`
 *
 *      注册 LoadBalancerInterceptor 是 ClientHttpRequestInterceptor 接口的实现类，其依赖于 LoadBalancerClient、LoadBalancerRequestFactory
 *          ClientHttpRequestInterceptor 是用来拦截 RestTemplate 执行请求的
 *
 *      注册 RestTemplateCustomizer 依赖 LoadBalancerInterceptor , 会将 LoadBalancerInterceptor 设置给 RestTemplate
 *          List<ClientHttpRequestInterceptor> list = new ArrayList<>(restTemplate.getInterceptors());
 *          list.add(loadBalancerInterceptor);
 *          restTemplate.setInterceptors(list);
 **/
```

## LoadBalancerClient

示例代码

```java
@EnableAutoConfiguration
@RestController
@Import({ LoadBalancerClientConfig.class, LoadBalancerOtherConfig.class })
public class Main extends BaseApp {

	public static void main(String[] args) {
		/**
		 * TODOHAITAO: 2023/4/7 验证方式 运行 Main、Client1、Client2 然后访问:
         * - 堵塞式 GET http://localhost:8080/s1
         * - 响应式 GET http://localhost:8080/2/s1
		 */
		// 采用那种方式对 RestTemplate 进行增强，看
		// org.springframework.cloud.client.loadbalancer.LoadBalancerAutoConfiguration
		System.setProperty("spring.cloud.loadbalancer.retry.enabled", "false");
		System.setProperty("spring.profiles.active", "loadbalance");
		ConfigurableApplicationContext context = SpringApplication.run(Main.class);
	}

}
```

负载均衡会使用 LoadBalancerClient 来执行请求的，大致逻辑是通过 DiscoveryClient 得到 serviceId 有哪些实例，再通过负载均衡策略的逻辑筛选出唯一的实例，然后根据这个实例的 url 执行请求。

`spring-cloud-loadbalancer.jar!/META-INF/spring.factories`的部分内容

```properties
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
    org.springframework.cloud.loadbalancer.config.LoadBalancerAutoConfiguration,\
    org.springframework.cloud.loadbalancer.config.LoadBalancerStatsAutoConfiguration,\
    org.springframework.cloud.loadbalancer.config.BlockingLoadBalancerClientAutoConfiguration
```

### LoadBalancerAutoConfiguration

[提供了@LoadBalancerClient 用于简易的注册 LoadBalancerClientSpecification](#@LoadBalancerClient)

```java
/**
 * org.springframework.cloud.loadbalancer.config.LoadBalancerAutoConfiguration
 *
 *      注册 LoadBalancerZoneConfig , ZonePreferenceServiceInstanceListSupplier 会依赖这个bean来过滤出 List<ServiceInstance>
 *
 *      注册 LoadBalancerClientFactory 其继承 NamedContextFactory。
 *          会根据 name 创建一个IOC容器，IOC容器默认有两个配置类：PropertyPlaceholderAutoConfiguration、LoadBalancerClientConfiguration
 *          并依赖 LoadBalancerClientSpecification 用来扩展配置类，创建的IOC容器会缓存到Map中。
 *
 *          LoadBalancerClientConfiguration 其目的是注册了 ServiceInstanceListSupplier、ReactorLoadBalancer<ServiceInstance>
 *          这两个bean是用来实现负载均衡策略得到唯一的 ServiceInstance 的。而且都有 @ConditionalOnMissingBean 条件，若我们想自定义
 *          可以设置 LoadBalancerClientSpecification 扩展配置类。
 *
 *          可以使用 @LoadBalancerClient 或者直接注册 LoadBalancerClientSpecification 类型的bean到容器中，
 **/
```

### LoadBalancerStatsAutoConfiguration

一般来说 LoadBalancerClient 执行负载均衡请求时会 回调 LoadBalancerLifecycle 接口的方法

```java
/**
 * LoadBalancerStatsAutoConfiguration
 *      注册 MicrometerStatsLoadBalancerLifecycle 其实现了 LoadBalancerLifecycle 接口。比如 BlockingLoadBalancerClient
 *      执行请求时会回调 LoadBalancerLifecycle 的方法做通知
 * */
```

### BlockingLoadBalancerClientAutoConfiguration

注册 LoadBalancerClient 的实现类到容器中

```java
/**
 * BlockingLoadBalancerClientAutoConfiguration
 *      注册 BlockingLoadBalancerClient 其实现了LoadBalancerClient接口，依赖 LoadBalancerClientFactory 和 properties
 *          BlockingLoadBalancerClient 的核心逻辑是接收 HttpRequest 解析 Uri 得到 serviceId ，然后使用 serviceId 负载均衡得到唯一的 serviceInstance
 *          然后再执行 HttpRequest
 *
 * */
```

### 负载均衡的 RestTemplate 执行请求的流程

使用 restTemplate 发送请求，最终会委托给 ClientHttpRequestInterceptor 执行请求

```properties
# 大致是这么个流程，可以细看下面的代码分析
RestTemplate -> (RetryLoadBalancerInterceptor|LoadBalancerInterceptor)
 -> LoadBalancerClientFactory ->  BlockingLoadBalancerClient
 -> ReactorLoadBalancer -> ServiceInstanceListSupplier -> DiscoveryClient
 -> LoadBalancerRequestTransformer
 -> 执行请求
```

```java
/**
 * 例如：
 * restTemplate.getForEntity("http://serviceName/xx", String.class)
 *
 * {@link RestTemplate#getForEntity(String, Class, Object...)}
 * {@link RestTemplate#execute(String, HttpMethod, RequestCallback, ResponseExtractor, Object...)}
 * {@link RestTemplate#doExecute(URI, HttpMethod, RequestCallback, ResponseExtractor)}
 * {@link AbstractClientHttpRequest#execute()}
 * {@link AbstractBufferingClientHttpRequest#executeInternal(HttpHeaders)}
 * {@link InterceptingClientHttpRequest#executeInternal(HttpHeaders, byte[])}
 * {@link InterceptingClientHttpRequest.InterceptingRequestExecution#execute(HttpRequest, byte[])}
 *      在这里回调 ClientHttpRequestInterceptor 的方法，从而实现拦截请求的执行
 **/
```

```java
public ClientHttpResponse execute(HttpRequest request, byte[] body) throws IOException {
    if (this.iterator.hasNext()) {
        ClientHttpRequestInterceptor nextInterceptor = this.iterator.next();
        // 委托给迭代器执行逻辑。比如 LoadBalancerInterceptor 其实就是修改 request 然后又递归回调该方法
        return nextInterceptor.intercept(request, body, this);
    }
    else {
        HttpMethod method = request.getMethod();
        Assert.state(method != null, "No standard HTTP method");
        ClientHttpRequest delegate = requestFactory.createRequest(request.getURI(), method);
        // 拷贝请求头内容
        request.getHeaders().forEach((key, value) -> delegate.getHeaders().addAll(key, value));
        // 执行请求
        return delegate.execute();
    }
}
```

### LoadBalancerInterceptor

默认注入的是 [RetryLoadBalancerInterceptor](#RetryLoadBalancerInterceptor) 而不是 LoadBalancerInterceptor。可以设置 `spring.cloud.loadbalancer.retry.enabled=false` 让 LoadBalancerInterceptor 生效

```java
/**
 * LoadBalancerInterceptor 的执行逻辑
 * {@link LoadBalancerInterceptor#intercept(HttpRequest, byte[], ClientHttpRequestExecution)}
 *  1. 获取serviceName
 *      final URI originalUri = request.getURI();
 *      String serviceName = originalUri.getHost();
 *
 *  2. 使用 LoadBalancerRequestFactory 构造出 LoadBalancerRequest，构造逻辑其实就是使用 LoadBalancerRequestTransformer 对 HttpRequest 进行增强
 *     LoadBalancerRequest lbRequest = requestFactory.createRequest(request, body, execution);
 *
 *  3. 委托给 LoadBalancerClient 执行请求
 *      loadBalancerClient.execute(serviceName, lbRequest)
 *      默认是这个实现类的方法 {@link BlockingLoadBalancerClient#execute(String, LoadBalancerRequest)}
 *
 **/
```

### RetryLoadBalancerInterceptor

整体逻辑和 [LoadBalancerInterceptor](#LoadBalancerInterceptor) 是一样的，只不过是使用 [RetryTemplate](https://github.com/spring-projects/spring-retry) 来执行，根据重试策略重复执行而已。

会使用 **LoadBalancedRetryFactory** 来生成 LoadBalancedRetryPolicy、BackOffPolicy、RetryListener 这三个东西是用来决定该如何重试，默认是有一个 BlockingLoadBalancedRetryPolicy 会根据属性信息生成 LoadBalancedRetryPolicy、BackOffPolicy，若我们有需要可以自定义 LoadBalancedRetryFactory bean 注册到容器中，因为

```java
@Configuration
public class BlockingLoadBalancerRetryConfig {
  @Bean
  @ConditionalOnMissingBean
  LoadBalancedRetryFactory loadBalancedRetryFactory(LoadBalancerProperties properties) {
    return new BlockingLoadBalancedRetryFactory(properties);
  }
}
```

```properties
# 指示应在同一ServiceInstance 上重试请求的次数（对每个选定实例单独计数）
spring.cloud.loadbalancer.retry.maxRetriesOnSameServiceInstance=1
# 指示新选择的 ServiceInstance 应重试请求的次数
spring.cloud.loadbalancer.retry.maxRetriesOnNextServiceInstance=1
# 总是重试失败请求的状态代码
spring.cloud.loadbalancer.retry.retryableStatusCodes=1
# 设置最小回退持续时间（默认为5毫秒）
spring.cloud.loadbalancer.retry.backoff.minBackoff=1
# 设置最大回退持续时间（默认为最大长值毫秒）
spring.cloud.loadbalancer.retry.backoff.maxBackoff=1
# 设置用于计算每个调用的实际回退持续时间的抖动（默认为0.5）
spring.cloud.loadbalancer.retry.backoff.jitter=1
```

```java
/**
 * RetryLoadBalancerInterceptor 的执行逻辑
 * {@link RetryLoadBalancerInterceptor#intercept(HttpRequest, byte[], ClientHttpRequestExecution)}
 *
 * 1. 使用 LoadBalancedRetryFactory 生成重试策略（默认是根据配置信息）
 *      final LoadBalancedRetryPolicy retryPolicy = lbRetryFactory.createRetryPolicy(serviceName, loadBalancer);
 *
 *  2. 构造出 RetryTemplate
 *      RetryTemplate template = createRetryTemplate(serviceName, request, retryPolicy);
 *
 *          2.1 使用 LoadBalancedRetryFactory 生成重试策略
 *              RetryTemplate template = new RetryTemplate();
 *              BackOffPolicy backOffPolicy = lbRetryFactory.createBackOffPolicy(serviceName);
 *              template.setBackOffPolicy(backOffPolicy == null ? new NoBackOffPolicy() : backOffPolicy);
 *
 *          2.2 使用 LoadBalancedRetryFactory 生成重试监听器
 *             RetryListener[] retryListeners = lbRetryFactory.createRetryListeners(serviceName);
 *             template.setListeners(retryListeners);
 *          ...
 *
 *  3. 使用 RetryTemplate 执行
 *      return template.execute(context -> {
 *
 *          1. 从 loadBalancerClientFactory 中获取 LoadBalancerLifecycle 类型的bean
 *              Set<LoadBalancerLifecycle> supportedLifecycleProcessors = LoadBalancerLifecycleValidator
 *                 .getSupportedLifecycleProcessors(
 *                       loadBalancerFactory.getInstances(serviceName, LoadBalancerLifecycle.class),
 *                       RetryableRequestContext.class, ResponseData.class, ServiceInstance.class);
 *
 *          2. 回调 LoadBalancerLifecycle#onStart 生命周期方法
 *              supportedLifecycleProcessors.forEach(lifecycle -> lifecycle.onStart(lbRequest));
 *
 *          3. 通过负载均衡策略选择出唯一的 serviceInstance
 *              serviceInstance = loadBalancerClient.choose(serviceName, lbRequest);
 *
 *          4. 执行请求
 *              ClientHttpResponse response = loadBalancer.execute(serviceName,
 *                 serviceInstance, lbRequest);
 *
 *      })
 *
 * */
```

### BlockingLoadBalancerClient#execute

1. 执行请求过程中会回调 LoadBalancerLifecycle 生命周期方法
2. 负载均衡得到 serviceInstance 构造出 HttpRequest 后，会使用 LoadBalancerRequestTransformer 对 HttpRequest 进行增强

>     注：不建议将 LoadBalancerLifecycle、ServiceInstanceListSupplier、ReactorLoadBalancer 注册到应用程序中，而是通过 LoadBalancerClientSpecification 的方式为每一个 serviceInstance 设置独立的bean，从而实现不同的 serviceInstance 使用不同的 负载均衡策略

```java
/**
 * BlockingLoadBalancerClient 执行请求
 * {@link BlockingLoadBalancerClient#execute(String, LoadBalancerRequest)}
 *
 *  1. 根据 serviceId 获取配置的 hint 值，默认是 default。可以设置 spring.cloud.loadbalancer.hint.serviceName=hint1 来设置该值
 *      String hint = getHint(serviceId);
 *
 *  2. 装饰成 LoadBalancerRequestAdapter
 *      LoadBalancerRequestAdapter<T, DefaultRequestContext> lbRequest = new LoadBalancerRequestAdapter<>(request,
 *              new DefaultRequestContext(request, hint));
 *
 *  3. 从 loadBalancerClientFactory 中获取 LoadBalancerLifecycle 类型的bean
 *     Set<LoadBalancerLifecycle> supportedLifecycleProcessors = loadBalancerClientFactory.getInstances(serviceId, LoadBalancerLifecycle.class)
 *     注：LoadBalancerClientFactory 继承 NamedContextFactory , 会根据 serviceId 创建一个IOC容器，再从这个指定的IOC容器中获取bean，创建的IOC容器会存到Map中
 *
 *  4. 回调 LoadBalancerLifecycle#onStart 生命周期方法
 *      supportedLifecycleProcessors.forEach(lifecycle -> lifecycle.onStart(lbRequest));
 *
 *  5. 负载均衡选择出唯一的 serviceInstance
 *      5.1 通过 loadBalancerClientFactory 获取 ReactiveLoadBalancer 实例。
 *          ReactiveLoadBalancer<ServiceInstance> loadBalancer = loadBalancerClientFactory.getInstance(serviceId);
 *
 *      5.2 选择出 ServiceInstance
 *          Response<ServiceInstance> loadBalancerResponse = Mono.from(loadBalancer.choose(request)).block();
 *          ServiceInstance serviceInstance = loadBalancerResponse.getServer();
 *
 *      注：ReactorLoadBalancer 依赖 ServiceInstanceListSupplier 得到 List<ServiceInstance> 然后根据其负载均衡策略得到唯一的 serviceInstance
 *            而 ServiceInstanceListSupplier 默认是通过获取 DiscoveryClient 得到 List<ServiceInstance>，然后根据 ServiceInstanceListSupplier
 *            的逻辑过滤掉一些
 *
 *  6. 若 serviceInstance 是空，先回调生命周期方法然后报错
 *      supportedLifecycleProcessors.forEach(lifecycle -> lifecycle.onComplete(
 *                 new CompletionContext<>(CompletionContext.Status.DISCARD, lbRequest, new EmptyResponse())));
 *      throw new IllegalStateException("No instances available for " + serviceId);
 *
 *  7. 装饰一下 serviceInstance
 *      DefaultResponse defaultResponse = new DefaultResponse(serviceInstance);
 *
 *  8. 回调 LoadBalancerLifecycle#onStartRequest 生命周期方法
 *      supportedLifecycleProcessors
 *            .forEach(lifecycle -> lifecycle.onStartRequest(lbRequest, new DefaultResponse(serviceInstance)));
 *
 *  9. 执行请求，其实就是回调RestTemplate的拦截方法
 *      T response = request.apply(serviceInstance);
 *
 *      9.1 构造出 HttpRequest，其目的是会根据 instance 生成 uri
 *          HttpRequest serviceRequest = new ServiceRequestWrapper(request, instance, this.loadBalancer);
 *
 *      9.2 遍历 LoadBalancerRequestTransformer 对 serviceRequest 进行增强
 *          for (LoadBalancerRequestTransformer transformer : this.transformers) {
 *             serviceRequest = transformer.transformRequest(serviceRequest, instance);
 *          }
 *
 *      9.3 放行请求，最终会发送Http请求
 *          execution.execute(serviceRequest, body);
 *
 *
 *  10. 回调 LoadBalancerLifecycle#onComplete 生命周期方法
 *      supportedLifecycleProcessors
 *            .forEach(lifecycle -> lifecycle.onComplete(new CompletionContext<>(CompletionContext.Status.SUCCESS,
 *              lbRequest, defaultResponse, clientResponse)));
 * */
```

### ReactorLoadBalancer

示例代码

```java
@LoadBalancerClient(name = "s1", configuration = { MyLoadBalancer.class, MyServiceInstanceListSupplier.class })
@LoadBalancerClients({ @LoadBalancerClient(name = "s2", configuration = MyRandomLoadBalancer.class),
		@LoadBalancerClient(name = "s3", configuration = MyRoundRobinLoadBalancer.class), })
public class LoadBalancerClientConfig {

}
```

```java
/**
 * ReactorLoadBalancer 是一个负载均衡器，会根据其负载均衡逻辑从 ServiceInstanceListSupplier 返回的 List<ServiceInstance> 中筛选出唯一的 ServiceInstance。
 *
 * 再执行负载均衡请求时会用到 ReactorLoadBalancer
 *      {@link BlockingLoadBalancerClient#execute(String, LoadBalancerRequest)}
 *      ReactiveLoadBalancer<ServiceInstance> loadBalancer = loadBalancerClientFactory.getInstance(serviceId);
 *
 * 而 LoadBalancerClientFactory 继承 NamedContextFactory，获取实例的特点是 每个serviceId对应一个IOC容器，实例是从对应的IOC容器中得到的，
 * LoadBalancerClientFactory 构造的IOC容器默认会注册配置类 LoadBalancerClientConfiguration，
 * 而 LoadBalancerClientConfiguration 其目的是注册了 ServiceInstanceListSupplier、ReactorLoadBalancer<ServiceInstance>
 * 而且都有 @ConditionalOnMissingBean 条件，若我们想自定义可以给IOC容器设置配置类，从而让 @ConditionalOnMissingBean 不匹配。
 * 可以使用 @LoadBalancerClient 或者直接注册 LoadBalancerClientSpecification 类型的bean到容器中。
 * */
```

```java
public interface ReactorLoadBalancer<T> extends ReactiveLoadBalancer<T> {

   /**
    * Choose the next server based on the load balancing algorithm.
    * @param request - an input request
    * @return - mono of response
    */
   @SuppressWarnings("rawtypes")
   Mono<Response<T>> choose(Request request);

   default Mono<Response<T>> choose() {
      return choose(REQUEST);
   }

}
```

```java
// 这只是伪代码
@Configuration(proxyBeanMethods = false)
@ConditionalOnDiscoveryEnabled
public class LoadBalancerClientConfiguration {

   @Bean
   @ConditionalOnMissingBean
   public ReactorLoadBalancer<ServiceInstance> reactorServiceInstanceLoadBalancer(Environment environment,
         LoadBalancerClientFactory loadBalancerClientFactory) {
      String name = environment.getProperty(LoadBalancerClientFactory.PROPERTY_NAME);
      return new RoundRobinLoadBalancer(
            loadBalancerClientFactory.getLazyProvider(name, ServiceInstanceListSupplier.class), name);
   }

   @Bean
   @ConditionalOnMissingBean
   public ServiceInstanceListSupplier discoveryClientServiceInstanceListSupplier(
            ConfigurableApplicationContext context) {
       return ServiceInstanceListSupplier.builder().withDiscoveryClient().withCaching().build(context);
   }

}
```

### ServiceInstanceListSupplier

示例代码

```java
public class MyServiceInstanceListSupplier {

    @Bean
    public ServiceInstanceListSupplier discoveryClientServiceInstanceListSupplier(
            ConfigurableApplicationContext context) {
        return ServiceInstanceListSupplier.builder()
                //.withDiscoveryClient() // 通过 ReactiveDiscoveryClient 获取 List<ServiceInstance>
                .withBlockingDiscoveryClient() // 通过 DiscoveryClient 获取 List<ServiceInstance>
                // 下面配置的是通过什么方式 过滤 List<ServiceInstance>
                // .withZonePreference() // spring.cloud.loadbalancer.zone" 属性值与 serviceInstance.getMetadata().get("zone") 进行匹配
                // .withBlockingHealthChecks() // spring.cloud.loadbalancer.healthCheck.* 属性定义的的规则来过滤
                // .withRequestBasedStickySession() spring.cloud.loadbalancer.stickySession.instanceIdCookieName 属性值过滤 serviceInstance.getInstanceId()
                // .withSameInstancePreference()
                .withCaching() // 会使用到 LoadBalancerCacheManager 缓存 List<ServiceInstance>
                .build(context);
    }

}
```

```java
/**
 * ServiceInstanceListSupplier 是用来返回 List<ServiceInstance> 的。一般是根据 ReactiveDiscoveryClient 或者 DiscoveryClient 得到 serviceId 注册的 List<ServiceInstance>，
 * 然后根据其逻辑过滤掉不满足的，再返回最终的 List<ServiceInstance>
 *
 * 提供了Builder快速构建
 *      响应式(获取 ReactiveDiscoveryClient 的bean得到有哪些服务)：ServiceInstanceListSupplier.builder().withDiscoveryClient().build(context);
 *      非响应式(获取 DiscoveryClient 的bean得到有哪些服务)：ServiceInstanceListSupplier.builder().withBlockingDiscoveryClient().build(context);
 *
 *
 * 这个 LoadBalancerClientConfiguration 配置类，定义了很多种 ServiceInstanceListSupplier。可以通过设置属性值决定应用哪种
 *      spring.cloud.loadbalancer.configurations=[default | zone-preference | health-check | request-based-sticky-session | same-instance-preference]
 * */
```

```java
public interface ServiceInstanceListSupplier extends Supplier<Flux<List<ServiceInstance>>> {

    String getServiceId();

    default Flux<List<ServiceInstance>> get(Request request) {
        return get();
    }

    static ServiceInstanceListSupplierBuilder builder() {
        return new ServiceInstanceListSupplierBuilder();
    }

}
```

### WebClient.Builder 实现负载均衡

WebClient.Builder 是执行响应式请求的工具类。下面是让 WebClient.Builder 具有负载均衡能力的实现逻辑。

`spring-cloud-commons.jar!/META-INF/spring.factories`的部分内容

```properties
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
	org.springframework.cloud.client.loadbalancer.reactive.LoadBalancerBeanPostProcessorAutoConfiguration,\
	org.springframework.cloud.client.loadbalancer.reactive.ReactorLoadBalancerClientAutoConfiguration
```

```java
/**
 * {@link LoadBalancerBeanPostProcessorAutoConfiguration}
 *      注册 LoadBalancerWebClientBuilderBeanPostProcessor 其依赖 DeferringLoadBalancerExchangeFilterFunction。
 *          其是一个后置处理器，会在 postProcessBeforeInitialization 时过滤类型是 WebClient.Builder 且有 @LoadBalanced 的bean ,为 bean 增加filter
 *          `((WebClient.Builder) bean).filter(DeferringLoadBalancerExchangeFilterFunction)`
 *
 *      注册 DeferringLoadBalancerExchangeFilterFunction 其依赖 LoadBalancedExchangeFilterFunction，没啥用具体逻辑是委托给 LoadBalancedExchangeFilterFunction 执行的。
 *
 * {@link ReactorLoadBalancerClientAutoConfiguration}
 *      注册 ReactorLoadBalancerExchangeFilterFunction 其依赖 ReactiveLoadBalancer.Factory、LoadBalancerProperties。
 *          其定义了负载均衡的实现逻辑，比如要回调 LoadBalancerLifecycle 的方法，要通过 ReactiveLoadBalancer.Factory 负载均衡得到 ServiceInstance
 *
 *          Tips：LoadBalancerClientFactory 是 ReactiveLoadBalancer.Factory  的实现类。
 *
 *      注册 RetryableLoadBalancerExchangeFilterFunction 其依赖 ReactiveLoadBalancer.Factory、LoadBalancerProperties、LoadBalancerRetryPolicy。
 *          大致逻辑和 ReactorLoadBalancerExchangeFilterFunction 一样，只不过增加了重试的实现
 *
 *      注册 LoadBalancerRetryPolicy 其依赖 LoadBalancerProperties。
 *          就是重试策略，没啥特别的
 *
 *
 * 总结：通过 LoadBalancerWebClientBuilderBeanPostProcessor 给 WebClient.Builder 增加 Filter，所以使用 WebClient.Builder 执行请求时会执行 Filter 的逻辑。
 *      DeferringLoadBalancerExchangeFilterFunction 的逻辑是 回调 LoadBalancerLifecycle 的方法，使用 LoadBalancerClientFactory 生成的负载均衡器得到唯一的 ServiceInstance，
 *      根据 ServiceInstance 的信息 修改请求的信息，从而实现负载均衡请求。
 *
 * WebClient.Builder -> ReactorLoadBalancerExchangeFilterFunction -> LoadBalancerLifecycle -> LoadBalancerClientFactory
 * */
```
