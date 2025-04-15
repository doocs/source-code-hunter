# Spring Security 自定义用户认证

在**Spring Boot 中开启 Spring Security**一节中我们简单地搭建了一个 Spring Boot + Spring Security 的项目，其中登录页、用户名和密码都是由 Spring Security 自动生成的。Spring Security 支持我们自定义认证的过程，如使用自定义的登录页替换默认的登录页，用户信息的获取逻辑、登录成功或失败后的处理逻辑等。这里将在上一节的源码基础上进行改造。

## 配置自定义登录页

为了方便起见，我们直接在`src/main/resources/resources`目录下创建一个`login.html`（不需要 Controller 跳转）：

```html
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

要怎么做才能让 Spring Security 跳转到我们自己定义的登录页面呢？很简单，只需要在 `BrowserSecurityConfig` 的 `configure` 中添加一些配置：

```java
@Configuration
public class BrowserConfig extends WebSecurityConfigurerAdapter {

    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http.formLogin() // 表单登录
                .loginPage("/login.html") // 自定义登录页
                .loginProcessingUrl("/login") // 登录认证路径
                .and()
                .authorizeRequests() // 授权配置
                .antMatchers("/login.html", "/css/**", "/error").permitAll() // 无需认证
                .anyRequest().authenticated() // 其他所有请求都需要认证
                .and()
                .csrf().disable(); // 禁用 CSRF
    }
}
```

上面代码中`.loginPage("/login.html")`指定了跳转到登录页面的请求 URL，`.loginProcessingUrl("/login")`对应登录页面 form 表单的`action="/login"`，`.antMatchers("/login.html", "/css/", "/error").permitAll()`表示跳转到登录页面的请求不被拦截。

这时候启动系统，访问`http://localhost:8080/hello`，会看到页面已经被重定向到了`http://localhost:8080/login.html`：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/d6bd19a2-08d3-4ba6-921c-5b5f57370a16.jpg)

## 配置用户信息的获取逻辑

Spring Security 默认会为我们生成一个用户名为 user，密码随机的用户实例，当然我们也可以定义自己用户信息的获取逻辑，只需要实现 Spring Security 提供的**_UserDetailService_**接口即可，该接口只有一个抽象方法**_loadUserByUsername_**，具体实现如下：

```java
@Service
public class UserDetailService implements UserDetailsService {
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        return new User(username, passwordEncoder.encode("123456"), AuthorityUtils.createAuthorityList("admin"));
    }
}
```

通过以上配置，我们定义了一个用户名随机，密码统一为 123456 的用户信息的获取逻辑。这样，当我们启动项目，访问`http://localhost:8080/login`，只需要输入任意用户名以及 123456 作为密码即可登录系统。

## 源码解析

### BrowserConfig 配置解析

我们首先来梳理下 `BrowserConfig` 中的配置是如何被 Spring Security 所加载的。

首先找到调用 `BrowserConfig` 的 `configure()` 的地方，在其父类 `WebSecurityConfigurerAdapter` 的 `getHttp()` 中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/12629a18-56ef-4286-9ab9-c124dc3d6791.png)

往上一步找到调用 `getHttp()` 的地方，在同个类的 `init()` 中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/2b54af34-7d68-4f40-8726-d02d18e03dea.png)

往上一步找到调用`init()`的地方，在 `AbstractConfiguredSecurityBuilder` 的`init()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/6e009bf1-aba3-4b89-8e86-d3d110e0f4a7.png)

在`init()`被调用时，它首先会遍历`getConfigurers()`返回的集合中的元素，调用其`init()`，点击`getConfigurers()`查看，发现其读取的是`configurers`属性的值，那么`configurers`是什么时候被赋值的呢？我们在同个类的`add()`中找到`configurers`被赋值的代码：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/ed65fd2a-8a9f-4808-bc16-36128b4af47a.png)

往上一步找到调用`add()`的地方，在同个类的`apply()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/1e929fec-d1ab-44b5-89bc-6e5ebcda1daf.png)

往上一步找到调用`apply()`的地方，在`WebSecurityConfiguration`的`setFilterChainProxySecurityConfigurer()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/1840f96a-6a31-4fce-8a98-02fa7fc60fbf.png)

我们可以看到，在`setFilterChainProxySecurityConfigurer()`中，首先会实例化一个`WebSecurity`（`AbstractConfiguredSecurityBuilder`的实现类）的实例，遍历参数`webSecurityConfigurers`，将存储在其中的元素作为参数传递给`WebSecurity`的`apply()`，那么`webSecurityConfigurers`是什么时候被赋值的呢？我们根据`@Value`中的信息找到`webSecurityConfigurers`被赋值的地方，在`AutowiredWebSecurityConfigurersIgnoreParents`的`getWebSecurityConfigurers()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/eb7a5916-4049-4682-9a11-10f1f1f94c74.png)

