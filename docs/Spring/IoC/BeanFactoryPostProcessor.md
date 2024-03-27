# BeanFactoryPostProcessor 源码分析

BeanFactoryPostProcessor 是当 BeanDefinition 读取完元数据（也就是从任意资源中定义的 bean 数据）后还未实例化之前可以进行修改

抄录并翻译官方的语句

> `BeanFactoryPostProcessor` 操作 bean 的元数据配置. 也就是说,Spring IoC 容器允许 `BeanFactoryPostProcessor` 读取配置元数据, 并可能在容器实例化除 `BeanFactoryPostProcessor` 实例之外的任何 bean _之前_ 更改它

tip:

> 在 `BeanFactoryPostProcessor` (例如使用 `BeanFactory.getBean()`) 中使用这些 bean 的实例虽然在技术上是可行的,但这么来做会将 bean 过早实例化, 这违反了标准的容器生命周期. 同时也会引发一些副作用,例如绕过 bean 的后置处理。

```java
public interface BeanFactoryPostProcessor {

	/**
	 *通过ConfigurableListableBeanFactory这个可配置的BeanFactory对我们的bean原数据进行修改
	 */
	void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException;

}
```

## BeanFactoryPostProcessor 执行时期的探究

ApplicationContext 的 refresh() 中的 invokeBeanFactoryPostProcessors 方法就开始创建我们的 BFPP(BeanFactoryPostProcessor)了

具体执行方法 invokeBeanFactoryPostProcessors，虽然一百多行代码，其实只需要特别了解的地方就几处。

