# Spring Property

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)

- 相关类

  - `org.springframework.beans.PropertyValues`
  - `org.springframework.beans.PropertyValue`
  - `org.springframework.beans.MutablePropertyValues`

- 类图如下

  ![images](/images/spring/PropertyValues.png)

- 在 Spring IoC 中,**非 Web 工程**,使用 xml 或者注解进行配置主要使用到的是 `PropertyValues` ，`PropertyValue` ，`MutablePropertyValues` 三个

  其中 `PropertyValues` 是继承迭代器，具体实现在`MutablePropertyValues` 他们处理的对象是`PropertyValues`

  关系就是这样.

- 开始类的解析了

## PropertyValue

- `org.springframework.beans.PropertyValue`

- 类图

  ![](/images/spring/PropertyValue.png)

- 这个类暂时只关注两个属性

  1. name: 属性名称
  2. value: 属性值

  对应标签`<property name="age" value="30"/>`

  属性值一一对应填入.

## MutablePropertyValues

- `org.springframework.beans.MutablePropertyValues`

- 属性
  1. `propertyValueList`：属性列表, key:参数名称,value:具体数据
  2. `processedProperties`: 已经处理的属性名称
  3. `converted`: 是否转换

```java
public class MutablePropertyValues implements PropertyValues, Serializable {
   /**
    * 属性列表, key:参数名称,value:具体数据
    */
   private final List<PropertyValue> propertyValueList;

   /**
    * 已经处理的属性名称
    */
   @Nullable
   private Set<String> processedProperties;

   /**
    * 是否转换
    */
   private volatile boolean converted = false;
}
```

### 构造器

- `MutablePropertyValues` 的一个构造器. 其他构造器的方式原理实现差不多. 核心是将构造参数转换成`PropertyValue`对象在放入`propertyValueList`中

```java
public MutablePropertyValues(@Nullable PropertyValues original) {
   // We can optimize this because it's all new:
   // There is no replacement of existing property values.
   if (original != null) {
      // 从列表中获取所有可能指
      PropertyValue[] pvs = original.getPropertyValues();
      this.propertyValueList = new ArrayList<>(pvs.length);
      for (PropertyValue pv : pvs) {
         // 循环插入 property values
         this.propertyValueList.add(new PropertyValue(pv));
      }
   }
   else {
      this.propertyValueList = new ArrayList<>(0);
   }
}
```

### PropertyValue 的构造方法

```java
	public PropertyValue(PropertyValue original) {
		Assert.notNull(original, "Original must not be null");
		this.name = original.getName();
		this.value = original.getValue();
		this.optional = original.isOptional();
		this.converted = original.converted;
		this.convertedValue = original.convertedValue;
		this.conversionNecessary = original.conversionNecessary;
		this.resolvedTokens = original.resolvedTokens;
		setSource(original.getSource());
		copyAttributesFrom(original);
	}

```

- 除了最后一行是一个复杂调用. 前面几行代码都是属性赋值操作.
  - 最后一行代码会调用`AttributeAccessor`接口上的方法.

## AttributeAccessor

- `org.springframework.core.AttributeAccessor`

- 完整的方法列表及作用注释

```java
public interface AttributeAccessor {

   /**
    * 设置属性值
    * @param name 属性值名称
    * @param value 属性值
    */
   void setAttribute(String name, @Nullable Object value);

   /**
    * 通过属性名称获取属性值
    *
    * @param name 属性值名称
    * @return 属性值
    */
   @Nullable
   Object getAttribute(String name);

   /**
    * 移除指定属性名称的值,返回移除的属性值
    *
    * @param name 属性值名称
    * @return 移除的属性值
    */
   @Nullable
   Object removeAttribute(String name);

   /**
    * 是否包含属性名称
    * @param 属性名称
    */
   boolean hasAttribute(String name);

   /**
    * 属性名称列表
    */
   String[] attributeNames();

}
```

- 回到`org.springframework.core.AttributeAccessorSupport#copyAttributesFrom`方法

