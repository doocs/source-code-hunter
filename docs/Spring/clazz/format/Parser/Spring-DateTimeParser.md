# Spring DateTimeParser

- 类全路径: `org.springframework.format.datetime.joda.DateTimeParser`

- 代码如下

```java
public final class DateTimeParser implements Parser<DateTime> {

	private final DateTimeFormatter formatter;


	/**
	 * Create a new DateTimeParser.
	 * @param formatter the Joda DateTimeFormatter instance
	 */
	public DateTimeParser(DateTimeFormatter formatter) {
		this.formatter = formatter;
	}


	@Override
	public DateTime parse(String text, Locale locale) throws ParseException {
		// DateTimeFormatter 转换字符串事件类型
		return JodaTimeContextHolder.getFormatter(this.formatter, locale).parseDateTime(text);
	}

}

```
