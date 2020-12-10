# Spring MillisecondInstantPrinter

- 类全路径: `org.springframework.format.datetime.joda.MillisecondInstantPrinter`

```java
public final class MillisecondInstantPrinter implements Printer<Long> {

	private final DateTimeFormatter formatter;


	/**
	 * Create a new ReadableInstantPrinter.
	 * @param formatter the Joda DateTimeFormatter instance
	 */
	public MillisecondInstantPrinter(DateTimeFormatter formatter) {
		this.formatter = formatter;
	}


	@Override
	public String print(Long instant, Locale locale) {
		// DateTimeFormatter .print
		return JodaTimeContextHolder.getFormatter(this.formatter, locale).print(instant);
	}

}

```
