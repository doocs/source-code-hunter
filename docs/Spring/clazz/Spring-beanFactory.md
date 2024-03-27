# Spring BeanFactory

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)

## BeanFactory 概述

- `org.springframework.beans.factory.BeanFactory`

### 类图

![beanFactory](../../../images/spring/BeanFactory.png)

### 方法列表

- 贴出部分代码. 仅表示方法作用

```java
public interface BeanFactory {
    // 从容器中根据beanname获取
	Object getBean(String name) throws BeansException;
    // 延迟加载对象
	<T> ObjectProvider<T> getBeanProvider(Class<T> requiredType);
    // 是否存在beanName
	boolean containsBean(String name);
    // 这个 beanName 是否是单例的. 映射成 bean
	boolean isSingleton(String name) throws NoSuchBeanDefinitionException;
    // 是否多例.
	boolean isPrototype(String name) throws NoSuchBeanDefinitionException;
    // 类型是否匹配
	boolean isTypeMatch(String name, ResolvableType typeToMatch) throws NoSuchBeanDefinitionException;
    // 获取bean的类型
	Class<?> getType(String name) throws NoSuchBeanDefinitionException;
    // 获取别名
	String[] getAliases(String name);
}
```

## 解析

### 用例

bean 的实例化有如下几种方法

1. 静态方法
2. 工厂方法创建
3. FactoryBean 接口创建

### 代码部分

```java
public class UserBean {

  private String name;
  private Integer age;

  public static UserBean createInstance() {
    UserBean userBean = new UserBean();
    userBean.setAge(18);
    userBean.setName("zhangsan");

    return userBean;
  }
    // get set 忽略
}
```

```java
public interface UserBeanFactory {
  UserBean factory();
}

public class UserBeanFactoryImpl implements
        UserBeanFactory {


    @Override
    public UserBean factory() {
        return UserBean.createInstance();
    }
}

```

```java
public class UserFactoryBean implements FactoryBean<UserBean> {

  @Override
  public boolean isSingleton() {
    return true;
  }

  @Override
  public UserBean getObject() throws Exception {
    return UserBean.createInstance();
  }

  @Override
  public Class<?> getObjectType() {
    return UserBean.class;
  }
}
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns="http://www.springframework.org/schema/beans"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.springframework.org/schema/beans http://www.springframework.org/schema/beans/spring-beans.xsd">


   <!--  静态方法-->
   <bean id="static-method-user"
        class="org.source.hot.spring.overview.ioc.bean.init.UserBean"
        factory-method="createInstance"/>

   <!--  工厂方法创建-->
   <bean id="factory-use" class="org.source.hot.spring.overview.ioc.bean.init.UserBean"
        factory-bean="userFactory" factory-method="factory"></bean>
   <!--user 工厂bean-->
   <bean id="userFactory"
        class="org.source.hot.spring.overview.ioc.bean.init.UserBeanFactoryImpl"/>
   <!--factory bean-->
   <bean id="factory-bean-user"
        class="org.source.hot.spring.overview.ioc.bean.init.UserFactoryBean"/>

</beans>
```

```java
public class SpringBeanInstantiation {

  public static void main(String[] args) {
    BeanFactory context = new ClassPathXmlApplicationContext(
        "META-INF/beans/spring-bean-instantiation.xml");

    UserBean staticMethodBean = context.getBean("static-method-user", UserBean.class);
    UserBean factoryUser = context.getBean("factory-use", UserBean.class);
    UserBean factoryBean = context.getBean("factory-bean-user", UserBean.class);
    System.out.println();

  }
}
```

### 分析

- 对下面代码进行分析

```java
 UserBean staticMethodBean = context.getBean("static-method-user", UserBean.class);
```

- `org.springframework.context.support.AbstractApplicationContext#getBean(java.lang.String, java.lang.Class<T>)`

```java
@Override
	public <T> T getBean(String name, Class<T> requiredType) throws BeansException {
	    // 判断 beanFactory 是否存活
		assertBeanFactoryActive();

		// 1. 获取 beanFactory
        // 2. 根据 beanName + class 获取 Bean
		return getBeanFactory().getBean(name, requiredType);
	}
```

- 从方法参数
  - name: beanName
  - requiredType: 唯一的类型. 对象类型

### assertBeanFactoryActive

- beanFactory 是否存活判断

```java
protected void assertBeanFactoryActive() {
        // 是否存活
        if (!this.active.get()) {
            // 是否关闭
            if (this.closed.get()) {
                throw new IllegalStateException(getDisplayName() + " has been closed already");
            }
            else {
                throw new IllegalStateException(getDisplayName() + " has not been refreshed yet");
            }
        }
    }
```

### getBeanFactory

- 获取 beanFactory

  - 获取方法是一个抽象方法

    ```java
    public abstract ConfigurableListableBeanFactory getBeanFactory() throws IllegalStateException;
    ```

    - 子类实现

      `org.springframework.context.support.AbstractRefreshableApplicationContext#getBeanFactory`

      ```java
      @Override
      public final ConfigurableListableBeanFactory getBeanFactory() {
         synchronized (this.beanFactoryMonitor) {
            if (this.beanFactory == null) {
               throw new IllegalStateException("BeanFactory not initialized or already closed - " +
                     "call 'refresh' before accessing beans via the ApplicationContext");
            }
            return this.beanFactory;
         }
      }
      ```

      - `org.springframework.context.support.GenericApplicationContext#getBeanFactory`

      ```java
      @Override
      public final ConfigurableListableBeanFactory getBeanFactory() {
         return this.beanFactory;
      }
      ```

- 获取到的对象是`org.springframework.beans.factory.support.DefaultListableBeanFactory`

![image-20200902102912716](../../../images/spring/image-20200902102912716.png)

- 整体类图

![image-20200902103154580](../../../images/spring/image-20200902103154580.png)

### doGetBean

- `org.springframework.beans.factory.support.AbstractBeanFactory#doGetBean`

  获取 bean 的核心

#### transformedBeanName

```java
protected String transformedBeanName(String name) {
    // 转换 beanName .
    // 1. 通过·BeanFactoryUtils.transformedBeanName· 求beanName
    // 2. 如果是有别名的(方法参数是别名) . 会从别名列表中获取对应的 beanName
    return canonicalName(BeanFactoryUtils.transformedBeanName(name));
}
```

```java
public static String transformedBeanName(String name) {
       Assert.notNull(name, "'name' must not be null");
       // 名字不是 & 开头直接返回
   if (!name.startsWith(BeanFactory.FACTORY_BEAN_PREFIX)) {
      return name;
   }
   // 截取字符串 在返回
   return transformedBeanNameCache.computeIfAbsent(name, beanName -> {
      do {
         beanName = beanName.substring(BeanFactory.FACTORY_BEAN_PREFIX.length());
      }
      while (beanName.startsWith(BeanFactory.FACTORY_BEAN_PREFIX));
      return beanName;
   });
}
```

```java
public String canonicalName(String name) {
    String canonicalName = name;
    // Handle aliasing...
    String resolvedName;
    do {
        // 别名的获取
        resolvedName = this.aliasMap.get(canonicalName);
        if (resolvedName != null) {
            canonicalName = resolvedName;
        }
    }
    while (resolvedName != null);
    return canonicalName;
}
```

别名对象

```java
private final Map<String, String> aliasMap = new ConcurrentHashMap<>(16);
```

```java
<bean id="factory-bean-user"
     class="org.source.hot.spring.overview.ioc.bean.init.UserFactoryBean"/>

<alias name="factory-bean-user" alias="userFactoryBean"/>
```

aliasMap 和 别名标签的对应关系

![image-20200902105454958](../../../images/spring/image-20200902105454958.png)

alias 标签的 alias 值作为别名的 key ， alias 标签的 name 值作为 value

#### getSingleton

- `org.springframework.beans.factory.support.DefaultSingletonBeanRegistry#getSingleton(java.lang.String)`

```java
@Override
@Nullable
public Object getSingleton(String beanName) {
   return getSingleton(beanName, true);
}
```

- `org.springframework.beans.factory.support.DefaultSingletonBeanRegistry#getSingleton(java.lang.String, boolean)`

```java
@Nullable
protected Object getSingleton(String beanName, boolean allowEarlyReference) {
    // 尝试从单例缓存中获取
    Object singletonObject = this.singletonObjects.get(beanName);
    // 单例对象是否null
    // 这个 beanName 是否正在创建
    if (singletonObject == null && isSingletonCurrentlyInCreation(beanName)) {
        // 锁
        synchronized (this.singletonObjects) {
            // 从延迟加载的map中获取
            singletonObject = this.earlySingletonObjects.get(beanName);
            // 对象是否空 ， 是否允许提前应用
            if (singletonObject == null && allowEarlyReference) {
                // 从对象工厂map中获取对象工厂
                ObjectFactory<?> singletonFactory = this.singletonFactories.get(beanName);
                if (singletonFactory != null) {
                    // 对象获取后设置
                    singletonObject = singletonFactory.getObject();
                    this.earlySingletonObjects.put(beanName, singletonObject);
                    this.singletonFactories.remove(beanName);
                }
            }
        }
    }
    return singletonObject;
}
```

- 相关属性值

```java
/**
 *  Cache of singleton objects: bean name to bean instance.
 *
 * 单例对象容器, key: beanName , value: bean实例
 * */
private final Map<String, Object> singletonObjects = new ConcurrentHashMap<>(256);


    /**
     *  Cache of singleton factories: bean name to ObjectFactory.
     * key: beanName
     * value: 对象工厂
     * */
    private final Map<String, ObjectFactory<?>> singletonFactories = new HashMap<>(16);



    /**
     *  Names of beans that are currently in creation.
     *
     * 当前正在实例化的beanName
     *
     * */
    private final Set<String> singletonsCurrentlyInCreation =
            Collections.newSetFromMap(new ConcurrentHashMap<>(16));
```

#### getObjectForBeanInstance

- `org.springframework.beans.factory.support.AbstractBeanFactory#getObjectForBeanInstance`

