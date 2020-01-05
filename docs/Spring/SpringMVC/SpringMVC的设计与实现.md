## 1 SpringMVC应用场景
在使用SpringMVC时，除了要在web.xml中配置ContextLoaderListener外，还要对DispatcherServlet进行配置。作为一个Servlet，这个DispatcherServlet实现的是Sun的J2EE核心模式中的前端控制器模式(Front Controller)， 作为一个前端控制器，所有的Web请求都需要通过它来处理，进行转发、匹配、数据处理后，并转由页面进行展现，因此这个DispatcerServlet可以看成是Spring MVC实现中最为核心的部分。

在Spring MVC中，对于不同的Web请求的映射需求，Spring MVC提供了不同的HandlerMapping的实现，可以让应用开发选取不同的映射策略。DispatcherSevlet默认了BeanNameUrlHandlerMapping作为映射策略实现。除了映射策略可以定制外，Spring MVC提供了各种Controller的实现来供应用扩展和使用，以应对不同的控制器使用场景，这些Controller控制器需要实现handleRequest接口方法，并返回ModelAndView对象。Spring MVC还提供了各种视图实现，比如常用的JSP视图。除此之外，Spring MVC还提供了拦截器供应用使用，允许应用对Web请求进行拦截，以及前置处理和后置处理。

## 2 SpringMVC设计概览
在完成对ContextLoaderListener的初始化以后，Web容器开始初始化DispatcherServlet，这个初始化的启动与在web.xml中对载入次序的定义有关。DispatcherServlet会建立自己的上下文来持有Spring MVC的Bean对象，在建立这个自己持有的IoC容器时，会**从ServletContext中得到根上下文**作为DispatcherServlet持有上下文的双亲上下文。有了这个根上下文，再对自己持有的上下文进行初始化，最后把自己持有的这个上下文保存到ServletContext中，供以后检索和使用。

为了解这个过程，可以从DispatcherServlet的父类FrameworkServlet的代码入手，去探寻DispatcherServlet的启动过程，它同时也是SpringMVC的启动过程。ApplicationContext的创建过程和ContextLoader创建根上下文的过程有许多类似的地方。下面来看一下这个DispatcherServlet类的继承关系。

![avatar](/images/springMVC/DispatcherServlet的继承关系.png)

DispatcherServlet通过继承FrameworkServlet和HttpServletBean而继承了HttpServlet，通过使用Servlet API来对HTTP请求进行响应，成为Spring MVC的前端处理器，同时成为MVC模块与Web容器集成的处理前端。

DispatcherServlet的工作大致可以分为两个部分：一个是初始化部分，由initServletBean()启动，通过initWebApplicationContext()方法最终调用DispatcherServlet的initStrategies()方法，在这个方法里，DispatcherServlet对MVC模块的其他部分进行了初始化，比如handlerMapping、ViewResolver等；另一个是对HTTP请求进行响应，作为一个Servlet，Web容器会调用Servlet的doGet()和doPost()方法，在经过FrameworkServlet的processRequest()简单处理后，会调用DispatcherServlet的doService()方法，在这个方法调用中封装了doDispatch()，这个doDispatch()是Dispatcher实现MVC模式的主要部分，下图为DispatcherServlet的处理过程时序图。

![avatar](/images/springMVC/DispatcherServlet的处理过程.png)

## 3 DispatcherServlet的启动和初始化
前面大致描述了Spring MVC的工作流程，下面看一下DispatcherServlet的启动和初始化的代码设计及实现。

作为Servlet，DispatcherServlet的启动与Servlet的启动过程是相联系的。在Servlet的初始化过程中，Servlet的init()方法会被调用，以进行初始化，DispatcherServlet的基类HttpServletBean实现了该方法。在初始化开始时，需要读取配置在ServletContext中的Bean属性参数，这些属性参数设置在web.xml的Web容器初始化参数中。使用编程式的方式来设置这些Bean属性，在这里可以看到对PropertyValues和BeanWrapper的使用。对于这些和依赖注人相关的类的使用，在分析IoC容器的初始化时，尤其是在依赖注入实现分析时，有过“亲密接触”。只是这里的依赖注人是与Web容器初始化相关的。

