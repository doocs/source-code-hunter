## 前言

这篇文章分享一下 spring IoC 容器初始化第三部分的代码，也就是将前面解析出来的 BeanDefinition 对象 注册进 IoC 容器，其实就是存入一个 ConcurrentHashMap<String, BeanDefinition> 中。

（PS：可以结合我 GitHub 上对 Spring 框架源码的翻译注释一起看，会更有助于各位同学理解，地址：  
spring-beans https://github.com/AmyliaY/spring-beans-reading  
spring-context https://github.com/AmyliaY/spring-context-reading
）

## 正文

回过头看一下前面在 DefaultBeanDefinitionDocumentReader 中实现的 processBeanDefinition(Element ele, BeanDefinitionParserDelegate delegate) 方法。

```java
/**
 * 将 .xml 文件中的元素解析成 BeanDefinition对象，并注册到 IoC容器 中
 */
protected void processBeanDefinition(Element ele, BeanDefinitionParserDelegate delegate) {

    // BeanDefinitionHolder 是对 BeanDefinition 的进一步封装，它持有一个 BeanDefinition 对象 及其对应
    // 的 beanName、aliases别名。
    // 对 Document 对象中 <Bean> 元素的解析由 BeanDefinitionParserDelegate 实现
    BeanDefinitionHolder bdHolder = delegate.parseBeanDefinitionElement(ele);
    if (bdHolder != null) {
        // 对 bdHolder 进行包装处理
        bdHolder = delegate.decorateBeanDefinitionIfRequired(ele, bdHolder);
        try {
            /**
             * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
             * 向 IoC 容器注册解析完成的 BeanDefinition对象，这是 BeanDefinition 向 IoC 容器注册的入口
             * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
             */
            BeanDefinitionReaderUtils.registerBeanDefinition(bdHolder, getReaderContext().getRegistry());
        }
        catch (BeanDefinitionStoreException ex) {
            getReaderContext().error("Failed to register bean definition with name '" +
                    bdHolder.getBeanName() + "'", ele, ex);
        }
        // 在完成向 IOC容器 注册 BeanDefinition对象 之后，发送注册事件
        getReaderContext().fireComponentRegistered(new BeanComponentDefinition(bdHolder));
    }
}
```

接着看一下 BeanDefinitionReaderUtils 的 registerBeanDefinition(BeanDefinitionHolder definitionHolder, BeanDefinitionRegistry registry) 方法。

```java
/**
 * 将解析到的 BeanDefinition对象 注册到 IoC容器
 */
public static void registerBeanDefinition(
        BeanDefinitionHolder definitionHolder, BeanDefinitionRegistry registry)
        throws BeanDefinitionStoreException {

    // 获取解析的 <bean>元素 的名称 beanName
    String beanName = definitionHolder.getBeanName();
    /**
     * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
     * 开始向 IoC容器 注册 BeanDefinition对象
     * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
     */
    registry.registerBeanDefinition(beanName, definitionHolder.getBeanDefinition());

    // 如果解析的 <bean>元素 有别名alias，向容器中注册别名
    String[] aliases = definitionHolder.getAliases();
    if (aliases != null) {
        for (String aliase : aliases) {
            registry.registerAlias(beanName, aliase);
        }
    }
}
```

BeanDefinitionRegistry 中的 registerBeanDefinition(String beanName, BeanDefinition beanDefinition) 方法在 DefaultListableBeanFactory 实现类中的具体实现。

```java
public class DefaultListableBeanFactory extends AbstractAutowireCapableBeanFactory
		implements ConfigurableListableBeanFactory, BeanDefinitionRegistry, Serializable {

    /** 按注册顺序排列的 beanDefinition名称列表(即 beanName)  */
    private final List<String> beanDefinitionNames = new ArrayList<String>();

    /** IoC容器 的实际体现，key --> beanName，value --> BeanDefinition对象 */
    private final Map<String, BeanDefinition> beanDefinitionMap = new ConcurrentHashMap<String, BeanDefinition>(64);

    /**
     * 向 IoC容器 注册解析的 beanName 和 BeanDefinition对象
     */
    public void registerBeanDefinition(String beanName, BeanDefinition beanDefinition)
            throws BeanDefinitionStoreException {

        Assert.hasText(beanName, "Bean name must not be empty");
        Assert.notNull(beanDefinition, "BeanDefinition must not be null");

        // 校验解析的 BeanDefiniton对象
        if (beanDefinition instanceof AbstractBeanDefinition) {
            try {
                ((AbstractBeanDefinition) beanDefinition).validate();
            }
            catch (BeanDefinitionValidationException ex) {
                throw new BeanDefinitionStoreException(beanDefinition.getResourceDescription(), beanName,
                        "Validation of bean definition failed", ex);
            }
        }

        // 注册的过程中需要线程同步，以保证数据的一致性
        synchronized (this.beanDefinitionMap) {
            Object oldBeanDefinition = this.beanDefinitionMap.get(beanName);

            // 检查是否有同名(beanName)的 BeanDefinition 存在于 IoC容器 中，如果已经存在，且不允许覆盖
            // 已注册的 BeanDefinition，则抛出注册异常，allowBeanDefinitionOverriding 默认为 true
            if (oldBeanDefinition != null) {
                if (!this.allowBeanDefinitionOverriding) {
                    throw new BeanDefinitionStoreException(beanDefinition.getResourceDescription(), beanName,
                            "Cannot register bean definition [" + beanDefinition + "] for bean '" + beanName +
                            "': There is already [" + oldBeanDefinition + "] bound.");
                }
                // 如果允许覆盖同名的 bean，后注册的会覆盖先注册的
                else {
                    if (this.logger.isInfoEnabled()) {
                        this.logger.info("Overriding bean definition for bean '" + beanName +
                                "': replacing [" + oldBeanDefinition + "] with [" + beanDefinition + "]");
                    }
                }
            }
            // 若该 beanName 在 IoC容器 中尚未注册，将其注册到 IoC容器中，
            else {
                // 将 beanName 注册到 beanDefinitionNames列表
                this.beanDefinitionNames.add(beanName);
                this.frozenBeanDefinitionNames = null;
            }
            // beanDefinitionMap 是 IoC容器 的最主要体现，他是一个 ConcurrentHashMap，
            // 直接存储了 bean的唯一标识 beanName，及其对应的 BeanDefinition对象
            this.beanDefinitionMap.put(beanName, beanDefinition);
        }
        // 重置所有已经注册过的 BeanDefinition 的缓存
        resetBeanDefinition(beanName);
    }
}
```
