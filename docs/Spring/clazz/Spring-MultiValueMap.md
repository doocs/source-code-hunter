# Spring MultiValueMap

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)

- 类路径: `org.springframework.util.MultiValueMap`

```java
public interface MultiValueMap<K, V> extends Map<K, List<V>> {

   /**
    * 获取value的第一
    */
   @Nullable
   V getFirst(K key);

   /**
    * 添加元素
    */
   void add(K key, @Nullable V value);

   /**
    * 添加所有元素
    */
   void addAll(K key, List<? extends V> values);

   /**
    * 添加要给 {@link MultiValueMap} 对象
    */
   void addAll(MultiValueMap<K, V> values);


   default void addIfAbsent(K key, @Nullable V value) {
      if (!containsKey(key)) {
         add(key, value);
      }
   }

   /**
    * 设置数据
    */
   void set(K key, @Nullable V value);

   /**
    * 设置一个map数据
    */
   void setAll(Map<K, V> values);

   /**
    * 转换成 map 结构
    */
   Map<K, V> toSingleValueMap();

}
```

- 但从接口定义上可以明确 value 是一个 list 结构

类图

![](/images/spring/MultiValueMap.png)

## LinkedMultiValueMap

```java
public class LinkedMultiValueMap<K, V> implements MultiValueMap<K, V>, Serializable, Cloneable {

    @Override
    @Nullable
    public V getFirst(K key) {
       // 获取list
       List<V> values = this.targetMap.get(key);
       // 获取 list 的第一个
       return (values != null && !values.isEmpty() ? values.get(0) : null);
    }

    @Override
    public void add(K key, @Nullable V value) {
       // 从当前内存中获取key对应的list.
       List<V> values = this.targetMap.computeIfAbsent(key, k -> new LinkedList<>());
       // 将value 插入到values中
       values.add(value);
    }

    @Override
    public void addAll(K key, List<? extends V> values) {
       // 从当前内存中获取key对应的list.
       List<V> currentValues = this.targetMap.computeIfAbsent(key, k -> new LinkedList<>());
       // 将value 插入到values中
       currentValues.addAll(values);
    }

    @Override
    public void addAll(MultiValueMap<K, V> values) {
       for (Entry<K, List<V>> entry : values.entrySet()) {
          addAll(entry.getKey(), entry.getValue());
       }
    }

    @Override
    public void set(K key, @Nullable V value) {
       // 构造list
       List<V> values = new LinkedList<>();
       // 添加
       values.add(value);
       // 添加
       this.targetMap.put(key, values);
    }

    @Override
    public void setAll(Map<K, V> values) {
       // 循环执行 set 方法
       values.forEach(this::set);
    }

    @Override
    public Map<K, V> toSingleValueMap() {
       // 返回结果定义
       LinkedHashMap<K, V> singleValueMap = new LinkedHashMap<>(this.targetMap.size());
       // 循环
       this.targetMap.forEach((key, values) -> {
          if (values != null && !values.isEmpty()) {
             // value 获取原来list中的第一个元素
             singleValueMap.put(key, values.get(0));
          }
       });
       return singleValueMap;
    }
}
```

- 其他实现类也基本和这个类相同, 不做具体展开