接着会执行DispatcherServlet持有的IoC容器的初始化过程，在这个初始化过程中，一个新的上下文被建立起来，这个DispatcherServlet持有的上下文被设置为根上下文的子上下文。一个Web应用中可以容纳多个Servlet存在；与此相对应，对于应用在Web容器中的上下体系，一个根上下文可以作为许多Servlet上下文的双亲上下文。了解IoC工作原理的读者知道，在向IoC容器getBean()时，IoC容器会首先向其双亲上下文去getBean()，也就是说，在根上下文中定义的Bean是可以被各个Servlet持有的上下文得到和共享的。DispatcherServlet持有的 上下文被建立起来以后，也需要和其他IoC容器一样完成初始化，这个初始化也是通过refresh()方法来完成的。最后，DispatcherServlet给这个自己持有的上下文命名，并把它设置到Web容器的上下文中，这个名称和在web.xml中设置的DispatcherServlet的Servlet名称有关，从而保证了这个上下文在Web环境上下文体系中的唯一性。
```java
public abstract class HttpServletBean extends HttpServlet implements EnvironmentCapable, EnvironmentAware {
	public final void init() throws ServletException {
		if (logger.isDebugEnabled()) {
			logger.debug("Initializing servlet '" + getServletName() + "'");
		}

		// 获取Servlet的初始化参数，对bean属性进行配置
		try {
			PropertyValues pvs = new ServletConfigPropertyValues(getServletConfig(), this.requiredProperties);
			BeanWrapper bw = PropertyAccessorFactory.forBeanPropertyAccess(this);
			ResourceLoader resourceLoader = new ServletContextResourceLoader(getServletContext());
			bw.registerCustomEditor(Resource.class, new ResourceEditor(resourceLoader, getEnvironment()));
			initBeanWrapper(bw);
			bw.setPropertyValues(pvs, true);
		}
		catch (BeansException ex) {
			logger.error("Failed to set bean properties on servlet '" + getServletName() + "'", ex);
			throw ex;
		}

		// 这个方法会调用子类的实现，进行具体的初始化
		initServletBean();

		if (logger.isDebugEnabled()) {
			logger.debug("Servlet '" + getServletName() + "' configured successfully");
		}
	}
}


public abstract class FrameworkServlet extends HttpServletBean {
	/** 此servlet的WebApplicationContext */
	private WebApplicationContext webApplicationContext;

	/** 我们是否应该将当前Servlet的上下文webApplicationContext设为ServletContext的属性 */
	private boolean publishContext = true;

	public FrameworkServlet() {
	}
	
	public FrameworkServlet(WebApplicationContext webApplicationContext) {
		this.webApplicationContext = webApplicationContext;
	}
	
	/**
	 * 覆盖了父类HttpServletBean的空实现
	 */
	@Override
	protected final void initServletBean() throws ServletException {
		getServletContext().log("Initializing Spring FrameworkServlet '" + getServletName() + "'");
		if (this.logger.isInfoEnabled()) {
			this.logger.info("FrameworkServlet '" + getServletName() + "': initialization started");
		}
		long startTime = System.currentTimeMillis();

		try {
			// 初始化上下文
			this.webApplicationContext = initWebApplicationContext();
			initFrameworkServlet();
		}
		catch (ServletException ex) {
			this.logger.error("Context initialization failed", ex);
			throw ex;
		}
		catch (RuntimeException ex) {
			this.logger.error("Context initialization failed", ex);
			throw ex;
		}

		if (this.logger.isInfoEnabled()) {
			long elapsedTime = System.currentTimeMillis() - startTime;
			this.logger.info("FrameworkServlet '" + getServletName() + "': initialization completed in " +
					elapsedTime + " ms");
		}
	}

	/**
	 * 为这个Servlet初始化一个公共的WebApplicationContext实例
	 */
	protected WebApplicationContext initWebApplicationContext() {
		// 获取 根上下文 作为当前MVC上下文的双亲上下文，这个根上下文保存在ServletContext中
		WebApplicationContext rootContext =
				WebApplicationContextUtils.getWebApplicationContext(getServletContext());
		WebApplicationContext wac = null;

		if (this.webApplicationContext != null) {
			// 可以在本对象被构造时注入一个webApplicationContext实例
			wac = this.webApplicationContext;
			if (wac instanceof ConfigurableWebApplicationContext) {
				ConfigurableWebApplicationContext cwac = (ConfigurableWebApplicationContext) wac;
				if (!cwac.isActive()) {
					// 上下文尚未刷新 -> 提供诸如设置父上下文、设置应用程序上下文id等服务
					if (cwac.getParent() == null) {
						// 上下文实例在没有显式父实例的情况下被注入 -> 
						// 将根上下文（如果有的话；可以为空）设置为父上下文
						cwac.setParent(rootContext);
					}
					configureAndRefreshWebApplicationContext(cwac);
				}
			}
		}
		if (wac == null) {
			// 在本对象被构造时没有注入上下文实例 -> 
			// 查看是否已在servlet上下文中注册了上下文实例。
			// 如果存在一个，则假定父上下文（如果有的话）已经被设置，
			// 并且用户已经执行了任何初始化，例如设置上下文ID
			wac = findWebApplicationContext();
		}
		if (wac == null) {
			// 没有为此servlet定义上下文实例 -> 创建本地实例
			wac = createWebApplicationContext(rootContext);
		}

		if (!this.refreshEventReceived) {
			// 上下文 不是支持刷新的ConfigurableApplicationContext，或者
			// 在构造时注入的上下文已经完成刷新 -> 在此处手动触发onRefresh()方法
			onRefresh(wac);
		}

		if (this.publishContext) {
			// 把当前建立的上下文保存到ServletContext中，使用的属性名是和当前servlet名相关的
			String attrName = getServletContextAttributeName();
			getServletContext().setAttribute(attrName, wac);
			if (this.logger.isDebugEnabled()) {
				this.logger.debug("Published WebApplicationContext of servlet '" + getServletName() +
						"' as ServletContext attribute with name [" + attrName + "]");
			}
		}

		return wac;
	}
}
```
至此，这个MVC的上下文就建立起来了，具体取得根上下文的过程在WebApplicationContextUtils中实现。这个根上下文是ContextLoader设置到ServletContext中去的，使用的属性是ROOT_WEB_APPLICATION_CONTEXT_ATTRIBUTE，ContextLoader还对这个IoC容器的Bean配置文件进行了设置，默认的位置是在/WEB-INF/applicationContext.xml文件中。由于这个根上下文是DispatcherServlet建立的上下文的 双亲上下文，所以根上下文中管理的Bean也可以被DispatcherServlet的上下文使用。通过getBean()向IoC容器获取Bean时，容器会先到它的双亲IoC容器中获取。
```java
/**
 * 这是一个封装了很多静态方法的抽象工具类，所以只能调用其静态方法，
 * 不能对其进行实例化
 */
public abstract class WebApplicationContextUtils {
	/**
	 * 使用了WebApplicationContext的ROOT_WEB_APPLICATION_CONTEXT_ATTRIBUTE属性，获取
	 * ServletContext中的根上下文，这个属性代表的根上下文在ContextLoaderListener初始化的
	 * 过程中被建立
	 */
	public static WebApplicationContext getWebApplicationContext(ServletContext sc) {
		return getWebApplicationContext(sc, WebApplicationContext.ROOT_WEB_APPLICATION_CONTEXT_ATTRIBUTE);
	}

	/**
	 * 查找此web应用程序的自定义WebApplicationContext
	 */
	public static WebApplicationContext getWebApplicationContext(ServletContext sc, String attrName) {
		Assert.notNull(sc, "ServletContext must not be null");
		Object attr = sc.getAttribute(attrName);
		if (attr == null) {
			return null;
		}
		if (attr instanceof RuntimeException) {
			throw (RuntimeException) attr;
		}
		if (attr instanceof Error) {
			throw (Error) attr;
		}
		if (attr instanceof Exception) {
			throw new IllegalStateException((Exception) attr);
		}
		if (!(attr instanceof WebApplicationContext)) {
			throw new IllegalStateException("Context attribute is not of type WebApplicationContext: " + attr);
		}
		return (WebApplicationContext) attr;
	}
)
```
回到FrameworkServlet的实现中来看一下，DispatcherServlet的上下文是怎样建立的，这个建立过程与前面建立根上下文的过程非常类似。建立DispatcherServlet的上下文，需要把根上下文作为参数传递给它。然后使用反射技术来实例化上下文对象，并为它设置参数。根据默认的配置，这个上下文对象也是XmlWebApplicationContext对象，这个类型是在DEFAULT_CONTEXT_CLASS参数中设置好并允许BeanUtilis使用的。在实例化结束后，需要为这个上下文对象设置好一些基本的配置，这些配置包括它的双亲上下文、Bean配置文件的位置等。完成这些配置以后，最后通过调用IoC容器的refresh()方法来完成IoC容器的最终初始化，这和前面我们对IoC容器实现原理的分析中所看到的IoC容器初始化的过程是一致的。
```java
public abstract class FrameworkServlet extends HttpServletBean {

	/**
	 * 为此servlet实例化一个WebApplicationContext，可以是默认的XmlWebApplicationContext，
	 * 也可以是用户设置的自定义Context上下文
	 */
	protected WebApplicationContext createWebApplicationContext(WebApplicationContext parent) {
		return createWebApplicationContext((ApplicationContext) parent);
	}

	protected WebApplicationContext createWebApplicationContext(ApplicationContext parent) {
		// 默认为XmlWebApplicationContext.class
		Class<?> contextClass = getContextClass();
		if (this.logger.isDebugEnabled()) {
			this.logger.debug("Servlet with name '" + getServletName() +
					"' will try to create custom WebApplicationContext context of class '" +
					contextClass.getName() + "'" + ", using parent context [" + parent + "]");
		}
		if (!ConfigurableWebApplicationContext.class.isAssignableFrom(contextClass)) {
			throw new ApplicationContextException(
					"Fatal initialization error in servlet with name '" + getServletName() +
					"': custom WebApplicationContext class [" + contextClass.getName() +
					"] is not of type ConfigurableWebApplicationContext");
		}
		// 实例化需要的上下文对象，并为其设置属性
		ConfigurableWebApplicationContext wac =
				(ConfigurableWebApplicationContext) BeanUtils.instantiateClass(contextClass);

		wac.setEnvironment(getEnvironment());
		// 这里设置的 双亲上下文，就是在ContextLoader中建立的根上下文
		wac.setParent(parent);
		wac.setConfigLocation(getContextConfigLocation());

		// 配置并且刷新wac
		configureAndRefreshWebApplicationContext(wac);

		return wac;
	}

	protected void configureAndRefreshWebApplicationContext(ConfigurableWebApplicationContext wac) {
		if (ObjectUtils.identityToString(wac).equals(wac.getId())) {
			// 应用程序上下文id仍设置为其原始默认值，如果该id不为空的话
			if (this.contextId != null) {
				wac.setId(this.contextId);
			}
			else {
				// 生成默认的id
				ServletContext sc = getServletContext();
				if (sc.getMajorVersion() == 2 && sc.getMinorVersion() < 5) {
					// 当Servlet<=2.4：如果有，请使用web.xml中指定的名称。
					String servletContextName = sc.getServletContextName();
					if (servletContextName != null) {
						wac.setId(ConfigurableWebApplicationContext.APPLICATION_CONTEXT_ID_PREFIX + servletContextName +
								"." + getServletName());
					}
					else {
						wac.setId(ConfigurableWebApplicationContext.APPLICATION_CONTEXT_ID_PREFIX + getServletName());
					}
				}
				else {
					// Servlet 2.5的getContextPath可用！
					wac.setId(ConfigurableWebApplicationContext.APPLICATION_CONTEXT_ID_PREFIX +
							ObjectUtils.getDisplayString(sc.getContextPath()) + "/" + getServletName());
				}
			}
		}

		// 设置其它配置信息
		wac.setServletContext(getServletContext());
		wac.setServletConfig(getServletConfig());
		wac.setNamespace(getNamespace());
		wac.addApplicationListener(new SourceFilteringListener(wac, new ContextRefreshListener()));

		// 在刷新上下文的任何情况下，都将会调用wac环境的initPropertySources()方法。
		// 在此处执行此方法，以确保在刷新上下文之前，servlet属性源已准备就绪
		ConfigurableEnvironment env = wac.getEnvironment();
		if (env instanceof ConfigurableWebEnvironment) {
			((ConfigurableWebEnvironment)env).initPropertySources(getServletContext(), getServletConfig());
		}

		postProcessWebApplicationContext(wac);

		applyInitializers(wac);

		// IoC容器都是通过该方法完成 容器初始化的
		wac.refresh();
	}
}
```
这时候DispatcherServlet中的IoC容器已经建立起来了，这个IoC容器是 根上下文 的子容器。如果要查找一个由DispatcherServlet所持有的IoC容器来管理的Bean，系统会首先到 根上下文 中去查找。如果查找不到，才会到DispatcherServlet所管理的IoC容器去进行查找，这是由IoC容器getBean()的实现来决定的。通过一系列在Web容器中执行的动作，在这个上下文体系建立和初始化完毕的基础上，Spring MVC就可以发挥其作用了。下面来分析一下Spring MVC的具体实现。

