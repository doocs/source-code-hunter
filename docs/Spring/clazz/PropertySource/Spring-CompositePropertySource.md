# Spring CompositePropertySource

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)

- 全路径: `org.springframework.core.env.CompositePropertySource`

- 整体代码如下

```java
public class CompositePropertySource extends EnumerablePropertySource<Object> {

	/**
	 * set 集合
	 */
	private final Set<PropertySource<?>> propertySources = new LinkedHashSet<>();


	/**
	 * Create a new {@code CompositePropertySource}.
	 * @param name the name of the property source
	 */
	public CompositePropertySource(String name) {
		super(name);
	}


	@Override
	@Nullable
	public Object getProperty(String name) {
		// 循环
		for (PropertySource<?> propertySource : this.propertySources) {
			// 获取存储内容
			Object candidate = propertySource.getProperty(name);
			if (candidate != null) {
				return candidate;
			}
		}
		return null;
	}

	@Override
	public boolean containsProperty(String name) {
		for (PropertySource<?> propertySource : this.propertySources) {
			// 是否存在name
			if (propertySource.containsProperty(name)) {
				return true;
			}
		}
		return false;
	}

	@Override
	public String[] getPropertyNames() {
		Set<String> names = new LinkedHashSet<>();
		for (PropertySource<?> propertySource : this.propertySources) {
			// 类型不同抛出异常
			if (!(propertySource instanceof EnumerablePropertySource)) {
				throw new IllegalStateException(
						"Failed to enumerate property names due to non-enumerable property source: " + propertySource);
			}
			// 批量添加
			names.addAll(Arrays.asList(((EnumerablePropertySource<?>) propertySource).getPropertyNames()));
		}
		// 转换成 array
		return StringUtils.toStringArray(names);
	}


	/**
	 * Add the given {@link PropertySource} to the end of the chain.
	 * @param propertySource the PropertySource to add
	 */
	public void addPropertySource(PropertySource<?> propertySource) {
		this.propertySources.add(propertySource);
	}

	/**
	 * Add the given {@link PropertySource} to the start of the chain.
	 * @param propertySource the PropertySource to add
	 * @since 4.1
	 */
	public void addFirstPropertySource(PropertySource<?> propertySource) {
		// 头插
		List<PropertySource<?>> existing = new ArrayList<>(this.propertySources);
		this.propertySources.clear();
		this.propertySources.add(propertySource);
		this.propertySources.addAll(existing);
	}

	/**
	 * Return all property sources that this composite source holds.
	 * @since 4.1.1
	 */
	public Collection<PropertySource<?>> getPropertySources() {
		return this.propertySources;
	}


	@Override
	public String toString() {
		return getClass().getSimpleName() + " {name='" + this.name + "', propertySources=" + this.propertySources + "}";
	}

}
```
