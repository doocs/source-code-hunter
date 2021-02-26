# Spring HandlerMapping

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)
- 源码路径: `org.springframework.jms.annotation.EnableJms`

- `org.springframework.web.servlet.HandlerMapping`
- HandlerMapping 处理映射关系, 通过请求转换成对象`HandlerExecutionChain`

```java
public interface HandlerMapping {
    HandlerExecutionChain getHandler(HttpServletRequest request) throws Exception;
// 其他静态变量省略
}
```

![image](/images/springMVC/HandlerMapping.png)

```java
@Override
@Nullable
public final HandlerExecutionChain getHandler(HttpServletRequest request) throws Exception {
   // 转换成handler
   Object handler = getHandlerInternal(request);
   if (handler == null) {
      // 获取默认的 handler
      handler = getDefaultHandler();
   }
   if (handler == null) {
      return null;
   }
   // Bean name or resolved handler?
   if (handler instanceof String) {
      // handler 是beanName 直接从容器中获取
      String handlerName = (String) handler;
      handler = obtainApplicationContext().getBean(handlerName);
   }

   HandlerExecutionChain executionChain = getHandlerExecutionChain(handler, request);

   if (logger.isTraceEnabled()) {
      logger.trace("Mapped to " + handler);
   }
   else if (logger.isDebugEnabled() && !request.getDispatcherType().equals(DispatcherType.ASYNC)) {
      logger.debug("Mapped to " + executionChain.getHandler());
   }

   if (hasCorsConfigurationSource(handler) || CorsUtils.isPreFlightRequest(request)) {
      CorsConfiguration config = (this.corsConfigurationSource != null ? this.corsConfigurationSource.getCorsConfiguration(request) : null);
      CorsConfiguration handlerConfig = getCorsConfiguration(handler, request);
      config = (config != null ? config.combine(handlerConfig) : handlerConfig);
      executionChain = getCorsHandlerExecutionChain(request, executionChain, config);
   }

   return executionChain;
}
```

- `getHandlerInternal`方法是一个抽象方法

  ```java
  @Nullable
  protected abstract Object getHandlerInternal(HttpServletRequest request) throws Exception;
  ```

  存在的实现方法

  ![image-20200915135933146](images/image-20200915135933146.png)

- 先看`org.springframework.web.servlet.handler.AbstractHandlerMethodMapping#getHandlerInternal`方法是怎么一回事.

```java
	@Override
	protected HandlerMethod getHandlerInternal(HttpServletRequest request) throws Exception {
		// 获取当前请求路径
		String lookupPath = getUrlPathHelper().getLookupPathForRequest(request);
		// 设置属性
		request.setAttribute(LOOKUP_PATH, lookupPath);
		// 上锁
		this.mappingRegistry.acquireReadLock();
		try {
			// 寻找 handler method
			HandlerMethod handlerMethod = lookupHandlerMethod(lookupPath, request);
			return (handlerMethod != null ? handlerMethod.createWithResolvedBean() : null);
		}
		finally {
			// 释放锁
			this.mappingRegistry.releaseReadLock();
		}
	}

```

## UrlPathHelper

- 全路径:`org.springframework.web.util.UrlPathHelper`

- 几个属性

  ```java
  /**
   * 是否全路径标记
   */
  private boolean alwaysUseFullPath = false;

  /**
   * 是否需要 decode
   */
  private boolean urlDecode = true;

  private boolean removeSemicolonContent = true;

  /**
   * 默认的encoding编码格式
   */
  private String defaultEncoding = WebUtils.DEFAULT_CHARACTER_ENCODING;
  ```

### getPathWithinApplication

```java
public String getPathWithinApplication(HttpServletRequest request) {
   // 获取 context path
   String contextPath = getContextPath(request);
   // 获取 uri
   String requestUri = getRequestUri(request);
   String path = getRemainingPath(requestUri, contextPath, true);
   if (path != null) {
      // Normal case: URI contains context path.
      return (StringUtils.hasText(path) ? path : "/");
   }
   else {
      return requestUri;
   }
}
```

1. 从 request 中获取 context-path
   1. 从属性中直接获取
   2. 从 request 中调用 getContextPath 获取
   3. 判断是否是**`/`**
   4. decode request string
