# Spring Security自定义用户认证

在**Spring Boot中开启Spring Security**一节中我们简单地搭建了一个Spring Boot + Spring Security的项目，其中登录页、用户名和密码都是由Spring Security自动生成的。Spring Security支持我们自定义认证的过程，如使用自定义的登录页替换默认的登录页，用户信息的获取逻辑、登录成功或失败后的处理逻辑等。这里将在上一节的源码基础上进行改造。

## 配置自定义登录页

为了方便起见，我们直接在<strong><i>src/main/resources/resources</strong></i>目录下创建一个<strong><i>login.html</strong></i>（不需要Controller跳转）：

```
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>登录</title>
    <link rel="stylesheet" href="css/login.css" type="text/css">
</head>
<body>
    <form class="login-page" action="/login" method="post">
        <div class="form">
            <h3>账户登录</h3>
            <input type="text" placeholder="用户名" name="username" required="required" />
            <input type="password" placeholder="密码" name="password" required="required" />
            <button type="submit">登录</button>
        </div>
    </form>
</body>
</html>
```

要怎么做才能让Spring Security跳转到我们自己定义的登录页面呢？很简单，只需要在<strong><i>BrowserSecurityConfig</strong></i>的<strong><i>configure</strong></i>中添加一些配置：

```
@Configuration
public class BrowserConfig extends WebSecurityConfigurerAdapter {
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http.formLogin() // 表单登录
                .loginPage("/login.html") // 自定义登录页
                .loginProcessingUrl("/login") // 登录认证路径
                .and()
                .authorizeRequests() // 授权配置
                .antMatchers("/login.html", "/css/</strong></i>", "/error").permitAll() // 无需认证
                .anyRequest().authenticated() // 除antMatchers中配置路径外其他所有请求都需要认证
                .and().csrf().disable();
    }
}
```

上面代码中<strong><i>.loginPage("/login.html")</strong></i>指定了跳转到登录页面的请求URL，<strong><i>.loginProcessingUrl("/login")</strong></i>对应登录页面form表单的<strong><i>action="/login"</strong></i>，<strong><i>.antMatchers("/login.html", "/css/", "/error").permitAll()</strong></i>表示跳转到登录页面的请求不被拦截。

这时候启动系统，访问<strong><i>http://localhost:8080/hello</strong></i>，会看到页面已经被重定向到了<strong><i>http://localhost:8080/login.html</strong></i>： 

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\d6bd19a2-08d3-4ba6-921c-5b5f57370a16.jpg)

## 源码解析

### BrowserConfig配置解析

我们首先来梳理下<strong><i>BrowserConfig</strong></i>中的配置是如何被Spring Security所加载的。

首先找到调用<strong><i>BrowserConfig</strong></i>的<strong><i>configure()</strong></i>的地方，在其父类<strong><i>WebSecurityConfigurerAdapter</strong></i>的<strong><i>getHttp()</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\12629a18-56ef-4286-9ab9-c124dc3d6791.png)

往上一步找到调用<strong><i>getHttp()</strong></i>的地方，在同个类的<strong><i>init()</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\2b54af34-7d68-4f40-8726-d02d18e03dea.png)

往上一步找到调用<strong><i>init()</strong></i>的地方，在<strong><i>AbstractConfiguredSecurityBuilder</strong></i>的<strong><i>init()</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\6e009bf1-aba3-4b89-8e86-d3d110e0f4a7.png)

在<strong><i>init()</strong></i>被调用时，它首先会遍历<strong><i>getConfigurers()</strong></i>返回的集合中的元素，调用其<strong><i>init()</strong></i>，点击<strong><i>getConfigurers()</strong></i>查看，发现其读取的是<strong><i>configurers</strong></i>属性的值，那么<strong><i>configurers</strong></i>是什么时候被赋值的呢？我们在同个类的<strong><i>add()</strong></i>中找到<strong><i>configurers</strong></i>被赋值的代码：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\ed65fd2a-8a9f-4808-bc16-36128b4af47a.png)

往上一步找到调用<strong><i>add()</strong></i>的地方，在同个类的<strong><i>apply()</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\1e929fec-d1ab-44b5-89bc-6e5ebcda1daf.png)

往上一步找到调用<strong><i>apply()</strong></i>的地方，在<strong><i>WebSecurityConfiguration</strong></i>的<strong><i>setFilterChainProxySecurityConfigurer()</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\1840f96a-6a31-4fce-8a98-02fa7fc60fbf.png)

