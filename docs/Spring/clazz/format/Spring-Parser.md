# Spring Parser

- 类全路径: `org.springframework.format.Parser`
- 类作用: 字符串准换成 java 对象

```java

@FunctionalInterface
public interface Parser<T> {

	/**
	 * Parse a text String to produce a T.
	 * 将字符串转换成对象
	 * @param text the text string
	 * @param locale the current user locale
	 * @return an instance of T
	 * @throws ParseException when a parse exception occurs in a java.text parsing library
	 * @throws IllegalArgumentException when a parse exception occurs
	 */
	T parse(String text, Locale locale) throws ParseException;

}
```

- 类图

![Parser](/images/spring/Parser.png)