```java
public static void invokeBeanFactoryPostProcessors(
			ConfigurableListableBeanFactory beanFactory, List<BeanFactoryPostProcessor> beanFactoryPostProcessors) {

    Set<String> processedBeans = new HashSet<>();

    // 由于我们的beanFactory是DefaultListableBeanFactory实例是BeanDefinitionRegistry的子类所以可以进来
    if (beanFactory instanceof BeanDefinitionRegistry) {
        BeanDefinitionRegistry registry = (BeanDefinitionRegistry) beanFactory;
        List<BeanFactoryPostProcessor> regularPostProcessors = new ArrayList<>();
        List<BeanDefinitionRegistryPostProcessor> registryProcessors = new ArrayList<>();

        for (BeanFactoryPostProcessor postProcessor : beanFactoryPostProcessors) {
            if (postProcessor instanceof BeanDefinitionRegistryPostProcessor) {
                BeanDefinitionRegistryPostProcessor registryProcessor =
                    (BeanDefinitionRegistryPostProcessor) postProcessor;
                registryProcessor.postProcessBeanDefinitionRegistry(registry);
                registryProcessors.add(registryProcessor);
            }
            else {
                regularPostProcessors.add(postProcessor);
            }
        }
        // BeanDefinitionRegistryPostProcessor是BFPP的子类但是比BFPP提前执行
        // 顺序实现PriorityOrdered接口先被执行，然后是Ordered接口，最后是什么都没实现的BeanDefinitionRegistryPostProcessor

        /**
              *都有beanFactory.getBean方法，证明BeanDefinitionRegistryPostProcessor这个bean现在已经被创建了
              */

        List<BeanDefinitionRegistryPostProcessor> currentRegistryProcessors = new ArrayList<>();

        String[] postProcessorNames =
            beanFactory.getBeanNamesForType(BeanDefinitionRegistryPostProcessor.class, true, false);
        for (String ppName : postProcessorNames) {
            if (beanFactory.isTypeMatch(ppName, PriorityOrdered.class)) {
                currentRegistryProcessors.add(beanFactory.getBean(ppName, BeanDefinitionRegistryPostProcessor.class));
                processedBeans.add(ppName);
            }
        }
        sortPostProcessors(currentRegistryProcessors, beanFactory);
        registryProcessors.addAll(currentRegistryProcessors);
        invokeBeanDefinitionRegistryPostProcessors(currentRegistryProcessors, registry, beanFactory.getApplicationStartup());
        currentRegistryProcessors.clear();

        postProcessorNames = beanFactory.getBeanNamesForType(BeanDefinitionRegistryPostProcessor.class, true, false);
        for (String ppName : postProcessorNames) {
            if (!processedBeans.contains(ppName) && beanFactory.isTypeMatch(ppName, Ordered.class)) {
                currentRegistryProcessors.add(beanFactory.getBean(ppName, BeanDefinitionRegistryPostProcessor.class));
                processedBeans.add(ppName);
            }
        }
        sortPostProcessors(currentRegistryProcessors, beanFactory);
        registryProcessors.addAll(currentRegistryProcessors);
        invokeBeanDefinitionRegistryPostProcessors(currentRegistryProcessors, registry, beanFactory.getApplicationStartup());
        currentRegistryProcessors.clear();

        boolean reiterate = true;
        while (reiterate) {
            reiterate = false;
            postProcessorNames = beanFactory.getBeanNamesForType(BeanDefinitionRegistryPostProcessor.class, true, false);
            for (String ppName : postProcessorNames) {
                if (!processedBeans.contains(ppName)) {
                    currentRegistryProcessors.add(beanFactory.getBean(ppName, BeanDefinitionRegistryPostProcessor.class));
                    processedBeans.add(ppName);
                    reiterate = true;
                }
            }
            sortPostProcessors(currentRegistryProcessors, beanFactory);
            registryProcessors.addAll(currentRegistryProcessors);
            invokeBeanDefinitionRegistryPostProcessors(currentRegistryProcessors, registry, beanFactory.getApplicationStartup());
            currentRegistryProcessors.clear();
        }

        invokeBeanFactoryPostProcessors(registryProcessors, beanFactory);
        invokeBeanFactoryPostProcessors(regularPostProcessors, beanFactory);
    }

    else {
        invokeBeanFactoryPostProcessors(beanFactoryPostProcessors, beanFactory);
    }
    // BFPP的执行顺序与上一样
    /**
        *都有beanFactory.getBean方法，证明BFPP这个bean现在已经被创建了
        */
    String[] postProcessorNames =
        beanFactory.getBeanNamesForType(BeanFactoryPostProcessor.class, true, false);


    List<BeanFactoryPostProcessor> priorityOrderedPostProcessors = new ArrayList<>();
    List<String> orderedPostProcessorNames = new ArrayList<>();
    List<String> nonOrderedPostProcessorNames = new ArrayList<>();
    for (String ppName : postProcessorNames) {
        if (processedBeans.contains(ppName)) {

        }
        else if (beanFactory.isTypeMatch(ppName, PriorityOrdered.class)) {
            priorityOrderedPostProcessors.add(beanFactory.getBean(ppName, BeanFactoryPostProcessor.class));
        }
        else if (beanFactory.isTypeMatch(ppName, Ordered.class)) {
            orderedPostProcessorNames.add(ppName);
        }
        else {
            nonOrderedPostProcessorNames.add(ppName);
        }
    }


    sortPostProcessors(priorityOrderedPostProcessors, beanFactory);
    invokeBeanFactoryPostProcessors(priorityOrderedPostProcessors, beanFactory);


    List<BeanFactoryPostProcessor> orderedPostProcessors = new ArrayList<>(orderedPostProcessorNames.size());
    for (String postProcessorName : orderedPostProcessorNames) {
        orderedPostProcessors.add(beanFactory.getBean(postProcessorName, BeanFactoryPostProcessor.class));
    }
    sortPostProcessors(orderedPostProcessors, beanFactory);
    invokeBeanFactoryPostProcessors(orderedPostProcessors, beanFactory);


    List<BeanFactoryPostProcessor> nonOrderedPostProcessors = new ArrayList<>(nonOrderedPostProcessorNames.size());
    for (String postProcessorName : nonOrderedPostProcessorNames) {
        nonOrderedPostProcessors.add(beanFactory.getBean(postProcessorName, BeanFactoryPostProcessor.class));
    }
    invokeBeanFactoryPostProcessors(nonOrderedPostProcessors, beanFactory);


    beanFactory.clearMetadataCache();
}
```

我们可以具体分析一下 BeanFactoryPostProcessor 的子类 CustomEditorConfigurer 自定义属性编辑器来巩固一下执行流程

所谓属性编辑器是当你要自定义更改配置文件中的属性属性时，如 String 类型转为 Date 或者其他，下面的一个小例子展示如何 String 类型的属性怎么转化为 Address 属性

## 简单工程（Spring-version-5.3.18)

Person 类

```java
package cn.demo1;

import lombok.Getter;
import lombok.Setter;

@Setter
@Getter
@ToString
public class Person {
    private String name;
    private Address address;
}
```

Address 类

```java
package cn.demo1;

@Setter
@Getter
@ToString
public class Address {
    private String city;
    private String town;
}

```

AddressParse 类

```java
package cn.demo1;

import java.beans.PropertyEditorSupport;

public class AddressParse extends PropertyEditorSupport {
    @Override
    public void setAsText(String text) throws IllegalArgumentException {
        final String[] vals = text.split(",");
        Address addr = new Address();
        addr.setProvince(vals[0]);
        addr.setCity(vals[1]);
        setValue(addr);
    }
}
```

MyCustomEditor 类

```java
package cn.demo1;

import org.springframework.beans.PropertyEditorRegistrar;
import org.springframework.beans.PropertyEditorRegistry;


public class MyCustomEditor implements PropertyEditorRegistrar {
    @Override
    public void registerCustomEditors(PropertyEditorRegistry registry) {
        registry.registerCustomEditor(Address.class, new AddressParse());
    }
}
```

