# Spring MockPropertySource
- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)


- 内部 source 是 Properties 类型







## withProperty

- 设置属性名称和属性值	

```java
public MockPropertySource withProperty(String name, Object value) {
   this.setProperty(name, value);
   return this;
}
```





## setProperty

```java
public void setProperty(String name, Object value) {
   this.source.put(name, value);
}
```





## 完整代码



```java
public class MockPropertySource extends PropertiesPropertySource {

   /**
    * {@value} is the default name for {@link MockPropertySource} instances not
    * otherwise given an explicit name.
    * @see #MockPropertySource()
    * @see #MockPropertySource(String)
    */
   public static final String MOCK_PROPERTIES_PROPERTY_SOURCE_NAME = "mockProperties";

   /**
    * Create a new {@code MockPropertySource} named {@value #MOCK_PROPERTIES_PROPERTY_SOURCE_NAME}
    * that will maintain its own internal {@link Properties} instance.
    */
   public MockPropertySource() {
      this(new Properties());
   }

   /**
    * Create a new {@code MockPropertySource} with the given name that will
    * maintain its own internal {@link Properties} instance.
    * @param name the {@linkplain #getName() name} of the property source
    */
   public MockPropertySource(String name) {
      this(name, new Properties());
   }

   /**
    * Create a new {@code MockPropertySource} named {@value #MOCK_PROPERTIES_PROPERTY_SOURCE_NAME}
    * and backed by the given {@link Properties} object.
    * @param properties the properties to use
    */
   public MockPropertySource(Properties properties) {
      this(MOCK_PROPERTIES_PROPERTY_SOURCE_NAME, properties);
   }

   /**
    * Create a new {@code MockPropertySource} with the given name and backed by the given
    * {@link Properties} object.
    * @param name the {@linkplain #getName() name} of the property source
    * @param properties the properties to use
    */
   public MockPropertySource(String name, Properties properties) {
      super(name, properties);
   }

   /**
    * Set the given property on the underlying {@link Properties} object.
    */
   public void setProperty(String name, Object value) {
      // map 操作
      this.source.put(name, value);
   }

   /**
    * Convenient synonym for {@link #setProperty} that returns the current instance.
    * Useful for method chaining and fluent-style use.
    * 设置属性名称和属性值
    * @return this {@link MockPropertySource} instance
    */
      public MockPropertySource withProperty(String name, Object value) {
         this.setProperty(name, value);
         return this;
      }

}
```