```java
protected Object getObjectForBeanInstance(
			Object beanInstance, String name, String beanName, @Nullable RootBeanDefinition mbd) {

		// Don't let calling code try to dereference the factory if the bean isn't a factory.
		// 判断 beanName 是不是 bean 工厂
		if (BeanFactoryUtils.isFactoryDereference(name)) {
			// 类型判断
			if (beanInstance instanceof NullBean) {
				return beanInstance;
			}
			if (!(beanInstance instanceof FactoryBean)) {
				throw new BeanIsNotAFactoryException(beanName, beanInstance.getClass());
			}
			if (mbd != null) {
				mbd.isFactoryBean = true;
			}
			// 返回实例
			return beanInstance;
		}

		// Now we have the bean instance, which may be a normal bean or a FactoryBean.
		// If it's a FactoryBean, we use it to create a bean instance, unless the
		// caller actually wants a reference to the factory.
		// 判断是否是 factoryBean
		if (!(beanInstance instanceof FactoryBean)) {
			return beanInstance;
		}

		Object object = null;
		if (mbd != null) {
			mbd.isFactoryBean = true;
		}
		else {
			// 缓存中获取
			object = getCachedObjectForFactoryBean(beanName);
		}
		if (object == null) {
			// Return bean instance from factory.
			// 如果还是 null 从 factory bean 中创建
			FactoryBean<?> factory = (FactoryBean<?>) beanInstance;
			// Caches object obtained from FactoryBean if it is a singleton.
			if (mbd == null && containsBeanDefinition(beanName)) {
				mbd = getMergedLocalBeanDefinition(beanName);
			}
			boolean synthetic = (mbd != null && mbd.isSynthetic());
			// 从 FactoryBean 中获取bean实例
			object = getObjectFromFactoryBean(factory, beanName, !synthetic);
		}
		return object;
	}
```

#### getObjectFromFactoryBean

- `org.springframework.beans.factory.support.FactoryBeanRegistrySupport#getObjectFromFactoryBean`

- 从 FactoryBean 中获取对象

```java
	protected Object getObjectFromFactoryBean(FactoryBean<?> factory, String beanName, boolean shouldPostProcess) {
		// 是否单例 是否已经包含
		if (factory.isSingleton() && containsSingleton(beanName)) {
			synchronized (getSingletonMutex()) {
				// 从工厂bean的缓存中获取
				Object object = this.factoryBeanObjectCache.get(beanName);
				if (object == null) {

					// 从 factoryBean 接口中获取
					object = doGetObjectFromFactoryBean(factory, beanName);
					// Only post-process and store if not put there already during getObject() call above
					// (e.g. because of circular reference processing triggered by custom getBean calls)
					// 从缓存map中获取
					Object alreadyThere = this.factoryBeanObjectCache.get(beanName);
					if (alreadyThere != null) {
						// 如果缓存中获取有值
						// object 覆盖
						object = alreadyThere;
					}
					else {
						if (shouldPostProcess) {
							if (isSingletonCurrentlyInCreation(beanName)) {
								// Temporarily return non-post-processed object, not storing it yet..
								return object;
							}
							// 单例创建前的验证
							beforeSingletonCreation(beanName);
							try {
								// 从 FactoryBean 接口创建的 后置处理
								object = postProcessObjectFromFactoryBean(object, beanName);
							}
							catch (Throwable ex) {
								throw new BeanCreationException(beanName,
										"Post-processing of FactoryBean's singleton object failed", ex);
							}
							finally {
								// 单例bean创建之后
								afterSingletonCreation(beanName);
							}
						}
						// 是否包含bean name
						if (containsSingleton(beanName)) {
							// 插入缓存
							// 后续使用的时候可以直接获取
							this.factoryBeanObjectCache.put(beanName, object);
						}
					}
				}
				return object;
			}
		}
		else {
			Object object = doGetObjectFromFactoryBean(factory, beanName);
			if (shouldPostProcess) {
				try {
					object = postProcessObjectFromFactoryBean(object, beanName);
				}
				catch (Throwable ex) {
					throw new BeanCreationException(beanName, "Post-processing of FactoryBean's object failed", ex);
				}
			}
			return object;
		}
	}

```

#### beforeSingletonCreation

- `org.springframework.beans.factory.support.DefaultSingletonBeanRegistry#beforeSingletonCreation`

- 单例创建前的验证

```java
protected void beforeSingletonCreation(String beanName) {
   // 排除的单例beanName 是否包含当前beanName
   // 添加当前正在初始化的beanName 是否正确
   if (!this.inCreationCheckExclusions.contains(beanName) && !this.singletonsCurrentlyInCreation.add(beanName)) {
      throw new BeanCurrentlyInCreationException(beanName);
   }
}
```

#### postProcessObjectFromFactoryBean

- 两种实现

  - `org.springframework.beans.factory.support.FactoryBeanRegistrySupport#postProcessObjectFromFactoryBean`

    ```java
    protected Object postProcessObjectFromFactoryBean(Object object, String beanName) throws BeansException {
       return object;
    }
    ```

    直接返回 object

  - `org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory#postProcessObjectFromFactoryBean` 调用 `BeanPostProcessor`

    ```java
    	@Override
    	protected Object postProcessObjectFromFactoryBean(Object object, String beanName) {
    		return applyBeanPostProcessorsAfterInitialization(object, beanName);
    	}


    	@Override
    	public Object applyBeanPostProcessorsAfterInitialization(Object existingBean, String beanName)
    			throws BeansException {

    		Object result = existingBean;
    		for (BeanPostProcessor processor : getBeanPostProcessors()) {
    			Object current = processor.postProcessAfterInitialization(result, beanName);
    			if (current == null) {
    				return result;
    			}
    			result = current;
    		}
    		return result;
    	}

    ```

- 两个方法军返回 `Bean` 对象 . 一种是直接返回 。 另一种是执行接口 `BeanPostProcessor` 接口返回

#### afterSingletonCreation

- `org.springframework.beans.factory.support.DefaultSingletonBeanRegistry#afterSingletonCreation`

```java
protected void afterSingletonCreation(String beanName) {
   // 排除的单例beanName 是否包含当前beanName
   // 移除当前正在初始化的beanName 是否正确
   if (!this.inCreationCheckExclusions.contains(beanName) && !this.singletonsCurrentlyInCreation.remove(beanName)) {
      throw new IllegalStateException("Singleton '" + beanName + "' isn't currently in creation");
   }
}
```

- 代码现在进入的很深了，回到 doGetBean
- `org.springframework.beans.factory.support.AbstractBeanFactory#doGetBean`

```java
	protected <T> T doGetBean(final String name, @Nullable final Class<T> requiredType,
			@Nullable final Object[] args, boolean typeCheckOnly) throws BeansException {
		// 转换beanName
		final String beanName = transformedBeanName(name);
		Object bean;

		// Eagerly check singleton cache for manually registered singletons.
		// 获取单例对象
		Object sharedInstance = getSingleton(beanName);
		// 单例对象是否存在 参数是否为空
		if (sharedInstance != null && args == null) {
			if (logger.isTraceEnabled()) {
				if (isSingletonCurrentlyInCreation(beanName)) {
					logger.trace("Returning eagerly cached instance of singleton bean '" + beanName +
							"' that is not fully initialized yet - a consequence of a circular reference");
				}
				else {
					logger.trace("Returning cached instance of singleton bean '" + beanName + "'");
				}
			}
			// 实例化bean
			bean = getObjectForBeanInstance(sharedInstance, name, beanName, null);
		}

        // 省略后续内容
    }
```

- 目前未知`doGetBean`的第一个`if`分支已经分析完毕. 接下来看下面的代码

- 下面这段代码就简单说一下就跳过了。
  - 从 容器中获取，最后还是回到 doGetBean 方法中. 来进行 bean 创建 这里不进行展开。

```java
else {
   // Fail if we're already creating this bean instance:
   // We're assumably within a circular reference.
   // 循环依赖的问题
   if (isPrototypeCurrentlyInCreation(beanName)) {
      throw new BeanCurrentlyInCreationException(beanName);
   }

   // Check if bean definition exists in this factory.
   BeanFactory parentBeanFactory = getParentBeanFactory();
   if (parentBeanFactory != null && !containsBeanDefinition(beanName)) {
      // Not found -> check parent.
      String nameToLookup = originalBeanName(name);
      if (parentBeanFactory instanceof AbstractBeanFactory) {
         return ((AbstractBeanFactory) parentBeanFactory).doGetBean(
               nameToLookup, requiredType, args, typeCheckOnly);
      }
      else if (args != null) {
         // Delegation to parent with explicit args.
         return (T) parentBeanFactory.getBean(nameToLookup, args);
      }
      else if (requiredType != null) {
         // No args -> delegate to standard getBean method.
         return parentBeanFactory.getBean(nameToLookup, requiredType);
      }
      else {
         return (T) parentBeanFactory.getBean(nameToLookup);
      }
   }
```

#### markBeanAsCreated

- `org.springframework.beans.factory.support.AbstractBeanFactory#markBeanAsCreated`

- 方法作用将 bean 标记为已创建

```
protected void markBeanAsCreated(String beanName) {
   // 已创建的beanName 是否包含当前beanName
   if (!this.alreadyCreated.contains(beanName)) {
      synchronized (this.mergedBeanDefinitions) {
         if (!this.alreadyCreated.contains(beanName)) {
            // Let the bean definition get re-merged now that we're actually creating
            // the bean... just in case some of its metadata changed in the meantime.
            // 将属性stale设置true
            clearMergedBeanDefinition(beanName);
            // 放入已创建集合中
            this.alreadyCreated.add(beanName);
         }
      }
   }
}
```

```java
protected void clearMergedBeanDefinition(String beanName) {
   RootBeanDefinition bd = this.mergedBeanDefinitions.get(beanName);
   if (bd != null) {
      bd.stale = true;
   }
}
```

- stale 的解释

  ```java
  /**
   *  Determines if the definition needs to be re-merged.
   * 是否需要重新合并定义
   * */
  volatile boolean stale;
  ```

- 属性值 已创建的 beanName

  ```java
  private final Set<String> alreadyCreated = Collections.newSetFromMap(new ConcurrentHashMap<>(256));
  ```

#### getMergedLocalBeanDefinition

- `org.springframework.beans.factory.support.AbstractBeanFactory#getMergedLocalBeanDefinition`

- 这个方法获取一个`RootBeanDefinition`对象 ， 这个对象也是 bean 的一种定义。
- 从目前的几个方法名称来看，暂且认为这是一个合并了多个 `BeanDefinition`的对象吧

![rootBeanDefinition](../../../images/spring/RootBeanDefinition.png)