2. 从 request 中虎丘 request-uri
   1. 从属性中获取
   2. 从 request 中调用 getRequestURI 获取
   3. decode
3. 获取剩余路径

### getContextPath

- 获取 context-path 地址

```java
public String getContextPath(HttpServletRequest request) {
   // 从 request 获取 context path
   String contextPath = (String) request.getAttribute(WebUtils.INCLUDE_CONTEXT_PATH_ATTRIBUTE);
   if (contextPath == null) {
      contextPath = request.getContextPath();
   }
   if ("/".equals(contextPath)) {
      // Invalid case, but happens for includes on Jetty: silently adapt it.
      contextPath = "";
   }
   // decode context path
   return decodeRequestString(request, contextPath);
}
```

### decodeRequestString

- 判断是否需要编码, 需要编码就做编码操作，不需要就直接返回

```java
public String decodeRequestString(HttpServletRequest request, String source) {
   // 判断是否需要编码
   if (this.urlDecode) {
      // 进行编码
      return decodeInternal(request, source);
   }
   return source;
}
```

### decodeInternal

- 编码方法

```java
@SuppressWarnings("deprecation")
private String decodeInternal(HttpServletRequest request, String source) {
   // 确定编码方式
   String enc = determineEncoding(request);
   try {
      // 将 source 编译成 enc 的编码方式
      return UriUtils.decode(source, enc);
   }
   catch (UnsupportedCharsetException ex) {
      if (logger.isWarnEnabled()) {
         logger.warn("Could not decode request string [" + source + "] with encoding '" + enc +
               "': falling back to platform default encoding; exception message: " + ex.getMessage());
      }
      // 直接编码,JDK底层编码
      return URLDecoder.decode(source);
   }
}
```

### determineEncoding

- 确认编码

```java
protected String determineEncoding(HttpServletRequest request) {
   // 从 request 中获取编码方式
   String enc = request.getCharacterEncoding();
   if (enc == null) {
      // 默认编码
      enc = getDefaultEncoding();
   }
   return enc;
}
```

### getRequestUri

- 获取 uri 地址

```java
	public String getRequestUri(HttpServletRequest request) {
		// 从属性中获取
		String uri = (String) request.getAttribute(WebUtils.INCLUDE_REQUEST_URI_ATTRIBUTE);
		if (uri == null) {
			// 调用方法获取
			uri = request.getRequestURI();
		}
		//编码和清理数据
		return decodeAndCleanUriString(request, uri);
	}

```

### decodeAndCleanUriString

- 编码和清理数据

```java
private String decodeAndCleanUriString(HttpServletRequest request, String uri) {
   // 去掉分号
   uri = removeSemicolonContent(uri);
   // decoding
   uri = decodeRequestString(request, uri);
   // 去掉 // 双斜杠
   uri = getSanitizedPath(uri);
   return uri;
}
```

### shouldRemoveTrailingServletPathSlash

- 是否删除 servlet path 后的斜杠

- 默认是 false .
- 代码流程
  1. 通过 classLoader 加载 `"com.ibm.ws.webcontainer.WebContainer"`
  2. 调用方法 `"getWebContainerProperties"`
  3. 从方法结果中取`"getWebContainerProperties"`

```java
private boolean shouldRemoveTrailingServletPathSlash(HttpServletRequest request) {
   if (request.getAttribute(WEBSPHERE_URI_ATTRIBUTE) == null) {
      // Regular servlet container: behaves as expected in any case,
      // so the trailing slash is the result of a "/" url-pattern mapping.
      // Don't remove that slash.
      return false;
   }
   Boolean flagToUse = websphereComplianceFlag;
   if (flagToUse == null) {
      ClassLoader classLoader = UrlPathHelper.class.getClassLoader();
      String className = "com.ibm.ws.webcontainer.WebContainer";
      String methodName = "getWebContainerProperties";
      String propName = "com.ibm.ws.webcontainer.removetrailingservletpathslash";
      boolean flag = false;
      try {
         Class<?> cl = classLoader.loadClass(className);
         Properties prop = (Properties) cl.getMethod(methodName).invoke(null);
         flag = Boolean.parseBoolean(prop.getProperty(propName));
      }
      catch (Throwable ex) {
         if (logger.isDebugEnabled()) {
            logger.debug("Could not introspect WebSphere web container properties: " + ex);
         }
      }
      flagToUse = flag;
      websphereComplianceFlag = flag;
   }
   // Don't bother if WebSphere is configured to be fully Servlet compliant.
   // However, if it is not compliant, do remove the improper trailing slash!
   return !flagToUse;
}
```

