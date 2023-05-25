# 说明

Author: [haitaoss](https://github.com/haitaoss)

源码阅读仓库: [spring-cloud-openfeign](https://github.com/haitaoss/spring-cloud-openfeign)

参考资料和需要掌握的知识：

- [SpringBoot 源码分析](https://github.com/haitaoss/spring-boot/blob/source-v2.7.8/note/springboot-source-note.md)
- [Spring 源码分析](https://github.com/haitaoss/spring-framework)
- [Spring Cloud 官网文档](https://docs.spring.io/spring-cloud/docs/2021.0.5/reference/html/)
- [Spring Cloud Commons 官网文档](https://docs.spring.io/spring-cloud-commons/docs/3.1.5/reference/html/)
- [Spring Cloud OpenFeign 官网文档](https://docs.spring.io/spring-cloud-openfeign/docs/3.1.5/reference/html/)
- [Feign 官方文档](https://github.com/OpenFeign/feign#readme)

# Spring Cloud OpenFeign 介绍

[Feign](https://github.com/haitaoss/feign) 是一个声明式的 Web 服务客户端，它使 Java 编写 Web 服务客户端变得更加容易。其实就是通过 JDK 代理生成接口的代理对象，方法的执行就是执行 Http 请求。而 OpenFeign 的作用是通过自动装配将 Feign 集成到应用程序中。主要是有这几个特性：

1. 整合 [Spring Cache](https://github.com/haitaoss/spring-framework/blob/source-v5.3.10/note/spring-source-note.md#cacheinterceptorinvoke) ，代理 FeignClient 接口方法，增加上缓存相关的逻辑。
2. 整合 CircuitBreaker ，代理 FeignClient 接口方法，方法的执行委托给 CircuitBreaker 控制
3. 整合 [spring-cloud-loadbalancer](https://github.com/haitaoss/spring-cloud-commons/blob/source-v3.0.1/note/spring-cloud-commons-source-note.md#loadbalancerclient) ，让 Feign 使用负载均衡的 HTTP 客户端 发送请求

# 核心功能源码分析

## OpenFeign 自动装配原理

`spring-cloud-openfeign-core.jar!META-INF/spring.factories` 的部分内容

```properties
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
       org.springframework.cloud.openfeign.FeignAutoConfiguration,\
       org.springframework.cloud.openfeign.encoding.FeignAcceptGzipEncodingAutoConfiguration,\
       org.springframework.cloud.openfeign.encoding.FeignContentGzipEncodingAutoConfiguration,\
       org.springframework.cloud.openfeign.loadbalancer.FeignLoadBalancerAutoConfiguration
```

### FeignAutoConfiguration

主要是注册了 FeignContext、Targeter、CachingCapability、Client：

- FeignContext 是用来隔离不同 FeignClient 的容器，每个 FeignClient 有单独的 IOC 容器，容器中默认注册了 FeignClient 需要的 bean。
- Targeter 是用来生成 FeignClient 接口实现类的，只是配置而已。生成接口代理类的逻辑是由 Feign 实现的。
- CachingCapability 是用来配置 Feign.Builder 的，主要是对 InvocationHandlerFactory 进行增强，而 InvocationHandlerFactory 是用来生成 InvocationHandler 从而让方法的执行委托给 [CacheInterceptor](https://github.com/haitaoss/spring-framework/blob/source-v5.3.10/note/spring-source-note.md#cacheinterceptorinvoke) 执行，这是属于 SpringCache 的内容了，不展开说了。
- Client 是执行 HTTP 请求的工具，比如 ApacheHttpClient、OkHttpClient。

```java
/**
 * FeignAutoConfiguration
 *      注册三个绑定属性的bean @EnableConfigurationProperties({ FeignClientProperties.class, FeignHttpClientProperties.class, FeignEncoderProperties.class})
 *          FeignClientProperties：记录 FeignClient 的配置信息，比如 RequestInterceptor 等等
 *          FeignHttpClientProperties：记录 HttpClient 的配置信息，最大连接数、连接的ttl等等
 *          FeignEncoderProperties: 是否从响应头 Content-Type 获取响应体的编码，会使用这个编码对响应体解码成字符串（默认是UTF-8）
 *
 *      注册 HasFeatures 是用来描述系统有 Feign 的功能，它是给 FeaturesEndpoint 使用的。
 *
 *      注册 FeignContext 其继承 NamedContextFactory。
 *        其作用是会根据 name 创建单独的IOC容器，获取bean是从单独的IOC容器中拿。IOC容器默认有两个配置类：PropertyPlaceholderAutoConfiguration、FeignClientsConfiguration
 *        并依赖 FeignClientSpecification 用来扩展配置类，创建的IOC容器会缓存到Map中。
 *
 *        FeignClientsConfiguration 其目的是注册 Decoder、Encoder、Encoder、Contract、FormattingConversionService、
 *        Retryer、FeignLoggerFactory、FeignClientConfigurer、Feign.Builder 这些bean 而且都有 @ConditionalOnMissingBean 条件，若我们想自定义
 *        这些bean，可以设置 FeignClientSpecification 扩展配置类，从而让 @ConditionalOnMissingBean 不满足，也就不会使用这些默认的bean
 *
 *        而 FeignClientSpecification 可以通过这两个注解快速配置
 *         @EnableFeignClients(defaultConfiguration={A.class}) // 这样子是注册全局的，FeignContext 创建的所有IOC容器都会使用这个配置类
 *         @FeignClient(contextId="f1",name="serviceName",configuration={A.class}) // FeignContext 为 f1 创建的IOC容器 会使用这个配置类
 *          注：contextId 为空 就会使用 name 作为缺省值
 *
 *      注册 CachingCapability 其实现 Capability 接口，依赖 CacheInterceptor。CachingCapability 是用来增强 Feign.Builder 设置的 InvocationHandlerFactory 的
 *          让方法的执行委托给 CacheInterceptor 执行，也就是支持 Spring Cache 的功能
 *
 *      注册 PageJacksonModule、SortJacksonModule 都是 Module 类型的，这两个东西是用来扩展 jackson 扩展序列化规则的，是为了支持 spring data
 *
 *      注册 Targeter 类型的bean，默认是 DefaultTargeter , 如果容器中有 CircuitBreakerFactory 类型的bean，那就会注册 FeignCircuitBreakerTargeter
 *          Targeter 是用来聚合 FeignClientFactoryBean、Feign.Builder、FeignContext、Target.HardCodedTarget，
 *                   定义了如何生成 Target.HardCodedTarget<T> 泛型的实例
 *
 *      注册 CircuitBreakerNameResolver 是用来生成断路器name的，FeignCircuitBreakerTargeter 会依赖这个bean
 *
 *      注册 HttpClientConnectionManager 会依赖 FeignHttpClientProperties 来设置连接相关参数
 *
 *      注册 CloseableHttpClient 是 HttpClient 的实现类，其依赖 HttpClientConnectionManager、FeignHttpClientProperties 设置一些参数
 *
 *      注册 ApacheHttpClient 是 feign.Client 的实现类，依赖 HttpClient 来执行HTTP请求
 *
 *      属性 feign.okhttp.enabled == true 会注册
 *          注册 ConnectionPool 会依赖 FeignHttpClientProperties 来设置连接相关参数
 *          注册 okhttp3.OkHttpClient 其依赖 ConnectionPool、FeignHttpClientProperties 设置一些参数
 *          注册 OkHttpClient 是 feign.Client 的实现类，依赖 okhttp3.OkHttpClient 来执行HTTP请求
 * */
```

### FeignAcceptGzipEncodingAutoConfiguration

```java
/**
 * FeignAcceptGzipEncodingAutoConfiguration
 *      注册 FeignAcceptGzipEncodingInterceptor , 它是 RequestInterceptor 的实现类，其目的是给 Request 增加请求头 Accept-Encoding=gzip,deflate
 *          注：请求头 Accept-Encoding=gzip,deflate 是告诉服务器 客户端支持 gzip,deflate 压缩
 **/
```

```yml
feign:
  compression:
    # 设置请求头 Accept-Encoding=gzip,deflate 用于告诉服务器 客户端支持 gzip,deflate 压缩
    response:
      enabled: true
```

### FeignContentGzipEncodingAutoConfiguration

```java
/**
 * FeignContentGzipEncodingAutoConfiguration
 *      注册 FeignContentGzipEncodingInterceptor , 它是 RequestInterceptor 的实现类，其目的是给 Request 增加请求头 Content-Encoding=gzip,deflate
 *          满足这两点才需要增加请求头：
 *              1. Content-Type 是属性 feign.compression.request.mimeTypes 包含的值
 *              2. Content-Length 大于 属性 feign.compression.request.minRequestSize 的值
 *
 *          请求头有 Content-Encoding=gzip,deflate 会对请求体进行编码后(压缩)再发送给到服务器(这得看你用的Client是否支持)
 * */
```

```yml
feign:
  compression:
    request:
      enabled: true
      # FeignClient 执行HTTP请求时，Content-Type 、Content-Length 满足这两个条件，就设置请求头 Content-Encoding=gzip,deflate。
      # 设置了请求头后 在发送前会对请求体进行压缩
      mimeTypes:
        - 'text/xml'
        - 'application/xml'
        - 'application/json'
      minRequestSize: 100
```

### FeignLoadBalancerAutoConfiguration

```java
@Import({ HttpClientFeignLoadBalancerConfiguration.class, OkHttpFeignLoadBalancerConfiguration.class,
        DefaultFeignLoadBalancerConfiguration.class })
public class FeignLoadBalancerAutoConfiguration {}
```

```java
/**
 * FeignLoadBalancerAutoConfiguration
 *
 *      目的都是注册 Client 的实现类，根据条件会注册 FeignBlockingLoadBalancerClient 或者是 RetryableFeignBlockingLoadBalancerClient
 *         导入的三个配置类的区别在于：
 *          - HttpClientFeignLoadBalancerConfiguration  依赖 HttpClient 执行HTTP请求
 *          - OkHttpFeignLoadBalancerConfiguration  依赖 okhttp3.OkHttpClient 执行HTTP请求
 *          - DefaultFeignLoadBalancerConfiguration  依赖 Client.Default 执行HTTP请求
 * */
```

## @EnableFeignClients 和 @FeignClient

@EnableFeignClients 是用来扫描得到标注了 @FeignClient 的类，将类的信息映射成 BeanDefinition，然后注册到 BeanFactory 中。而需要注意的是这个 bean 的实例化是 `FeignClientFactoryBean.getObject()` 得到的。@FeignClient 的注解值主要是映射给`FeignClientFactoryBean`。所以要想知道 `@FeignClient` 是如何实现生成接口代理对象的还得看`FeignClientFactoryBean.getObjec()`

```java
@Import(FeignClientsRegistrar.class)
public @interface EnableFeignClients {

    String[] value() default {}; // 要扫描的包

    String[] basePackages() default {}; // 要扫描的包

    Class<?>[] basePackageClasses() default {}; // 类所在的包

    Class<?>[] defaultConfiguration() default {}; // FeignClient Context 会用到的默认配置类

    Class<?>[] clients() default {}; // 指定 FeignClient，若指定就不会根据包路径扫描
}
```

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
public @interface FeignClient {

    String contextId() default ""; // FeignClient Context 的ID，没指定会使用 name 或者 value 的值。支持占位符解析

    @AliasFor("name")
    String value() default ""; // 服务名。支持占位符解析

    @AliasFor("value")
    String name() default ""; // 服务名。支持占位符解析

    String qualifier() default ""; // 别名

    String url() default ""; // 若指定这个值，那就不会使用 name，也就不会变成负载均衡请求了。支持占位符解析

    boolean decode404() default false;

    Class<?>[] configuration() default {}; // 给 FeignClient Context 设置默认配置类

    Class<?> fallback() default void.class; // 使用 {@link FeignCircuitBreaker.Builder} 构造的 FeignClient 才会用到这个属性，是用来给 CircuitBreaker 使用的，用于在执行HTTP请求时出错后 的兜底策略。需要注册到容器中才行

    Class<?> fallbackFactory() default void.class; // 和 {@link FeignClient#fallback()} 的用法类似，只不过这个是用来创建 fallback的。如果指定了 fallback ，那么这个属性就没用了。需要注册到容器中才行

    String path() default ""; // 访问路径是 url + path 。支持占位符解析

    boolean primary() default true; // bean是否是 @Primary 的

}
```

```java
/**
 *
 * 举例：
 *      @EnableFeignClients(defaultConfiguration={A.class},clients={A.class})
 *      @FeignClient(name="s1",configuration={A.class})
 *      public class Config{}
 *
 * @EnableFeignClients 上有 @Import(FeignClientsRegistrar.class) 所以解析配置类解析到这个注解时会将 FeignClientsRegistrar
 * 注册到BeanFactory中，而 FeignClientsRegistrar 实现了 ImportBeanDefinitionRegistrar 接口，所以其接口方法会被回调。
 * {@link FeignClientsRegistrar#registerBeanDefinitions(AnnotationMetadata, BeanDefinitionRegistry)}
 *
 *  1. 注册 FeignClient 默认配置
 *      获取 defaultConfiguration 注解值映射成 BeanDefinition 注册到 BeanFactory 中
 *        BeanDefinitionBuilder builder = BeanDefinitionBuilder.genericBeanDefinition(FeignClientSpecification.class);
 *        builder.addConstructorArgValue("default."+Config.class.getName());
 *        builder.addConstructorArgValue(defaultConfiguration);
 *        registry.registerBeanDefinition(name + "." + FeignClientSpecification.class.getSimpleName(),
 *              builder.getBeanDefinition());
 *
 *        Tips: FeignContext 继承 NamedContextFactory, 会依赖 FeignClientSpecification 类型的bean 用来配置要生成的IOC容器。
 *             FeignContext 会使用 beanName是 "default." 前缀的 FeignClientSpecification 作为默认项，用来配置要生成的IOC容器
 *
 *  2. 注册 FeignClient
 *      2.1 记录候选的组件 candidateComponents
 *          设置 clients 值那就只使用这些值作为 candidateComponents，  没有设置 clients 值，那就扫描包下的类,只会收集有 @FeignClient 的类。
 *          value + basePackages + basePackageClasses 的值作为要扫描的包路径，若这三个注解值都没设置，
 *          那就用 @EnableFeignClients 注解所在的配置类的包作为要扫描的包路径
 *
 *      2.2 遍历 candidateComponents 挨个映射成 BeanDefinition 注册到 BeanFactory 中
 *          - 校验 @FeignClient 标注的类 不是接口就报错
 *          - 注册 FeignClient 配置
 *              String name = getClientName(attributes); // 为空就依次获取属性 contextId -> value -> name -> serviceId 都没设置就报错
 *              registerClientConfiguration(registry, name, attributes.get("configuration")); // 同上映射成 FeignClientSpecification，但是没有 "default." 前缀
 *
 *          - 将注解的值映射到 FeignClientFactoryBean ，然后装饰成 BeanDefinition 注册到BeanFactory中
 *              String contextId = getContextId(beanFactory, attributes); // 获取属性值，值为空就依次获取: contextId -> serviceId -> name -> value
 *              String name = getName(attributes); // 同上，只不过获取的是：serviceId -> name -> value
 *
 *              // 定义 FeignClientFactoryBean
 *              FeignClientFactoryBean factoryBean = new FeignClientFactoryBean();
 *              factoryBean.setBeanFactory(beanFactory);
 *              factoryBean.setName(name);
 *              factoryBean.setContextId(contextId);
 *              factoryBean.setType(clazz);
 *              // 根据 属性 feign.client.refresh-enabled 设置
 *              factoryBean.setRefreshableClient(isClientRefreshEnabled());
 *
 *              // 提供 Supplier ，BeanFactory实例化会调用 Supplier 得到bean对象
 *              BeanDefinitionBuilder definition = BeanDefinitionBuilder.genericBeanDefinition(clazz, () -> {
 *                  // 根据 @FeignClient(url="")的值来设置，会解析占位符，还会补全http://
 *                  factoryBean.setUrl(getUrl(beanFactory, attributes));
 *
 *                  // 获取 @FeignClient(path="")的值来设置,会解析占位符, 会补上前缀/,移除后缀/
 *                  factoryBean.setPath(getPath(beanFactory, attributes));
 *
 *                  // 剩下的就是简单读取值然后设置给factoryBean
 *                  factoryBean.setDecode404(Boolean.parseBoolean(String.valueOf(attributes.get("decode404"))));
 *                  factoryBean.setFallback(attributes.get("fallback"));
 *                  factoryBean.setFallbackFactory(attributes.get("fallbackFactory"));
 *                  return factoryBean.getObject();
 *              });
 *
 *              // 将BeanDefinition注册到BeanFactory中
 *              registry.registerBeanDefinition(beanName, definition.getBeanDefinition());
 *
 *              如果 feign.client.refresh-enabled 是true那就多注册 OptionsFactoryBean 到容器中,而且是 refresh 作用域的
 *              当 FeignClientFactoryBean.getObject() 时会拿到 OptionsFactoryBean 用来配置 Feign.Builder
 *
 *              Tips：因为每次实例化bean都会重新设置 url、path 的值且支持使用占位符，所以我们可以
 *                    将 bean 设置成 refresh 作用域的，然后就能实现 url、path 的动态更新
 * */
```

## FeignClientFactoryBean

```java
/**
 * @FeignClient 注解修饰的接口会注册到BeanFactory中，这种bean的实例化是执行 FeignClientFactoryBean.getObject() 得到。
 *
 * FeignClientFactoryBean 继承 FactoryBean 实现 InitializingBean
 *      {@link FeignClientFactoryBean#afterPropertiesSet()} 会校验属性 contextId、name 都不能为空
 *      {@link FeignClientFactoryBean#getType()} 返回的其实就是 @FeignClient 标注的接口类型
 *      {@link FeignClientFactoryBean#getObject()} 这个才是关键，看这里才能知道是得到接口代理对象的
 * */
```

## FeignClientFactoryBean#getObject

其目的是配置 `Feign.Builder`，配置的参数有啥作用去看 [Feign](https://github.com/haitaoss/feign) 就明白了，最后将 `Feign.Builder` 交给 [Targeter](#Targeter) ，由 Targeter 使用 `Feign.Bduiler` 生成接口代理对象。我们可以自定义 Targeter 注册到容器中，让默认注册的失效。

可以使用 FeignClientSpecification、FeignBuilderCustomizer 来配置 `Feign.Builder` 需要的参数

```java
/**
 * {@link FeignClientFactoryBean#getObject()}
 *
 * 1. 从容器中获取 FeignContext
 *      FeignContext context = beanFactory.getBean(FeignContext.class)
 *
 * 2. 获取 Feign.Builder 并对其进行配置
 *      Feign.Builder builder = feign(context);
 *          2.1 根据 contextId 从 FeignContext 中获取 Feign.Builder
 *          2.2 根据 contextId 从 FeignContext 中获取 FeignLoggerFactory、Encoder、Decoder、Contract... 设置给 Feign.Builder
 *          2.3 可以设置 feign.client.config.contextId.xx 属性 和使用 FeignBuilderCustomizer 用来对 Feign.Builder 进行配置
 *                会设置很多东西：Logger.Level、Retryer、ErrorDecoder、FeignErrorDecoderFactory、Options、RequestInterceptor、QueryMapEncoder、Contract、Encoder、Decoder、ExceptionPropagationPolicy、Capability
 *
 *          注：FeignContext 是 NamedContextFactory 不同的 name 会有单独的IOC容器，IOC容器默认会加载的配置类是 FeignClientsConfiguration
 *
 * 3. url 没有值，那就使用 name + path 拼接成 url，然后使用 Target 得到接口的代理对象
 *      Client client = getOptional(context, Client.class);
 *         builder.client(client);
 *         Targeter targeter = get(context, Targeter.class);
 *
 *         return targeter.target(this, builder, context, target);
 *
 * 4. url 有值，那就使用 url + path 拼接成 url，然后使用 Target 得到接口的代理对象（这里会对Client进行解构，使用非负载均衡的Client）
 *      Client client = getOptional(context, Client.class);
 *      if (client instanceof FeignBlockingLoadBalancerClient) {
 *         // 因为提供了Url所以不需要负载均衡的Client，所以这里解构拿到 非负载均衡的Client
 *         client = ((FeignBlockingLoadBalancerClient) client).getDelegate();
 *      }
 *      builder.client(client);
 *      Targeter targeter = get(context, Targeter.class);
 *      return targeter.target(this, builder, context, target);
 *
 * */
```

## FeignClientBuilder

这是 OpenFeign 提供的工具类，用于快速生成 FeignClient 接口的代理对象。其本质是通过配置 FeignClientFactoryBean 然后执行 [getObject](#FeignClientFactoryBean#getObject) 得到代理对象。

## Targeter

```java
public interface Targeter {
    <T> T target(FeignClientFactoryBean factory, Feign.Builder feign, FeignContext context,
                 Target.HardCodedTarget<T> target);
}
```

就是接口规范而已，其目的是规定使用 Feign 的步骤。最终的目的是使用 `Feign.Builder` 为 `Target.HardCodedTarget `描述的接口生成代理对象。

我们可以注册 Targeter 到容器中，自定义逻辑，比如 [FeignCircuitBreakerTargeter](#FeignCircuitBreakerTargeter)

## FeignCircuitBreakerTargeter

断路器可以看：

- [spring-cloud-circuitbreaker](https://github.com/haitaoss/spring-cloud-circuitbreaker)
- [Sentinel](https://github.com/haitaoss/Sentinel)

`spring-cloud-openfeign-core.jar!META-INF/spring.factories` 的部分内容

```properties
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
       org.springframework.cloud.openfeign.FeignAutoConfiguration,\
```

属性`feign.circuitbreaker.enabled`是 true 且 容器中有 CircuitBreakerFactory 类型的 bean，就会注册 FeignCircuitBreakerTargeter 到容器中

```java
public class FeignAutoConfiguration {
    @Configuration(proxyBeanMethods = false)
    @ConditionalOnProperty("feign.circuitbreaker.enabled")
    protected static class CircuitBreakerPresentFeignTargeterConfiguration {

        @Bean
        @ConditionalOnMissingBean
        @ConditionalOnBean(CircuitBreakerFactory.class)
        public Targeter circuitBreakerFeignTargeter(CircuitBreakerFactory circuitBreakerFactory) {
            return new FeignCircuitBreakerTargeter(circuitBreakerFactory);
        }

    }
}
```

FeignCircuitBreakerTargeter 的核心逻辑是为 Feign.Builder 配置 **invocationHandlerFactory** 属性，从而能够将方法的执行委托给 **CircuitBreaker** 执行。

```java
// 伪代码如下
Feign.builder().invocationHandlerFactory(
        (target, dispatch) -> new FeignCircuitBreakerInvocationHandler(circuitBreakerFactory,
        feignClientName, target, dispatch, nullableFallbackFactory
        ));
```

```java
class FeignCircuitBreakerTargeter implements Targeter {

    @Override
    public <T> T target(FeignClientFactoryBean factory, Feign.Builder feign, FeignContext context,
                        Target.HardCodedTarget<T> target) {
        // 不是 FeignCircuitBreaker 类型的就不做处理
        if (!(feign instanceof FeignCircuitBreaker.Builder)) {
            return feign.target(target);
        }
        FeignCircuitBreaker.Builder builder = (FeignCircuitBreaker.Builder) feign;
        String name = !StringUtils.hasText(factory.getContextId()) ? factory.getName() : factory.getContextId();
        /**
         * 前置知识：Feign 其实是通过JDK动态代理 为接口创建出代理对象，所以要想拦截方法的执行只需要配置 InvocationHandler 即可。
         *
         * 下面的几行代码的最终目都是设置 FeignCircuitBreakerInvocationHandler 作为代理对象的 InvocationHandler，
         * 所以关键还得看 FeignCircuitBreakerInvocationHandler
         *
         * {@link FeignCircuitBreakerInvocationHandler#invoke(Object, Method, Object[])}
         * 		大致流程是方法的执行交给 CircuitBreaker 执行 {@link CircuitBreaker#run(Supplier, Function)}
         * 		CircuitBreaker 可以拿到 fallback 或者 fallbackFactory。可以决定什么时候回调 fallback 的逻辑
         * */
        Class<?> fallback = factory.getFallback();
        if (fallback != void.class) {
            // 存在 fallback 的情况
            return targetWithFallback(name, context, target, builder, fallback);
        }
        Class<?> fallbackFactory = factory.getFallbackFactory();
        if (fallbackFactory != void.class) {
            // 存在 fallbackFactory 的情况
            return targetWithFallbackFactory(name, context, target, builder, fallbackFactory);
        }
        return builder(name, builder).target(target);
    }
}
```

## FeignCircuitBreakerInvocationHandler

[FeignCircuitBreakerTargeter](#FeignCircuitBreakerTargeter) 会配置 FeignCircuitBreakerInvocationHandler 作为 FeignClient 接口代理对象的 InvocationHandler，从而将 方法的执行 和 fallback 的执行 交给 CircuitBreaker 来决定，比如方法执行出错了就执行 fallback。

```java
class FeignCircuitBreakerInvocationHandler implements InvocationHandler {

    @Override
    public Object invoke(final Object proxy, final Method method, final Object[] args) throws Throwable {
        String circuitName = this.feignClientName + "_" + method.getName();
        // 通过 CircuitBreakerFactory 得到 CircuitBreaker 实例
        CircuitBreaker circuitBreaker = this.factory.create(circuitName);
        // 定义方法的执行
        Supplier<Object> supplier = asSupplier(method, args);
        /**
         * 存在 nullableFallbackFactory 就使用
         *
         * 比如这两种情况 nullableFallbackFactory 才会有值
         *     @FeignClient(fallback=A.class)
         *     @FeignClient(fallbackFactory=A.class)
         *     @FeignClient(fallback=A.class, fallbackFactory=A.class) // 两个都有的情况 只会使用 fallback
         * */
        if (this.nullableFallbackFactory != null) {
            // 使用 nullableFallbackFactory 构造出 fallbackFunction
            Function<Throwable, Object> fallbackFunction = throwable -> {
                // 通过 nullableFallbackFactory 得到 fallback
                Object fallback = this.nullableFallbackFactory.create(throwable);
                try {
                    // 使用 fallback 执行当前出错的方法
                    return this.fallbackMethodMap.get(method).invoke(fallback, args);
                }
                catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            };
            // 使用 circuitBreaker 执行方法
            return circuitBreaker.run(supplier, fallbackFunction);
        }
        // 使用 circuitBreaker 执行方法
        return circuitBreaker.run(supplier);
    }

    private Supplier<Object> asSupplier(final Method method, final Object[] args) {
        return () -> {
            try {
                return this.dispatch.get(method).invoke(args);
            }
            catch (RuntimeException throwable) {
                throw throwable;
            }
            catch (Throwable throwable) {
                throw new RuntimeException(throwable);
            }
        };
    }
}
```

## FeignClientsConfiguration

FeignContext 中为 name 创建的 IOC 容器都会使用 FeignClientsConfiguration 作为默认的配置类，这个配置类中定义了配置 Feign.Builder 的参数，其实就是对 Feign 的功能做实现，让 Feign 支持 SpringMVC 的注解等等。

**列举最关键的几个参数对象，并不是全部的代码**

```java
@Configuration(proxyBeanMethods = false)
public class FeignClientsConfiguration {

    /**
     * 依赖IOC容器配置的 List<HttpMessageConverter> ，其作用是将 执行 FeignClient 接口的响应体 转成 方法的参数类型
     * @return
     */
    @Bean
    @ConditionalOnMissingBean
    public Decoder feignDecoder() {
        return new OptionalDecoder(new ResponseEntityDecoder(new SpringDecoder(this.messageConverters)));
    }

    /**
     * 依赖IOC容器配置的 List<HttpMessageConverter> ,其作用是将 FeignClient 接口的参数 设置到请求体中
     * @param formWriterProvider
     * @return
     */
    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnMissingClass("org.springframework.data.domain.Pageable")
    public Encoder feignEncoder(ObjectProvider<AbstractFormWriter> formWriterProvider) {
        return springEncoder(formWriterProvider);
    }

    /**
     * 扩展 FeignClient 接口 支持的注解。其作用是在执行接口方法时 将特殊注解标注的内容 映射到Request对象中，
     * 比如设置 请求头、请求路径、查询参数、请求体 等等
     * @param feignConversionService
     * @return
     */
    @Bean
    @ConditionalOnMissingBean
    public Contract feignContract(ConversionService feignConversionService) {
        boolean decodeSlash = feignClientProperties == null || feignClientProperties.isDecodeSlash();
        return new SpringMvcContract(this.parameterProcessors, feignConversionService, decodeSlash);
    }

    /**
     * 生成 FeignClient 的 Builder 对象。FeignCircuitBreaker 是 OpenFeign 定义的，
     * 用来使用 FeignCircuitBreaker 来执行 FeignClient 接口的方法
     * @return
     */
    @Bean
    @Scope("prototype")
    @ConditionalOnMissingBean
    @ConditionalOnBean(CircuitBreakerFactory.class)
    public Feign.Builder circuitBreakerFeignBuilder() {
        return FeignCircuitBreaker.builder();
    }

}
```