```java
protected RootBeanDefinition getMergedLocalBeanDefinition(String beanName) throws BeansException {
   // Quick check on the concurrent map first, with minimal locking.
   // 缓存中获取
   RootBeanDefinition mbd = this.mergedBeanDefinitions.get(beanName);
   if (mbd != null && !mbd.stale) {
      return mbd;
   }
   // 合并的 bean 定义
   return getMergedBeanDefinition(beanName, getBeanDefinition(beanName));
}


	protected RootBeanDefinition getMergedBeanDefinition(String beanName, BeanDefinition bd)
			throws BeanDefinitionStoreException {

		return getMergedBeanDefinition(beanName, bd, null);
	}

```

#### getBeanDefinition

- 获取 `beanDefinition `
- `org.springframework.beans.factory.support.DefaultListableBeanFactory#getBeanDefinition`

```java
@Override
public BeanDefinition getBeanDefinition(String beanName) throws NoSuchBeanDefinitionException {
   BeanDefinition bd = this.beanDefinitionMap.get(beanName);
   if (bd == null) {
      if (logger.isTraceEnabled()) {
         logger.trace("No bean named '" + beanName + "' found in " + this);
      }
      throw new NoSuchBeanDefinitionException(beanName);
   }
   return bd;
}
```

- 从 beanDefinition map 中获取

- 相关属性

  ```java
  	/**
  	 * Map of bean definition objects, keyed by bean name.
  	 *
  	 * key: beanName
  	 * value: BeanDefinition
  	 *
  	 *  */
  	private final Map<String, BeanDefinition> beanDefinitionMap = new ConcurrentHashMap<>(256);
  ```

#### getMergedBeanDefinition

- 获取`RootBeanDefinition`

- `org.springframework.beans.factory.support.AbstractBeanFactory#getMergedBeanDefinition(java.lang.String, org.springframework.beans.factory.config.BeanDefinition, org.springframework.beans.factory.config.BeanDefinition)`

- 第一部分代码
  - map 中获取 RootBeanDefinition
  - 是否存在父名称
  - 类型是否是 `RootBeanDefinition`
    - 是: 拷贝
    - 否: 将 `BeanDefinition` 转换成 `RootBeanDefinition`

```java
protected RootBeanDefinition getMergedBeanDefinition(
      String beanName, BeanDefinition bd, @Nullable BeanDefinition containingBd)
      throws BeanDefinitionStoreException {

   synchronized (this.mergedBeanDefinitions) {
      RootBeanDefinition mbd = null;
      RootBeanDefinition previous = null;

      // Check with full lock now in order to enforce the same merged instance.
      if (containingBd == null) {
         // 从缓存中获取
         mbd = this.mergedBeanDefinitions.get(beanName);
      }

      if (mbd == null || mbd.stale) {
         previous = mbd;
         // 是否存在父名称
         if (bd.getParentName() == null) {
            // Use copy of given root bean definition.
            // 类型是否等于RootBeanDefinition
            if (bd instanceof RootBeanDefinition) {
               // 做一次对象拷贝
               mbd = ((RootBeanDefinition) bd).cloneBeanDefinition();
            }
            else {
               // 将 beanDefinition 创建成 RootBeanDefinition
               mbd = new RootBeanDefinition(bd);
            }
         }

          // 省略其他
      }
```

- 相关属性

  ```java
  /**
   * Map from bean name to merged RootBeanDefinition.
   * key: beanName
   * value: RootBeanDefinition
   *  */
  private final Map<String, RootBeanDefinition> mergedBeanDefinitions = new ConcurrentHashMap<>(256);
  ```

- 克隆 方法

  ```java
  /**
   * 克隆 BeanDefinition
   * @return
   */
  @Override
  public RootBeanDefinition cloneBeanDefinition() {
     return new RootBeanDefinition(this);
  }
  ```

- 第二部分代码

```java
{
					// Child bean definition: needs to be merged with parent.
					// 父BeanDefinition
					BeanDefinition pbd;
					try {
						// 父类beanName
						String parentBeanName = transformedBeanName(bd.getParentName());
						// 当前beanName是否等于父的beanName
						if (!beanName.equals(parentBeanName)) {
							// 存在父 beanName
							// 父 beanDefinition
							// 递归调用
							pbd = getMergedBeanDefinition(parentBeanName);
						}
						else {
							// 获取父 beanFactory
							BeanFactory parent = getParentBeanFactory();
							// beanFactory 类型判断
							if (parent instanceof ConfigurableBeanFactory) {
								// ConfigurableBeanFactory 的获取方式
								pbd = ((ConfigurableBeanFactory) parent).getMergedBeanDefinition(parentBeanName);
							}
							else {
								throw new NoSuchBeanDefinitionException(parentBeanName,
										"Parent name '" + parentBeanName + "' is equal to bean name '" + beanName +
												"': cannot be resolved without an AbstractBeanFactory parent");
							}
						}
					}
					catch (NoSuchBeanDefinitionException ex) {
						throw new BeanDefinitionStoreException(bd.getResourceDescription(), beanName,
								"Could not resolve parent bean definition '" + bd.getParentName() + "'", ex);
					}
					// Deep copy with overridden values.
					// 将 父 BeanDefinition 对象拷贝
					mbd = new RootBeanDefinition(pbd);
					// 覆盖 beanDefinition
					mbd.overrideFrom(bd);
				}
```

#### overrideFrom

- 覆盖方法

- `org.springframework.beans.factory.support.AbstractBeanDefinition#overrideFrom`

- 最后一段

```java
   // Set default singleton scope, if not configured before.
   // 作用域设置
   if (!StringUtils.hasLength(mbd.getScope())) {
      // 没有设置作用域直接给单例类型
      mbd.setScope(SCOPE_SINGLETON);
   }

   // A bean contained in a non-singleton bean cannot be a singleton itself.
   // Let's correct this on the fly here, since this might be the result of
   // parent-child merging for the outer bean, in which case the original inner bean
   // definition will not have inherited the merged outer bean's singleton status.
   // 修正 作用域
   if (containingBd != null && !containingBd.isSingleton() && mbd.isSingleton()) {
      mbd.setScope(containingBd.getScope());
   }

   // Cache the merged bean definition for the time being
   // (it might still get re-merged later on in order to pick up metadata changes)
   if (containingBd == null && isCacheBeanMetadata()) {
      // 放入缓存
      this.mergedBeanDefinitions.put(beanName, mbd);
   }
}
if (previous != null) {
   copyRelevantMergedBeanDefinitionCaches(previous, mbd);
}
return mbd;
```

#### checkMergedBeanDefinition

- `org.springframework.beans.factory.support.AbstractBeanFactory#checkMergedBeanDefinition`

  ```java
  protected void checkMergedBeanDefinition(RootBeanDefinition mbd, String beanName, @Nullable Object[] args)
        throws BeanDefinitionStoreException {

     if (mbd.isAbstract()) {
        throw new BeanIsAbstractException(beanName);
     }
  }
  ```

  - 判断是否 abstract 标记的情况

- 继续回到 `doGetBean` 方法

```java
// 需要依赖的bean
String[] dependsOn = mbd.getDependsOn();
if (dependsOn != null) {
   for (String dep : dependsOn) {
      if (isDependent(beanName, dep)) {
         throw new BeanCreationException(mbd.getResourceDescription(), beanName,
               "Circular depends-on relationship between '" + beanName + "' and '" + dep + "'");
      }
      // 注册依赖bean
      registerDependentBean(dep, beanName);
      try {
         getBean(dep);
      }
      catch (NoSuchBeanDefinitionException ex) {
         throw new BeanCreationException(mbd.getResourceDescription(), beanName,
               "'" + beanName + "' depends on missing bean '" + dep + "'", ex);
      }
   }
}
```

#### isDependent

- 是否存在依赖关系

- `org.springframework.beans.factory.support.DefaultSingletonBeanRegistry#isDependent(java.lang.String, java.lang.String, java.util.Set<java.lang.String>)`

```java
private boolean isDependent(String beanName, String dependentBeanName, @Nullable Set<String> alreadySeen) {
   if (alreadySeen != null && alreadySeen.contains(beanName)) {
      return false;
   }
   // 别名
   String canonicalName = canonicalName(beanName);
   // 依赖列表中获取
   Set<String> dependentBeans = this.dependentBeanMap.get(canonicalName);
   if (dependentBeans == null) {
      return false;
   }
   if (dependentBeans.contains(dependentBeanName)) {
      return true;
   }
   for (String transitiveDependency : dependentBeans) {
      if (alreadySeen == null) {
         alreadySeen = new HashSet<>();
      }
      alreadySeen.add(beanName);
      if (isDependent(transitiveDependency, dependentBeanName, alreadySeen)) {
         return true;
      }
   }
   return false;
}
```

- 相关属性

  ```java
  /**
   * Map between dependent bean names: bean name to Set of dependent bean names.
   *
   * key: bean
   * value: 依赖列表
   * */
  private final Map<String, Set<String>> dependentBeanMap = new ConcurrentHashMap<>(64);
  ```

- 一个用例

```xml
<bean class="org.source.hot.spring.overview.ioc.bean.init.SystemUserBean" >
   <property name="userBean" ref="factory-use"/>
</bean>
```

![image-20200903091759451](../../../images/spring/image-20200903091759451.png)

#### registerDependentBean

- 注册依赖关系
- `org.springframework.beans.factory.support.DefaultSingletonBeanRegistry#registerDependentBean`
  - 在前文调用 `isDependent` 方法的的时候我们找到了一个依赖映射`dependentBeanMap` ，在这个方法中会将依赖关系放入`dependentBeanMap`

```java
public void registerDependentBean(String beanName, String dependentBeanName) {
   // 别名
   String canonicalName = canonicalName(beanName);

   synchronized (this.dependentBeanMap) {
      // 向依赖关系中放入数据
      Set<String> dependentBeans =
            this.dependentBeanMap.computeIfAbsent(canonicalName, k -> new LinkedHashSet<>(8));
      if (!dependentBeans.add(dependentBeanName)) {
         return;
      }
   }

   synchronized (this.dependenciesForBeanMap) {
      Set<String> dependenciesForBean =
            this.dependenciesForBeanMap.computeIfAbsent(dependentBeanName, k -> new LinkedHashSet<>(8));
      dependenciesForBean.add(canonicalName);
   }
}
```

- 再回到 `doGetBean`

- 接下来就是实例化的过程了.

