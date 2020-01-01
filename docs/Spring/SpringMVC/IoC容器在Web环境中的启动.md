## 1 Web环境中的SpringMVC
在Web环境中，SpringMVC是建立在IoC容器基础上的。了解SpringMVC，首先要了解Spring的IoC容器是如何在Web环境中被载人并起作用的。

Spring的IoC是一个独立模块，它并不直接在Web容器中发挥作用，如果要在Web环境中使用IoC容器，需要Spring为IoC设计一个启动过程，把IoC容器导入，并在Web容器中建立起来。具体说来，这个启动过程是和Web容器的启动过程集成在一起的。在这个过程中，一方面处理Web容器的启动，另一方面通过设计特定的Web容器拦截器，将IoC容器载人到Web环境中来，并将其初始化。在这个过程建立完成以后，IoC容器才能正常工作，而SpringMVC是建立在IoC容器的基础上的，这样才能建立起MVC框架的运行机制，从而响应从Web容器传递的HTTP请求。

下面以Tomcat作为Web容器的例子进行分析。在Tomcat中，web.xml是应用的部署描述文件。在web.xml中常常经常能看到与Spring相关的部署描述。
```xml
<servlet>
	<servlet-name>sample</servlet-name>
	<servlet-class>org.springframework.web.servlet.DispatcherServlet</servlet-class>
	<load-on-startup>6</load-on-startup>
</servlet>
<servlet-mapping>
	<servlet-name>sample</servlet-name>
	<url-pattern>/*</url-pattern>
</servlet-mapping>
<context-param>
	<param-name>contextConfigLocation</param-name>
	<param-value>/WEB-INF/applicationContext.xml</param-value>
</context-param>
<listener>
	<listener-class>org.springframework.web.context.ContextLoaderListener</listener-class>
</listener>
```
web.xml是SpringMVC与Tomcat的接口部分。这个部署描述文件中，首先定义了一个Servlet对象，它是SpringMVC的DispatcherServlet。这个DispatcherServlet是MVC中很重要的一个类，起着分发请求的作用。

同时，在部署描述中，还为这个DispatcherServlet定义了对应的URL映射，以指定这个Servlet需要处理的HTTP请求范围。context-param参数用来指定IoC容器读取Bean的XML文件的路径，在这里，这个配置文件被定义为WEB-INF/applicationContext.xml。其中可以看到Spring应用的Bean配置。

最后，作为Spring MVC的启动类，ContextLoaderListener被定义为一个监听器，这个监听器是与Web服务器的生命周期相关联的，由ContextLoaderListener监听器负责完成 IoC容器在Web环境中的启动工作。

DispatchServlet和ContextLoaderListener提供了在Web容器中对Spring的接口，也就是说，这些接口与Web容器耦合是通过ServletContext来实现的（ServletContext是容器和应用沟通的桥梁，从一定程度上讲ServletContext就是servlet规范的体现）。这个ServletContext为Spring的IoC容器提供了一个宿主环境，在宿主环境中，Spring MVC建立起一个IoC容器的体系。这个IoC容器体系是通过ContextLoaderListener的初始化来建立的，在建立IoC容器体系后，把DispatchServlet作为Spring MVC处理Web请求的转发器建立起来，从而完成响应HTTP请求的准备。有了这些基本配置，建立在IoC容器基础上的SpringMVC就可以正常地发挥作用了。下面我们看一下loC容器在Web容器中的启动代码实现。

## 2 IoC容器启动的基本过程
IoC容器的启动过程就是建立上下文的过程，该上下文是与ServletContext相伴而生的，同时也是IoC容器在Web应用环境中的具体表现之一。由ContextLoaderListener启动的上下文为根上下文。在根上下文的基础上，还有一个与Web MVC相关的上下文用来保存控制器(DispatcherServlet)需要的MVC对象，作为根上下文的子上下文，构成一个层次化的上下文体系。在Web容器中启动Spring应用程序时，首先建立根上下文，然后建立这个上下文体系，这个上下文体系的建立是由ContextLoder来完成的，其UML时序图如下图所示。

![avatar](/images/springMVC/Web容器启动spring应用程序过程图.png)