我们重点看第二句代码，可以看到这里会提取存储在 bean 工厂中类型为`WebSecurityConfigurer.class`的 bean，而`BrowserConfig`正是`WebSecurityConfigurerAdapter`的实现类。

解决完`configurers`的赋值问题，我们回到`AbstractConfiguredSecurityBuilder`的`init()`处，找到调用该方法的地方，在同个类的`doBuild()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/522574e3-bacc-4794-a17e-492bc2b4457d.png)

往上一步找到调用`doBuild()`的地方，在`AbstractSecurityBuilder`的`build()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/fb22f2ca-3d9a-420f-b77a-f9c0f737d9ad.png)

往上一步找到调用`doBuild()`的地方，在`WebSecurityConfiguration`的`springSecurityFilterChain()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/a5c61feb-ca72-4768-94bd-1b0a8cf8af70.png)

至此，我们分析完了`BrowserConfig`被 Spring Security 加载的过程。现在我们再来看看当我们自定义的配置被加载完后，`http`各属性的变化，在`BrowserConfig`的`configure()`末尾打上断点，当程序走到断点处时，查看`http`属性：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/6c72c09b-742c-4415-851a-8ca5292a4969.png)

我们配置的`.loginPage("/login.html")`和`.loginProcessingUrl("/login")`在`FormLoginConfigurer`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/51ba02f0-bae6-4c08-9adf-7ee0f12b05d3.png)

配置的`.antMatchers("/login.html", "/css/", "/error").permitAll()`在`ExpressionUrlAuthorizationConfigurer`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/52390725-d87d-42b1-9071-ea21e445e1e6.png)

这样，当我们访问除`"/login.html", "/css/", "/error"`以外的路径时，在`AbstractSecurityInterceptor`（`FilterSecurityInterceptor`的父类）的`attemptAuthorization()`中会抛出`AccessDeniedException`异常（最终由`AuthenticationTrustResolverImpl`的<strong></i>isAnonymous()`进行判断）

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/558b8b1c-be32-44c4-8d8f-5f0d231741f8.png)

当我们访问`"/login.html", "/css/", "/error"`这几个路径时，在`AbstractSecurityInterceptor`（`FilterSecurityInterceptor`的父类）的`attemptAuthorization()`中正常执行（最终由`SecurityExpressionRoot`的`permitAll()`进行判断）

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/4612c27e-dd9f-4e60-92dc-fc9858496ec5.png)

### login.html 路径解析

当我们请求的资源需要经过认证时，Spring Security 会将请求重定向到我们自定义的登录页，那么 Spring 又是如何找到我们自定义的登录页的呢？下面就让我们来解析一下：

我们首先来到`DispatcherServlet`中，`DispatcherServlet`是 Spring Web 处理请求的入口。当 Spring Web 项目启动后，第一次接收到请求时，会调用其`initStrategies()`进行初始化：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/964ec4a4-6039-4205-8a87-ea2febcc00b6.png)

我们重点关注`initHandlerMappings(context);`这句，`initHandlerMappings()`用于初始化处理器映射器（处理器映射器可以根据请求找到对应的资源），我们来到`initHandlerMappings()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/0a97b011-34ed-4d57-945e-95c8e6bafc8e.png)

可以看到，当程序走到`initHandlerMappings()`中时，会从 bean 工厂中找出`HandlerMapping.class`类型的 bean，将其存储到`handlerMappings`属性中。这里看到一共找到 5 个，分别是：`requestMappingHandlerMapping`（将请求与标注了`@RequestMapping`的方法进行关联）、`weclomePageHandlerMapping`（将请求与主页进行关联）、`beanNameHandlerMapping`（将请求与同名的 bean 进行关联）、`routerFunctionMapping`（将请求与`RouterFunction`进行关联）、`resourceHandlerMapping`（将请求与静态资源进行关联），这 5 个 bean 是在`WebMvcAutoConfiguration$EnableWebMvcConfiguration`中配置的：

`requestMappingHandlerMapping:`

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/cd7aee86-66f8-4197-99d1-1c9275e33bee.png)

`weclomePageHandlerMapping:`

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/ef28372b-de89-46ff-8679-8b8feca04a7a.png)

`beanNameHandlerMapping`、`routerFunctionMapping`、`resourceHandlerMapping`在`EnableWebMvcConfiguration`的父类（`WebMvcConfigurationSupport`）中配置：

`beanNameHandlerMapping:`

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/8d05ac54-f034-47d4-b750-67b2e3b3cd14.png)

`routerFunctionMapping:`

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/481b88aa-028d-4392-8c0a-365f1d0e2ae9.png)

`resourceHandlerMapping:`

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/fcdab503-2735-46bd-a5b6-226dc348e78c.png)

我们将目光锁定在`resourceHandlerMapping`上，当`resourceHandlerMapping`被初始化时，会调用`addResourceHandlers()`为`registry`添加资源处理器，我们找到实际被调用的`addResourceHandlers()`，在`DelegatingWebMvcConfiguration`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/6eca7b58-80f9-4e98-8483-62b4ef751854.png)

可以看到这里实际调用的是`configurers`属性的`addResourceHandlers()`，而`configurers`是一个 final 类型的成员变量，其值是`WebMvcConfigurerComposite`的实例，我们来到`WebMvcConfigurerComposite`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/c365e5ab-a7a3-4ebf-8a25-09cd2e049f22.png)

可以看到这里实际调用的是`delegates`属性的`addResourceHandlers()`，`delegates`是一个 final 类型的集合，集合的元素由`addWebMvcConfigurers()`负责添加：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/895afead-ea6b-4ac6-8138-fbe0a223daf9.png)

我们找到调用`addWebMvcConfigurers()`的地方，在`DelegatingWebMvcConfiguration`的`setConfigurers()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/a20e06a4-5a43-4edf-bea1-53fc9bc929e9.png)