### decodeMatrixVariables

- 编码修改方法

```java
public MultiValueMap<String, String> decodeMatrixVariables(
      HttpServletRequest request, MultiValueMap<String, String> vars) {

   // 判断是否需要重写编码
   if (this.urlDecode) {
      return vars;
   }
   else {
      // 需要重写编码的情况
      MultiValueMap<String, String> decodedVars = new LinkedMultiValueMap<>(vars.size());
      // 循环, 将 value 调用decodeInternal写到结果map返回
      vars.forEach((key, values) -> {
         for (String value : values) {
            decodedVars.add(key, decodeInternal(request, value));
         }
      });
      return decodedVars;
   }
}
```

- 与这个方法对应的还有`decodePathVariables`

### decodePathVariables

```java
public Map<String, String> decodePathVariables(HttpServletRequest request, Map<String, String> vars) {
   // 判断是否需要重写编码
   if (this.urlDecode) {
      return vars;
   }
   else {
      Map<String, String> decodedVars = new LinkedHashMap<>(vars.size());
      // 虚幻 decoding
      vars.forEach((key, value) -> decodedVars.put(key, decodeInternal(request, value)));
      return decodedVars;
   }
}
```

- 回到`org.springframework.web.servlet.handler.AbstractHandlerMethodMapping#getHandlerInternal`

```java
String lookupPath = getUrlPathHelper().getLookupPathForRequest(request);
```

- 设置属性上锁开锁就不具体展开了.

## lookupHandlerMethod

- `org.springframework.web.servlet.handler.AbstractHandlerMethodMapping#lookupHandlerMethod` 方法

- 第一部分

```java
@Nullable
protected HandlerMethod lookupHandlerMethod(String lookupPath, HttpServletRequest request) throws Exception {
   List<Match> matches = new ArrayList<>();
   // 从 MultiValueMap 获取
   List<T> directPathMatches = this.mappingRegistry.getMappingsByUrl(lookupPath);
   // 如果不为空
   if (directPathMatches != null) {
      // 添加匹配映射
      addMatchingMappings(directPathMatches, matches, request);
   }
   if (matches.isEmpty()) {
      // No choice but to go through all mappings...
      // 添加匹配映射
      addMatchingMappings(this.mappingRegistry.getMappings().keySet(), matches, request);
   }

    //...
}
```

- 创建一个匹配 list,将匹配结果放入

  ```
  List<Match> matches = new ArrayList<>();
  ```

- 从 map 中获取数据

  ```
  List<T> directPathMatches = this.mappingRegistry.getMappingsByUrl(lookupPath);
  ```

  ```java
  @Nullable
  public List<T> getMappingsByUrl(String urlPath) {
     return this.urlLookup.get(urlPath);
  }
  ```

  urlLookup 是`MultiValueMap`接口.

  key:url value:mapping

- addMatchingMappings 方法

  ```java
  if (directPathMatches != null) {
     // 添加匹配映射
     addMatchingMappings(directPathMatches, matches, request);
  }
  if (matches.isEmpty()) {
     // No choice but to go through all mappings...
     // 添加匹配映射
     addMatchingMappings(this.mappingRegistry.getMappings().keySet(), matches, request);
  }
  ```

  ```java
  private void addMatchingMappings(Collection<T> mappings, List<Match> matches, HttpServletRequest request) {
     for (T mapping : mappings) {
        // 抽象方法
        // 通过抽象方法获取 match 结果
        T match = getMatchingMapping(mapping, request);
        // 是否为空
        if (match != null) {
           // 从 mappingLookup 获取结果并且插入到matches中
           matches.add(new Match(match, this.mappingRegistry.getMappings().get(mapping)));
        }
     }
  }
  ```

