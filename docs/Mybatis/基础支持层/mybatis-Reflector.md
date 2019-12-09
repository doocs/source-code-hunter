# mybatis 反射

## addDefaultConstructor

-  mybatis 的反射相关内容在`org.apache.ibatis.reflection` 下存放. 本片主要讲解`org.apache.ibatis.reflection.Reflector`类, 先看一下该类的属性
```java
public class Reflector {

     /**
        * 实体类.class
        */
       private final Class<?> type;
       /**
        * 可读 属性
        */
       private final String[] readablePropertyNames;
       /**
        * 可写 属性值
        */
       private final String[] writablePropertyNames;
       /**
        * set 方法列表
        */
       private final Map<String, Invoker> setMethods = new HashMap<>();
       /**
        * get 方法列表
        */
       private final Map<String, Invoker> getMethods = new HashMap<>();
       /**
        * set 的数据类型
        */
       private final Map<String, Class<?>> setTypes = new HashMap<>();
       /**
        * get 的数据类型
        */
       private final Map<String, Class<?>> getTypes = new HashMap<>();
       /**
        * 构造函数
        */
       private Constructor<?> defaultConstructor;
   
       /**
        * 缓存数据, 大写KEY
        */
       private Map<String, String> caseInsensitivePropertyMap = new HashMap<>();

}
```

- 构造方法, 构造方法传入一个类的字节码,在构造方法中设置相关的属性值
```java
public class Reflector {

/**
 * @param clazz 待解析类的字节码
 */
public Reflector(Class<?> clazz) {
    type = clazz;
    // 构造方法
    addDefaultConstructor(clazz);
    // get 方法
    addGetMethods(clazz);
    // set 方法
    addSetMethods(clazz);
    // 字段值
    addFields(clazz);
    readablePropertyNames = getMethods.keySet().toArray(new String[0]);
    writablePropertyNames = setMethods.keySet().toArray(new String[0]);
    for (String propName : readablePropertyNames) {
        // 循环操作设置到缓存中,
        caseInsensitivePropertyMap.put(propName.toUpperCase(Locale.ENGLISH), propName);
    }
    for (String propName : writablePropertyNames) {
        caseInsensitivePropertyMap.put(propName.toUpperCase(Locale.ENGLISH), propName);
    }
}
}
```
- `addDefaultConstructor` 方法 , 下面截图内容为JDK8 mybatis中 的内容
```java
    private void addDefaultConstructor(Class<?> clazz) {

        // 获取类里面的所有构造方法
        Constructor<?>[] constructors = clazz.getDeclaredConstructors();
        // 过滤得到空参构造 constructor -> constructor.getParameterTypes().length == 0
        Arrays.stream(constructors).filter(constructor -> constructor.getParameterTypes().length == 0)
                .findAny().ifPresent(constructor -> {
            System.out.println("有空参构造");
            this.defaultConstructor = constructor;
        });
    }
```
- 创建一个测试类
```java 
public class People {
    private String name;

    public People() {
    }

    public People(String name) {
        this.name = name;
    }

    @Override
    public String toString() {
        return "People{" +
                "name='" + name + '\'' +
                '}';
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}

```
```java
import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;

class HfReflectorTest {
    @Test
    void getDefaultConstructorTest() throws Exception {
        Reflector reflector = new Reflector(People.class);
        // 获取空参构造方法
        Constructor<?> defaultConstructor = reflector.getDefaultConstructor();
        People o = (People) defaultConstructor.newInstance();
        o.setName("hhh");

        System.out.println(o);
    }
}
```

- 准备工作完成了开始进行 debug , 在`org.apache.ibatis.reflection.Reflector#addDefaultConstructor`这个方法上打上断点

  ![1575890354400](/images/mybatis/1575890354400.png)

  观察`constructors`属性存在两个方法,这两个方法就是我在`People`类中的构造方法.

  根据语法内容我们应该对`parameterTypes`属性进行查看

  ![1575890475839](/images/mybatis/1575890475839.png)

可以发现空参构造的`parameterTypes`长度是0.因此可以确认`org.apache.ibatis.reflection.Reflector#addDefaultConstructor`方法获取了空参构造

- 继续看`org.apache.ibatis.reflection.Reflector#getDefaultConstructor`方法, 该方法是获取构造函数的方法,如果构造函数没有就抛出异常,这也是为什么我们的实体类需要把空参构造写上去的原因。

  ```java
      public Constructor<?> getDefaultConstructor() {
          if (defaultConstructor != null) {
              return defaultConstructor;
          } else {
              // 如果没有空参构造抛出的异常
              throw new ReflectionException("There is no default constructor for " + type);
          }
      }
  ```

  



