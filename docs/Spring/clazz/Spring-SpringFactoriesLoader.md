# SpringFactoriesLoader
- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring-boot](https://github.com/SourceHot/spring-boot-read)


- 全路径 : `org.springframework.core.io.support.SpringFactoriesLoader`
- 测试类 : `org.springframework.core.io.support.SpringFactoriesLoaderTests`


## loadFactories

- **加载并实例化工厂**

```java
public static <T> List<T> loadFactories(Class<T> factoryType, @Nullable ClassLoader classLoader) {
		Assert.notNull(factoryType, "'factoryType' must not be null");
		ClassLoader classLoaderToUse = classLoader;
		if (classLoaderToUse == null) {
			classLoaderToUse = SpringFactoriesLoader.class.getClassLoader();
		}
		// 工厂实现类名称
		List<String> factoryImplementationNames = loadFactoryNames(factoryType, classLoaderToUse);
		if (logger.isTraceEnabled()) {
			logger.trace("Loaded [" + factoryType.getName() + "] names: " + factoryImplementationNames);
		}
		List<T> result = new ArrayList<>(factoryImplementationNames.size());
		for (String factoryImplementationName : factoryImplementationNames) {
			// 将实例化的工厂放入结果集合
			result.add(instantiateFactory(factoryImplementationName, factoryType, classLoaderToUse));
		}
		// 排序
		AnnotationAwareOrderComparator.sort(result);
		return result;
	}
```





## loadSpringFactories

- 获取接口的实现类名

```java
	private static Map<String, List<String>> loadSpringFactories(@Nullable ClassLoader classLoader) {
		MultiValueMap<String, String> result = cache.get(classLoader);
		if (result != null) {
			return result;
		}

		try {
			// 找 META-INF/spring.factories
			Enumeration<URL> urls = (classLoader != null ?
					classLoader.getResources(FACTORIES_RESOURCE_LOCATION) :
					ClassLoader.getSystemResources(FACTORIES_RESOURCE_LOCATION));
			result = new LinkedMultiValueMap<>();
			while (urls.hasMoreElements()) {
				// 获取 路由地址
				URL url = urls.nextElement();
				// url 解析
				UrlResource resource = new UrlResource(url);
				// Properties 解析
				Properties properties = PropertiesLoaderUtils.loadProperties(resource);
				// 循环解析结果
				for (Map.Entry<?, ?> entry : properties.entrySet()) {
					String factoryTypeName = ((String) entry.getKey()).trim();
					for (String factoryImplementationName : StringUtils.commaDelimitedListToStringArray((String) entry.getValue())) {
						// 放入list
						result.add(factoryTypeName, factoryImplementationName.trim());
					}
				}
			}
			// 放入缓存
			cache.put(classLoader, result);
			return result;
		}
		catch (IOException ex) {
			throw new IllegalArgumentException("Unable to load factories from location [" +
													   FACTORIES_RESOURCE_LOCATION + "]", ex);
		}
	}

```

- 存放在 测试目录下的`META-INF/spring.factories`

  ```properties
  org.springframework.core.io.support.DummyFactory =\
  org.springframework.core.io.support.MyDummyFactory2, \
  org.springframework.core.io.support.MyDummyFactory1
  
  java.lang.String=\
  org.springframework.core.io.support.MyDummyFactory1
  
  org.springframework.core.io.support.DummyPackagePrivateFactory=\
  org.springframework.core.io.support.DummyPackagePrivateFactory
  
  ```

  

- `Enumeration<URL> urls ` 变量存放的是 扫描到的`META-INF/spring.factories` 路径

- while 代码简单描述
  1. 获取文件路径
  2. 文件路径解析
  3. 读取文件 Properties 解析
  4. 放入返回结果
  5. 放入缓存



## instantiateFactory

```java
@SuppressWarnings("unchecked")
private static <T> T instantiateFactory(String factoryImplementationName, Class<T> factoryType, ClassLoader classLoader) {
   try {
      Class<?> factoryImplementationClass = ClassUtils.forName(factoryImplementationName, classLoader);
      if (!factoryType.isAssignableFrom(factoryImplementationClass)) {
         throw new IllegalArgumentException(
               "Class [" + factoryImplementationName + "] is not assignable to factory type [" + factoryType.getName() + "]");
      }
      return (T) ReflectionUtils.accessibleConstructor(factoryImplementationClass).newInstance();
   }
   catch (Throwable ex) {
      throw new IllegalArgumentException(
            "Unable to instantiate factory class [" + factoryImplementationName + "] for factory type [" + factoryType.getName() + "]",
            ex
      );
   }
}
```

- 反射创建



