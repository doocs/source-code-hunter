# Spring ServletConfigPropertySource

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)


- 类全路径: `org.springframework.web.context.support.ServletConfigPropertySource`
- 内部数据结构是 `ServletConfig`
   

- 整体代码如下

```java

public class ServletConfigPropertySource extends EnumerablePropertySource<ServletConfig> {

	public ServletConfigPropertySource(String name, ServletConfig servletConfig) {
		super(name, servletConfig);
	}

	@Override
	public String[] getPropertyNames() {
		// javax.servlet.ServletConfig.getInitParameterNames
		return StringUtils.toStringArray(this.source.getInitParameterNames());
	}

	@Override
	@Nullable
	public String getProperty(String name) {
		// javax.servlet.ServletConfig.getInitParameter
		return this.source.getInitParameter(name);
	}

}

```