# Spring BeanDefinitionReaderUtils

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)

## createBeanDefinition

- `org.springframework.beans.factory.support.BeanDefinitionReaderUtils.createBeanDefinition`

```java
public static AbstractBeanDefinition createBeanDefinition(
      @Nullable String parentName, @Nullable String className, @Nullable ClassLoader classLoader) throws ClassNotFoundException {

   GenericBeanDefinition bd = new GenericBeanDefinition();
   // 设置 父bean
   bd.setParentName(parentName);
   if (className != null) {
      if (classLoader != null) {
         // 设置 class
         // 内部是通过反射创建 class
         bd.setBeanClass(ClassUtils.forName(className, classLoader));
      }
      else {
         // 设置 class name
         bd.setBeanClassName(className);
      }
   }
   return bd;
}
```

## generateBeanName

- `org.springframework.beans.factory.support.BeanDefinitionReaderUtils.generateBeanName(org.springframework.beans.factory.config.BeanDefinition, org.springframework.beans.factory.support.BeanDefinitionRegistry, boolean)`

```java
	public static String generateBeanName(
			BeanDefinition definition, BeanDefinitionRegistry registry, boolean isInnerBean)
			throws BeanDefinitionStoreException {

		// 获取 bean class 的名称
		// Class.getName()
		String generatedBeanName = definition.getBeanClassName();
		if (generatedBeanName == null) {
			// 父类名称是否存在
			if (definition.getParentName() != null) {
				generatedBeanName = definition.getParentName() + "$child";
			}
			// 工厂 beanName 是否为空
			else if (definition.getFactoryBeanName() != null) {
				generatedBeanName = definition.getFactoryBeanName() + "$created";
			}
		}
		if (!StringUtils.hasText(generatedBeanName)) {
			throw new BeanDefinitionStoreException("Unnamed bean definition specifies neither " +
					"'class' nor 'parent' nor 'factory-bean' - can't generate bean name");
		}

		String id = generatedBeanName;
		if (isInnerBean) {
			// Inner bean: generate identity hashcode suffix.
			// 组装名称
			// 生成名称 + # + 16 进制的一个字符串
			id = generatedBeanName + GENERATED_BEAN_NAME_SEPARATOR + ObjectUtils.getIdentityHexString(definition);
		}
		else {
			// Top-level bean: use plain class name with unique suffix if necessary.
			// 唯一beanName设置
			// // beanName + # + 序号
			return uniqueBeanName(generatedBeanName, registry);
		}
		return id;
	}
```

## uniqueBeanName

```java
public static String uniqueBeanName(String beanName, BeanDefinitionRegistry registry) {
   String id = beanName;
   int counter = -1;

   // Increase counter until the id is unique.
   while (counter == -1 || registry.containsBeanDefinition(id)) {
      counter++;
      // beanName + # + 序号
      id = beanName + GENERATED_BEAN_NAME_SEPARATOR + counter;
   }
   return id;
}
```

## registerBeanDefinition

```java
public static void registerBeanDefinition(
      BeanDefinitionHolder definitionHolder, BeanDefinitionRegistry registry)
      throws BeanDefinitionStoreException {

   // Register bean definition under primary name.
   // 获取 beanName
   String beanName = definitionHolder.getBeanName();
   // 注册bean definition
   registry.registerBeanDefinition(beanName, definitionHolder.getBeanDefinition());

   // Register aliases for bean name, if any.
   // 别名列表
   String[] aliases = definitionHolder.getAliases();
   // 注册别名列表
   if (aliases != null) {
      for (String alias : aliases) {
         registry.registerAlias(beanName, alias);
      }
   }
}
```

## registerWithGeneratedName

```java
public static String registerWithGeneratedName(
      AbstractBeanDefinition definition, BeanDefinitionRegistry registry)
      throws BeanDefinitionStoreException {

   // 生成一个 beanName
   String generatedName = generateBeanName(definition, registry, false);
   // 注册 bean Definition
   registry.registerBeanDefinition(generatedName, definition);
   return generatedName;
}
```