```java
if (mbd.isSingleton()) {
   sharedInstance = getSingleton(beanName, () -> {
      try {
         return createBean(beanName, mbd, args);
      }
      catch (BeansException ex) {
         // Explicitly remove instance from singleton cache: It might have been put there
         // eagerly by the creation process, to allow for circular reference resolution.
         // Also remove any beans that received a temporary reference to the bean.
         destroySingleton(beanName);
         throw ex;
      }
   });
   bean = getObjectForBeanInstance(sharedInstance, name, beanName, mbd);
}
```

#### getSingleton

- `org.springframework.beans.factory.support.DefaultSingletonBeanRegistry#getSingleton(java.lang.String, org.springframework.beans.factory.ObjectFactory<?>)`
- 获取单例对象

  1. 从单例对象的 map 缓存中获取
  2. 从 ObjectFactory 中获取

- 周边方法

  - `beforeSingletonCreation`

  - `afterSingletonCreation`
  - `addSingleton`

```java
public Object getSingleton(String beanName, ObjectFactory<?> singletonFactory) {
   Assert.notNull(beanName, "Bean name must not be null");
   synchronized (this.singletonObjects) {
      // 从单例对象缓存中获取
      Object singletonObject = this.singletonObjects.get(beanName);
      if (singletonObject == null) {
         if (this.singletonsCurrentlyInDestruction) {
            throw new BeanCreationNotAllowedException(beanName,
                  "Singleton bean creation not allowed while singletons of this factory are in destruction " +
                        "(Do not request a bean from a BeanFactory in a destroy method implementation!)");
         }
         if (logger.isDebugEnabled()) {
            logger.debug("Creating shared instance of singleton bean '" + beanName + "'");
         }
         // 单例创建前的验证
         beforeSingletonCreation(beanName);
         boolean newSingleton = false;
         boolean recordSuppressedExceptions = (this.suppressedExceptions == null);
         if (recordSuppressedExceptions) {
            this.suppressedExceptions = new LinkedHashSet<>();
         }
         try {
            // 从 ObjectFactory 中获取
            singletonObject = singletonFactory.getObject();
            newSingleton = true;
         }
         catch (IllegalStateException ex) {
            // Has the singleton object implicitly appeared in the meantime ->
            // if yes, proceed with it since the exception indicates that state.
            singletonObject = this.singletonObjects.get(beanName);
            if (singletonObject == null) {
               throw ex;
            }
         }
         catch (BeanCreationException ex) {
            if (recordSuppressedExceptions) {
               for (Exception suppressedException : this.suppressedExceptions) {
                  ex.addRelatedCause(suppressedException);
               }
            }
            throw ex;
         }
         finally {
            if (recordSuppressedExceptions) {
               this.suppressedExceptions = null;
            }
            // 创建单例对象后的验证
            afterSingletonCreation(beanName);
         }
         if (newSingleton) {
            // 添加到 单例容器中
            addSingleton(beanName, singletonObject);
         }
      }
      return singletonObject;
   }
}
```

- 回到 doGetBean 方法中

  ```java
  if (mbd.isSingleton()) {
     // 判断是否是单例
     sharedInstance = getSingleton(beanName, () -> {
        try {
           return createBean(beanName, mbd, args);
        }
        catch (BeansException ex) {
           // Explicitly remove instance from singleton cache: It might have been put there
           // eagerly by the creation process, to allow for circular reference resolution.
           // Also remove any beans that received a temporary reference to the bean.
           destroySingleton(beanName);
           throw ex;
        }
     });
     bean = getObjectForBeanInstance(sharedInstance, name, beanName, mbd);
  }
  ```

  这里又要给 `createBean`方法， 从 `getSingleton` 的参数看可以知道 ，第二个匿名函数是`ObjectFactory`接口实现.

  ```java
  @FunctionalInterface
  public interface ObjectFactory<T> {

     /**
      * Return an instance (possibly shared or independent)
      * of the object managed by this factory.
      * 获取对象
      * @return the resulting instance
      * @throws BeansException in case of creation errors
      */
     T getObject() throws BeansException;

  }
  ```

  - createBean 返回的就是单例 bean 对象的实例

##### createBean

- `org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory#createBean(java.lang.String, org.springframework.beans.factory.support.RootBeanDefinition, java.lang.Object[])`

- 两个核心方法

```java
// Give BeanPostProcessors a chance to return a proxy instead of the target bean instance.
Object bean = resolveBeforeInstantiation(beanName, mbdToUse);
Object beanInstance = doCreateBean(beanName, mbdToUse, args);
```

###### resolveBeforeInstantiation

- `org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory#resolveBeforeInstantiation`

- 方法概述:

  获取`BeanPostProcessor`接口的实现列表

  - `applyBeanPostProcessorsBeforeInstantiation` 前置方法执行
  - `applyBeanPostProcessorsAfterInitialization`后置方法执行

```java
@Nullable
protected Object resolveBeforeInstantiation(String beanName, RootBeanDefinition mbd) {
   Object bean = null;
   if (!Boolean.FALSE.equals(mbd.beforeInstantiationResolved)) {
      // Make sure bean class is actually resolved at this point.
      if (!mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
         Class<?> targetType = determineTargetType(beanName, mbd);
         if (targetType != null) {
            /**
             * 主要实现{@link org.springframework.beans.factory.config.InstantiationAwareBeanPostProcessor#postProcessBeforeInstantiation(java.lang.Class, java.lang.String)}
             */
            bean = applyBeanPostProcessorsBeforeInstantiation(targetType, beanName);
            if (bean != null) {
               bean = applyBeanPostProcessorsAfterInitialization(bean, beanName);
            }
         }
      }
      mbd.beforeInstantiationResolved = (bean != null);
   }
   return bean;
}
```

###### doCreateBean

- 创建 bean
- `org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory#doCreateBean`

```java
		// Instantiate the bean.
		BeanWrapper instanceWrapper = null;
		if (mbd.isSingleton()) {
			// beanFactory 移除当前创建的beanName
			instanceWrapper = this.factoryBeanInstanceCache.remove(beanName);
		}
		// beanWrapper 是否存在
		if (instanceWrapper == null) {
			// 创建 bean 实例
			instanceWrapper = createBeanInstance(beanName, mbd, args);
		}
```

###### createBeanInstance

- `org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory#createBeanInstance`
- 创建 bean 实例

```java
protected BeanWrapper createBeanInstance(String beanName, RootBeanDefinition mbd, @Nullable Object[] args) {
   // Make sure bean class is actually resolved at this point.
   // 获取 bean class
   Class<?> beanClass = resolveBeanClass(mbd, beanName);

   if (beanClass != null && !Modifier.isPublic(beanClass.getModifiers()) && !mbd.isNonPublicAccessAllowed()) {
      throw new BeanCreationException(mbd.getResourceDescription(), beanName,
            "Bean class isn't public, and non-public access not allowed: " + beanClass.getName()
      );
   }

   // 返回一个用来创建bean实例的回调接口
   // Supplier get 直接获取bean对象
   Supplier<?> instanceSupplier = mbd.getInstanceSupplier();
   if (instanceSupplier != null) {
      return obtainFromSupplier(instanceSupplier, beanName);
   }

   if (mbd.getFactoryMethodName() != null) {
      // 通过工厂方法创建
      return instantiateUsingFactoryMethod(beanName, mbd, args);
   }

   // Shortcut when re-creating the same bean...
   boolean resolved = false;
   boolean autowireNecessary = false;
   if (args == null) {
      synchronized (mbd.constructorArgumentLock) {
         if (mbd.resolvedConstructorOrFactoryMethod != null) {
            resolved = true;
            autowireNecessary = mbd.constructorArgumentsResolved;
         }
      }
   }
   if (resolved) {
      if (autowireNecessary) {
         // 自动构造 bean
         return autowireConstructor(beanName, mbd, null, null);
      }
      else {
         // 实例化bean
         return instantiateBean(beanName, mbd);
      }
   }

   // Candidate constructors for autowiring?
   Constructor<?>[] ctors = determineConstructorsFromBeanPostProcessors(beanClass, beanName);
   if (ctors != null || mbd.getResolvedAutowireMode() == AUTOWIRE_CONSTRUCTOR ||
         mbd.hasConstructorArgumentValues() || !ObjectUtils.isEmpty(args)) {
      return autowireConstructor(beanName, mbd, ctors, args);
   }

   // Preferred constructors for default construction?
   ctors = mbd.getPreferredConstructors();
   if (ctors != null) {
      return autowireConstructor(beanName, mbd, ctors, null);
   }

   // No special handling: simply use no-arg constructor.
   return instantiateBean(beanName, mbd);
}
```

###### resolveBeanClass

- `org.springframework.beans.factory.support.AbstractBeanFactory#resolveBeanClass`
- 获取 bean 的 class

```java
@Nullable
protected Class<?> resolveBeanClass(final RootBeanDefinition mbd, String beanName, final Class<?>... typesToMatch)
      throws CannotLoadBeanClassException {

   try {
      // 是否包含 bean 类型
      if (mbd.hasBeanClass()) {
         // 直接返回
         return mbd.getBeanClass();
      }
      if (System.getSecurityManager() != null) {
         return AccessController.doPrivileged((PrivilegedExceptionAction<Class<?>>) () ->
               doResolveBeanClass(mbd, typesToMatch), getAccessControlContext());
      }
      else {
         // 从 bean definition 中获取
         return doResolveBeanClass(mbd, typesToMatch);
      }
   }
   catch (PrivilegedActionException pae) {
      ClassNotFoundException ex = (ClassNotFoundException) pae.getException();
      throw new CannotLoadBeanClassException(mbd.getResourceDescription(), beanName, mbd.getBeanClassName(), ex);
   }
   catch (ClassNotFoundException ex) {
      throw new CannotLoadBeanClassException(mbd.getResourceDescription(), beanName, mbd.getBeanClassName(), ex);
   }
   catch (LinkageError err) {
      throw new CannotLoadBeanClassException(mbd.getResourceDescription(), beanName, mbd.getBeanClassName(), err);
   }
}
```

###### doResolveBeanClass

- `org.springframework.beans.factory.support.AbstractBeanFactory#doResolveBeanClass`

