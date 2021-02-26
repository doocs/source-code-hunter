# MappingRegistry

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)
- 源码路径: `org.springframework.jms.annotation.EnableJms`

- 类全路径
- `org.springframework.web.servlet.handler.AbstractHandlerMethodMapping.MappingRegistry`
- 基本属性

  ```java
  class MappingRegistry {

     /**
      * key:mapping
      * value: mapping registration
      */
     private final Map<T, MappingRegistration<T>> registry = new HashMap<>();

     /**
      * key: mapping
      * value: handlerMethod
      */
     private final Map<T, HandlerMethod> mappingLookup = new LinkedHashMap<>();

     /**
      * key: url
      * value: list mapping
      */
     private final MultiValueMap<String, T> urlLookup = new LinkedMultiValueMap<>();

     /**
      * key: name
      * value: handler method
      */
     private final Map<String, List<HandlerMethod>> nameLookup = new ConcurrentHashMap<>();

     /**
      * key:handler method
      * value: 跨域配置
      */
     private final Map<HandlerMethod, CorsConfiguration> corsLookup = new ConcurrentHashMap<>();

     /**
      * 读写锁
      */
     private final ReentrantReadWriteLock readWriteLock = new ReentrantReadWriteLock();
  }
  ```

- 写一个简单的 controller 来进行解析

```java
@RestController
@RequestMapping("/demo")
public class DemoController {
   @GetMapping("/do")
   public Object go() {
      return "fff";
   }
}
```

- 前置链路追踪

  - `org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping#registerHandlerMethod`

  ```java
  protected void registerHandlerMethod(Object handler, Method method, RequestMappingInfo mapping) {
      super.registerHandlerMethod(handler, method, mapping);
      this.updateConsumesCondition(mapping, method);
  }
  ```

  - `org.springframework.web.servlet.handler.AbstractHandlerMethodMapping#registerHandlerMethod`

  ```java
  protected void registerHandlerMethod(Object handler, Method method, T mapping) {
      this.mappingRegistry.register(mapping, handler, method);
  }
  ```

  - `org.springframework.web.servlet.handler.AbstractHandlerMethodMapping.MappingRegistry#register`

    本文重点的方法

先将对象截图出来方便后续理解

![image-20200918130340555](/images/springMVC/clazz/image-20200918130340555.png)

## createHandlerMethod

- `org.springframework.web.servlet.handler.AbstractHandlerMethodMapping#createHandlerMethod`

```java
protected HandlerMethod createHandlerMethod(Object handler, Method method) {
   // 是否是字符串
   if (handler instanceof String) {
      // 创建对象
      return new HandlerMethod((String) handler,
            obtainApplicationContext().getAutowireCapableBeanFactory(), method);
   }
   return new HandlerMethod(handler, method);
}
```

- HandlerMethod 构造函数

  ```java
  public HandlerMethod(String beanName, BeanFactory beanFactory, Method method){}

  public HandlerMethod(Object bean, Method method) {}
  ```

## HandlerMethod

- 成员变量

```java
public class HandlerMethod {

   /** Logger that is available to subclasses. */
   protected final Log logger = LogFactory.getLog(getClass());

   /**
    * beanName 或者 bean 实例
    */
   private final Object bean;

   /**
    * 上下文
    */
   @Nullable
   private final BeanFactory beanFactory;

   /**
    * bean 类型
    */
   private final Class<?> beanType;

   /**
    * 处理方法
    */
   private final Method method;

   private final Method bridgedMethod;

   /**
    * 方法参数
    */
   private final MethodParameter[] parameters;
}
```

## validateMethodMapping

- `org.springframework.web.servlet.handler.AbstractHandlerMethodMapping.MappingRegistry#validateMethodMapping`

HandlerMethod 进行验证

```java
private void validateMethodMapping(HandlerMethod handlerMethod, T mapping) {
   // Assert that the supplied mapping is unique.
   // 从缓存中获取
   HandlerMethod existingHandlerMethod = this.mappingLookup.get(mapping);
   // 是否为空 , 是否相同
   if (existingHandlerMethod != null && !existingHandlerMethod.equals(handlerMethod)) {
      throw new IllegalStateException(
            "Ambiguous mapping. Cannot map '" + handlerMethod.getBean() + "' method \n" +
                  handlerMethod + "\nto " + mapping + ": There is already '" +
                  existingHandlerMethod.getBean() + "' bean method\n" + existingHandlerMethod + " mapped.");
   }
}
```