在web.xml中，已经配置了ContextLoaderListener，它是Spring提供的类，是为在Web容器中建立IoC容器服务的，它实现了ServletContextListener接口，这个接口是在Servlet API中定义的，提供了与Servlet生命周期结合的回调，比如上下文初始化contextInitialized()方法和上下文销毁contextDestroyed()方法。而在Web容器中，建立WebApplicationContext的过程，是在contextInitialized()方法中完成的。另外，ContextLoaderListener还继承了ContextLoader，具体的载入IoC容器的过程是由ContextLoader来完成的。

在ContextLoader中，完成了两个IoC容器建立的基本过程，一个是在Web容器中建立起双亲IoC容器，另一个是生成相应的WebApplicationContext并将其初始化。

## 3 Web容器中的上下文设计
先从Web容器中的上下文入手，看看Web环境中的上下文设置有哪些特别之处，然后再
到ContextLoaderListener中去了解整个容器启动的过程。为了方便在Web环境中使用IoC容器，
Spring为Web应用提供了上下文的扩展接口WebApplicationContext来满足启动过程的需要，其继承关系如下图所示。

![avatar](/images/springMVC/WebApplicationContext接口的类继承关系.png)

在这个类继承关系中，可以从熟悉的XmlWebApplicationContext入手来了解它的接口实现。在接口设计中，最后是通过ApplicationContex接口与BeanFactory接口对接的，而对于具体的功能实现，很多都是封装在其基类AbstractRefreshableWebApplicationContext中完成的。

同样，在源代码中，也可以分析出类似的继承关系，在WebApplicationContext中可以看到相关的常量设计，比如ROOT_ WEB_ APPLICATION_CONTEXT_ATTRIBUTE等，这个常量是用来索引在ServletContext中存储的根上下文的。这个接口类定义的接口方法比较简单，在这个接口中，定义了一
个getServletContext方法，通过这个方法可以得到当前Web容器的Servlet上下文环境，通过
这个方法，相当于提供了一个Web容器级别的全局环境。
```java
public interface WebApplicationContext extends ApplicationContext {

	/**
	 * 该常量用于在ServletContext中存取根上下文
	 */
	String ROOT_WEB_APPLICATION_CONTEXT_ATTRIBUTE = WebApplicationContext.class.getName() + ".ROOT";

	/**
	 * 对于WebApplicationContext来说，需要得到Web容器的ServletContext
	 */
	ServletContext getServletContext();
}
```
在启动过程中，Spring会使用一个默认的WebApplicationContext实现作为IoC容器，这个默认使用的IoC容器就是XmlWebApplicationContext，它继承了ApplicationContext，在ApplicationContext的基础上，增加了对Web环境和XML配置定义的处理。在XmlWebApplicationContext的初始化过程中，Web容器中的IoC容器被建立起来，从而在Web容器中建立起整个Spring应用。与前面博文中分析的IoC容器的初始化一样，这个过程也有loadBeanDefinition对BeanDefinition的载入。在Web环境中，对定位BeanDefinition的Resource有特别的要求，这个要求的处理体现在对getDefaultConfigLocations方法的处理中。这里使用了默认的BeanDefinition的配置路径，这个路径在XmlWebApplicationContext中作为一个常量定义好了，即/WEB-INF/applicationContext.xml。
```java
public class XmlWebApplicationContext extends AbstractRefreshableWebApplicationContext {

	/** 若不指定其它文件，spring默认从"/WEB-INF/applicationContext.xml"目录文件 初始化IoC容器 */
	public static final String DEFAULT_CONFIG_LOCATION = "/WEB-INF/applicationContext.xml";

	/** 默认的配置文件在 /WEB-INF/ 目录下 */
	public static final String DEFAULT_CONFIG_LOCATION_PREFIX = "/WEB-INF/";

	/** 默认的配置文件后缀名为.xml */
	public static final String DEFAULT_CONFIG_LOCATION_SUFFIX = ".xml";

	/**
	 * 此加载过程在 容器refresh()时启动
	 */
	@Override
	protected void loadBeanDefinitions(DefaultListableBeanFactory beanFactory) throws BeansException, IOException {
		// 使用XmlBeanDefinitionReader对指定的BeanFactory进行解析
		XmlBeanDefinitionReader beanDefinitionReader = new XmlBeanDefinitionReader(beanFactory);

		// 初始化beanDefinitionReader的属性，其中，设置ResourceLoader是因为
		// XmlBeanDefinitionReader是DefaultResource的子类，所有这里同样会使用
		// DefaultResourceLoader来定位BeanDefinition
		beanDefinitionReader.setEnvironment(this.getEnvironment());
		beanDefinitionReader.setResourceLoader(this);
		beanDefinitionReader.setEntityResolver(new ResourceEntityResolver(this));

		// 该方法是一个空实现
		initBeanDefinitionReader(beanDefinitionReader);
		// 使用初始化完成的beanDefinitionReader来加载BeanDefinitions
		loadBeanDefinitions(beanDefinitionReader);
	}

	protected void initBeanDefinitionReader(XmlBeanDefinitionReader beanDefinitionReader) {
	}

	/**
	 * 获取所有的配置文件，然后一个一个载入BeanDefinition
	 */
	protected void loadBeanDefinitions(XmlBeanDefinitionReader reader) throws IOException {
		String[] configLocations = getConfigLocations();
		if (configLocations != null) {
			for (String configLocation : configLocations) {
				reader.loadBeanDefinitions(configLocation);
			}
		}
	}

	/**
	 * 获取默认路径"/WEB-INF/***.xml"下的配置文件，
	 * 或者获取"/WEB-INF/applicationContext.xml"配置文件
	 */
	@Override
	protected String[] getDefaultConfigLocations() {
		if (getNamespace() != null) {
			return new String[] {DEFAULT_CONFIG_LOCATION_PREFIX + getNamespace() + DEFAULT_CONFIG_LOCATION_SUFFIX};
		}
		else {
			return new String[] {DEFAULT_CONFIG_LOCATION};
		}
	}
}
```
从上面的代码中可以看到，在XmlWebApplicationContext中，基本的上下文功能都已经通过类的继承获得，这里需要处理的是，如何获取Bean定义信息，在这里，就转化为如何在Web容器环境中获得Bean定义信息。在获得Bean定义信息之后，后面的过程基本上就和前面分析的XmlFileSystemBeanFactory一样，是通过XmlBeanDefinitionReader来载人Bean定义信息的，最终完成整个上下文的初始化过程。
## 4 ContextLoader的设计与实现
对于Spring承载的Web应用而言，可以指定在Web应用程序启动时载入IoC容器（或者称为WebApplicationContext）。这个功能是由ContextLoaderListener这样的类来完成的，它是在Web容器中配置的监听器。这个ContextLoaderListener通过使用ContextLoader来完成实际的WebApplicationContext，也就是IoC容器的初始化工作。这个ContextLoader就像Spring应用程序在Web容器中的启动器。这个启动过程是在Web容器中发生的，所以需要根据Web容器部署的要求来定义ContextLoader，相关的配置在概述中已经看到了，这里就不重复了。

