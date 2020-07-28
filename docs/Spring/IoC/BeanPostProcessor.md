BeanPostProcessor接口 也叫 Bean后置处理器，作用是在Bean对象实例化和依赖注入完成后，在显示调用bean的init-method(初始化方法)的前后添加我们自己的处理逻辑。注意是Bean实例化完毕后及依赖注入完成后触发的，接口的源码如下。

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

使用方法也很简单，实现 BeanPostProcessor接口，然后将实现类注入IoC容器即可。