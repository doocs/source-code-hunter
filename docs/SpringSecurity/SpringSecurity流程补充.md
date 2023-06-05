注意:

1. 基于spring-boot-dependencies:2.7.7
2. 首先需要了解[springboot2.7升级](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-2.7-Release-Notes)
   `Changes to Auto-configuration` 以后使用`autoconfigure`进行自动注入

# 启动

我们每次添加` <artifactId>spring-boot-starter-security</artifactId>`
,启动的时候启动日志会有一条类似
`Using generated security password: 1db8eb87-e2ee-4c72-88e7-9b85268c4430

This generated password is for development use only. Your security configuration must be updated before running your application in production.`

的日志.找到`UserDetailsServiceAutoConfiguration#InMemoryUserDetailsManager`类,它是springboot自动装配的.

下面这些都是springboot自动装配类,在`spring-boot-autoconfigure-2.7.7.jar`>META-INF>spring>
org.springframework.boot.autoconfigure.AutoConfiguration.imports中. 这些类就是security的全部了.

```imports
org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration
org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration
org.springframework.boot.autoconfigure.security.servlet.SecurityFilterAutoConfiguration
org.springframework.boot.autoconfigure.security.reactive.ReactiveSecurityAutoConfiguration
org.springframework.boot.autoconfigure.security.reactive.ReactiveUserDetailsServiceAutoConfiguration
org.springframework.boot.autoconfigure.security.rsocket.RSocketSecurityAutoConfiguration
org.springframework.boot.autoconfigure.security.saml2.Saml2RelyingPartyAutoConfiguration
..........
org.springframework.boot.autoconfigure.security.oauth2.client.servlet.OAuth2ClientAutoConfiguration
org.springframework.boot.autoconfigure.security.oauth2.client.reactive.ReactiveOAuth2ClientAutoConfiguration
org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration
org.springframework.boot.autoconfigure.security.oauth2.resource.reactive.ReactiveOAuth2ResourceServerAutoConfiguration
```

## SecurityAutoConfiguration

```java

/**
 * {@code EnableAutoConfiguration} for Spring Security.
 *
 * @author Dave Syer
 * @author Andy Wilkinson
 * @author Madhura Bhave
 * @since 1.0.0
 */
@AutoConfiguration
@ConditionalOnClass(DefaultAuthenticationEventPublisher.class)
@EnableConfigurationProperties(SecurityProperties.class)
@Import({SpringBootWebSecurityConfiguration.class, SecurityDataConfiguration.class})
public class SecurityAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(AuthenticationEventPublisher.class)
    public DefaultAuthenticationEventPublisher authenticationEventPublisher(ApplicationEventPublisher publisher) {
        return new DefaultAuthenticationEventPublisher(publisher);
    }

}
```

### @EnableConfigurationProperties(SecurityProperties.class)

这个是security的核心配置类`SecurityProperties`,里面能配置
`filter`: 过滤,`user` : 用户信息

`这个有个问题,filter是属于tomcat的,security中使用什么方式让filter变的有序的`

### @Import({ SpringBootWebSecurityConfiguration.class, SecurityDataConfiguration.class })

这里导入了2个类 `SpringBootWebSecurityConfiguration`和`SecurityDataConfiguration`,`SecurityDataConfiguration`是Spring
Security与Spring数据的集成,暂时不做讲解,重点是`SpringBootWebSecurityConfiguration`

#### SpringBootWebSecurityConfiguration

##### SecurityFilterChainConfiguration

其中第一个子类`SecurityFilterChainConfiguration`添加了`@ConditionalOnDefaultWebSecurity`,这个类有个注解
`@Conditional(DefaultWebSecurityCondition.class)`,而`DefaultWebSecurityCondition`类继承了`AllNestedConditions`

所以下面代码就是判断该类是否生效,如果不存在`SecurityFilterChain`和`WebSecurityConfigurerAdapter`
的bean,就生效.创建默认的`SecurityFilterChain`

```java
/**
 * {@link Condition} for
 * {@link ConditionalOnDefaultWebSecurity @ConditionalOnDefaultWebSecurity}.
 *
 * @author Phillip Webb
 */
class DefaultWebSecurityCondition extends AllNestedConditions {

    DefaultWebSecurityCondition() {
        super(ConfigurationPhase.REGISTER_BEAN);
    }

    @ConditionalOnClass({SecurityFilterChain.class, HttpSecurity.class})
    static class Classes {

    }

    @ConditionalOnMissingBean({
            org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter.class,
            SecurityFilterChain.class})
    @SuppressWarnings("deprecation")
    static class Beans {

    }

}
```



##### ErrorPageSecurityFilterConfiguration

这是第二个子类,主要就是通过`FilterRegistrationBean`注入了一个`ErrorPageSecurityFilter`.    用于拦截错误调度，以确保对错误页面的授权访问。
 

##### WebSecurityEnablerConfiguration
这个类主要就是添加了`@EnableWebSecurity`注解,这个注解也很重要,后面跟`SecurityFilterChain`一样讲解


### DefaultAuthenticationEventPublisher
在类中还存在`SecurityAutoConfiguration`bean,这个是属于spring的发布订阅.改装一下,就是security的成功和失败事件,可以订阅失败后的一些处理,如日志打印等


```java
/**
 * @author Luke Taylor
 * @since 3.0
 */
public interface AuthenticationEventPublisher {

	void publishAuthenticationSuccess(Authentication authentication);

	void publishAuthenticationFailure(AuthenticationException exception, Authentication authentication);

}
```

## UserDetailsServiceAutoConfiguration

## SecurityFilterAutoConfiguration



 
