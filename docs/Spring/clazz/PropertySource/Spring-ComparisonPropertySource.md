# Spring ComparisonPropertySource

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)


- 整体代码如下.
    - 下面几个调用方法会直接抛出异常
        1. getSource
        1. containsProperty
        1. getProperty

```java
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

```