我们可以看到，在<strong><i>setFilterChainProxySecurityConfigurer()</strong></i>中，首先会实例化一个<strong><i>WebSecurity</strong></i>（<strong><i>AbstractConfiguredSecurityBuilder</strong></i>的实现类）的实例，遍历参数<strong><i>webSecurityConfigurers</strong></i>，将存储在其中的元素作为参数传递给<strong><i>WebSecurity</strong></i>的<strong><i>apply()</strong></i>，那么<strong><i>webSecurityConfigurers</strong></i>是什么时候被赋值的呢？我们根据<strong><i>@Value</strong></i>中的信息找到<strong><i>webSecurityConfigurers</strong></i>被赋值的地方，在<strong><i>AutowiredWebSecurityConfigurersIgnoreParents</strong></i>的<strong><i>getWebSecurityConfigurers()</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\eb7a5916-4049-4682-9a11-10f1f1f94c74.png)

我们重点看第二句代码，可以看到这里会提取存储在bean工厂中类型为<strong><i>WebSecurityConfigurer.class</strong></i>的bean，而<strong><i>BrowserConfig</strong></i>正是<strong><i>WebSecurityConfigurerAdapter</strong></i>的实现类。

解决完<strong><i>configurers</strong></i>的赋值问题，我们回到<strong><i>AbstractConfiguredSecurityBuilder</strong></i>的<strong><i>init()</strong></i>处，找到调用该方法的地方，在同个类的<strong><i>doBuild()</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\522574e3-bacc-4794-a17e-492bc2b4457d.png)

往上一步找到调用<strong><i>doBuild()</strong></i>的地方，在<strong><i>AbstractSecurityBuilder</strong></i>的<strong><i>build()</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\fb22f2ca-3d9a-420f-b77a-f9c0f737d9ad.png)

往上一步找到调用<strong><i>doBuild()</strong></i>的地方，在<strong><i>WebSecurityConfiguration</strong></i>的<strong><i>springSecurityFilterChain()</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\a5c61feb-ca72-4768-94bd-1b0a8cf8af70.png)

至此，我们分析完了<strong><i>BrowserConfig</strong></i>被Spring Security加载的过程。现在我们再来看看当我们自定义的配置被加载完后，<strong><i>http</strong></i>各属性的变化，在<strong><i>BrowserConfig</strong></i>的<strong><i>configure()</strong></i>末尾打上断点，当程序走到断点处时，查看<strong><i>http</strong></i>属性：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\6c72c09b-742c-4415-851a-8ca5292a4969.png)

我们配置的<strong><i>.loginPage("/login.html")</strong></i>和<strong><i>.loginProcessingUrl("/login")</strong></i>在<strong><i>FormLoginConfigurer</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\51ba02f0-bae6-4c08-9adf-7ee0f12b05d3.png)

配置的<strong><i>.antMatchers("/login.html", "/css/", "/error").permitAll()</strong></i>在<strong><i>ExpressionUrlAuthorizationConfigurer</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\52390725-d87d-42b1-9071-ea21e445e1e6.png)

这样，当我们访问除<strong><i>"/login.html", "/css/", "/error"</strong></i>以外的路径时，在<strong><i>AbstractSecurityInterceptor</strong></i>（<strong><i>FilterSecurityInterceptor</strong></i>的父类）的<strong><i>attemptAuthorization()</strong></i>中会抛出<strong><i>AccessDeniedException</strong></i>异常（最终由<strong><i>AuthenticationTrustResolverImpl</strong></i>的<strong></i>isAnonymous()</strong></i>进行判断）

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\558b8b1c-be32-44c4-8d8f-5f0d231741f8.png)

当我们访问<strong><i>"/login.html", "/css/", "/error"</strong></i>这几个路径时，在<strong><i>AbstractSecurityInterceptor</strong></i>（<strong><i>FilterSecurityInterceptor</strong></i>的父类）的<strong><i>attemptAuthorization()</strong></i>中正常执行（最终由<strong><i>SecurityExpressionRoot</strong></i>的<strong><i>permitAll()</strong></i>进行判断）

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\4612c27e-dd9f-4e60-92dc-fc9858496ec5.png)

### login.html路径解析