配置文件 test1.xml

```java
<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns="http://www.springframework.org/schema/beans"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xsi:schemaLocation="http://www.springframework.org/schema/beans http://www.springframework.org/schema/beans/spring-beans.xsd http://www.springframework.org/schema/aop https://www.springframework.org/schema/aop/spring-aop.xsd http://www.springframework.org/schema/context https://www.springframework.org/schema/context/spring-context.xsd">

    <!--    待属性编辑的bean，value代表的就是string类型-->
    <bean class="cn.demo1.Person" id="person">
        <property name="name" value="李华"/>
        <property name="address" value="四川,成都"/>
    </bean>

    <!--    注册属性编辑器-->
    <bean class="org.springframework.beans.factory.config.CustomEditorConfigurer" id="configurer">
        <property name="propertyEditorRegistrars">
            <list>
                <bean class="cn.demo1.MyCustomEditor"/>
            </list>
        </property>
    </bean>
</beans>
```

测试类 EdT

```java
package cn.test1;

import cn.demo1.Person;
import org.junit.Test;
import org.springframework.context.ApplicationContext;
import org.springframework.context.support.ClassPathXmlApplicationContext;

public class EdT {
    @Test
    public void test1() {
        ApplicationContext context = new ClassPathXmlApplicationContext("test1.xml");
        final Person bean = context.getBean(Person.class);
        System.out.println(bean);
    }
}

=====================测试结果

Person(name=李华, address=Address(province=四川, city=成都))
```

可以看见我们成功的将 String 类型转化为 Address 类型，让我们来看看实现流程，

- 首先实现 PropertyEditorSupport 来自定义属性编辑规则
- 其次将你的编辑规则给到 PropertyEditorRegistrar 子类里进行注册
- 最后在 Spring 中配置 CustomEditorConfigurer 类然后注入你的 PropertyEditorRegistrar 注册器

让我们 debug 走一遍

如果你已经耐心看完上面的`BeanFactoryPostProcessor执行时期的探究`那么你应该可以知道接下来我们的步骤应该是进入 invokeBeanFactoryPostProcessors 这个方法里了

```java
private static void invokeBeanFactoryPostProcessors(
			Collection<? extends BeanFactoryPostProcessor> postProcessors, ConfigurableListableBeanFactory beanFactory) {

		for (BeanFactoryPostProcessor postProcessor : postProcessors) {
			StartupStep postProcessBeanFactory = beanFactory.getApplicationStartup().start("spring.context.bean-factory.post-process")
					.tag("postProcessor", postProcessor::toString);
			postProcessor.postProcessBeanFactory(beanFactory);
			postProcessBeanFactory.end();
		}
	}
```

很明显它执行 postProcessBeanFactory 这个方法

我们探究的 BFPP 正是 CustomEditorConfigurer，所以这个是 CustomEditorConfigurer 对 BFPP 的 postProcessBeanFactory 实现

```java
// 必然有个set方法让我们进行注入
public void setPropertyEditorRegistrars(PropertyEditorRegistrar[] propertyEditorRegistrars) {
    this.propertyEditorRegistrars = propertyEditorRegistrars;
}

@Override
public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
    if (this.propertyEditorRegistrars != null) {
        for (PropertyEditorRegistrar propertyEditorRegistrar : this.propertyEditorRegistrars) {
            // 把它加入Bean工厂里后面可以进行调用
	private final Set<PropertyEditorRegistrar> propertyEditorRegistrars = new LinkedHashSet<>(4);
            beanFactory.addPropertyEditorRegistrar(propertyEditorRegistrar);
        }
    }
    if (this.customEditors != null) {
        this.customEditors.forEach(beanFactory::registerCustomEditor);
    }
}
```

关于这个注册器使用要到后面填充属性的时候才会用到，

> 我其实觉得这个有点瑕疵，因为 BFPP 作用影响应该是当 Spring 还未创建 bean 的时候，可以用 BFPP 进行修改操作，可是这个属性编辑却影响了 bean 创建过后的修改操作，那么它就替代了 BPP（BeanPostProcessor)的作用发挥了。（以上仅仅代表个人的观点，有可能是我想错了）

当我们 debug 到 AbstractAutowireCapableBeanFactory 的 populateBean 这个方法填充 bean 的属性的时候，

让我们看看它的方法，其中我省略了大部分无关代码

