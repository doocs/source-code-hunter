# Spring Conditional

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)

## Conditional

```java
@Target({ ElementType.TYPE, ElementType.METHOD })
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Conditional {

    /**
     * 多个匹配器接口
     */
    Class<? extends Condition>[] value();

}
```

## Condition

```
@FunctionalInterface
public interface Condition {

    /**
     * 匹配,如果匹配返回true进行初始化,返回false跳过初始化
     */
    boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata);

}
```

- ConditionContext 上下文
- AnnotatedTypeMetadata 注解信息

### ConditionContext

```
public interface ConditionContext {

   /**
     * bean的定义
    */
   BeanDefinitionRegistry getRegistry();

   /**
     * bean 工厂
    */
   @Nullable
   ConfigurableListableBeanFactory getBeanFactory();

   /**
     * 环境
    */
   Environment getEnvironment();

   /**
     * 资源加载器
    */
   ResourceLoader getResourceLoader();

   /**
     * 类加载器
    */
   @Nullable
   ClassLoader getClassLoader();

}
```

- 唯一实现 : `org.springframework.context.annotation.ConditionEvaluator.ConditionContextImpl`

- 构造方法

```java
public ConditionContextImpl(@Nullable BeanDefinitionRegistry registry,
      @Nullable Environment environment, @Nullable ResourceLoader resourceLoader) {

   this.registry = registry;
   this.beanFactory = deduceBeanFactory(registry);
   this.environment = (environment != null ? environment : deduceEnvironment(registry));
   this.resourceLoader = (resourceLoader != null ? resourceLoader : deduceResourceLoader(registry));
   this.classLoader = deduceClassLoader(resourceLoader, this.beanFactory);
}
```

- 在构造方法中加载了一些变量, 这些变量是根据一定规则转换后得到. 具体规则不展开.

### AnnotatedTypeMetadata

- 元数据接口

```java
public interface AnnotatedTypeMetadata {

    /**
     * 获取所有注解
     */
    MergedAnnotations getAnnotations();

    /**
     * 是否有注解
     */
    default boolean isAnnotated(String annotationName) {
        return getAnnotations().isPresent(annotationName);
    }

    /**
     * 获取注解的属性
     */
    @Nullable
    default Map<String, Object> getAnnotationAttributes(String annotationName) {
        return getAnnotationAttributes(annotationName, false);
    }

}
```

## 源码分析

- 对应测试类`org.springframework.context.annotation.ConfigurationClassWithConditionTests`

```java
@Test
public void conditionalOnMissingBeanMatch() throws Exception {
   AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext();
   ctx.register(BeanOneConfiguration.class, BeanTwoConfiguration.class);
   ctx.refresh();
   assertThat(ctx.containsBean("bean1")).isTrue();
   assertThat(ctx.containsBean("bean2")).isFalse();
   assertThat(ctx.containsBean("configurationClassWithConditionTests.BeanTwoConfiguration")).isFalse();
}



	@Configuration
	static class BeanOneConfiguration {

		@Bean
		public ExampleBean bean1() {
			return new ExampleBean();
		}
	}

	@Configuration
	@Conditional(NoBeanOneCondition.class)
	static class BeanTwoConfiguration {

		@Bean
		public ExampleBean bean2() {
			return new ExampleBean();
		}
	}


	static class NoBeanOneCondition implements Condition {

		@Override
		public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
			return !context.getBeanFactory().containsBeanDefinition("bean1");
		}
	}

```

- `org.springframework.context.annotation.AnnotatedBeanDefinitionReader#doRegisterBean`

### shouldSkip

```java
public boolean shouldSkip(@Nullable AnnotatedTypeMetadata metadata, @Nullable ConfigurationPhase phase) {
   if (metadata == null || !metadata.isAnnotated(Conditional.class.getName())) {
      return false;
   }

   if (phase == null) {
      if (metadata instanceof AnnotationMetadata &&
            ConfigurationClassUtils.isConfigurationCandidate((AnnotationMetadata) metadata)) {
         return shouldSkip(metadata, ConfigurationPhase.PARSE_CONFIGURATION);
      }
      return shouldSkip(metadata, ConfigurationPhase.REGISTER_BEAN);
   }

   List<Condition> conditions = new ArrayList<>();
   // 获取注解 Conditional 的属性值
   for (String[] conditionClasses : getConditionClasses(metadata)) {
      for (String conditionClass : conditionClasses) {
         // 序列化成注解
         Condition condition = getCondition(conditionClass, this.context.getClassLoader());
         // 插入注解列表
         conditions.add(condition);
      }
   }

   AnnotationAwareOrderComparator.sort(conditions);

   for (Condition condition : conditions) {
      ConfigurationPhase requiredPhase = null;
      if (condition instanceof ConfigurationCondition) {
         requiredPhase = ((ConfigurationCondition) condition).getConfigurationPhase();
      }

      // matches 进行验证
      if ((requiredPhase == null || requiredPhase == phase) && !condition.matches(this.context, metadata)) {
         return true;
      }
   }

   return false;
}
```

- 读取注解信息, 并且执行注解对应的类的方法

  用例如下. 实例化`BeanTwoConfiguration`对象的时候会去执行`NoBeanOneCondition`方法

  ```java
  @Configuration
  @Conditional(NoBeanOneCondition.class)
  static class BeanTwoConfiguration {

     @Bean
     public ExampleBean bean2() {
        return new ExampleBean();
     }
  }


  static class NoBeanOneCondition implements Condition {

  		@Override
  		public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
  			return !context.getBeanFactory().containsBeanDefinition("bean1");
  		}
  	}
  ```

在开发中可以自定义 matches 规则

这也是在注册的时候第一个方法

```java
private <T> void doRegisterBean(Class<T> beanClass, @Nullable String name,
      @Nullable Class<? extends Annotation>[] qualifiers, @Nullable Supplier<T> supplier,
      @Nullable BeanDefinitionCustomizer[] customizers) {

   AnnotatedGenericBeanDefinition abd = new AnnotatedGenericBeanDefinition(beanClass);
   // 和条件注解相关的函数
   if (this.conditionEvaluator.shouldSkip(abd.getMetadata())) {
      return;
   }

    // 省略其他
}
```