当我们请求的资源需要经过认证时，Spring Security会将请求重定向到我们自定义的登录页，那么Spring又是如何找到我们自定义的登录页的呢？下面就让我们来解析一下：

我们首先来到<strong><i>DispatcherServlet</strong></i>中，<strong><i>DispatcherServlet</strong></i>是Spring Web处理请求的入口。当Spring Web项目启动后，第一次接收到请求时，会调用其<strong><i>initStrategies()</strong></i>进行初始化：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\964ec4a4-6039-4205-8a87-ea2febcc00b6.png)

我们重点关注<strong><i>initHandlerMappings(context);</strong></i>这句，<strong><i>initHandlerMappings()</strong></i>用于初始化处理器映射器（处理器映射器可以根据请求找到对应的资源），我们来到<strong><i>initHandlerMappings()</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\0a97b011-34ed-4d57-945e-95c8e6bafc8e.png)

可以看到，当程序走到<strong><i>initHandlerMappings()</strong></i>中时，会从bean工厂中找出<strong><i>HandlerMapping.class</strong></i>类型的bean，将其存储到<strong><i>handlerMappings</strong></i>属性中。这里看到一共找到5个，分别是：<strong><i>requestMappingHandlerMapping</strong></i>（将请求与标注了<strong><i>@RequestMapping</strong></i>的方法进行关联）、<strong><i>weclomePageHandlerMapping</strong></i>（将请求与主页进行关联）、<strong><i>beanNameHandlerMapping</strong></i>（将请求与同名的bean进行关联）、<strong><i>routerFunctionMapping</strong></i>（将请求与<strong><i>RouterFunction</strong></i>进行关联）、<strong><i>resourceHandlerMapping</strong></i>（将请求与静态资源进行关联），这5个bean是在<strong><i>WebMvcAutoConfiguration$EnableWebMvcConfiguration</strong></i>中配置的：

<strong><i>requestMappingHandlerMapping:</strong></i>

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\cd7aee86-66f8-4197-99d1-1c9275e33bee.png)

<strong><i>resourceHandlerMapping:</strong></i>

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\ef28372b-de89-46ff-8679-8b8feca04a7a.png)

<strong><i>beanNameHandlerMapping</strong></i>、<strong><i>routerFunctionMapping</strong></i>、<strong><i>resourceHandlerMapping</strong></i>在<strong><i>EnableWebMvcConfiguration</strong></i>的父类（<strong><i>WebMvcConfigurationSupport</strong></i>）中配置：

<strong><i>beanNameHandlerMapping:</strong></i>

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\8d05ac54-f034-47d4-b750-67b2e3b3cd14.png)

<strong><i>routerFunctionMapping:</strong></i>

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\481b88aa-028d-4392-8c0a-365f1d0e2ae9.png)

<strong><i>resourceHandlerMapping:</strong></i>

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\fcdab503-2735-46bd-a5b6-226dc348e78c.png)

我们将目光锁定在<strong><i>resourceHandlerMapping</strong></i>上，当<strong><i>resourceHandlerMapping</strong></i>被初始化时，会调用<strong><i>addResourceHandlers()</strong></i>为<strong><i>registry</strong></i>添加资源处理器，我们找到实际被调用的<strong><i>addResourceHandlers()</strong></i>，在<strong><i>DelegatingWebMvcConfiguration</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\6eca7b58-80f9-4e98-8483-62b4ef751854.png)

可以看到这里实际调用的是<strong><i>configurers</strong></i>属性的<strong><i>addResourceHandlers()</strong></i>，而<strong><i>configurers</strong></i>是一个final类型的成员变量，其值是<strong><i>WebMvcConfigurerComposite</strong></i>的实例，我们来到<strong><i>WebMvcConfigurerComposite</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\c365e5ab-a7a3-4ebf-8a25-09cd2e049f22.png)

可以看到这里实际调用的是<strong><i>delegates</strong></i>属性的<strong><i>addResourceHandlers()</strong></i>，<strong><i>delegates</strong></i>是一个final类型的集合，集合的元素由<strong><i>addWebMvcConfigurers()</strong></i>负责添加：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\895afead-ea6b-4ac6-8138-fbe0a223daf9.png)

我们找到调用<strong><i>addWebMvcConfigurers()</strong></i>的地方，在<strong><i>DelegatingWebMvcConfiguration</strong></i>的<strong><i>setConfigurers()</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\a20e06a4-5a43-4edf-bea1-53fc9bc929e9.png)