- 第一段

  ```java
  ClassLoader beanClassLoader = getBeanClassLoader();
  ClassLoader dynamicLoader = beanClassLoader;
  boolean freshResolve = false;

  // 判断 typesToMatch 是否为空
  if (!ObjectUtils.isEmpty(typesToMatch)) {
     // When just doing type checks (i.e. not creating an actual instance yet),
     // use the specified temporary class loader (e.g. in a weaving scenario).
     // 获取临时类加载器
     ClassLoader tempClassLoader = getTempClassLoader();
     if (tempClassLoader != null) {
        dynamicLoader = tempClassLoader;
        freshResolve = true;
        // 类型比较
        if (tempClassLoader instanceof DecoratingClassLoader) {
           DecoratingClassLoader dcl = (DecoratingClassLoader) tempClassLoader;
           for (Class<?> typeToMatch : typesToMatch) {
              // 添加排除的类
              dcl.excludeClass(typeToMatch.getName());
           }
        }
     }
  }
  ```

- 第二段

  ```java
  if (className != null) {
     // bean 属性值
     Object evaluated = evaluateBeanDefinitionString(className, mbd);
     if (!className.equals(evaluated)) {
        // A dynamically resolved expression, supported as of 4.2...
        if (evaluated instanceof Class) {
           return (Class<?>) evaluated;
        }
        else if (evaluated instanceof String) {
           className = (String) evaluated;
           freshResolve = true;
        }
        else {
           throw new IllegalStateException("Invalid class name expression result: " + evaluated);
        }
     }
  ```

###### evaluateBeanDefinitionString

```java
@Nullable
protected Object evaluateBeanDefinitionString(@Nullable String value, @Nullable BeanDefinition beanDefinition) {
   // 占位符解析
   if (this.beanExpressionResolver == null) {
      return value;
   }

   Scope scope = null;
   if (beanDefinition != null) {
      // 获取 scope
      String scopeName = beanDefinition.getScope();
      if (scopeName != null) {
         // scope 转换成 接口值
         scope = getRegisteredScope(scopeName);
      }
   }
   // 返回对象
   return this.beanExpressionResolver.evaluate(value, new BeanExpressionContext(this, scope));
}
```

###### evaluate

- `org.springframework.context.expression.StandardBeanExpressionResolver#evaluate`

```java
	@Override
	@Nullable
	public Object evaluate(@Nullable String value, BeanExpressionContext evalContext) throws BeansException {
		if (!StringUtils.hasLength(value)) {
			return value;
		}
		try {
			Expression expr = this.expressionCache.get(value);
			if (expr == null) {
				// el表达式解析
				expr = this.expressionParser.parseExpression(value, this.beanExpressionParserContext);
				// 解析结果放入缓存
				this.expressionCache.put(value, expr);
			}
			// spring 中默认的表达式上下文
			StandardEvaluationContext sec = this.evaluationCache.get(evalContext);
			if (sec == null) {
				// 设置属性
				sec = new StandardEvaluationContext(evalContext);
				sec.addPropertyAccessor(new BeanExpressionContextAccessor());
				sec.addPropertyAccessor(new BeanFactoryAccessor());
				sec.addPropertyAccessor(new MapAccessor());
				sec.addPropertyAccessor(new EnvironmentAccessor());
				sec.setBeanResolver(new BeanFactoryResolver(evalContext.getBeanFactory()));
				sec.setTypeLocator(new StandardTypeLocator(evalContext.getBeanFactory().getBeanClassLoader()));
				ConversionService conversionService = evalContext.getBeanFactory().getConversionService();
				if (conversionService != null) {
					sec.setTypeConverter(new StandardTypeConverter(conversionService));
				}
				customizeEvaluationContext(sec);
				this.evaluationCache.put(evalContext, sec);
			}
			// 把值获取
			return expr.getValue(sec);
		}
		catch (Throwable ex) {
			throw new BeanExpressionException("Expression parsing failed", ex);
		}
	}

```

- 类图

![](../../../images/spring/TemplateAwareExpressionParser.png)

###### BeanExpressionContext

- 两个属性

```java
private final ConfigurableBeanFactory beanFactory;

@Nullable
private final Scope scope;
```

- 几个方法

```java
public boolean containsObject(String key) {
   return (this.beanFactory.containsBean(key) ||
         (this.scope != null && this.scope.resolveContextualObject(key) != null));
}

@Nullable
public Object getObject(String key) {
   if (this.beanFactory.containsBean(key)) {
      return this.beanFactory.getBean(key);
   }
   else if (this.scope != null) {
      return this.scope.resolveContextualObject(key);
   }
   else {
      return null;
   }
}
```

beanName 是否存在

根据 beanName 获取 bean 实例

- 回到解析方法

###### parseExpression

```java
@Override
public Expression parseExpression(String expressionString, @Nullable ParserContext context) throws ParseException {
   if (context != null && context.isTemplate()) {
      // 是否使用 template 解析
      return parseTemplate(expressionString, context);
   }
   else {
      // 自定义的解析规则
      return doParseExpression(expressionString, context);
   }
}
```

- doParseExpression

  - spring 中的两种解析方式
    - `org.springframework.expression.spel.standard.InternalSpelExpressionParser#doParseExpression `
    - `org.springframework.expression.spel.standard.SpelExpressionParser#doParseExpression`

- parseTemplate 方法
  - `org.springframework.expression.common.TemplateAwareExpressionParser#parseTemplate`

```java
private Expression parseTemplate(String expressionString, ParserContext context) throws ParseException {
   // 表达式为空
   if (expressionString.isEmpty()) {
      // 创建空的 LiteralExpression
      return new LiteralExpression("");
   }

   // 表达式解析成接口
   Expression[] expressions = parseExpressions(expressionString, context);
   if (expressions.length == 1) {
      return expressions[0];
   }
   else {
      // 返回字符串的表达式
      return new CompositeStringExpression(expressionString, expressions);
   }
}
```

![image-20200903111128603](../../../images/spring/image-20200903111128603.png)

- `parseExpressions`

  - `org.springframework.expression.common.TemplateAwareExpressionParser#parseExpressions`
  - 说简单一些这个地方就是拿出表达式的值

- 回到 `evaluate` 方法

```java
StandardEvaluationContext sec = this.evaluationCache.get(evalContext);
if (sec == null) {
   // 设置属性
   sec = new StandardEvaluationContext(evalContext);
   sec.addPropertyAccessor(new BeanExpressionContextAccessor());
   sec.addPropertyAccessor(new BeanFactoryAccessor());
   sec.addPropertyAccessor(new MapAccessor());
   sec.addPropertyAccessor(new EnvironmentAccessor());
   sec.setBeanResolver(new BeanFactoryResolver(evalContext.getBeanFactory()));
   sec.setTypeLocator(new StandardTypeLocator(evalContext.getBeanFactory().getBeanClassLoader()));
   ConversionService conversionService = evalContext.getBeanFactory().getConversionService();
   if (conversionService != null) {
      sec.setTypeConverter(new StandardTypeConverter(conversionService));
   }
   customizeEvaluationContext(sec);
   this.evaluationCache.put(evalContext, sec);
}
// 把值获取
return expr.getValue(sec);
```

- 最后一句 `getValue`

  - `org.springframework.expression.common.LiteralExpression#getValue(org.springframework.expression.EvaluationContext)`

    刚才流程中我们可以看到 `expr` 是`LiteralExpression`

    ```java
    @Override
    public String getValue(EvaluationContext context) {
       return this.literalValue;
    }
    ```

    直接返回字符串. 这个字符串就是刚才放进去的 el 表达式

往外跳 找到方法 `doResolveBeanClass`

```java
if (className != null) {
    // bean 属性值
    Object evaluated = evaluateBeanDefinitionString(className, mbd);
    if (!className.equals(evaluated)) {
        // A dynamically resolved expression, supported as of 4.2...
        if (evaluated instanceof Class) {
            return (Class<?>) evaluated;
        }
        else if (evaluated instanceof String) {
            className = (String) evaluated;
            freshResolve = true;
        }
        else {
            throw new IllegalStateException("Invalid class name expression result: " + evaluated);
        }
    }
    if (freshResolve) {
        // When resolving against a temporary class loader, exit early in order
        // to avoid storing the resolved Class in the bean definition.
        if (dynamicLoader != null) {
            try {
                return dynamicLoader.loadClass(className);
            }
            catch (ClassNotFoundException ex) {
                if (logger.isTraceEnabled()) {
                    logger.trace("Could not load class [" + className + "] from " + dynamicLoader + ": " + ex);
                }
            }
        }
        return ClassUtils.forName(className, dynamicLoader);
    }
}

```

- 目前为止我们解析了 第一句话 `Object evaluated = evaluateBeanDefinitionString(className, mbd);` 接下来往下走看一下具体的 class 返回对象

1. 类型等于 class 直接返回
2. 类型等于 String 的两种返回方式
   1. ClassLoader.loadClass 返回
   2. ClassUtils.forName 返回
      1. 底层方法为 `java.lang.Class#forName(java.lang.String, boolean, java.lang.ClassLoader)`

###### resolveBeanClass

- 回到`doResolveBeanClass`方法中.最后一行

  ```java
  // Resolve regularly, caching the result in the BeanDefinition...
  return mbd.resolveBeanClass(beanClassLoader);
  ```

```java
@Nullable
public Class<?> resolveBeanClass(@Nullable ClassLoader classLoader) throws ClassNotFoundException {
   // 获取beanClassName
   String className = getBeanClassName();
   if (className == null) {
      return null;
   }
   // 加载类
   Class<?> resolvedClass = ClassUtils.forName(className, classLoader);
   this.beanClass = resolvedClass;
   // 返回
   return resolvedClass;
}
```

- 获取 beanClassName

```java
@Override
@Nullable
public String getBeanClassName() {
   Object beanClassObject = this.beanClass;
   if (beanClassObject instanceof Class) {
      return ((Class<?>) beanClassObject).getName();
   }
   else {
      return (String) beanClassObject;
   }
}
```

- 回到`createBeanInstance`
  - `org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory#createBeanInstance`

```java
// 返回一个用来创建bean实例的回调接口
// Supplier get 直接获取bean对象
Supplier<?> instanceSupplier = mbd.getInstanceSupplier();
if (instanceSupplier != null) {
    return obtainFromSupplier(instanceSupplier, beanName);
}
```

###### obtainFromSupplier

