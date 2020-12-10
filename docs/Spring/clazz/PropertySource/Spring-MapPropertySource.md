# Spring MapPropertySource

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)

- 类全路径: `org.springframework.core.env.MapPropertySource`
- 内部数据结构是一个`Map<String,Object>`
  这是一个对 map 的操作.
- 整体代码如下.

```java

public class MapPropertySource extends EnumerablePropertySource<Map<String, Object>> {

	public MapPropertySource(String name, Map<String, Object> source) {
		super(name, source);
	}


	@Override
	@Nullable
	public Object getProperty(String name) {
		// 从map中获取 name 对应的value
		return this.source.get(name);
	}

	@Override
	public boolean containsProperty(String name) {
		// 判断是否存在 name 属性
		return this.source.containsKey(name);
	}

	@Override
	public String[] getPropertyNames() {
		// 互殴去 map 的所有key
		return StringUtils.toStringArray(this.source.keySet());
	}

}

```
