# Spring OrderUtils

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-Spring](https://github.com/SourceHot/spring-framework-read)
- `org.springframework.core.annotation.OrderUtils`主要方法如下
  1. getOrder
  1. getPriority
- 测试类`org.springframework.core.annotation.OrderUtilsTests`

```java
    @Nullable
    public static Integer getOrder(Class<?> type) {
        // 缓存中获取
        Object cached = orderCache.get(type);
        if (cached != null) {
            // 返回 int
            return (cached instanceof Integer ? (Integer) cached : null);
        }
        /**
         * 注解工具类,寻找{@link Order}注解
         */
        Order order = AnnotationUtils.findAnnotation(type, Order.class);
        Integer result;
        if (order != null) {
            // 返回
            result = order.value();
        } else {
            result = getPriority(type);
        }
        // key: 类名,value: intValue
        orderCache.put(type, (result != null ? result : NOT_ANNOTATED));
        return result;
    }

```

```java
    @Nullable
    public static Integer getPriority(Class<?> type) {
        if (priorityAnnotationType == null) {
            return null;
        }
        // 缓存中获取
        Object cached = priorityCache.get(type);
        if (cached != null) {
            // 不为空返回
            return (cached instanceof Integer ? (Integer) cached : null);
        }
        // 注解工具获取注解
        Annotation priority = AnnotationUtils.findAnnotation(type, priorityAnnotationType);
        Integer result = null;
        if (priority != null) {
            // 获取 value
            result = (Integer) AnnotationUtils.getValue(priority);
        }
        // 向缓存插入数据
        priorityCache.put(type, (result != null ? result : NOT_ANNOTATED));
        return result;
    }

```