```java
protected BeanWrapper obtainFromSupplier(Supplier<?> instanceSupplier, String beanName) {
   Object instance;

   // 获取当前的bean实例
   String outerBean = this.currentlyCreatedBean.get();
   // 设置当前处理的beanName
   this.currentlyCreatedBean.set(beanName);
   try {
      // 从 Supplier 中获取
      instance = instanceSupplier.get();
   }
   finally {
      if (outerBean != null) {
         // 如果 currentlyCreatedBean 取不到设置
         this.currentlyCreatedBean.set(outerBean);
      }
      else {
         // 移除
         this.currentlyCreatedBean.remove();
      }
   }

   if (instance == null) {
      // supplier 中获取不到, 将实例设置为 NullBean
      instance = new NullBean();
   }
   // beanWrapper 包装
   BeanWrapper bw = new BeanWrapperImpl(instance);
   // beanWrapper 实例化后的操作
   initBeanWrapper(bw);
   return bw;
}
```

- `Supplier` 代码如下

```java
@FunctionalInterface
public interface Supplier<T> {

    /**
     * Gets a result.
     *
     * @return a result
     */
    T get();
}
```

###### initBeanWrapper

```java
protected void initBeanWrapper(BeanWrapper bw) {
   // 设置转换服务
   bw.setConversionService(getConversionService());
   // 注册自定义属性编辑器
   registerCustomEditors(bw);
}
```

###### registerCustomEditors

```java
protected void registerCustomEditors(PropertyEditorRegistry registry) {
   PropertyEditorRegistrySupport registrySupport =
         (registry instanceof PropertyEditorRegistrySupport ? (PropertyEditorRegistrySupport) registry : null);
   if (registrySupport != null) {
      registrySupport.useConfigValueEditors();
   }
   if (!this.propertyEditorRegistrars.isEmpty()) {
      for (PropertyEditorRegistrar registrar : this.propertyEditorRegistrars) {
         try {
            // 属性编辑器,注册自定义属性编辑器
            registrar.registerCustomEditors(registry);
         }
         catch (BeanCreationException ex) {
            Throwable rootCause = ex.getMostSpecificCause();
            if (rootCause instanceof BeanCurrentlyInCreationException) {
               BeanCreationException bce = (BeanCreationException) rootCause;
               String bceBeanName = bce.getBeanName();
               if (bceBeanName != null && isCurrentlyInCreation(bceBeanName)) {
                  if (logger.isDebugEnabled()) {
                     logger.debug("PropertyEditorRegistrar [" + registrar.getClass().getName() +
                           "] failed because it tried to obtain currently created bean '" +
                           ex.getBeanName() + "': " + ex.getMessage());
                  }
                  onSuppressedException(ex);
                  continue;
               }
            }
            throw ex;
         }
      }
   }
   if (!this.customEditors.isEmpty()) {
      this.customEditors.forEach((requiredType, editorClass) ->
            registry.registerCustomEditor(requiredType, BeanUtils.instantiateClass(editorClass)));
   }
}
```

- 最后调用

  `org.springframework.beans.support.ResourceEditorRegistrar#registerCustomEditors`

###### registerCustomEditors

```java
@Override
public void registerCustomEditors(PropertyEditorRegistry registry) {
   ResourceEditor baseEditor = new ResourceEditor(this.resourceLoader, this.propertyResolver);
   doRegisterEditor(registry, Resource.class, baseEditor);
   doRegisterEditor(registry, ContextResource.class, baseEditor);
   doRegisterEditor(registry, InputStream.class, new InputStreamEditor(baseEditor));
   doRegisterEditor(registry, InputSource.class, new InputSourceEditor(baseEditor));
   doRegisterEditor(registry, File.class, new FileEditor(baseEditor));
   doRegisterEditor(registry, Path.class, new PathEditor(baseEditor));
   doRegisterEditor(registry, Reader.class, new ReaderEditor(baseEditor));
   doRegisterEditor(registry, URL.class, new URLEditor(baseEditor));

   ClassLoader classLoader = this.resourceLoader.getClassLoader();
   doRegisterEditor(registry, URI.class, new URIEditor(classLoader));
   doRegisterEditor(registry, Class.class, new ClassEditor(classLoader));
   doRegisterEditor(registry, Class[].class, new ClassArrayEditor(classLoader));

   if (this.resourceLoader instanceof ResourcePatternResolver) {
      doRegisterEditor(registry, Resource[].class,
            new ResourceArrayPropertyEditor((ResourcePatternResolver) this.resourceLoader, this.propertyResolver));
   }
}
```

###### doRegisterEditor

```java
private void doRegisterEditor(PropertyEditorRegistry registry, Class<?> requiredType, PropertyEditor editor) {
   if (registry instanceof PropertyEditorRegistrySupport) {
      // 属性编辑器覆盖默认的编辑器
      ((PropertyEditorRegistrySupport) registry).overrideDefaultEditor(requiredType, editor);
   }
   else {
      // 注册自定义的属性编辑器
      registry.registerCustomEditor(requiredType, editor);
   }
}
```

覆盖默认编辑器

```java
public void overrideDefaultEditor(Class<?> requiredType, PropertyEditor propertyEditor) {
   if (this.overriddenDefaultEditors == null) {
      this.overriddenDefaultEditors = new HashMap<>();
   }
   this.overriddenDefaultEditors.put(requiredType, propertyEditor);
}
```

- `registerCustomEditor`

```java
@Override
public void registerCustomEditor(@Nullable Class<?> requiredType, @Nullable String propertyPath, PropertyEditor propertyEditor) {
   if (requiredType == null && propertyPath == null) {
      throw new IllegalArgumentException("Either requiredType or propertyPath is required");
   }
   if (propertyPath != null) {
      if (this.customEditorsForPath == null) {
         this.customEditorsForPath = new LinkedHashMap<>(16);
      }
      this.customEditorsForPath.put(propertyPath, new CustomEditorHolder(propertyEditor, requiredType));
   }
   else {
      if (this.customEditors == null) {
         this.customEditors = new LinkedHashMap<>(16);
      }
      // 放入 customEditors map对象中
      this.customEditors.put(requiredType, propertyEditor);
      this.customEditorCache = null;
   }
}
```

到这里 `createBeanInstance` 流程已经完毕

回到`doCreateBean` 方法

```java
// beanWrapper 是否存在
if (instanceWrapper == null) {
   // 创建 bean 实例
   instanceWrapper = createBeanInstance(beanName, mbd, args);
}
// 获取 实例
final Object bean = instanceWrapper.getWrappedInstance();
// beanWrapper中存储的实例.class
Class<?> beanType = instanceWrapper.getWrappedClass();
if (beanType != NullBean.class) {
   mbd.resolvedTargetType = beanType;
}
```

紧接着两行代码 获取 bean 实例 和 beanType

###### applyMergedBeanDefinitionPostProcessors

```java
synchronized (mbd.postProcessingLock) {
   if (!mbd.postProcessed) {
      try {
         // 后置方法执行 BeanPostProcessor
         applyMergedBeanDefinitionPostProcessors(mbd, beanType, beanName);
      }
      catch (Throwable ex) {
         throw new BeanCreationException(mbd.getResourceDescription(), beanName,
               "Post-processing of merged bean definition failed", ex
         );
      }
      mbd.postProcessed = true;
   }
}
```

- `applyMergedBeanDefinitionPostProcessors` 方法会执行所有的后置方法.

```java
protected void applyMergedBeanDefinitionPostProcessors(RootBeanDefinition mbd, Class<?> beanType, String beanName) {
   for (BeanPostProcessor bp : getBeanPostProcessors()) {
      if (bp instanceof MergedBeanDefinitionPostProcessor) {
         MergedBeanDefinitionPostProcessor bdp = (MergedBeanDefinitionPostProcessor) bp;
         bdp.postProcessMergedBeanDefinition(mbd, beanType, beanName);
      }
   }
}
```

###### addSingletonFactory

- `org.springframework.beans.factory.support.DefaultSingletonBeanRegistry#addSingletonFactory`

- 继续回到 doCreateBean

```java
// Eagerly cache singletons to be able to resolve circular references
// even when triggered by lifecycle interfaces like BeanFactoryAware.
boolean earlySingletonExposure = (mbd.isSingleton() && this.allowCircularReferences &&
      isSingletonCurrentlyInCreation(beanName));

// 单例对象暴露
if (earlySingletonExposure) {
   if (logger.isTraceEnabled()) {
      logger.trace("Eagerly caching bean '" + beanName +
            "' to allow for resolving potential circular references");
   }
   addSingletonFactory(beanName, () -> getEarlyBeanReference(beanName, mbd, bean));
}
```

- `org.springframework.beans.factory.support.DefaultSingletonBeanRegistry#addSingletonFactory`

  添加单例工厂

```java
protected void addSingletonFactory(String beanName, ObjectFactory<?> singletonFactory) {
   Assert.notNull(singletonFactory, "Singleton factory must not be null");
   synchronized (this.singletonObjects) {
      if (!this.singletonObjects.containsKey(beanName)) {
         // 添加单例对象工厂
         this.singletonFactories.put(beanName, singletonFactory);
         // 删除单例BeanName
         this.earlySingletonObjects.remove(beanName);
         // 注册单例beanName
         this.registeredSingletons.add(beanName);
      }
   }
}
```

###### getEarlyBeanReference

- `org.springframework.aop.framework.autoproxy.AbstractAutoProxyCreator#getEarlyBeanReference`

```java
@Override
public Object getEarlyBeanReference(Object bean, String beanName) {
   // 尝试获取缓存
   Object cacheKey = getCacheKey(bean.getClass(), beanName);
   // 加入缓存
   this.earlyProxyReferences.put(cacheKey, bean);
   // 代理对象
   return wrapIfNecessary(bean, beanName, cacheKey);
}
```

- wrapIfNecessary

```java
protected Object wrapIfNecessary(Object bean, String beanName, Object cacheKey) {
   // 这个bean是否处理过
   if (StringUtils.hasLength(beanName) && this.targetSourcedBeans.contains(beanName)) {
      return bean;
   }
   // 这个bean是否需要代理
   if (Boolean.FALSE.equals(this.advisedBeans.get(cacheKey))) {
      return bean;
   }
   // 1.bean.class是否是Spring接口类型 2. 是否为 AutowireCapableBeanFactory 接口
   if (isInfrastructureClass(bean.getClass()) || shouldSkip(bean.getClass(), beanName)) {
      // 向代理集合中插入值
      this.advisedBeans.put(cacheKey, Boolean.FALSE);
      return bean;
   }

   // Create proxy if we have advice.
   // 增强方法获取
   Object[] specificInterceptors = getAdvicesAndAdvisorsForBean(bean.getClass(), beanName, null);
   // 增强方法不为空
   if (specificInterceptors != DO_NOT_PROXY) {
      // 向代理集合中插入值
      this.advisedBeans.put(cacheKey, Boolean.TRUE);
      // 创建代理
      Object proxy = createProxy(
            bean.getClass(), beanName, specificInterceptors, new SingletonTargetSource(bean));
      // 代理类型
      this.proxyTypes.put(cacheKey, proxy.getClass());
      return proxy;
   }

   this.advisedBeans.put(cacheKey, Boolean.FALSE);
   return bean;
}
```

