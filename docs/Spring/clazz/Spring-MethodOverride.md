# Spring MethodOverride

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)

- `org.springframework.beans.factory.support.MethodOverride`
  - `org.springframework.beans.factory.support.LookupOverride`
  - `org.springframework.beans.factory.support.ReplaceOverride`
- `org.springframework.beans.factory.support.MethodOverrides`

## MethodOverride

- MethodOverride 方法重载类

在`MethodOverride`定义了下面三个属性

1. 方法名称
2. 是否重载
3. 源

```java
public abstract class MethodOverride implements BeanMetadataElement {

   /**
    * 方法名称
    */
   private final String methodName;

   /**
    * 是否重载
    */
   private boolean overloaded = true;

   /**
    * 源
    */
   @Nullable
   private Object source;
}
```

- 定义了一个抽象方法, 交由子类实现

```java
public abstract boolean matches(Method method);
```

类图

![MethodOverride](/images/spring/MethodOverride.png)

- 在 Spring 中有两种可以重写的机制(XML)

  1. `lookup-method` 标签

     ```xml
     <lookup-method name="" bean=""/>
     ```

  2. `replaced-method` 标签

     ```xml
     <replaced-method name="" replacer=""/>
     ```

相对应的两个类如类图所示

## LookupOverride

- `org.springframework.beans.factory.support.LookupOverride`
- lookup-method 标签对应的实体对象

属性列表

1. beanName
2. method

```java
@Nullable
private final String beanName;

@Nullable
private Method method;
```

### matches

比较方法

1. method 是否直接相等
1. method 名称是否相同
1. 是否需要重载
1. 是不是 ABSTRACT 方法
1. 参数列表长度是否等于 0

```java
	@Override
	public boolean matches(Method method) {
		if (this.method != null) {
			// 通过 equals 判断
			return method.equals(this.method);
		}
		else {
			// 1. method 名称是否相同
			// 2. 是否需要重载
			// 3. 是不是 ABSTRACT 方法
			// 4. 参数列表长度是否等于0
			return (method.getName().equals(getMethodName()) && (!isOverloaded() ||
					Modifier.isAbstract(method.getModifiers()) || method.getParameterCount() == 0));
		}
	}

```

## ReplaceOverride

- `org.springframework.beans.factory.support.ReplaceOverride`

```java
/**
 * 实现 MethodReplacer 接口的bean name
 * @see MethodReplacer
 */
private final String methodReplacerBeanName;

/**
 * 标签 arg-type 数据
 */
private final List<String> typeIdentifiers = new LinkedList<>();
```

- 一个例子

```XML
<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
	   xmlns="http://www.springframework.org/schema/beans"
	   xsi:schemaLocation="http://www.springframework.org/schema/beans http://www.springframework.org/schema/beans/spring-beans.xsd">
	<bean id="apple" class="org.source.hot.spring.overview.ioc.bean.lookup.Apple">
		<replaced-method replacer="methodReplacerApple" name="hello" >
			<arg-type>String</arg-type>
		</replaced-method>

	</bean>

	<bean id="methodReplacerApple" class="org.source.hot.spring.overview.ioc.bean.lookup.MethodReplacerApple">

	</bean>

</beans>
```

methodReplacerBeanName 对应`org.springframework.beans.factory.support.MethodReplacer` 的实现类

typeIdentifiers 对应标签 arg-type 的属性值

构造方法

```java
public ReplaceOverride(String methodName, String methodReplacerBeanName) {
   super(methodName);
   Assert.notNull(methodName, "Method replacer bean name must not be null");
   this.methodReplacerBeanName = methodReplacerBeanName;
}
```

methodName 通过父类进行设置

### matches

```java
@Override
public boolean matches(Method method) {
   // 方法名称是否相同
   if (!method.getName().equals(getMethodName())) {
      return false;
   }
   // 是否重载
   if (!isOverloaded()) {
      // Not overloaded: don't worry about arg type matching...
      return true;
   }
   // If we get here, we need to insist on precise argument matching...
   // 类型标识数量是否和参数列表是否不相同
   if (this.typeIdentifiers.size() != method.getParameterCount()) {
      return false;
   }
   // 获取参数类型列表
   Class<?>[] parameterTypes = method.getParameterTypes();
   for (int i = 0; i < this.typeIdentifiers.size(); i++) {
      String identifier = this.typeIdentifiers.get(i);
      // 判断 方法参数的类型是否在类型标识列表中
      if (!parameterTypes[i].getName().contains(identifier)) {
         return false;
      }
   }
   return true;
}
```

## MethodOverrides

- `org.springframework.beans.factory.support.MethodOverrides`

- 重载方法对象

- 存储所有重载的方法列表(set 结构)

```java
	private final Set<MethodOverride> overrides = new CopyOnWriteArraySet<>();
```

几个方法

1. 添加 MethodOverride

   ```java
   public void addOverride(MethodOverride override) {
      this.overrides.add(override);
   }

   public void addOverrides(@Nullable MethodOverrides other) {
   		if (other != null) {
   			this.overrides.addAll(other.overrides);
   		}
   }
   ```

1. 获取 MethodOverride

   ```java
   @Nullable
   public MethodOverride getOverride(Method method) {
      MethodOverride match = null;
      for (MethodOverride candidate : this.overrides) {
         if (candidate.matches(method)) {
            match = candidate;
         }
      }
      return match;
   }
   ```
