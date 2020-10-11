# Spring PropertiesPropertySource
- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)


- 全路径: `org.springframework.core.env.PropertiesPropertySource`



- Properties 是map结构。可以做类型转换. 
- getPropertyNames 就转换成了父类MapPropertySource的方法了
  - map.keySet()

```java
public class PropertiesPropertySource extends MapPropertySource {

   @SuppressWarnings({"rawtypes", "unchecked"})
   public PropertiesPropertySource(String name, Properties source) {
      super(name, (Map) source);
   }

   protected PropertiesPropertySource(String name, Map<String, Object> source) {
      super(name, source);
   }


   @Override
   public String[] getPropertyNames() {
      synchronized (this.source) {
         return super.getPropertyNames();
      }
   }

}
```