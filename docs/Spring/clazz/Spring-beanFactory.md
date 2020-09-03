# Spring BeanFactory 
- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)

## BeanFactory 概述
- `org.springframework.beans.factory.BeanFactory`

### 类图

![beanFactory](/images/spring/BeanFactory.png)



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

- 获取beanFactory

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

  

![image-20200902102912716](images/image-20200902102912716.png)

- 整体类图

![image-20200902103154580](images/image-20200902103154580.png)





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

![image-20200902105454958](images/image-20200902105454958.png)



alias标签的alias值作为别名的key ， alias 标签的 name 值作为 value





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

    ```JAVA
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

```JAVA
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
  - 从 容器中获取，最后还是回到doGetBean方法中. 来进行bean创建 这里不进行展开。

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

- 方法作用将bean标记为已创建



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

- 属性值 已创建的beanName

  ```java
  private final Set<String> alreadyCreated = Collections.newSetFromMap(new ConcurrentHashMap<>(256));
  ```







#### getMergedLocalBeanDefinition

- `org.springframework.beans.factory.support.AbstractBeanFactory#getMergedLocalBeanDefinition`

- 这个方法获取一个`RootBeanDefinition`对象 ， 这个对象也是bean的一种定义。
- 从目前的几个方法名称来看，暂且认为这是一个合并了多个 `BeanDefinition`的对象吧

![rootBeanDefinition](/images/spring/RootBeanDefinition.png)





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