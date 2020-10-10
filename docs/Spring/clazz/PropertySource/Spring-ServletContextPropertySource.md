# Spring ServletContextPropertySource


- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)


- 类全路径: `org.springframework.web.context.support.ServletContextPropertySource`
- 内部数据结构是 ServletContext 接口
      
- 整体代码如下.


```java

public class ServletContextPropertySource extends EnumerablePropertySource<ServletContext> {

	public ServletContextPropertySource(String name, ServletContext servletContext) {
		super(name, servletContext);
	}

	@Override
	public String[] getPropertyNames() {
		// javax.servlet.ServletContext.getInitParameterNames 方法调用
		return StringUtils.toStringArray(this.source.getInitParameterNames());
	}

	@Override
	@Nullable
	public String getProperty(String name) {
		// javax.servlet.ServletContext.getInitParameter
		return this.source.getInitParameter(name);
	}

}

```