可以看到当<strong><i>setConfigurers()</strong></i>被初始化时，Spring会往参数<strong><i>configurers</strong></i>中传入两个值，我们关注第一个值，是一个<strong><i>WebMvcAutoConfiguration$WebMvcAutoConfigurationAdapter</strong></i>的实例，注意它的属性<strong><i>resourceProperties</strong></i>，是一个<strong><i>WebProperties$Resources</strong></i>的实例，默认情况下，在实例化<strong><i>WebMvcAutoConfigurationAdapter</strong></i>时，由传入参数<strong><i>webProperties</strong></i>进行赋值：<strong><i>webProperties.getResources()</strong></i>：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\97b6f22c-414d-4a16-aa8e-c3deece2f7cd.png)

我们进入参数<strong><i>webProperties</strong></i>的类中，可以看到<strong><i>getResources()</strong></i>是直接实例化了一个<strong><i>Resources</strong></i>，其属性<strong><i>staticLocations</strong></i>是一个含有4个值的final类型的字符串数组，这4个值正是Spring寻找静态文件的地方：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\4d84fe43-2646-4a6f-a580-f39f6416d02d.png)

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\25899949-dac3-4873-a2af-7abfe0e97615.png)

我们回到<strong><i>WebMvcAutoConfiguration</strong></i>的<strong><i>addResourceHandlers()</strong></i>中：![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\003ff2fa-022e-47cb-8aa9-343ed7c40c4a.png)

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\ccd16b38-d724-4c03-949e-3b6ba03268a9.png)

在<strong><i>addResourceHandlers()</strong></i>中，会为<strong><i>registry</strong></i>添加两个资源处理器，当请求路径是“/webjars/”时，会在”classpath:/META-INF/resources/webjars/“路径下寻找对应的资源，当请求路径是“/**”时，会在”classpath:/META-INF/resources/“、”classpath:/resources/“、”classpath:/static/“、”classpath:/public/“路径下寻找对应的资源。

现在我们通过访问<strong><i>http://localhost:8080/login.html</strong></i>来验证这个过程。

请求首先来到<strong><i>DispatcherServlet</strong></i>的<strong><i>doDispatch()</strong></i>中，由于是对静态资源的请求，当程序走到<strong><i>mappedHandler = getHandler(processedRequest);</strong></i>时，通过<strong><i>getHandler()</strong></i>返回<strong><i>SimpleUrlHandlerMapping</strong></i>（即<strong><i>resourceHandlerMapping</strong></i>的类型）的<strong><i>HandlerExecutionChain</strong></i>：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\4c9c302d-2ce0-4b5b-beb6-c76d2e94038f.png)

然后由实际的处理器进行处理：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\1590bae4-2e3a-4f97-b02d-d918c49cac22.png)

程序一路调试，来到<strong><i>ResourceHttpRequestHandler</strong></i>的<strong><i>handleRequest()</strong></i>中，通过调用<strong><i>Resource resource = getResource(request);</strong></i>找到请求对应的资源：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\0879e131-da5f-491e-a153-42770ce8b975.png)

而在<strong><i>getResource()</strong></i>中，实际是将请求路径（即<strong><i>login.html</strong></i>）与前面配置的路径进行拼接（组合成<strong><i>/resources/login.html</strong></i>这样的路径），再通过类加载器来寻找资源。

后面源码深入过深，就不一一展开了，只截取其中比较重要的几段代码：

<strong><i>PathResourceResolver</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\6c58e27d-dd29-48fc-b597-8067e1c97786.png)

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\c7ef78df-c2ab-4f89-b5ad-45561a91ffcc.png)

<strong><i>ClassPathResource</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\42c5125e-0dc2-4c0c-9434-af4a9efd2d5d.png)

<strong><i>ClassLoader</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\7842f83d-5417-4cb2-bb30-d70f98c3053f.png)

<strong><i>URLClassLoader</strong></i>中：

![img](D:\ronaldoc\workspace\source-code-hunter\images\SpringSecurity\870891e9-f8ea-4097-98c9-829b1cdcf145.png)

最终，类加载器会在如上两个路径下找到登录页并返回。

## 参考

1. [Spring Security自定义用户认证](https://mrbird.cc/Spring-Security-Authentication.html)