```java
protected void populateBean(String beanName, RootBeanDefinition mbd, @Nullable BeanWrapper bw) {
    // 这个是如果你配置的bean中有属性值的话
    // 也就是如下的配置，那么pvs不会为空的
    /**
    <bean class="cn.demo1.Person" id="person">
        <property name="name" value="李华"/>
        <property name="address" value="四川,成都"/>
    </bean>
    */
    PropertyValues pvs = (mbd.hasPropertyValues() ? mbd.getPropertyValues() : null);

    if (pvs != null) {
        // 属性操作
        applyPropertyValues(beanName, mbd, bw, pvs);
    }
}
```

让我们继续看看 applyPropertyValues 这个方法，无关的代码我也给省略了

```java
protected void applyPropertyValues(String beanName, BeanDefinition mbd, BeanWrapper bw, PropertyValues pvs) {
    // PropertyValues接口的默认实现。允许对属性进行简单操作，并提供构造函数以支持从 Map 进行深度复制和构造。
    MutablePropertyValues mpvs = null;
    List<PropertyValue> original;
    // 可以进去
    if (pvs instanceof MutablePropertyValues) {
        mpvs = (MutablePropertyValues) pvs;
    // 默认为false，即我们需要类型转换
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
      // 把bean的属性以列表的形式展示出来
        original = mpvs.getPropertyValueList();
    }
    else {
        original = Arrays.asList(pvs.getPropertyValues());
    }
    // 默认为空
    TypeConverter converter = getCustomTypeConverter();
    if (converter == null) {
        converter = bw;
    }
    // 就一个组合类，帮助更好的bean的属性的解析
    BeanDefinitionValueResolver valueResolver = new BeanDefinitionValueResolver(this, beanName, mbd, converter);

    // 深拷贝
    List<PropertyValue> deepCopy = new ArrayList<>(original.size());
    boolean resolveNecessary = false;
    for (PropertyValue pv : original) {
        if (pv.isConverted()) {
            deepCopy.add(pv);
        }
        else {
            // 获取bean的属性名字
            String propertyName = pv.getName();
            //获取bean属性值的包装对象
            Object originalValue = pv.getValue();
            // 自动装配的事情
            if (originalValue == AutowiredPropertyMarker.INSTANCE) {
                Method writeMethod = bw.getPropertyDescriptor(propertyName).getWriteMethod();
                if (writeMethod == null) {
                    throw new IllegalArgumentException("Autowire marker for property without write method: " + pv);
                }
                originalValue = new DependencyDescriptor(new MethodParameter(writeMethod, 0), true);
            }
            // 把bean的属性值从包装类中分离出来
            Object resolvedValue = valueResolver.resolveValueIfNecessary(pv, originalValue);
            Object convertedValue = resolvedValue;
            // 一般为true
            boolean convertible = bw.isWritableProperty(propertyName) &&
                !PropertyAccessorUtils.isNestedOrIndexedProperty(propertyName);
            if (convertible) {
                // 这个就是重点，对应我们的属性转化
                convertedValue = convertForProperty(resolvedValue, propertyName, bw, converter);
            }
}
```

继续追踪

```java
@Nullable
private Object convertForProperty(
    @Nullable Object value, String propertyName, BeanWrapper bw, TypeConverter converter) {
    // BeanWrapperImpl是继承TypeConverter的
    if (converter instanceof BeanWrapperImpl) {
        // 所以执行下面的方法
        return ((BeanWrapperImpl) converter).convertForProperty(value, propertyName);
    }
    else {
        PropertyDescriptor pd = bw.getPropertyDescriptor(propertyName);
        MethodParameter methodParam = BeanUtils.getWriteMethodParameter(pd);
        return converter.convertIfNecessary(value, pd.getPropertyType(), methodParam);
    }
}
```

```java
@Nullable
public Object convertForProperty(@Nullable Object value, String propertyName) throws TypeMismatchException {
    CachedIntrospectionResults cachedIntrospectionResults = getCachedIntrospectionResults();
    PropertyDescriptor pd = cachedIntrospectionResults.getPropertyDescriptor(propertyName);
    if (pd == null) {
        throw new InvalidPropertyException(getRootClass(), getNestedPath() + propertyName,
                                           "No property '" + propertyName + "' found");
    }
    TypeDescriptor td = cachedIntrospectionResults.getTypeDescriptor(pd);
    if (td == null) {
        td = cachedIntrospectionResults.addTypeDescriptor(pd, new TypeDescriptor(property(pd)));
    }
    // 上面的工作不用管，全是一些前戏工作，这个才是主题，至此我们的流程就到这里结束吧
    // 后面的流程太多了，大部分都是处理细节，你只需要知道大概的脉络就行，就是最终它肯定会
    // 走到AddressParse这个核心处理
    return convertForProperty(propertyName, null, value, td);
}
```

你可以自己可以尝试 debug 一下，看别人实践真的不如自己动手实践一下，Spring 的包装类实属太多，但是可以抓住核心流程进行 debug。