- 回到下面代码中

  ```java
  if (earlySingletonExposure) {
     if (logger.isTraceEnabled()) {
        logger.trace("Eagerly caching bean '" + beanName +
              "' to allow for resolving potential circular references");
     }
     // 添加单例工厂
     addSingletonFactory(beanName, () -> getEarlyBeanReference(beanName, mbd, bean));
  }
  ```

  - 上述方法就是将结果 bean 放入

###### populateBean

```java
// Initialize the bean instance.
Object exposedObject = bean;
try {
   populateBean(beanName, mbd, instanceWrapper);
   exposedObject = initializeBean(beanName, exposedObject, mbd);
}
```

- `org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory#populateBean`
- 设置属性值

- 概述一下方法

  - 自动注入的两种实现

    1. 根据类型
    2. 根据名称

  - xml 中的属性标签设置

    ```xml
    <bean class="org.source.hot.spring.overview.ioc.bean.init.UserBean">
       <property name="age" value="30"/>
    </bean>
    ```

  ```java
  {
     if (bw == null) {
        if (mbd.hasPropertyValues()) {
           throw new BeanCreationException(
                 mbd.getResourceDescription(), beanName, "Cannot apply property values to null instance");
        }
        else {
           // Skip property population phase for null instance.
           return;
        }
     }

     // Give any InstantiationAwareBeanPostProcessors the opportunity to modify the
     // state of the bean before properties are set. This can be used, for example,
     // to support styles of field injection.
     if (!mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
        for (BeanPostProcessor bp : getBeanPostProcessors()) {
           if (bp instanceof InstantiationAwareBeanPostProcessor) {
              InstantiationAwareBeanPostProcessor ibp = (InstantiationAwareBeanPostProcessor) bp;
              if (!ibp.postProcessAfterInstantiation(bw.getWrappedInstance(), beanName)) {
                 return;
              }
           }
        }
     }

     PropertyValues pvs = (mbd.hasPropertyValues() ? mbd.getPropertyValues() : null);
     // 获取自动注入的值
     int resolvedAutowireMode = mbd.getResolvedAutowireMode();
     // 自动注入
     if (resolvedAutowireMode == AUTOWIRE_BY_NAME || resolvedAutowireMode == AUTOWIRE_BY_TYPE) {
        MutablePropertyValues newPvs = new MutablePropertyValues(pvs);
        // Add property values based on autowire by name if applicable.
        if (resolvedAutowireMode == AUTOWIRE_BY_NAME) {
           // 按照名称注入
           autowireByName(beanName, mbd, bw, newPvs);
        }
        // Add property values based on autowire by type if applicable.
        if (resolvedAutowireMode == AUTOWIRE_BY_TYPE) {
           // 按照类型注入
           autowireByType(beanName, mbd, bw, newPvs);
        }
        pvs = newPvs;
     }

     boolean hasInstAwareBpps = hasInstantiationAwareBeanPostProcessors();
     boolean needsDepCheck = (mbd.getDependencyCheck() != AbstractBeanDefinition.DEPENDENCY_CHECK_NONE);

     PropertyDescriptor[] filteredPds = null;
     if (hasInstAwareBpps) {
        if (pvs == null) {
           pvs = mbd.getPropertyValues();
        }
        for (BeanPostProcessor bp : getBeanPostProcessors()) {
           if (bp instanceof InstantiationAwareBeanPostProcessor) {
              InstantiationAwareBeanPostProcessor ibp = (InstantiationAwareBeanPostProcessor) bp;
              PropertyValues pvsToUse = ibp.postProcessProperties(pvs, bw.getWrappedInstance(), beanName);
              if (pvsToUse == null) {
                 if (filteredPds == null) {
                    filteredPds = filterPropertyDescriptorsForDependencyCheck(bw, mbd.allowCaching);
                 }
                 pvsToUse = ibp.postProcessPropertyValues(pvs, filteredPds, bw.getWrappedInstance(), beanName);
                 if (pvsToUse == null) {
                    return;
                 }
              }
              pvs = pvsToUse;
           }
        }
     }
     if (needsDepCheck) {
        if (filteredPds == null) {
           filteredPds = filterPropertyDescriptorsForDependencyCheck(bw, mbd.allowCaching);
        }
        // 以来检查
        checkDependencies(beanName, mbd, filteredPds, pvs);
     }

     if (pvs != null) {
        // 应用属性
        applyPropertyValues(beanName, mbd, bw, pvs);
     }
  }
  ```

pvs 属性如下

![image-20200903150738285](../../../images/spring/image-20200903150738285.png)

###### applyPropertyValues

- `org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory#applyPropertyValues`
- 属性设置

```java
protected void applyPropertyValues(String beanName, BeanDefinition mbd, BeanWrapper bw, PropertyValues pvs) {
   if (pvs.isEmpty()) {
      return;
   }

   if (System.getSecurityManager() != null && bw instanceof BeanWrapperImpl) {
      ((BeanWrapperImpl) bw).setSecurityContext(getAccessControlContext());
   }

   MutablePropertyValues mpvs = null;
   // 没有解析的属性
   List<PropertyValue> original;

   if (pvs instanceof MutablePropertyValues) {
      mpvs = (MutablePropertyValues) pvs;
      if (mpvs.isConverted()) {
         // Shortcut: use the pre-converted values as-is.
         try {
            bw.setPropertyValues(mpvs);
            return;
         }
         catch (BeansException ex) {
            throw new BeanCreationException(
                  mbd.getResourceDescription(), beanName, "Error setting property values", ex);
         }
      }
      original = mpvs.getPropertyValueList();
   }
   else {
      original = Arrays.asList(pvs.getPropertyValues());
   }

   // 自定义转换器
   TypeConverter converter = getCustomTypeConverter();
   if (converter == null) {
      converter = bw;
   }
   //  创建BeanDefinitionValueResolver
   BeanDefinitionValueResolver valueResolver = new BeanDefinitionValueResolver(this, beanName, mbd, converter);

   // Create a deep copy, resolving any references for values.
   // 解析后的对象集合
   List<PropertyValue> deepCopy = new ArrayList<>(original.size());
   boolean resolveNecessary = false;
   for (PropertyValue pv : original) {
      // 解析过的属性
      if (pv.isConverted()) {
         deepCopy.add(pv);
      }
      // 没有解析过的属性
      else {
         // 属性名称
         String propertyName = pv.getName();
         // 属性值,直接读取到的
         Object originalValue = pv.getValue();
         if (originalValue == AutowiredPropertyMarker.INSTANCE) {
            Method writeMethod = bw.getPropertyDescriptor(propertyName).getWriteMethod();
            if (writeMethod == null) {
               throw new IllegalArgumentException("Autowire marker for property without write method: " + pv);
            }
            originalValue = new DependencyDescriptor(new MethodParameter(writeMethod, 0), true);
         }
         // 解析值
         Object resolvedValue = valueResolver.resolveValueIfNecessary(pv, originalValue);
         Object convertedValue = resolvedValue;

         /**
          * 1. isWritableProperty: 属性可写
          * 2. isNestedOrIndexedProperty: 是否循环嵌套
          */
         boolean convertible = bw.isWritableProperty(propertyName) &&
               !PropertyAccessorUtils.isNestedOrIndexedProperty(propertyName);
         if (convertible) {
            // 转换器解析
            convertedValue = convertForProperty(resolvedValue, propertyName, bw, converter);
         }
         // Possibly store converted value in merged bean definition,
         // in order to avoid re-conversion for every created bean instance.
         if (resolvedValue == originalValue) {
            if (convertible) {
               pv.setConvertedValue(convertedValue);
            }
            deepCopy.add(pv);
         }
         // 类型解析
         else if (convertible && originalValue instanceof TypedStringValue &&
               !((TypedStringValue) originalValue).isDynamic() &&
               !(convertedValue instanceof Collection || ObjectUtils.isArray(convertedValue))) {
            pv.setConvertedValue(convertedValue);
            deepCopy.add(pv);
         }
         else {
            resolveNecessary = true;
            deepCopy.add(new PropertyValue(pv, convertedValue));
         }
      }
   }
   if (mpvs != null && !resolveNecessary) {
      mpvs.setConverted();
   }

   // Set our (possibly massaged) deep copy.
   try {
      bw.setPropertyValues(new MutablePropertyValues(deepCopy));
   }
   catch (BeansException ex) {
      throw new BeanCreationException(
            mbd.getResourceDescription(), beanName, "Error setting property values", ex);
   }
}
```

属性设置后跳出方法回到 `doCreateBean`

```java
try {
   populateBean(beanName, mbd, instanceWrapper);
   exposedObject = initializeBean(beanName, exposedObject, mbd);
}
```

![image-20200903150930186](../../../images/spring/image-20200903150930186.png)

###### initializeBean

- `org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory#initializeBean(java.lang.String, java.lang.Object, org.springframework.beans.factory.support.RootBeanDefinition)`

- 我们可以看一下整个代码的流程
  1. aware 接口的执行
  2. BeanPostProcessor 前置方法执行
  3. bean 实例化
  4. BeanPostProcessor 后置方法执行
  5. 返回 bean

