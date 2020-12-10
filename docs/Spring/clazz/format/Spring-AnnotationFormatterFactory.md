# Spring AnnotationFormatterFactory

- 类全路径: `org.springframework.format.AnnotationFormatterFactory`

```java

public interface AnnotationFormatterFactory<A extends Annotation> {

	/**
	 * The types of fields that may be annotated with the &lt;A&gt; annotation.
	 * 字段类型
	 */
	Set<Class<?>> getFieldTypes();

	/**
	 * Get the Printer to print the value of a field of {@code fieldType} annotated with
	 * {@code annotation}.
	 * <p>If the type T the printer accepts is not assignable to {@code fieldType}, a
	 * coercion from {@code fieldType} to T will be attempted before the Printer is invoked.
	 * 通过注解和字段类型获取输出接口
	 * @param annotation the annotation instance
	 * @param fieldType the type of field that was annotated
	 * @return the printer
	 */
	Printer<?> getPrinter(A annotation, Class<?> fieldType);

	/**
	 * Get the Parser to parse a submitted value for a field of {@code fieldType}
	 * annotated with {@code annotation}.
	 * <p>If the object the parser returns is not assignable to {@code fieldType},
	 * a coercion to {@code fieldType} will be attempted before the field is set.
	 * 通过注解和字段类型获取解析接口
	 * @param annotation the annotation instance
	 * @param fieldType the type of field that was annotated
	 * @return the parser
	 */
	Parser<?> getParser(A annotation, Class<?> fieldType);

}

```
