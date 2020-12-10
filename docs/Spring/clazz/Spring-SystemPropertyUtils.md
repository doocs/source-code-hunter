# Spring SystemPropertyUtils

- spring 中获取系统属性的工具类

- 内部属性

```java
/**
 *
 * Prefix for system property placeholders: "${".
 * 前缀占位符
 * */
public static final String PLACEHOLDER_PREFIX = "${";

/**
 *  Suffix for system property placeholders: "}".
 *  后缀占位符
 * */
public static final String PLACEHOLDER_SUFFIX = "}";

/**
 * Value separator for system property placeholders: ":".
 * 值分割符号
 * */
public static final String VALUE_SEPARATOR = ":";


/**
 * 占位符解析类
 */
private static final PropertyPlaceholderHelper strictHelper =
      new PropertyPlaceholderHelper(PLACEHOLDER_PREFIX, PLACEHOLDER_SUFFIX, VALUE_SEPARATOR, false);

/**
 * 占位符解析类
 */
private static final PropertyPlaceholderHelper nonStrictHelper =
      new PropertyPlaceholderHelper(PLACEHOLDER_PREFIX, PLACEHOLDER_SUFFIX, VALUE_SEPARATOR, true);
```

## resolvePlaceholders

- 解析属性

![SystemPropertyUtils-resolvePlaceholders.png](/images/spring/SystemPropertyUtils-resolvePlaceholders.png)

时序图因为有递归所以看着有点长, 其核心方法最后会指向 PlaceholderResolver

通过 PlaceholderResolver 获取属性值

在 `SystemPropertyUtils` 内部有 `PlaceholderResolver ` 实现

- 最终通过下面的类来获取具体的属性值

```java
private static class SystemPropertyPlaceholderResolver implements PropertyPlaceholderHelper.PlaceholderResolver {

   private final String text;

   public SystemPropertyPlaceholderResolver(String text) {
      this.text = text;
   }

   @Override
   @Nullable
   public String resolvePlaceholder(String placeholderName) {
      try {
         String propVal = System.getProperty(placeholderName);
         if (propVal == null) {
            // Fall back to searching the system environment.
            // 获取系统属性
            propVal = System.getenv(placeholderName);
         }
         return propVal;
      }
      catch (Throwable ex) {
         System.err.println("Could not resolve placeholder '" + placeholderName + "' in [" +
               this.text + "] as system property: " + ex);
         return null;
      }
   }
}
```