```java
protected Object initializeBean(final String beanName, final Object bean, @Nullable RootBeanDefinition mbd) {
   if (System.getSecurityManager() != null) {
      AccessController.doPrivileged((PrivilegedAction<Object>) () -> {
         invokeAwareMethods(beanName, bean);
         return null;
      }, getAccessControlContext());
   }
   else {
      // aware 接口执行
      invokeAwareMethods(beanName, bean);
   }

   Object wrappedBean = bean;
   if (mbd == null || !mbd.isSynthetic()) {
      // BeanPostProcessor 前置方法执行
      wrappedBean = applyBeanPostProcessorsBeforeInitialization(wrappedBean, beanName);
   }

   try {
      // 执行实例化函数
      invokeInitMethods(beanName, wrappedBean, mbd);
   }
   catch (Throwable ex) {
      throw new BeanCreationException(
            (mbd != null ? mbd.getResourceDescription() : null),
            beanName, "Invocation of init method failed", ex
      );
   }
   if (mbd == null || !mbd.isSynthetic()) {
      // BeanPostProcessor 后置方法执行
      wrappedBean = applyBeanPostProcessorsAfterInitialization(wrappedBean, beanName);
   }

   return wrappedBean;
}
```

- Aware 接口的执行

```java
private void invokeAwareMethods(final String beanName, final Object bean) {
   if (bean instanceof Aware) {
      if (bean instanceof BeanNameAware) {
         ((BeanNameAware) bean).setBeanName(beanName);
      }
      if (bean instanceof BeanClassLoaderAware) {
         ClassLoader bcl = getBeanClassLoader();
         if (bcl != null) {
            ((BeanClassLoaderAware) bean).setBeanClassLoader(bcl);
         }
      }
      if (bean instanceof BeanFactoryAware) {
         ((BeanFactoryAware) bean).setBeanFactory(AbstractAutowireCapableBeanFactory.this);
      }
   }
}j
```

- 前置方法执行

  ```java
  @Override
  public Object applyBeanPostProcessorsBeforeInitialization(Object existingBean, String beanName)
        throws BeansException {

     Object result = existingBean;
     for (BeanPostProcessor processor : getBeanPostProcessors()) {
        Object current = processor.postProcessBeforeInitialization(result, beanName);
        if (current == null) {
           return result;
        }
        result = current;
     }
     return result;
  }
  ```

- 后置方法执行

  ```java
  @Override
  public Object applyBeanPostProcessorsAfterInitialization(Object existingBean, String beanName)
        throws BeansException {

     Object result = existingBean;
     for (BeanPostProcessor processor : getBeanPostProcessors()) {
        // 执行 spring 容器中 BeanPostProcessor
        Object current = processor.postProcessAfterInitialization(result, beanName);
        if (current == null) {
           return result;
        }
        result = current;
     }
     return result;
  }
  ```

###### invokeInitMethods

- `org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory#invokeInitMethods`
- 初始化方法重点看一下

```java
protected void invokeInitMethods(String beanName, final Object bean, @Nullable RootBeanDefinition mbd)
      throws Throwable {


   // 是否是 InitializingBean
   boolean isInitializingBean = (bean instanceof InitializingBean);
   // 是否存在方法 "afterPropertiesSet"
   if (isInitializingBean && (mbd == null || !mbd.isExternallyManagedInitMethod("afterPropertiesSet"))) {
      if (logger.isTraceEnabled()) {
         logger.trace("Invoking afterPropertiesSet() on bean with name '" + beanName + "'");
      }
      if (System.getSecurityManager() != null) {
         try {
            // 执行 afterPropertiesSet
            AccessController.doPrivileged((PrivilegedExceptionAction<Object>) () -> {
               ((InitializingBean) bean).afterPropertiesSet();
               return null;
            }, getAccessControlContext());
         }
         catch (PrivilegedActionException pae) {
            throw pae.getException();
         }
      }
      else {
         ((InitializingBean) bean).afterPropertiesSet();
      }
   }

   if (mbd != null && bean.getClass() != NullBean.class) {
      String initMethodName = mbd.getInitMethodName();
      if (StringUtils.hasLength(initMethodName) &&
            !(isInitializingBean && "afterPropertiesSet".equals(initMethodName)) &&
            !mbd.isExternallyManagedInitMethod(initMethodName)) {
         // 自定义的 init method
         invokeCustomInitMethod(beanName, bean, mbd);
      }
   }
}
```

![image-20200903153057321](../../../images/spring/image-20200903153057321.png)

我们现在的 bean 不是`InitializingBean` 会走自定义的`init-mthod`方法

- 做一下改造实体对象

  ```java
  public void initMethod() {
     this.name = "abc";
     this.age = 10;
  }
  ```

```xml
<bean class="org.source.hot.spring.overview.ioc.bean.init.UserBean"
     init-method="initMethod">
   <property name="age" value="30"/>
</bean>
```

- 观察 `initMethodName` 会变成 标签属性`init-method` 的内容. 接下来就是通过反射执行方法

![image-20200903153432559](../../../images/spring/image-20200903153432559.png)

- 在执行方法前将 bean 的信息先做一次截图

  ![image-20200903153533141](../../../images/spring/image-20200903153533141.png)

- 如果按照我们代码中的编写方式 bean 的属性会被覆盖

  ![image-20200903153617353](../../../images/spring/image-20200903153617353.png)

###### invokeCustomInitMethod

- `org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory#invokeCustomInitMethod`
- 执行 自定义的`init-method` 方法

```java
protected void invokeCustomInitMethod(String beanName, final Object bean, RootBeanDefinition mbd)
      throws Throwable {

   // 获取 initMethod 名称
   String initMethodName = mbd.getInitMethodName();
   Assert.state(initMethodName != null, "No init method set");
   // 反射获取方法
   Method initMethod = (mbd.isNonPublicAccessAllowed() ?
         BeanUtils.findMethod(bean.getClass(), initMethodName) :
         ClassUtils.getMethodIfAvailable(bean.getClass(), initMethodName));

   // 方法是否存在判断
   if (initMethod == null) {
      if (mbd.isEnforceInitMethod()) {
         throw new BeanDefinitionValidationException("Could not find an init method named '" +
               initMethodName + "' on bean with name '" + beanName + "'");
      }
      else {
         if (logger.isTraceEnabled()) {
            logger.trace("No default init method named '" + initMethodName +
                  "' found on bean with name '" + beanName + "'");
         }
         // Ignore non-existent default lifecycle methods.
         return;
      }
   }

   if (logger.isTraceEnabled()) {
      logger.trace("Invoking init method  '" + initMethodName + "' on bean with name '" + beanName + "'");
   }
   // 尝试获取接口方法
   Method methodToInvoke = ClassUtils.getInterfaceMethodIfPossible(initMethod);

   if (System.getSecurityManager() != null) {
      AccessController.doPrivileged((PrivilegedAction<Object>) () -> {
         ReflectionUtils.makeAccessible(methodToInvoke);
         return null;
      });
      try {
         // 反射调用
         AccessController.doPrivileged((PrivilegedExceptionAction<Object>) () ->
               methodToInvoke.invoke(bean), getAccessControlContext());
      }
      catch (PrivilegedActionException pae) {
         InvocationTargetException ex = (InvocationTargetException) pae.getException();
         throw ex.getTargetException();
      }
   }
   else {
      try {
         // 反射调用
         ReflectionUtils.makeAccessible(methodToInvoke);
         methodToInvoke.invoke(bean);
      }
      catch (InvocationTargetException ex) {
         throw ex.getTargetException();
      }
   }
}
```

###### getInterfaceMethodIfPossible

- `org.springframework.util.ClassUtils#getInterfaceMethodIfPossible`

```java
public static Method getInterfaceMethodIfPossible(Method method) {
   // 是不是 public
   // 是不是 接口
   if (!Modifier.isPublic(method.getModifiers()) || method.getDeclaringClass().isInterface()) {
      return method;
   }
   // 放入init-method 缓存
   return interfaceMethodCache.computeIfAbsent(method, key -> {
      Class<?> current = key.getDeclaringClass();
      while (current != null && current != Object.class) {
         // 当前类的 接口列表
         Class<?>[] ifcs = current.getInterfaces();
         for (Class<?> ifc : ifcs) {
            try {
               // 从接口中获取方法
               return ifc.getMethod(key.getName(), key.getParameterTypes());
            }
            catch (NoSuchMethodException ex) {
               // ignore
            }
         }
         current = current.getSuperclass();
      }
      return key;
   });
}
```

- 跳出这个方法`initializeBean` 回到下面代码

  ```java
  try {
     populateBean(beanName, mbd, instanceWrapper);
     exposedObject = initializeBean(beanName, exposedObject, mbd);
  }
  ```

  - `org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory#doCreateBean`

    其实到此 bean 已经创建完成可以直接返回了.

- 再往外层跳

  `org.springframework.beans.factory.support.AbstractBeanFactory#doGetBean`

  ```javascript
  if (mbd.isSingleton()) {
     // 判断是否是单例
     sharedInstance = getSingleton(beanName, () -> {
        try {
           return createBean(beanName, mbd, args);
        }
        catch (BeansException ex) {
           // Explicitly remove instance from singleton cache: It might have been put there
           // eagerly by the creation process, to allow for circular reference resolution.
           // Also remove any beans that received a temporary reference to the bean.
           destroySingleton(beanName);
           throw ex;
        }
     });
     bean = getObjectForBeanInstance(sharedInstance, name, beanName, mbd);
  }
  ```

  - 单例对象的创建 bean 已经完成啦...

- 其他的两种创建，其本质还是 `createBean` 方法的调用.

```java
// 原型模式创建
else if (mbd.isPrototype()) {
   // It's a prototype -> create a new instance.
   Object prototypeInstance = null;
   try {
      beforePrototypeCreation(beanName);
      prototypeInstance = createBean(beanName, mbd, args);
   }
   finally {
      afterPrototypeCreation(beanName);
   }
   bean = getObjectForBeanInstance(prototypeInstance, name, beanName, mbd);
}

else {
   String scopeName = mbd.getScope();
   final Scope scope = this.scopes.get(scopeName);
   if (scope == null) {
      throw new IllegalStateException("No Scope registered for scope name '" + scopeName + "'");
   }
   try {
      Object scopedInstance = scope.get(beanName, () -> {
         beforePrototypeCreation(beanName);
         try {
            return createBean(beanName, mbd, args);
         }
         finally {
            afterPrototypeCreation(beanName);
         }
      });
      bean = getObjectForBeanInstance(scopedInstance, name, beanName, mbd);
   }
   catch (IllegalStateException ex) {
      throw new BeanCreationException(beanName,
            "Scope '" + scopeName + "' is not active for the current thread; consider " +
                  "defining a scoped proxy for this bean if you intend to refer to it from a singleton",
            ex);
   }
}
```

- 再往外面跳一层 回到 getBean 方法.

- 终于 getBean 方法底层调用分析结束.
