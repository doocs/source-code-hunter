# Spring PropertySources

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)

## MutablePropertySources

- 全路径: `org.springframework.core.env.MutablePropertySources`

- `MutablePropertySources`类内部存储了`List<PropertySource<?>>`对象,主要是针对`List<PropertySource<?>>` 进行的操作.换句话说就是对 list 操作的实现

- 类注解如下

```java
public class MutablePropertySources implements PropertySources {

   private final List<PropertySource<?>> propertySourceList = new CopyOnWriteArrayList<>();


   /**
    * Create a new {@link MutablePropertySources} object.
    *
    * 构造方法
    */
   public MutablePropertySources() {
   }

   /**
    * Create a new {@code MutablePropertySources} from the given propertySources
    * object, preserving the original order of contained {@code PropertySource} objects.
    * 构造方法, 传递一个集合, 将集合中的数据放入 {@code propertySourceList}.
    */
   public MutablePropertySources(PropertySources propertySources) {
      this();
      // PropertySources 是一个迭代器接口的实现,通过循环取出信息放入到 propertySourceList 中
      for (PropertySource<?> propertySource : propertySources) {
         // 放入方法
         addLast(propertySource);
      }
   }


   /**
    * 获取迭代器对象
    */
   @Override
   public Iterator<PropertySource<?>> iterator() {
      return this.propertySourceList.iterator();
   }

   /**
    * 获取 Spliterator 对象
    */
   @Override
   public Spliterator<PropertySource<?>> spliterator() {
      return Spliterators.spliterator(this.propertySourceList, 0);
   }

   /**
    * 获取流
    */
   @Override
   public Stream<PropertySource<?>> stream() {
      return this.propertySourceList.stream();
   }

   /**
    * 判断是否存在 name
    * @param name the {@linkplain PropertySource#getName() name of the property source} to find
    */
   @Override
   public boolean contains(String name) {
      return this.propertySourceList.contains(PropertySource.named(name));
   }

   /**
    * 获取 PropertySource 信息
    * @param name the {@linkplain PropertySource#getName() name of the property source} to find
    * @return
    */
   @Override
   @Nullable
   public PropertySource<?> get(String name) {
      // 获取 name 所在的索引位置
      int index = this.propertySourceList.indexOf(PropertySource.named(name));
      // get方法获取结果
      return (index != -1 ? this.propertySourceList.get(index) : null);
   }


   /**
    * Add the given property source object with highest precedence.
    *
    * 头插数据
    */
   public void addFirst(PropertySource<?> propertySource) {
      removeIfPresent(propertySource);
      this.propertySourceList.add(0, propertySource);
   }

   /**
    * Add the given property source object with lowest precedence.
    *
    * 尾插数据
    */
   public void addLast(PropertySource<?> propertySource) {
      removeIfPresent(propertySource);
      this.propertySourceList.add(propertySource);
   }

   /**
    * Add the given property source object with precedence immediately higher
    * than the named relative property source.
    *
    * 在relativePropertySourceName的索引位置前添加数据
    */
   public void addBefore(String relativePropertySourceName, PropertySource<?> propertySource) {
      assertLegalRelativeAddition(relativePropertySourceName, propertySource);
      removeIfPresent(propertySource);
      int index = assertPresentAndGetIndex(relativePropertySourceName);
      addAtIndex(index, propertySource);
   }

   /**
    * Add the given property source object with precedence immediately lower
    * than the named relative property source.
    * 在relativePropertySourceName的索引位置后添加数据
    */
   public void addAfter(String relativePropertySourceName, PropertySource<?> propertySource) {
      assertLegalRelativeAddition(relativePropertySourceName, propertySource);
      // 删除存在的数据
      removeIfPresent(propertySource);
      // 获取所有
      int index = assertPresentAndGetIndex(relativePropertySourceName);
      // 在索引+1出添加数据
      addAtIndex(index + 1, propertySource);
   }

   /**
    * Return the precedence of the given property source, {@code -1} if not found.
    * 获取索引位置
    */
   public int precedenceOf(PropertySource<?> propertySource) {
      return this.propertySourceList.indexOf(propertySource);
   }

   /**
    * Remove and return the property source with the given name, {@code null} if not found.
    * 删除索引位置
    * @param name the name of the property source to find and remove
    */
   @Nullable
   public PropertySource<?> remove(String name) {
      // 获取索引
      int index = this.propertySourceList.indexOf(PropertySource.named(name));
      // 删除索引上的数据
      return (index != -1 ? this.propertySourceList.remove(index) : null);
   }

   /**
    * Replace the property source with the given name with the given property source object.
    * 替换 name 的信息
    * @param name the name of the property source to find and replace
    * @param propertySource the replacement property source
    * @throws IllegalArgumentException if no property source with the given name is present
    * @see #contains
    */
   public void replace(String name, PropertySource<?> propertySource) {
      // 获取索引位置
      int index = assertPresentAndGetIndex(name);
      // 设置具体所应位置的值
      this.propertySourceList.set(index, propertySource);
   }

   /**
    * Return the number of {@link PropertySource} objects contained.
    * 数量
    */
   public int size() {
      return this.propertySourceList.size();
   }

   @Override
   public String toString() {
      return this.propertySourceList.toString();
   }

   /**
    * Ensure that the given property source is not being added relative to itself.
    * 确保两个 PropertySource 的 name不相同
    */
   protected void assertLegalRelativeAddition(String relativePropertySourceName, PropertySource<?> propertySource) {
      // 获取 PropertySource 的名字
      String newPropertySourceName = propertySource.getName();
      // 历史名字和新的名字是否相同
      if (relativePropertySourceName.equals(newPropertySourceName)) {
         throw new IllegalArgumentException(
               "PropertySource named '" + newPropertySourceName + "' cannot be added relative to itself");
      }
   }

   /**
    * Remove the given property source if it is present.
    * 删除已存在的数据
    */
   protected void removeIfPresent(PropertySource<?> propertySource) {
      this.propertySourceList.remove(propertySource);
   }

   /**
    * Add the given property source at a particular index in the list.
    * 指定索引位置插入数据
    */
   private void addAtIndex(int index, PropertySource<?> propertySource) {
      removeIfPresent(propertySource);
      this.propertySourceList.add(index, propertySource);
   }

   /**
    * Assert that the named property source is present and return its index.
    * 获取 name 所在的索引位置
    * @param name {@linkplain PropertySource#getName() name of the property source} to find
    * @throws IllegalArgumentException if the named property source is not present
    */
   private int assertPresentAndGetIndex(String name) {
      int index = this.propertySourceList.indexOf(PropertySource.named(name));
      if (index == -1) {
         throw new IllegalArgumentException("PropertySource named '" + name + "' does not exist");
      }
      return index;
   }

}
```

