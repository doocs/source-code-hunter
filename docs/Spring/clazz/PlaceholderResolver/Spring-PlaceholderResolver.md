# Spring PlaceholderResolver

- 类全路径: `org.springframework.util.PropertyPlaceholderHelper.PlaceholderResolver`

- 类作用将占位符中的内容替换成属性值.
  - 假设现有属性表: user.dir = c:\home
    传入参数 user.dir 会获得 c:\home

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

- 类图如下

![PropertyPlaceholderConfigurerResolver](/images/spring/PropertyPlaceholderConfigurerResolver.png)