## getDirectUrls

- 找到 mapping 匹配的 url

- `org.springframework.web.servlet.handler.AbstractHandlerMethodMapping.MappingRegistry#getDirectUrls`

```java
private List<String> getDirectUrls(T mapping) {
   List<String> urls = new ArrayList<>(1);
   // mapping.getPatternsCondition().getPatterns()
   for (String path : getMappingPathPatterns(mapping)) {
      // 是否匹配
      if (!getPathMatcher().isPattern(path)) {
         urls.add(path);
      }
   }
   return urls;
}
```

## handlerMethod 和 name 绑定

```java
String name = null;
if (getNamingStrategy() != null) {
   // 获取名字
   // 类名#方法名
   name = getNamingStrategy().getName(handlerMethod, mapping);
   // 设置 handlerMethod + name 的关系
   addMappingName(name, handlerMethod);
}
```

- `org.springframework.web.servlet.mvc.method.RequestMappingInfoHandlerMethodMappingNamingStrategy#getName`

```java
@Override
public String getName(HandlerMethod handlerMethod, RequestMappingInfo mapping) {
   if (mapping.getName() != null) {
      return mapping.getName();
   }
   StringBuilder sb = new StringBuilder();
   // 短类名
   String simpleTypeName = handlerMethod.getBeanType().getSimpleName();
   for (int i = 0; i < simpleTypeName.length(); i++) {
      if (Character.isUpperCase(simpleTypeName.charAt(i))) {
         sb.append(simpleTypeName.charAt(i));
      }
   }
   // 组装名称
   // 类名+#+方法名称
   sb.append(SEPARATOR).append(handlerMethod.getMethod().getName());
   return sb.toString();
}
```

## initCorsConfiguration

- `org.springframework.web.servlet.handler.AbstractHandlerMethodMapping#initCorsConfiguration`

```java
@Override
protected CorsConfiguration initCorsConfiguration(Object handler, Method method, RequestMappingInfo mappingInfo) {
   // 创建 handlerMethod
   HandlerMethod handlerMethod = createHandlerMethod(handler, method);
   // 获取 beanType
   Class<?> beanType = handlerMethod.getBeanType();
   // 获取跨域注解 CrossOrigin
   CrossOrigin typeAnnotation = AnnotatedElementUtils.findMergedAnnotation(beanType, CrossOrigin.class);
   CrossOrigin methodAnnotation = AnnotatedElementUtils.findMergedAnnotation(method, CrossOrigin.class);

   if (typeAnnotation == null && methodAnnotation == null) {
      return null;
   }

   // 跨域信息配置
   CorsConfiguration config = new CorsConfiguration();
   // 更新跨域配置
   updateCorsConfig(config, typeAnnotation);
   updateCorsConfig(config, methodAnnotation);

   if (CollectionUtils.isEmpty(config.getAllowedMethods())) {
      // 跨域配置赋给方法
      for (RequestMethod allowedMethod : mappingInfo.getMethodsCondition().getMethods()) {
         config.addAllowedMethod(allowedMethod.name());
      }
   }
   // 应用跨域
   return config.applyPermitDefaultValues();
}
```

## unregister

- `org.springframework.web.servlet.handler.AbstractHandlerMethodMapping.MappingRegistry#unregister`

  移除 mapping 信息

- 执行 map ， list 相关的移除方法.

```java
public void unregister(T mapping) {
   this.readWriteLock.writeLock().lock();
   try {
      MappingRegistration<T> definition = this.registry.remove(mapping);
      if (definition == null) {
         return;
      }

      this.mappingLookup.remove(definition.getMapping());

      for (String url : definition.getDirectUrls()) {
         List<T> list = this.urlLookup.get(url);
         if (list != null) {
            list.remove(definition.getMapping());
            if (list.isEmpty()) {
               this.urlLookup.remove(url);
            }
         }
      }

      removeMappingName(definition);

      this.corsLookup.remove(definition.getHandlerMethod());
   }
   finally {
      this.readWriteLock.writeLock().unlock();
   }
}
```