## PropertySources

- 类路径: `org.springframework.core.env.PropertySources`

- 详细说明如下

```java
public interface PropertySources extends Iterable<PropertySource<?>> {

   /**
    * Return a sequential {@link Stream} containing the property sources.
    * 获取流
    * @since 5.1
    */
   default Stream<PropertySource<?>> stream() {
      return StreamSupport.stream(spliterator(), false);
   }

   /**
    * Return whether a property source with the given name is contained.
    * 判断是否存在 name
    * @param name the {@linkplain PropertySource#getName() name of the property source} to find
    */
   boolean contains(String name);

   /**
    * Return the property source with the given name, {@code null} if not found.
    * 获取 PropertySource
    * @param name the {@linkplain PropertySource#getName() name of the property source} to find
    */
   @Nullable
   PropertySource<?> get(String name);

}
```

## PropertySource

- 类路径: `org.springframework.core.env.PropertySource`

- 存有两个子类
  1. StubPropertySource
  2. ComparisonPropertySource 3. 调用`getSource`、`containsProperty`、`getProperty` 都会直接异常

```java
public abstract class PropertySource<T> {

	protected final Log logger = LogFactory.getLog(getClass());

	/**
	 * 属性名称
	 */
	protected final String name;

	/**
	 * 值
	 */
	protected final T source;


	/**
	 * Create a new {@code PropertySource} with the given name and source object.
	 */
	public PropertySource(String name, T source) {
		Assert.hasText(name, "Property source name must contain at least one character");
		Assert.notNull(source, "Property source must not be null");
		this.name = name;
		this.source = source;
	}

	/**
	 * Create a new {@code PropertySource} with the given name and with a new
	 * {@code Object} instance as the underlying source.
	 * <p>Often useful in testing scenarios when creating anonymous implementations
	 * that never query an actual source but rather return hard-coded values.
	 */
	@SuppressWarnings("unchecked")
	public PropertySource(String name) {
		this(name, (T) new Object());
	}

	/**
	 * Return a {@code PropertySource} implementation intended for collection comparison purposes only.
	 * <p>Primarily for internal use, but given a collection of {@code PropertySource} objects, may be
	 * used as follows:
	 * <pre class="code">
	 * {@code List<PropertySource<?>> sources = new ArrayList<PropertySource<?>>();
	 * sources.add(new MapPropertySource("sourceA", mapA));
	 * sources.add(new MapPropertySource("sourceB", mapB));
	 * assert sources.contains(PropertySource.named("sourceA"));
	 * assert sources.contains(PropertySource.named("sourceB"));
	 * assert !sources.contains(PropertySource.named("sourceC"));
	 * }</pre>
	 * The returned {@code PropertySource} will throw {@code UnsupportedOperationException}
	 * if any methods other than {@code equals(Object)}, {@code hashCode()}, and {@code toString()}
	 * are called.
	 * @param name the name of the comparison {@code PropertySource} to be created and returned.
	 */
	public static PropertySource<?> named(String name) {
		return new ComparisonPropertySource(name);
	}

	/**
	 * Return the name of this {@code PropertySource}.
	 */
	public String getName() {
		return this.name;
	}

	/**
	 * Return the underlying source object for this {@code PropertySource}.
	 */
	public T getSource() {
		return this.source;
	}

	/**
	 * Return whether this {@code PropertySource} contains the given name.
	 * <p>This implementation simply checks for a {@code null} return value
	 * from {@link #getProperty(String)}. Subclasses may wish to implement
	 * a more efficient algorithm if possible.
	 * @param name the property name to find
	 */
	public boolean containsProperty(String name) {
		// getProperty 抽象方法子类实现
		return (getProperty(name) != null);
	}

	/**
	 * Return the value associated with the given name,
	 * or {@code null} if not found.
	 * // getProperty 抽象方法子类实现
	 * @param name the property to find
	 * @see PropertyResolver#getRequiredProperty(String)
	 */
	@Nullable
	public abstract Object getProperty(String name);

	/**
	 * This {@code PropertySource} object is equal to the given object if:
	 * <ul>
	 * <li>they are the same instance
	 * <li>the {@code name} properties for both objects are equal
	 * </ul>
	 * <p>No properties other than {@code name} are evaluated.
	 */
	@Override
	public boolean equals(@Nullable Object other) {
		return (this == other || (other instanceof PropertySource &&
				ObjectUtils.nullSafeEquals(this.name, ((PropertySource<?>) other).name)));
	}

	/**
	 * Return a hash code derived from the {@code name} property
	 * of this {@code PropertySource} object.
	 */
	@Override
	public int hashCode() {
		return ObjectUtils.nullSafeHashCode(this.name);
	}

	/**
	 * Produce concise output (type and name) if the current log level does not include
	 * debug. If debug is enabled, produce verbose output including the hash code of the
	 * PropertySource instance and every name/value property pair.
	 * <p>This variable verbosity is useful as a property source such as system properties
	 * or environment variables may contain an arbitrary number of property pairs,
	 * potentially leading to difficult to read exception and log messages.
	 * @see Log#isDebugEnabled()
	 */
	@Override
	public String toString() {
		if (logger.isDebugEnabled()) {
			return getClass().getSimpleName() + "@" + System.identityHashCode(this) +
					" {name='" + this.name + "', properties=" + this.source + "}";
		}
		else {
			return getClass().getSimpleName() + " {name='" + this.name + "'}";
		}
	}

	/**
	 * {@code PropertySource} to be used as a placeholder in cases where an actual
	 * property source cannot be eagerly initialized at application context
	 * creation time.  For example, a {@code ServletContext}-based property source
	 * must wait until the {@code ServletContext} object is available to its enclosing
	 * {@code ApplicationContext}.  In such cases, a stub should be used to hold the
	 * intended default position/order of the property source, then be replaced
	 * during context refresh.
	 * @see org.springframework.context.support.AbstractApplicationContext#initPropertySources()
	 * @see org.springframework.web.context.support.StandardServletEnvironment
	 * @see org.springframework.web.context.support.ServletContextPropertySource
	 */
	public static class StubPropertySource extends PropertySource<Object> {

		public StubPropertySource(String name) {
			super(name, new Object());
		}

		/**
		 * Always returns {@code null}.
		 */
		@Override
		@Nullable
		public String getProperty(String name) {
			return null;
		}
	}


	/**
	 * A {@code PropertySource} implementation intended for collection comparison
	 * purposes.
	 *
	 * @see PropertySource#named(String)
	 */
	static class ComparisonPropertySource extends StubPropertySource {

		// 异常信息
		private static final String USAGE_ERROR =
				"ComparisonPropertySource instances are for use with collection comparison only";

		public ComparisonPropertySource(String name) {
			super(name);
		}

		@Override
		public Object getSource() {
			// 抛异常
			throw new UnsupportedOperationException(USAGE_ERROR);
		}

		@Override
		public boolean containsProperty(String name) {
			// 抛异常
			throw new UnsupportedOperationException(USAGE_ERROR);
		}

		@Override
		@Nullable
		public String getProperty(String name) {
			// 抛异常
			throw new UnsupportedOperationException(USAGE_ERROR);
		}
	}

}
```

类图

![PropertySource.png](/images/spring/PropertySource.png)