在前面分析DispatchServlet的初始化过程中可以看到，DispatchServlet持有一个以自己的Servlet名称命名的IoC容器。这个IoC容器是一个WebApplicationContext对象，这个IoC容器建立起来以后，意味着DispatcherServlet拥有自己的Bean定义空间，这为使用各个独立的XML文件来配置MVC中各个Bean创造了条件。由于在初始化结束以后，与Web容器相关的加载过程实际上已经完成了，SpringMVC的具体实现和普通的Spring应用程序的实现并没有太大的差别。

在DispatcherServlet的初始化过程中，以对HandlerMapping的初始化调用作为触发点，了解SpringMVC模块初始化的方法调用关系。这个调用关系最初是由HttpServletBean的init()方法触发的，这个HttpServletBean是HttpServlet的子类。接着会在HttpServletBean的子类FrameworkServlet中对IoC容器完成初始化，在这个初始化方法中，会调用DispatcherServlet的initStrategies()方法，该方法包括对各种MVC框架的实现元素，比如支持国际化的LocalResolver、支持request映射的HandlerMappings，以及视图生成的ViewResolver等。由该方法启动整个Spring MVC框架的初始化。
```java
public class DispatcherServlet extends FrameworkServlet {
	/**
	 * 初始化此servlet使用的策略对象。
	 * 可以在子类中重写，以便初始化进一步的策略对象（U8C）
	 */
	protected void initStrategies(ApplicationContext context) {
		// 请求解析
		initMultipartResolver(context);
		// 多语言，国际化
		initLocaleResolver(context);
		// 主题view层
		initThemeResolver(context);
		// 解析url和Method的对应关系
		initHandlerMappings(context);
		// 适配器匹配
		initHandlerAdapters(context);
		// 异常解析
		initHandlerExceptionResolvers(context);
		// 视图转发，根据视图名字匹配到一个具体模板
		initRequestToViewNameTranslator(context);
		// 解析模板中的内容
		initViewResolvers(context);

		initFlashMapManager(context);
	}
}
```
对于具体的初始化过程，根据上面的方法名称，很容易理解。以HandlerMapping为例来说明这个initHandlerMappings()过程。这里的Mapping关系的作用是，为HTTP请求找到相应的Controller控制器，从而利用这些控制器Controller去完成设计好的数据处理工作。