为了了解IoC容器在Web容器中的启动原理，这里对启动器ContextLoaderListener的实现进行分析。这个监听器是启动根IoC容器并把它载入到Web容器的主要功能模块，也是整个Spring Web应用加载IoC的第一个地方。从加载过程可以看到，首先从Servlet事件中得到ServletContext，然后可以读取配置在web.xml中的各个相关的属性值，接着ContextLoader会实例化WebApplicationContext，并完成其载人和初始化过程。这个被初始化的第一个上下文，作为根上下文而存在，这个根上下文载入后，被绑定到Web应用程序的ServletContext上。任何需要访问根上下文的应用程序代码都可以从WebApplicationContextUtils类的静态方法中得到。

下面分析具体的根上下文的载人过程。在ContextLoaderListener中，实现的是ServletContextListener接口，这个接口里的函数会结合Web容器的生命周期被调用。因为ServletContextListener是ServletContext的监听者，如果ServletContext发生变化，会触发出相应的事件，而监听器一直在对这些事件进行监听，如果接收到了监听的事件，就会做出预先设计好的响应动作。由于ServletContext的变化而触发的监听器的响应具体包括:在服务器启动时，ServletContext被创建的时候，服务器关闭时，ServletContext将被销毁的时候等。对应这些事件及Web容器状态的变化，在监听器中定义了对应的事件响应的回调方法。比如，在服务器启动时，ServletContextListener的contextInitialized()方法被调用，服务器将要关闭时，ServletContextListener的contextDestroyed()方法被调用。了解了Web容器中监听器的工作原理，下面看看服务器启动时 ContextLoaderListener的调用完成了什么。在这个初始化回调中，创建了ContextLoader，同时会利用创建出来的ContextLoader来完成IoC容器的初始化。












