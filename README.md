# 互联网公司常用框架源码赏析
[![license](https://badgen.net/github/license/doocs/source-code-hunter?color=green)](https://github.com/doocs/source-code-hunter/blob/master/LICENSE)
[![PRs Welcome](https://badgen.net/badge/PRs/welcome/green)](http://makeapullrequest.com)
[![stars](https://badgen.net/github/stars/doocs/source-code-hunter)](https://github.com/doocs/source-code-hunter/stargazers)
[![contributors](https://badgen.net/github/contributors/doocs/source-code-hunter)](https://github.com/doocs/source-code-hunter/graphs/contributors)
[![help-wanted](https://badgen.net/github/label-issues/doocs/source-code-hunter/help%20wanted/open)](https://github.com/doocs/source-code-hunter/labels/help%20wanted)
[![issues](https://badgen.net/github/open-issues/doocs/source-code-hunter)](https://github.com/doocs/source-code-hunter/issues)
[![PRs Welcome](https://badgen.net/badge/PRs/welcome/green)](http://makeapullrequest.com)

有被“读过哪些知名的开源项目源码？”这种问题所困扰过吗？加入我们，一起通读互联网公司主流框架及中间件源码，成为强大的“源码猎人”，目前开放的有 Spring 系列框架、Mybatis 框架、Netty 框架，及Redis中间件等，让我们一起开拓新的领地，揭开这些源码的神秘面纱。本项目主要用于记录框架及中间件源码的阅读经验、个人理解及解析，希望能够使阅读源码变成一件更简单有趣，且有价值的事情，抽空更新中...(如果本项目对您有帮助，请watch、star、fork 素质三连一波，鼓励一下作者，谢谢）

## Spring系列
### IoC容器
- [BeanDefinition 的资源定位过程](/docs/Spring/IoC/1、BeanDefinition的资源定位过程.md)
- [将 bean 解析封装成 BeanDefinition](/docs/Spring/IoC/2、将bean解析封装成BeanDefinition.md)
- [将 BeanDefinition 注册进 IoC 容器](/docs/Spring/IoC/3、将BeanDefinition注册进IoC容器.md)
- [依赖注入(DI)](/docs/Spring/IoC/4、依赖注入(DI).md)

### AOP
- [AOP 源码实现及分析](/docs/Spring/AOP/AOP源码实现及分析.md)
- [JDK 动态代理的实现原理解析](/docs/Spring/AOP/JDK动态代理的实现原理解析.md)
- [Spring AOP 如何生效(Spring AOP标签解析)](/docs/Spring/AOP/Spring-Aop如何生效.md)

### SpringMVC
- [温习一下 servlet](/docs/Spring/SpringMVC/温习一下servlet.md)
- [IoC容器 在 Web环境 中的启动](/docs/Spring/SpringMVC/IoC容器在Web环境中的启动.md)
- [SpringMVC 的设计与实现](/docs/Spring/SpringMVC/SpringMVC的设计与实现.md)
- [SpringMVC 跨域解析](/docs/Spring/SpringMVC/SpringMVC-CROS.md)
### SpringJDBC
- 努力编写中...

### Spring事务
- [Spring 与事务处理](/docs/Spring/SpringTransaction/Spring与事务处理.md)
- [Spring 声明式事务处理](/docs/Spring/SpringTransaction/Spring声明式事务处理.md)
- [Spring 事务处理的设计与实现](/docs/Spring/SpringTransaction/Spring事务处理的设计与实现.md)
- [Spring 事务管理器的设计与实现](/docs/Spring/SpringTransaction/Spring事务管理器的设计与实现.md)

### Spring源码故事（瞎编版）
- [面筋哥 IoC 容器的一天(上)](/docs/Spring/Spring源码故事（瞎编版）/面筋哥IoC容器的一天(上).md)

### Spring 类解析
- [Spring 自定义标签解析](/docs/Spring/clazz/Spring-Custom-label-resolution.md)
- [Spring Scan 包扫描](/docs/Spring/clazz/Spring-scan.md)
- [Spring 注解工具类](/docs/Spring/clazz/Spring-AnnotationUtils.md)
- [Spring 别名注册](/docs/Spring/clazz/Spring-SimpleAliasRegistry.md)
- [Spring 标签解析类](/docs/Spring/clazz/Spring-BeanDefinitionParserDelegate.md)
- [Spring ApplicationListener](/docs/Spring/clazz/Spring-ApplicationListener.md)
- [Spring messageSource](/docs/Spring/clazz/Spring-MessageSource.md)
- [Spring 自定义属性解析器](/docs/Spring/clazz/Spring-Custom-attribute-resolver.md)
- [Spring 排序工具](/docs/Spring/clazz/Spring-OrderUtils.md)
### Spring5 新特性
- [Spring5-spring.components解析](/docs/Spring/Spring5新特性/Spring-spring-components.md)

### Spring RMI
- [Spring RMI](/docs/Spring/RMI/Spring-RMI.md)

## MyBatis
### 基础支持层
- [反射工具箱和 TypeHandler 系列](docs/Mybatis/基础支持层/1、反射工具箱和TypeHandler系列.md)
- [DataSource 及 Transaction 模块](docs/Mybatis/基础支持层/2、DataSource及Transaction模块.md)
- [binding 模块](docs/Mybatis/基础支持层/3、binding模块.md)
- [缓存模块](docs/Mybatis/基础支持层/4、缓存模块.md)
### 核心处理层
- [MyBatis 初始化](docs/Mybatis/核心处理层/1、MyBatis初始化.md)
- [SqlNode 和 SqlSource](docs/Mybatis/核心处理层/2、SqlNode和SqlSource.md)
- [ResultSetHandler](docs/Mybatis/核心处理层/3、ResultSetHandler.md)
- [StatementHandler](docs/Mybatis/核心处理层/4、StatementHandler.md)
- [Executor 组件](docs/Mybatis/核心处理层/5、Executor组件.md)
- [SqlSession 组件](docs/Mybatis/核心处理层/6、SqlSession组件.md)
### 类解析
- [Mybatis-Cache](/docs/Mybatis/基础支持层/Mybatis-Cache.md)
- [Mybatis-log](/docs/Mybatis/基础支持层/Mybatis-log.md)
- [Mybatis-Reflector](/docs/Mybatis/基础支持层/Mybatis-Reflector.md)
- [Mybatis-Alias](/docs/Mybatis/核心处理层/Mybatis-Alias.md)
- [Mybatis-Cursor](/docs/Mybatis/核心处理层/Mybatis-Cursor.md)
- [Mybatis-DataSource](/docs/Mybatis/核心处理层/Mybatis-DataSource.md)
- [Mybatis-DyanmicSqlSourcce](/docs/Mybatis/核心处理层/Mybatis-DyanmicSqlSourcce.md)
- [Mybatis-MapperMethod](/docs/Mybatis/核心处理层/Mybatis-MapperMethod.md)
- [Mybatis-MetaObject](/docs/Mybatis/核心处理层/Mybatis-MetaObject.md)
- [Mybatis-MethodSignature](/docs/Mybatis/核心处理层/Mybatis-MethodSignature.md)
- [Mybatis-ObjectWrapper](/docs/Mybatis/核心处理层/Mybatis-ObjectWrapper.md)
- [Mybatis-ParamNameResolver](/docs/Mybatis/核心处理层/Mybatis-ParamNameResolver.md)
- [Mybatis-SqlCommand](/docs/Mybatis/核心处理层/Mybatis-SqlCommand.md)
- [Mybats-GenericTokenParser](/docs/Mybatis/核心处理层/Mybats-GenericTokenParser.md)


## Netty
### 网络 IO 技术基础
- [把被说烂的 BIO、NIO、AIO 再从头到尾扯一遍](docs/Netty/IOTechnologyBase/把被说烂的BIO、NIO、AIO再从头到尾扯一遍.md)
- [IO模型](docs/Netty/IOTechnologyBase/IO模型.md)
- [四种IO编程及对比](docs/Netty/IOTechnologyBase/四种IO编程及对比.md)

### Netty 粘拆包解决方案
- [TCP粘拆包问题及Netty中的解决方案](docs/Netty/TCP粘拆包/TCP粘拆包问题及Netty中的解决方案.md)

### Netty 编解码
- [Java序列化缺点与主流编解码框架](docs/Netty/Netty编解码/Java序列化缺点与主流编解码框架.md)

### Netty 多协议开发
- [基于HTTP协议的Netty开发](docs/Netty/Netty多协议开发/基于HTTP协议的Netty开发.md)
- [基于WebSocket协议的Netty开发](docs/Netty/Netty多协议开发/基于WebSocket协议的Netty开发.md)
- [基于自定义协议的Netty开发](docs/Netty/Netty多协议开发/基于自定义协议的Netty开发.md)

### 基于Netty开发服务端及客户端
- [基于Netty的服务端开发](docs/Netty/基于Netty开发服务端及客户端/基于Netty的服务端开发.md)
- [基于Netty的客户端开发](docs/Netty/基于Netty开发服务端及客户端/基于Netty的客户端开发.md)

### Netty 主要组件的源码分析
- [ByteBuf组件]()
- [Channel组件 和 Unsafe组件]()
- [ChannelPipeline 和 ChannelHandler组件]()
- [EventLoop 和 EventLoopGroup组件]()
- [Future 和 Promise组件]()

### Netty 高级特性
- [Netty 架构设计](docs/Netty/AdvancedFeaturesOfNetty/Netty架构设计.md)
- [Netty 高性能之道](docs/Netty/AdvancedFeaturesOfNetty/Netty高性能之道.md)
- [Netty 高可靠性设计](docs/Netty/AdvancedFeaturesOfNetty/Netty高可靠性设计.md)

## Redis
- 努力编写中...

## Tomcat
- 努力编写中...

## 番外篇（JDK 1.8）
- [HashMap 源码赏析]()
- [ConcurrentHashMap 源码赏析]()
- [String 源码赏析]()

## 学习心得
### 个人经验
- [初级开发者应该从 Spring 源码中学什么](docs/LearningExperience/PersonalExperience/初级开发者应该从spring源码中学什么.md)

### 编码规范
- [一个程序员的自我修养](docs/LearningExperience/EncodingSpecification/一个程序员的自我修养.md)

### 设计模式
- [从 Spring 及 Mybatis 框架源码中学习设计模式(创建型)](docs/LearningExperience/DesignPattern/从Spring及Mybatis框架源码中学习设计模式(创建型).md)
- [从 Spring 及 Mybatis 框架源码中学习设计模式(行为型)](docs/LearningExperience/DesignPattern/从Spring及Mybatis框架源码中学习设计模式(行为型).md)
- [从 Spring 及 Mybatis 框架源码中学习设计模式(结构型)](docs/LearningExperience/DesignPattern/从Spring及Mybatis框架源码中学习设计模式(结构型).md)
- [从框架源码中学习设计模式的感悟](docs/LearningExperience/DesignPattern/从框架源码中学习设计模式的感悟.md)

### 多线程
- [Java多线程编程在各主流框架中的应用]()

## 贡献者
感谢以下所有朋友对 [GitHub 技术社区 Doocs](https://github.com/doocs) 所做出的贡献，[参与项目维护请戳这儿](https://doocs.github.io/#/?id=how-to-join)。

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->

<a href="https://opencollective.com/doocs/contributors.svg?width=890&button=true"><img src="https://opencollective.com/doocs/contributors.svg?width=890&button=false" /></a>

<!-- ALL-CONTRIBUTORS-LIST:END -->