- `getMatchingMapping` 方法是一个抽象方法

  ```java
  protected abstract T getMatchingMapping(T mapping, HttpServletRequest request);
  ```

- `org.springframework.web.servlet.mvc.method.RequestMappingInfoHandlerMapping#getMatchingMapping`

  ```java
  @Override
  protected RequestMappingInfo getMatchingMapping(RequestMappingInfo info, HttpServletRequest request) {
     return info.getMatchingCondition(request);
  }
  ```

- 第二部分

```java
if (!matches.isEmpty()) {
   // 比较对象
   Comparator<Match> comparator = new MatchComparator(getMappingComparator(request));
   // 排序
   matches.sort(comparator);
   // 获取第一个 match 对象
   Match bestMatch = matches.get(0);
   if (matches.size() > 1) {
      if (logger.isTraceEnabled()) {
         logger.trace(matches.size() + " matching mappings: " + matches);
      }

      if (CorsUtils.isPreFlightRequest(request)) {
         return PREFLIGHT_AMBIGUOUS_MATCH;
      }
      Match secondBestMatch = matches.get(1);
      if (comparator.compare(bestMatch, secondBestMatch) == 0) {
         // 拿出 handlerMethod 进行比较
         Method m1 = bestMatch.handlerMethod.getMethod();
         Method m2 = secondBestMatch.handlerMethod.getMethod();
         String uri = request.getRequestURI();
         throw new IllegalStateException(
               "Ambiguous handler methods mapped for '" + uri + "': {" + m1 + ", " + m2 + "}");
      }
   }
   request.setAttribute(BEST_MATCHING_HANDLER_ATTRIBUTE, bestMatch.handlerMethod);
   handleMatch(bestMatch.mapping, lookupPath, request);
   return bestMatch.handlerMethod;
}
else {
   return handleNoMatch(this.mappingRegistry.getMappings().keySet(), lookupPath, request);
}
```

- 一行行开始分析

```java
Comparator<Match> comparator = new MatchComparator(getMappingComparator(request));
```

- 抽象方法`getMappingComparator`

```java
protected abstract Comparator<T> getMappingComparator(HttpServletRequest request);
```

- 实现方法

  ```java
  @Override
  protected Comparator<RequestMappingInfo> getMappingComparator(final HttpServletRequest request) {
     return (info1, info2) -> info1.compareTo(info2, request);
  }
  ```

  内部定义了 compareTo 方法

- 执行完成比较方法后创建对象`MatchComparator`
- 对象创建后进行排序，排序后取出第一个元素作为后续操作的基准对象

```java
// 排序
matches.sort(comparator);
// 获取第一个 match 对象
Match bestMatch = matches.get(0);
```

```java
if (matches.size() > 1) {
   if (logger.isTraceEnabled()) {
      logger.trace(matches.size() + " matching mappings: " + matches);
   }

   // 是否跨域请求
   if (CorsUtils.isPreFlightRequest(request)) {
      return PREFLIGHT_AMBIGUOUS_MATCH;
   }
   // 取出第二个元素.
   Match secondBestMatch = matches.get(1);
   // 如果比较结果相同
   if (comparator.compare(bestMatch, secondBestMatch) == 0) {
      // 第二个元素和第一个元素的比较过程
      // 拿出 handlerMethod 进行比较
      Method m1 = bestMatch.handlerMethod.getMethod();
      Method m2 = secondBestMatch.handlerMethod.getMethod();
      String uri = request.getRequestURI();
      throw new IllegalStateException(
            "Ambiguous handler methods mapped for '" + uri + "': {" + m1 + ", " + m2 + "}");
   }
}
```

- 取出第一个元素和第二个元素进行比较. 如果两个 match 相同, 出现异常

最后两个方法

```java
    // 设置属性
   request.setAttribute(BEST_MATCHING_HANDLER_ATTRIBUTE, bestMatch.handlerMethod);
   // 处理匹配的结果
   handleMatch(bestMatch.mapping, lookupPath, request);
   return bestMatch.handlerMethod;
}
else {
   // 处理没有匹配的结果
   return handleNoMatch(this.mappingRegistry.getMappings().keySet(), lookupPath, request);
}
```