HandlerMappings完成对MVC中Controller的定义和配置，只不过在Web这个特定的应用环境中，这些控制器是与具体的HTTP请求相对应的。在HandlerMapping初始化的过程中，把在Bean配置文件中配置好的HandlerMapping从IoC容器中取得。
```java
	/**
	 * 初始化此类使用的HandlerMappings。
	 * 如果在BeanFactory中没有为此命名空间定义的HandlerMapping bean，则默认为BeanNameUrlHandlerMapping
	 */
	private void initHandlerMappings(ApplicationContext context) {
		this.handlerMappings = null;

		// 这个detectAllHandlerMappings默认为true，表示从所有的IoC容器中获取所有的HandlerMappings
		if (this.detectAllHandlerMappings) {
			// 查找所有的HandlerMapping，从应用上下文context及其双亲上下文中
			Map<String, HandlerMapping> matchingBeans = BeanFactoryUtils.beansOfTypeIncludingAncestors(
					context, HandlerMapping.class, true, false);
			if (!matchingBeans.isEmpty()) {
				this.handlerMappings = new ArrayList<HandlerMapping>(
						matchingBeans.values());
				// 保持HandlerMappings的有序性
				OrderComparator.sort(this.handlerMappings);
			}
		}
		else {
			try {
				// 根据名称从当前的IoC容器中通过getBean()获取HandlerMapping
				HandlerMapping hm = context.getBean(HANDLER_MAPPING_BEAN_NAME,
						HandlerMapping.class);
				this.handlerMappings = Collections.singletonList(hm);
			}
			catch (NoSuchBeanDefinitionException ex) {
				// 忽略，稍后将添加默认的HandlerMapping
			}
		}

		// 如果找不到其他映射，请通过注册默认的HandlerMapping确保至少有一个HandlerMapping
		if (this.handlerMappings == null) {
			this.handlerMappings = getDefaultStrategies(context, HandlerMapping.class);
			if (logger.isDebugEnabled()) {
				logger.debug("No HandlerMappings found in servlet '" + getServletName()
						+ "': using default");
			}
		}
	}
```
经过以上读取过程，handlerMappings变量就已经获取了在Bean中配置好的映射关系。其他的初始化过程和handlerMappings比较类似，都是直接从IoC容器中读入配置，所以这里的MVC初始化过程是建立在IoC容器已经初始化完成的基础上的。

## 4 SpringMVC处理分发HTTP请求
### 4.1 HandlerMapping的配置和设计原理



### 4.2 使用HandlerMapping完成请求的映射处理



### 4.3 DispatcherServlet对HTTP请求的分发处理