可以看到当`setConfigurers()`被初始化时，Spring 会往参数`configurers`中传入两个值，我们关注第一个值，是一个`WebMvcAutoConfiguration$WebMvcAutoConfigurationAdapter`的实例，注意它的属性`resourceProperties`，是一个`WebProperties$Resources`的实例，默认情况下，在实例化`WebMvcAutoConfigurationAdapter`时，由传入参数`webProperties`进行赋值：`webProperties.getResources()`：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/97b6f22c-414d-4a16-aa8e-c3deece2f7cd.png)

我们进入参数`webProperties`的类中，可以看到`getResources()`是直接实例化了一个`Resources`，其属性`staticLocations`是一个含有 4 个值的 final 类型的字符串数组，这 4 个值正是 Spring 寻找静态文件的地方：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/4d84fe43-2646-4a6f-a580-f39f6416d02d.png)

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/25899949-dac3-4873-a2af-7abfe0e97615.png)

我们回到`WebMvcAutoConfiguration`的`addResourceHandlers()`中：![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/003ff2fa-022e-47cb-8aa9-343ed7c40c4a.png)

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/ccd16b38-d724-4c03-949e-3b6ba03268a9.png)

在`addResourceHandlers()`中，会为`registry`添加两个资源处理器，当请求路径是“/webjars/”时，会在”classpath:/META-INF/resources/webjars/“路径下寻找对应的资源，当请求路径是“/\*\*”时，会在”classpath:/META-INF/resources/“、”classpath:/resources/“、”classpath:/static/“、”classpath:/public/“路径下寻找对应的资源。

现在我们通过访问`http://localhost:8080/login.html`来验证这个过程。

请求首先来到`DispatcherServlet`的`doDispatch()`中，由于是对静态资源的请求，当程序走到`mappedHandler = getHandler(processedRequest);`时，通过`getHandler()`返回`SimpleUrlHandlerMapping`（即`resourceHandlerMapping`的类型）的`HandlerExecutionChain`：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/4c9c302d-2ce0-4b5b-beb6-c76d2e94038f.png)

然后由实际的处理器进行处理：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/1590bae4-2e3a-4f97-b02d-d918c49cac22.png)

程序一路调试，来到`ResourceHttpRequestHandler`的`handleRequest()`中，通过调用`Resource resource = getResource(request);`找到请求对应的资源：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/0879e131-da5f-491e-a153-42770ce8b975.png)

而在`getResource()`中，实际是将请求路径（即`login.html`）与前面配置的路径进行拼接（组合成`/resources/login.html`这样的路径），再通过类加载器来寻找资源。

后面源码深入过深，就不一一展开了，只截取其中比较重要的几段代码：

`PathResourceResolver`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/6c58e27d-dd29-48fc-b597-8067e1c97786.png)

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/c7ef78df-c2ab-4f89-b5ad-45561a91ffcc.png)

`ClassPathResource`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/42c5125e-0dc2-4c0c-9434-af4a9efd2d5d.png)

`ClassLoader`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/7842f83d-5417-4cb2-bb30-d70f98c3053f.png)

`URLClassLoader`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/870891e9-f8ea-4097-98c9-829b1cdcf145.png)

最终，类加载器会在如上两个路径下找到登录页并返回。

### UserDetailService 配置解析

我们定义的用户信息的获取逻辑是如何被 Spring Security 应用的呢？让我们通过阅读源码来了解一下。

