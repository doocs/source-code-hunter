# Spring ServletContextPlaceholderResolver


- 类全路径: `org.springframework.web.util.ServletContextPropertyUtils.ServletContextPlaceholderResolver`

```java
	private static class ServletContextPlaceholderResolver
			implements PropertyPlaceholderHelper.PlaceholderResolver {

		private final String text;

		private final ServletContext servletContext;

		public ServletContextPlaceholderResolver(String text, ServletContext servletContext) {
			this.text = text;
			this.servletContext = servletContext;
		}

		@Override
		@Nullable
		public String resolvePlaceholder(String placeholderName) {
			try {
				// servlet 上下文获取
				String propVal = this.servletContext.getInitParameter(placeholderName);
				if (propVal == null) {
					// Fall back to system properties.
					propVal = System.getProperty(placeholderName);
					if (propVal == null) {
						// Fall back to searching the system environment.
						propVal = System.getenv(placeholderName);
					}
				}
				return propVal;
			}
			catch (Throwable ex) {
				System.err.println("Could not resolve placeholder '" + placeholderName + "' in [" +
						this.text + "] as ServletContext init-parameter or system property: " + ex);
				return null;
			}
		}
	}

```