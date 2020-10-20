# Spring PropertyPlaceholderHelper

- 类全路径: `org.springframework.util.PropertyPlaceholderHelper`

## parseStringValue

- `org.springframework.util.PropertyPlaceholderHelper#parseStringValue` 这个方法是主要方法

```java
protected String parseStringValue(
      String value, PlaceholderResolver placeholderResolver, @Nullable Set<String> visitedPlaceholders) {

   // 占位符所在位置
   int startIndex = value.indexOf(this.placeholderPrefix);
   if (startIndex == -1) {
      return value;
   }

   // 返回值
   StringBuilder result = new StringBuilder(value);
   while (startIndex != -1) {
      // 寻找结尾占位符
      int endIndex = findPlaceholderEndIndex(result, startIndex);
      if (endIndex != -1) {
         // 返回值切分留下中间内容
         String placeholder = result.substring(startIndex + this.placeholderPrefix.length(), endIndex);
         String originalPlaceholder = placeholder;
         if (visitedPlaceholders == null) {
            visitedPlaceholders = new HashSet<>(4);
         }
         if (!visitedPlaceholders.add(originalPlaceholder)) {
            throw new IllegalArgumentException(
                  "Circular placeholder reference '" + originalPlaceholder + "' in property definitions");
         }
         // Recursive invocation, parsing placeholders contained in the placeholder key.
         // 递归获取占位符内容
         placeholder = parseStringValue(placeholder, placeholderResolver, visitedPlaceholders);
         // Now obtain the value for the fully resolved key...
         // 解析占位符内容获得真正的属性值
         String propVal = placeholderResolver.resolvePlaceholder(placeholder);
         if (propVal == null && this.valueSeparator != null) {
            int separatorIndex = placeholder.indexOf(this.valueSeparator);
            if (separatorIndex != -1) {
               String actualPlaceholder = placeholder.substring(0, separatorIndex);
               String defaultValue = placeholder.substring(separatorIndex + this.valueSeparator.length());
               propVal = placeholderResolver.resolvePlaceholder(actualPlaceholder);
               if (propVal == null) {
                  propVal = defaultValue;
               }
            }
         }
         if (propVal != null) {
            // Recursive invocation, parsing placeholders contained in the
            // previously resolved placeholder value.
            propVal = parseStringValue(propVal, placeholderResolver, visitedPlaceholders);
            result.replace(startIndex, endIndex + this.placeholderSuffix.length(), propVal);
            if (logger.isTraceEnabled()) {
               logger.trace("Resolved placeholder '" + placeholder + "'");
            }
            startIndex = result.indexOf(this.placeholderPrefix, startIndex + propVal.length());
         }
         else if (this.ignoreUnresolvablePlaceholders) {
            // Proceed with unprocessed value.
            startIndex = result.indexOf(this.placeholderPrefix, endIndex + this.placeholderSuffix.length());
         }
         else {
            throw new IllegalArgumentException("Could not resolve placeholder '" +
                  placeholder + "'" + " in value \"" + value + "\"");
         }
         visitedPlaceholders.remove(originalPlaceholder);
      }
      else {
         startIndex = -1;
      }
   }
   return result.toString();
}
```

在这里还需要关注一个接口

- 占位符解析.

```java
@FunctionalInterface
public interface PlaceholderResolver {

   /**
    * Resolve the supplied placeholder name to the replacement value.
    * @param placeholderName the name of the placeholder to resolve
    * @return the replacement value, or {@code null} if no replacement is to be made
    */
   @Nullable
   String resolvePlaceholder(String placeholderName);
}
```

占位符解析请查看: [PlaceholderResolver](PlaceholderResolver)

## findPlaceholderEndIndex

- 寻找结尾占位符索引

```java
/**
 * 寻找结尾占位符索引
 */
private int findPlaceholderEndIndex(CharSequence buf, int startIndex) {
   int index = startIndex + this.placeholderPrefix.length();
   int withinNestedPlaceholder = 0;
   while (index < buf.length()) {
      if (StringUtils.substringMatch(buf, index, this.placeholderSuffix)) {
         if (withinNestedPlaceholder > 0) {
            withinNestedPlaceholder--;
            index = index + this.placeholderSuffix.length();
         }
         else {
            return index;
         }
      }
      else if (StringUtils.substringMatch(buf, index, this.simplePrefix)) {
         withinNestedPlaceholder++;
         index = index + this.simplePrefix.length();
      }
      else {
         index++;
      }
   }
   return -1;
}
```