还记得前面我们讲**_BrowserConfig 配置_**被加载的过程吗？**_UserDetailService_**也是在这个过程中被一起加载完成的，回到**BrowserConfig 配置解析**的第一幅图中，如下：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/68490740-e03c-4353-b5fc-ac99c0cf0435.png)

在断点处位置，`authenticationManager()`会返回一个**_AuthenticationManager_**实例，我们进入`authenticationManager()`中:

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/e7a1a684-64db-41d0-a5c0-d9a841d86cc1.png)

在`authenticationManager()`中，**_AuthenticationManager_**转由**_AuthenticationConfiguration_**中获取，我们进入`getAuthenticationManager()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/d9ae84ae-d60c-4d9c-a7fd-cddeb1142f95.png)

程序来到**_AuthenticationConfiguration_**的`getAuthenticationManager()`中，**_AuthenticationManager_**转由**_AuthenticationManagerBuilder_**中获取，我们进入`build()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/19f71152-f456-4db7-a1d5-f79aaa37253b.png)

程序来到**_AbstractConfiguredSecurityBuilder_**的`doBuild()`中，这里在构建**_AuthenticationManager_**实例时，需要初始化 3 个配置类，我们重点关注第 3 个配置类：**_org.springframework.security.config.annotation.authentication.configuration.InitializeUserDetailsBeanManagerConfigurer_**，这个配置类是在**_AuthenticationConfiguration_**中引入的：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/9f06c823-645d-413b-8bb6-1d81b8f329ea.png)

我们来到**_InitializeUserDetailsBeanManagerConfigurer_**的`init()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/cd7d6cb9-c6e7-4570-aab8-309adcb15e16.png)

这里会新建一个**_InitializeUserDetailsManagerConfigurer_**实例添加到**_AuthenticationManagerBuilder_**中。我们回到`doBuild()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/3ea76980-417d-4c0c-9330-e0bb241c6a47.png)

可以看到配置类变成了 5 个，其中就有刚刚新建的**_InitializeUserDetailsManagerConfigurer_**，程序接下来会调用各个配置类的`configure()`进行配置，我们来到**_InitializeUserDetailsManagerConfigurer_**的`configure()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/ec39a9f6-c97d-4b7d-8843-d20358c1d194.png)

可以看到在`configure()`中，就会去 bean 工厂中寻找**_UserDetailsService_**类型的 bean，若是我们没有自定义**_UserDetailsService_**的实现类的话，Spring Security 默认会生成一个**_InMemoryUserDetailsManager_**的实例：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/c6a7370c-4afb-4c5d-aa35-ba9c3406b1ed.png)

**_InMemoryUserDetailsManager_**是在**_UserDetailsServiceAutoConfiguration_**类中配置的：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/476f8954-abe3-4e26-bfe1-8c5b4abbf0e0.png)

解决完**_UserDetailsService_**的加载问题，现在我们来看看 Spring Security 是如何通过**_UserDetailsService_**获取用户信息的。

通过**Spring Boot 中开启 Spring Security**一节的学习我们知道，登录判断的逻辑是在**_UsernamePasswordAuthenticationFilter_**中进行的，因此我们在**_UsernamePasswordAuthenticationFilter_**的`attemptAuthenticatio()`中打上断点，然后启动项目，访问登录页，输入用户名和密码点击登录后，程序来到**_UsernamePasswordAuthenticationFilter_**中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/1282014b-fc29-4c2b-9316-9fdd638653c9.png)

这里将验证的逻辑交由**_AuthenticationManager_**进行，我们进入`authenticate()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/5d511c93-3614-40e0-b3c9-9673c573d60f.png)

程序来到**_ProviderManager_**的`authenticate()`中，这里将验证的逻辑委托给其父类进行，再次点击进入`authenticate()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/8dddd63e-c567-4b41-a9d9-8ef8aa6f2a92.png)

这里将验证的逻辑交由**_AuthenticationProvider_**进行，我们进入`authenticate()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/ec796a9b-7c65-49a2-9f9f-7685af7bd57b.png)

程序来到**_AbstractUserDetailsAuthenticationProvider_**的`authenticate()`中，这里会根据用户名去寻找对应的用户实例，我们进入`retrieveUser()`中：

![img](https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/SpringSecurity/3980e264-c073-456a-b808-715edd85633a.png)

程序来到**_DaoAuthenticationProvider_**的`retrieveUser()`中，可以看到正是在这里，会从**_UserDetailsService_**的`loadUserByUsername()`中寻找对应的用户信息。

## 参考

1. [Spring Security 自定义用户认证](https://mrbird.cc/Spring-Security-Authentication.html)