```java
protected void copyAttributesFrom(AttributeAccessor source) {
   Assert.notNull(source, "Source must not be null");
   // 获取属性名称列表
   String[] attributeNames = source.attributeNames();
   // 循环属性名称列表
   for (String attributeName : attributeNames) {
      // 设置属性
      // name: 属性名称,value: 从入参中获取属性名称对应的属性值
      setAttribute(attributeName, source.getAttribute(attributeName));
   }
}
```

### setAttribute

- 一个 map 操作

```java
@Override
public void setAttribute(String name, @Nullable Object value) {
   Assert.notNull(name, "Name must not be null");
   if (value != null) {
      this.attributes.put(name, value);
   }
   else {
      removeAttribute(name);
   }
}
```

## addPropertyValue

- `org.springframework.beans.MutablePropertyValues#addPropertyValue(org.springframework.beans.PropertyValue)`

```java
	public MutablePropertyValues addPropertyValue(PropertyValue pv) {
		// 循环获取 属性对象
		for (int i = 0; i < this.propertyValueList.size(); i++) {
			// 正在处理的 属性对象
			PropertyValue currentPv = this.propertyValueList.get(i);
			// 正在处理的属性对象名称和添加的属性对象名称比较
			// 如果相同会做一个合并操作
			if (currentPv.getName().equals(pv.getName())) {
				// 合并属性
				pv = mergeIfRequired(pv, currentPv);
				// 重新设置
				setPropertyValueAt(pv, i);
				return this;
			}
		}
		// 放入 list 集合
		this.propertyValueList.add(pv);
		return this;
	}

```

## mergeIfRequired

- `org.springframework.beans.MutablePropertyValues#mergeIfRequired`

- 这段代码会取舍新老数据.
  1. 如果是`Mergeable`类型会做合并操作
  2. 直接返回新数据

```java
	private PropertyValue mergeIfRequired(PropertyValue newPv, PropertyValue currentPv) {
		Object value = newPv.getValue();
		if (value instanceof Mergeable) {
			Mergeable mergeable = (Mergeable) value;
			if (mergeable.isMergeEnabled()) {
				// 获取合并的结果,放入对象
				Object merged = mergeable.merge(currentPv.getValue());
				// 创建新的 属性对象
				return new PropertyValue(newPv.getName(), merged);
			}
		}
		return newPv;
	}

```

- 配合测试代码，跟容易看懂.

  ```java
  @Test
  public void testAddOrOverride() {
     MutablePropertyValues pvs = new MutablePropertyValues();
     pvs.addPropertyValue(new PropertyValue("forname", "Tony"));
     pvs.addPropertyValue(new PropertyValue("surname", "Blair"));
     pvs.addPropertyValue(new PropertyValue("age", "50"));
     doTestTony(pvs);
     PropertyValue addedPv = new PropertyValue("rod", "Rod");
     pvs.addPropertyValue(addedPv);
     assertThat(pvs.getPropertyValue("rod").equals(addedPv)).isTrue();
     PropertyValue changedPv = new PropertyValue("forname", "Greg");
     pvs.addPropertyValue(changedPv);
     assertThat(pvs.getPropertyValue("forname").equals(changedPv)).isTrue();
  }
  ```

## Mergeable

新的接口`Mergeable`

- `org.springframework.beans.Mergeable`

```java
public interface Mergeable {

   /**
    * 是否需要合并
    */
   boolean isMergeEnabled();

   /**
    * 合并方法
    */
   Object merge(@Nullable Object parent);

}
```

![](/images/spring/Mergeable.png)

- 看一下 List 怎么实现`merge`

```java
@Override
@SuppressWarnings("unchecked")
public List<E> merge(@Nullable Object parent) {
   if (!this.mergeEnabled) {
      throw new IllegalStateException("Not allowed to merge when the 'mergeEnabled' property is set to 'false'");
   }
   if (parent == null) {
      return this;
   }
   if (!(parent instanceof List)) {
      throw new IllegalArgumentException("Cannot merge with object of type [" + parent.getClass() + "]");
   }
   List<E> merged = new ManagedList<>();
   merged.addAll((List<E>) parent);
   merged.addAll(this);
   return merged;
}
```

- 在 list 视线中就是讲两个结果合并. 事实上其他的几个都是这个操作. 这里就不贴所有的代码了
