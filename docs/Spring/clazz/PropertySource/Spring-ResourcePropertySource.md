# Spring ResourcePropertySource

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)

- 全路径: `org.springframework.core.io.support.ResourcePropertySource`

- source 依然是 map 结构

## getNameForResource

```java
private static String getNameForResource(Resource resource) {
   // 获取 resource 的介绍
   String name = resource.getDescription();
   if (!StringUtils.hasText(name)) {
      // 短类名+@+hashcode
      name = resource.getClass().getSimpleName() + "@" + System.identityHashCode(resource);
   }
   return name;
}
```

## withName

- 创建 ResourcePropertySource 对象, 根据 name 属性

```java
public ResourcePropertySource withName(String name) {
   if (this.name.equals(name)) {
      return this;
   }
   // Store the original resource name if necessary...
   if (this.resourceName != null) {
      if (this.resourceName.equals(name)) {
         return new ResourcePropertySource(this.resourceName, null, this.source);
      }
      else {
         return new ResourcePropertySource(name, this.resourceName, this.source);
      }
   }
   else {
      // Current name is resource name -> preserve it in the extra field...
      return new ResourcePropertySource(name, this.name, this.source);
   }
}
```

## 构造函数

- 通过 location 字符串读取 resource

```java
public ResourcePropertySource(String name, String location, ClassLoader classLoader) throws IOException {
   // 默认资源读取器读取 location 转换成 resource
   this(name, new DefaultResourceLoader(classLoader).getResource(location));
}
```

- 读取 resource 信息进行存储

```java
public ResourcePropertySource(String name, EncodedResource resource) throws IOException {
   // 设置 name + map 对象
   // map 对象是 资源信息
   super(name, PropertiesLoaderUtils.loadProperties(resource));
   // 获取 resource name
   this.resourceName = getNameForResource(resource.getResource());
}
```

## 完整代码

```java
public class ResourcePropertySource extends PropertiesPropertySource {

   /** The original resource name, if different from the given name. */
   @Nullable
   private final String resourceName;


   /**
    * Create a PropertySource having the given name based on Properties
    * loaded from the given encoded resource.
    */
   public ResourcePropertySource(String name, EncodedResource resource) throws IOException {
      // 设置 name + map 对象
      // map 对象是 资源信息
      super(name, PropertiesLoaderUtils.loadProperties(resource));
      // 获取 resource name
      this.resourceName = getNameForResource(resource.getResource());
   }

   /**
    * Create a PropertySource based on Properties loaded from the given resource.
    * The name of the PropertySource will be generated based on the
    * {@link Resource#getDescription() description} of the given resource.
    */
   public ResourcePropertySource(EncodedResource resource) throws IOException {
      // 设置 key: name, resource 的 name
      // 设置 value: resource 资源信息
      super(getNameForResource(resource.getResource()), PropertiesLoaderUtils.loadProperties(resource));
      this.resourceName = null;
   }

   /**
    * Create a PropertySource having the given name based on Properties
    * loaded from the given encoded resource.
    */
   public ResourcePropertySource(String name, Resource resource) throws IOException {
      super(name, PropertiesLoaderUtils.loadProperties(new EncodedResource(resource)));
      this.resourceName = getNameForResource(resource);
   }

   /**
    * Create a PropertySource based on Properties loaded from the given resource.
    * The name of the PropertySource will be generated based on the
    * {@link Resource#getDescription() description} of the given resource.
    */
   public ResourcePropertySource(Resource resource) throws IOException {
      super(getNameForResource(resource), PropertiesLoaderUtils.loadProperties(new EncodedResource(resource)));
      this.resourceName = null;
   }

   /**
    * Create a PropertySource having the given name based on Properties loaded from
    * the given resource location and using the given class loader to load the
    * resource (assuming it is prefixed with {@code classpath:}).
    */
   public ResourcePropertySource(String name, String location, ClassLoader classLoader) throws IOException {
      // 默认资源读取器读取 location 转换成 resource
      this(name, new DefaultResourceLoader(classLoader).getResource(location));
   }

   /**
    * Create a PropertySource based on Properties loaded from the given resource
    * location and use the given class loader to load the resource, assuming it is
    * prefixed with {@code classpath:}. The name of the PropertySource will be
    * generated based on the {@link Resource#getDescription() description} of the
    * resource.
    */
   public ResourcePropertySource(String location, ClassLoader classLoader) throws IOException {
      this(new DefaultResourceLoader(classLoader).getResource(location));
   }

   /**
    * Create a PropertySource having the given name based on Properties loaded from
    * the given resource location. The default thread context class loader will be
    * used to load the resource (assuming the location string is prefixed with
    * {@code classpath:}.
    */
   public ResourcePropertySource(String name, String location) throws IOException {
      this(name, new DefaultResourceLoader().getResource(location));
   }

   /**
    * Create a PropertySource based on Properties loaded from the given resource
    * location. The name of the PropertySource will be generated based on the
    * {@link Resource#getDescription() description} of the resource.
    */
   public ResourcePropertySource(String location) throws IOException {
      this(new DefaultResourceLoader().getResource(location));
   }

   private ResourcePropertySource(String name, @Nullable String resourceName, Map<String, Object> source) {
      super(name, source);
      this.resourceName = resourceName;
   }

   /**
    * Return the description for the given Resource; if the description is
    * empty, return the class name of the resource plus its identity hash code.
    * @see org.springframework.core.io.Resource#getDescription()
    */
   private static String getNameForResource(Resource resource) {
      // 获取 resource 的介绍
      String name = resource.getDescription();
      if (!StringUtils.hasText(name)) {
         // 短类名+@+hashcode
         name = resource.getClass().getSimpleName() + "@" + System.identityHashCode(resource);
      }
      return name;
   }

   /**
    * Return a potentially adapted variant of this {@link ResourcePropertySource},
    * overriding the previously given (or derived) name with the specified name.
    * @since 4.0.4
    */
   public ResourcePropertySource withName(String name) {
      if (this.name.equals(name)) {
         return this;
      }
      // Store the original resource name if necessary...
      if (this.resourceName != null) {
         if (this.resourceName.equals(name)) {
            return new ResourcePropertySource(this.resourceName, null, this.source);
         }
         else {
            return new ResourcePropertySource(name, this.resourceName, this.source);
         }
      }
      else {
         // Current name is resource name -> preserve it in the extra field...
         return new ResourcePropertySource(name, this.name, this.source);
      }
   }

   /**
    * Return a potentially adapted variant of this {@link ResourcePropertySource},
    * overriding the previously given name (if any) with the original resource name
    * (equivalent to the name generated by the name-less constructor variants).
    * @since 4.1
    */
   public ResourcePropertySource withResourceName() {
      if (this.resourceName == null) {
         return this;
      }
      return new ResourcePropertySource(this.resourceName, null, this.source);
   }

}
```
