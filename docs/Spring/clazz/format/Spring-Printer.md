# Spring Printer

- 类全路径: `org.springframework.format.Printer`
- 类作用: 对象转换成字符串

```java
@FunctionalInterface
public interface Printer<T> {

	/**
	 * Print the object of type T for display.
	 * 打印对象
	 * @param object the instance to print
	 * @param locale the current user locale
	 * @return the printed text string
	 */
	String print(T object, Locale locale);

}
```
