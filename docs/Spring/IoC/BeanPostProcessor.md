# BeanPostProcessor 源码分析

BeanPostProcessor 接口也叫 Bean 后置处理器，作用是在 Bean 对象实例化和依赖注入完成后，在配置文件 bean 的 init-method(初始化方法)或者 InitializingBean 的 afterPropertiesSet 的前后添加我们自己的处理逻辑。注意是 Bean 实例化完毕后及依赖注入完成后触发的，接口的源码如下。

```java
public interface BeanPostProcessor {
    /**
     * 实例化、依赖注入完毕，
     * 在调用显示的初始化之前完成一些定制的初始化任务
     */
    Object postProcessBeforeInitialization(Object bean, String beanName) throws BeansException;

    /**
     * 实例化、依赖注入、初始化完毕时执行
     */
    Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException;
}
```

共有两种方式实现：

- 实现 BeanPostProcessor 接口，然后将此类注册到 Spring 即可；
- 第二种是通过`ConfigurableBeanFactory` 的 addBeanPostProcessor 方法进行注册。

BeanPostProcess 可以有多个，并且可以通过设置 order 属性来控制这些 BeanPostProcessor 实例的执行顺序。 仅当 BeanPostProcessor 实现 Ordered 接口时,才能设置此属性，或者 PriorityOrdered 接口。

如果某个类实现了 BeanPostProcessor 则它会在 AbstractApplicationContext 中的 registerBeanPostProcessors(beanFactory)方法中创建 bean 而不是和普通的 bean 一样在 finishBeanFactoryInitialization(beanFactory)中才被创建。

当我们注册 BeanPostProcessor 的时候，其中我省略了大部分无关代码：

```java
public static void registerBeanPostProcessors(
			ConfigurableListableBeanFactory beanFactory, AbstractApplicationContext applicationContext) {
    // 找到实现BeanPostProcessor接口的子类bean名称
    String[] postProcessorNames = beanFactory.getBeanNamesForType(BeanPostProcessor.class, true, false);
    // 加一是因为下一行又加了一个BPP(BeanPostProcessor)
    int beanProcessorTargetCount = beanFactory.getBeanPostProcessorCount() + 1 + postProcessorNames.length;
    beanFactory.addBeanPostProcessor(new BeanPostProcessorChecker(beanFactory, beanProcessorTargetCount));

    // 排序省略，没啥好讲的，你只需要知道没有实现排序接口的BPP放在了nonOrderedPostProcessorNames这里
    List<BeanPostProcessor> priorityOrderedPostProcessors = new ArrayList<>();
    List<BeanPostProcessor> internalPostProcessors = new ArrayList<>();
    List<String> orderedPostProcessorNames = new ArrayList<>();
    List<String> nonOrderedPostProcessorNames = new ArrayList<>();
    for (String ppName : postProcessorNames) {
        if (beanFactory.isTypeMatch(ppName, PriorityOrdered.class)) {
            BeanPostProcessor pp = beanFactory.getBean(ppName, BeanPostProcessor.class);
            priorityOrderedPostProcessors.add(pp);
            if (pp instanceof MergedBeanDefinitionPostProcessor) {
                internalPostProcessors.add(pp);
            }
        }
        else if (beanFactory.isTypeMatch(ppName, Ordered.class)) {
            orderedPostProcessorNames.add(ppName);
        }
        else {
            nonOrderedPostProcessorNames.add(ppName);
        }
    }

    // 中间省略了一些....

    // 重点来了
    List<BeanPostProcessor> nonOrderedPostProcessors = new ArrayList<>(nonOrderedPostProcessorNames.size());
    for (String ppName : nonOrderedPostProcessorNames) {
        // 当它getBean的时候我们的BPP就开始创建
        BeanPostProcessor pp = beanFactory.getBean(ppName, BeanPostProcessor.class);
        nonOrderedPostProcessors.add(pp);
        if (pp instanceof MergedBeanDefinitionPostProcessor) {
    	    internalPostProcessors.add(pp);
        }
    }
}
```

在此我举例一个典型的例子 AutowiredAnnotationBeanPostProcessor，是 BeanPostProcessor 的一个子类，是@Autowired 和@Value 的具体实现，其他的子类你也可以按如下的流程自行走一边，注意我的例子只是一个最为简单的例子，也就是用@Autowired 注入了一个普通的字段对象

我们看看 AutowiredAnnotationBeanPostProcessor 类，当然也是省略大部分代码：

```java
// 这个类可以看见当我们创建AutowiredAnnotationBeanPostProcessor对象的时候完成了一个工作就是给
// autowiredAnnotationTypes赋值,这个操作有点超前，后面根据这个判断要注入的类中是否有如下的注解
public AutowiredAnnotationBeanPostProcessor() {
    this.autowiredAnnotationTypes.add(Autowired.class);
    this.autowiredAnnotationTypes.add(Value.class);
    try {
        this.autowiredAnnotationTypes.add((Class<? extends Annotation>)
                                          ClassUtils.forName("javax.inject.Inject", AutowiredAnnotationBeanPostProcessor.class.getClassLoader()));
        logger.trace("JSR-330 'javax.inject.Inject' annotation found and supported for autowiring");
    }
    catch (ClassNotFoundException ex) {
        // JSR-330 API not available - simply skip.
    }
}
// 从InstantiationAwareBeanPostProcessors继承而来
@Override
public PropertyValues postProcessProperties(PropertyValues pvs, Object bean, String beanName) {
    // 寻找注入的元数据，其中它有注解扫描，和类属性信息的填充
    InjectionMetadata metadata = findAutowiringMetadata(beanName, bean.getClass(), pvs);
    try {
       // 把数据注入到当前的bean，由于需要分析的过程太多就略过怎么实现的
        metadata.inject(bean, beanName, pvs);
    }
    catch (BeanCreationException ex) {
        throw ex;
    }
    catch (Throwable ex) {
        throw new BeanCreationException(beanName, "Injection of autowired dependencies failed", ex);
    }
    return pvs;
}
```

BeanPostProcessor 的职责是在 bean 初始化后进行实例的更改，所以我们在普通 bean 实例化的时候就可以看见它的身影 AbstractAutowireCapableBeanFactory 中的 populateBean 就是给 bean 属性填充值，同样我们省略大部分代码：

```java
protected void populateBean(String beanName, RootBeanDefinition mbd, @Nullable BeanWrapper bw) {
    // true 因为我们有InstantiationAwareBeanPostProcessors的实现子类
    boolean hasInstAwareBpps = hasInstantiationAwareBeanPostProcessors();
    boolean needsDepCheck = (mbd.getDependencyCheck() != AbstractBeanDefinition.DEPENDENCY_CHECK_NONE);

    PropertyDescriptor[] filteredPds = null;
    if (hasInstAwareBpps) {
        if (pvs == null) {
            pvs = mbd.getPropertyValues();
        }
        for (InstantiationAwareBeanPostProcessor bp : getBeanPostProcessorCache().instantiationAware) {
            // 主要方法
            PropertyValues pvsToUse = bp.postProcessProperties(pvs, bw.getWrappedInstance(), beanName);
            if (pvsToUse == null) {
                if (filteredPds == null) {
                    filteredPds = filterPropertyDescriptorsForDependencyCheck(bw, mbd.allowCaching);
                }
                pvsToUse = bp.postProcessPropertyValues(pvs, filteredPds, bw.getWrappedInstance(), beanName);
                if (pvsToUse == null) {
                    return;
                }
            }
            pvs = pvsToUse;
        }
    }
}
```

至此当前的 bean 就实现了@Autowired 的字段注入，整个过程看似简单，但却有诸多细节。
