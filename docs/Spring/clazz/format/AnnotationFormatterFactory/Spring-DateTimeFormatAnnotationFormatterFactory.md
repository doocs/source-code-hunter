# Spring DateTimeFormatAnnotationFormatterFactory

- 类全路径: `org.springframework.format.datetime.DateTimeFormatAnnotationFormatterFactory`

- 类图
  ![EmbeddedValueResolutionSupport](/images/spring/DateTimeFormatAnnotationFormatterFactory.png)

```java
public class DateTimeFormatAnnotationFormatterFactory extends EmbeddedValueResolutionSupport
		implements AnnotationFormatterFactory<DateTimeFormat> {

	/**
	 * 字段类型
	 */
	private static final Set<Class<?>> FIELD_TYPES;

	@Override
	public Set<Class<?>> getFieldTypes() {
		return FIELD_TYPES;
	}

	@Override
	public Printer<?> getPrinter(DateTimeFormat annotation, Class<?> fieldType) {
		return getFormatter(annotation, fieldType);
	}

	@Override
	public Parser<?> getParser(DateTimeFormat annotation, Class<?> fieldType) {
		return getFormatter(annotation, fieldType);
	}

	protected Formatter<Date> getFormatter(DateTimeFormat annotation, Class<?> fieldType) {
		DateFormatter formatter = new DateFormatter();
		// style
		String style = resolveEmbeddedValue(annotation.style());
		// 判断时间格式是否村子啊
		if (StringUtils.hasLength(style)) {
			formatter.setStylePattern(style);
		}
		// iso 设置
		formatter.setIso(annotation.iso());
		// date time pattern
		String pattern = resolveEmbeddedValue(annotation.pattern());
		// 设置
		if (StringUtils.hasLength(pattern)) {
			formatter.setPattern(pattern);
		}
		return formatter;
	}

	static {
		Set<Class<?>> fieldTypes = new HashSet<>(4);
		// 加入字段类型
		fieldTypes.add(Date.class);
		fieldTypes.add(Calendar.class);
		fieldTypes.add(Long.class);
		FIELD_TYPES = Collections.unmodifiableSet(fieldTypes);
	}

}

```