- `handleMatch`

  ```java
  protected void handleMatch(T mapping, String lookupPath, HttpServletRequest request) {
     request.setAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE, lookupPath);
  }
  ```

  设置一次属性

  这个方法子类会继续实现

  - `org.springframework.web.servlet.mvc.method.RequestMappingInfoHandlerMapping#handleMatch`

```java
@Override
protected void handleMatch(RequestMappingInfo info, String lookupPath, HttpServletRequest request) {
   super.handleMatch(info, lookupPath, request);

   String bestPattern;
   Map<String, String> uriVariables;

   // 匹配器
   Set<String> patterns = info.getPatternsCondition().getPatterns();
   // 如果空设置基本数据
   if (patterns.isEmpty()) {
      bestPattern = lookupPath;
      uriVariables = Collections.emptyMap();
   }
   else {
      // 取出一个匹配器
      bestPattern = patterns.iterator().next();

      // 地址匹配器比较 路由地址和匹配器比较
      uriVariables = getPathMatcher().extractUriTemplateVariables(bestPattern, lookupPath);
   }

   request.setAttribute(BEST_MATCHING_PATTERN_ATTRIBUTE, bestPattern);

   if (isMatrixVariableContentAvailable()) {
      // 处理多层参数, 带有;分号的处理
      Map<String, MultiValueMap<String, String>> matrixVars = extractMatrixVariables(request, uriVariables);
      request.setAttribute(HandlerMapping.MATRIX_VARIABLES_ATTRIBUTE, matrixVars);
   }

   // 编码url参数
   Map<String, String> decodedUriVariables = getUrlPathHelper().decodePathVariables(request, uriVariables);
   request.setAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE, decodedUriVariables);

   if (!info.getProducesCondition().getProducibleMediaTypes().isEmpty()) {
      // 获取 media type
      Set<MediaType> mediaTypes = info.getProducesCondition().getProducibleMediaTypes();
      request.setAttribute(PRODUCIBLE_MEDIA_TYPES_ATTRIBUTE, mediaTypes);
   }
}
```

- `handleNoMatch` 也是同类型操作
  - `org.springframework.web.servlet.handler.AbstractHandlerMethodMapping#handleNoMatch`
    - `org.springframework.web.servlet.mvc.method.RequestMappingInfoHandlerMapping#handleNoMatch`

```java
@Override
protected HandlerMethod handleNoMatch(
      Set<RequestMappingInfo> infos, String lookupPath, HttpServletRequest request) throws ServletException {

   // 创建对象 PartialMatchHelper
   PartialMatchHelper helper = new PartialMatchHelper(infos, request);
   if (helper.isEmpty()) {
      return null;
   }

   // 函数是否匹配
   if (helper.hasMethodsMismatch()) {
      Set<String> methods = helper.getAllowedMethods();
      // 请求方式比较
      if (HttpMethod.OPTIONS.matches(request.getMethod())) {
         // handler 转换
         HttpOptionsHandler handler = new HttpOptionsHandler(methods);
         // 构建 handler method
         return new HandlerMethod(handler, HTTP_OPTIONS_HANDLE_METHOD);
      }
      throw new HttpRequestMethodNotSupportedException(request.getMethod(), methods);
   }

   if (helper.hasConsumesMismatch()) {
      Set<MediaType> mediaTypes = helper.getConsumableMediaTypes();
      MediaType contentType = null;
      if (StringUtils.hasLength(request.getContentType())) {
         try {
            // 字符串转换成对象
            contentType = MediaType.parseMediaType(request.getContentType());
         }
         catch (InvalidMediaTypeException ex) {
            throw new HttpMediaTypeNotSupportedException(ex.getMessage());
         }
      }
      throw new HttpMediaTypeNotSupportedException(contentType, new ArrayList<>(mediaTypes));
   }

   if (helper.hasProducesMismatch()) {
      Set<MediaType> mediaTypes = helper.getProducibleMediaTypes();
      throw new HttpMediaTypeNotAcceptableException(new ArrayList<>(mediaTypes));
   }

   if (helper.hasParamsMismatch()) {
      List<String[]> conditions = helper.getParamConditions();
      throw new UnsatisfiedServletRequestParameterException(conditions, request.getParameterMap());
   }

   return null;
}
```
