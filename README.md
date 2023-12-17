# 互联网公司常用框架源码赏析

[![license](https://badgen.net/github/license/doocs/source-code-hunter?color=green)](https://github.com/doocs/source-code-hunter/blob/main/LICENSE)
[![stars](https://badgen.net/github/stars/doocs/source-code-hunter)](https://github.com/doocs/source-code-hunter/stargazers)
[![contributors](https://badgen.net/github/contributors/doocs/source-code-hunter)](https://github.com/doocs/source-code-hunter/graphs/contributors)
[![help-wanted](https://badgen.net/github/label-issues/doocs/source-code-hunter/help%20wanted/open)](https://github.com/doocs/source-code-hunter/labels/help%20wanted)
[![issues](https://badgen.net/github/open-issues/doocs/source-code-hunter)](https://github.com/doocs/source-code-hunter/issues)
[![PRs Welcome](https://badgen.net/badge/PRs/welcome/green)](http://makeapullrequest.com)

“技术深度” 与 “技术广度”是对开发者来说最为重要的两个维度，本项目致力于从源码层面，剖析和挖掘互联网行业主流技术的底层实现原理，**为广大开发者 “提升技术深度” 提供便利**。

加入我们，一起通读互联网行业主流框架及中间件源码，成为强大的 “源码猎人”，目前开放的有 **Spring 全家桶**、**Mybatis**、**Netty**、**Dubbo 框架**，及 **Redis**、**Tomcat** 中间件等，让我们一起开拓新的领地，揭开这些源码的神秘面纱。

本项目主要用于记录框架及中间件源码的阅读经验、个人理解及解析，希望能够使阅读源码变成一件简单有趣，且有价值的事情，抽空更新中... (如果本项目对您有帮助，请 watch、star、fork 素质三连一波，鼓励一下作者，谢谢）

- Gitee Pages: https://doocs.gitee.io/source-code-hunter
- GitHub Pages: https://doocs.github.io/source-code-hunter

## Spring 系列

### IoC 容器

- [BeanDefinition 的资源定位过程](/docs/Spring/IoC/1、BeanDefinition的资源定位过程.md)
- [将 bean 解析封装成 BeanDefinition](/docs/Spring/IoC/2、将bean解析封装成BeanDefinition.md)
- [将 BeanDefinition 注册进 IoC 容器](/docs/Spring/IoC/3、将BeanDefinition注册进IoC容器.md)
- [依赖注入(DI)](</docs/Spring/IoC/4、依赖注入(DI).md>)
- [BeanFactoryPostProcessor](/docs/Spring/IoC/BeanFactoryPostProcessor.md)
- [BeanPostProcessor](/docs/Spring/IoC/BeanPostProcessor.md)
- [Spring BeanFactory 源码解析](/docs/Spring/clazz/Spring-beanFactory.md)
- [循环依赖](/docs/Spring/IoC/循环依赖.md)

### AOP

- [AOP 源码实现及分析](/docs/Spring/AOP/AOP源码实现及分析.md)
- [JDK 动态代理的实现原理解析](/docs/Spring/AOP/JDK动态代理的实现原理解析.md)
- [Spring AOP 如何生效(Spring AOP 标签解析)](/docs/Spring/AOP/Spring-Aop如何生效.md)

### SpringMVC

- [IoC 容器 在 Web 环境 中的启动](/docs/Spring/SpringMVC/IoC容器在Web环境中的启动.md)
- [SpringMVC 的设计与实现](/docs/Spring/SpringMVC/SpringMVC的设计与实现.md)
- [SpringMVC 跨域解析](/docs/Spring/SpringMVC/SpringMVC-CROS.md)
- [Spring-MVC-HandlerMapping](/docs/Spring/mvc/Spring-MVC-HandlerMapping.md)
- [Spring-mvc-MappingRegistry](/docs/Spring/mvc/Spring-mvc-MappingRegistry.md)

### SpringJDBC

- 努力编写中...

### Spring 事务

- [Spring 与事务处理](/docs/Spring/SpringTransaction/Spring与事务处理.md)
- [Spring 声明式事务处理](/docs/Spring/SpringTransaction/Spring声明式事务处理.md)
- [Spring 事务处理的设计与实现](/docs/Spring/SpringTransaction/Spring事务处理的设计与实现.md)
- [Spring 事务管理器的设计与实现](/docs/Spring/SpringTransaction/Spring事务管理器的设计与实现.md)
- [Spring 事务解析](/docs/Spring/TX/Spring-transaction.md)

### Spring 源码故事（瞎编版）

- [面筋哥 IoC 容器的一天(上)](</docs/Spring/Spring源码故事（瞎编版）/面筋哥IoC容器的一天(上).md>)

### Spring 整体脉络

- [16 张图解锁 Spring 的整体脉络](/docs/Spring/Spring整体脉络/16张图解锁Spring的整体脉络.md)

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

- [Spring-import 注解](/docs/Spring/clazz/Spring-Import.md)
- [Spring-定时任务](/docs/Spring/clazz/Spring-Scheduling.md)
- [Spring StopWatch](/docs/Spring/clazz/Spring-StopWatch.md)
- [Spring 元数据](/docs/Spring/clazz/Spring-Metadata.md)
- [Spring 条件接口](/docs/Spring/clazz/Spring-Conditional.md)

- [Spring MultiValueMap](/docs/Spring/clazz/Spring-MultiValueMap.md)
- [Spring MethodOverride](/docs/Spring/clazz/Spring-MethodOverride.md)
- [Spring BeanDefinitionReaderUtils](/docs/Spring/clazz/Spring-BeanDefinitionReaderUtils.md)
- [Spring PropertyPlaceholderHelper](/docs/Spring/clazz/Spring-PropertyPlaceholderHelper.md)

- [Spring PropertySource](/docs/Spring/clazz/PropertySource)
- [Spring PlaceholderResolver](/docs/Spring/clazz/PlaceholderResolver)

- [Spring-AnnotationFormatterFactory](/docs/Spring/clazz/format/Spring-AnnotationFormatterFactory.md)
- [Spring-Formatter](/docs/Spring/clazz/format/Spring-Formatter.md)
- [Spring-Parser](/docs/Spring/clazz/format/Spring-Parser.md)
- [Spring-Printer](/docs/Spring/clazz/format/Spring-Printer.md)

### Spring5 新特性

- [Spring5-spring.components 解析](/docs/Spring/Spring5新特性/Spring-spring-components.md)

### Spring RMI

- [Spring RMI](/docs/Spring/RMI/Spring-RMI.md)

### Spring Message

- [Spring EnableJMS](/docs/Spring/message/Spring-EnableJms.md)
- [Spring JmsTemplate](/docs/Spring/message/Spring-JmsTemplate.md)
- [Spring MessageConverter](/docs/Spring/message/Spring-MessageConverter.md)

### SpringBoot

- [SpringBoot run 方法解析](/docs/SpringBoot/Spring-Boot-Run.md)
- [SpringBoot 配置加载解析](/docs/SpringBoot/SpringBoot-application-load.md)
- [SpringBoot 自动装配](/docs/SpringBoot/SpringBoot-自动装配.md)
- [SpringBoot ConfigurationProperties](/docs/SpringBoot/SpringBoot-ConfigurationProperties.md)
- [SpringBoot 日志系统](/docs/SpringBoot/SpringBoot-LogSystem.md)
- [SpringBoot ConditionalOnBean](/docs/SpringBoot/SpringBoot-ConditionalOnBean.md)

### SpringBootBatch

- [SpringBootBatch 源码](/docs/SpringBootBatch/SpringBootBatch源码.md)

### Spring Cloud

- [Spring Cloud Commons 源码](docs/SpringCloud/spring-cloud-commons-source-note.md)
- [Spring Cloud OpenFeign 源码](docs/SpringCloud/spring-cloud-openfeign-source-note.md)
- [Spring Cloud Gateway 源码](docs/SpringCloud/spring-cloud-gateway-source-note.md)

### SpringSecurity

- [SpringSecurity 请求全过程解析](/docs/SpringSecurity/SpringSecurity请求全过程解析.md)
- [SpringSecurity 自定义用户认证](/docs/SpringSecurity/SpringSecurity自定义用户认证.md)
- [SpringSecurity 流程补充](/docs/SpringSecurity/SpringSecurity流程补充.md)

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
- [IO 模型](docs/Netty/IOTechnologyBase/IO模型.md)
- [四种 IO 编程及对比](docs/Netty/IOTechnologyBase/四种IO编程及对比.md)

### JDK1.8 NIO 包 核心组件源码剖析

- [Selector、SelectionKey 及 Channel 组件](docs/Netty/IOTechnologyBase/Selector、SelectionKey及Channel组件.md)

### Netty 粘拆包及解决方案

- [TCP 粘拆包问题及 Netty 中的解决方案](docs/Netty/TCP粘拆包/TCP粘拆包问题及Netty中的解决方案.md)

### Netty 多协议开发

- [基于 HTTP 协议的 Netty 开发](docs/Netty/Netty多协议开发/基于HTTP协议的Netty开发.md)
- [基于 WebSocket 协议的 Netty 开发](docs/Netty/Netty多协议开发/基于WebSocket协议的Netty开发.md)
- [基于自定义协议的 Netty 开发](docs/Netty/Netty多协议开发/基于自定义协议的Netty开发.md)

### 基于 Netty 开发服务端及客户端

- [基于 Netty 的服务端开发](docs/Netty/基于Netty开发服务端及客户端/基于Netty的服务端开发.md)
- [基于 Netty 的客户端开发](docs/Netty/基于Netty开发服务端及客户端/基于Netty的客户端开发.md)

### Netty 主要组件的源码分析

- [ByteBuf 组件](docs/Netty/Netty主要组件源码分析/ByteBuf组件.md)
- [Channel 组件 和 Unsafe 组件](docs/Netty/Netty主要组件源码分析/Channel和Unsafe组件.md)
- [EventLoop 组件](docs/Netty/Netty主要组件源码分析/EventLoop组件.md)
- [ChannelPipeline 和 ChannelHandler 组件](docs/Netty/Netty主要组件源码分析/ChannelPipeline和ChannelHandler组件.md)
- [Future 和 Promise 组件](docs/Netty/Netty主要组件源码分析/Future和Promise组件.md)

### Netty 高级特性

- [Netty 架构设计](docs/Netty/AdvancedFeaturesOfNetty/Netty架构设计.md)
- [Netty 高性能之道](docs/Netty/AdvancedFeaturesOfNetty/Netty高性能之道.md)

### Netty 技术细节源码分析

- [FastThreadLocal 源码分析](docs/Netty/Netty技术细节源码分析/FastThreadLocal源码分析.md)
- [Recycler 对象池原理分析](docs/Netty/Netty技术细节源码分析/Recycler对象池原理分析.md)
- [MpscLinkedQueue 队列原理分析](docs/Netty/Netty技术细节源码分析/MpscLinkedQueue队列原理分析.md)
- [HashedWheelTimer 时间轮原理分析](docs/Netty/Netty技术细节源码分析/HashedWheelTimer时间轮原理分析.md)
- [HashedWheelTimer & schedule](docs/Netty/Netty技术细节源码分析/HashedWheelTimer&schedule.md)
- [ByteBuf 的内存泄漏原因与检测原理](docs/Netty/Netty技术细节源码分析/ByteBuf的内存泄漏原因与检测原理.md)
- [内存池之 PoolChunk 设计与实现](docs/Netty/Netty技术细节源码分析/内存池之PoolChunk设计与实现.md)
- [内存池之从内存池申请内存](docs/Netty/Netty技术细节源码分析/内存池之从内存池申请内存.md)

## Dubbo

### 架构设计

- [Dubbo 整体架构](docs/Dubbo/architectureDesign/Dubbo整体架构.md)

### SPI 机制

- [Dubbo 与 Java 的 SPI 机制](docs/Dubbo/SPI/Dubbo与Java的SPI机制.md)

### 注册中心

- [Dubbo 注册中心模块简析](docs/Dubbo/registry/Dubbo注册中心模块简析.md)
- [注册中心的 Zookeeper 实现](docs/Dubbo/registry/注册中心的Zookeeper实现.md)

### 远程通信

- [Dubbo 远程通信模块简析](docs/Dubbo/remote/Dubbo远程通信模块简析.md)
- [Transport 组件](docs/Dubbo/remote/Transport组件.md)
- [Exchange 组件](docs/Dubbo/remote/Exchange组件.md)
- [Buffer 组件](docs/Dubbo/remote/Buffer组件.md)
- [基于 Netty 实现远程通信](docs/Dubbo/remote/基于Netty实现远程通信.md)
- [基于 HTTP 实现远程通信](docs/Dubbo/remote/基于HTTP实现远程通信.md)

### RPC

- [RPC 模块简析](docs/Dubbo/RPC/RPC模块简析.md)
- [Protocol 组件](docs/Dubbo/RPC/Protocol组件.md)
- [Proxy 组件](docs/Dubbo/RPC/Proxy组件.md)
- [Dubbo 协议](docs/Dubbo/RPC/Dubbo协议.md)
- [Hessian 协议](docs/Dubbo/RPC/Hessian协议.md)

### 集群

- [Dubbo 集群模块简析](docs/Dubbo/cluster/Dubbo集群模块简析.md)
- [负载均衡](docs/Dubbo/cluster/负载均衡.md)
- [集群容错](docs/Dubbo/cluster/集群容错.md)
- [mock 与服务降级](docs/Dubbo/cluster/mock与服务降级.md)

## Tomcat

### Servlet 与 Servlet 容器

- [servlet-api 源码赏析](docs/Tomcat/servlet-api源码赏析.md)
- [一个简单的 Servlet 容器](docs/Tomcat/一个简单的servlet容器代码设计.md)
- [Servlet 容器详解](docs/Tomcat/servlet容器详解.md)

### Web 容器

- [一个简单的 Web 服务器](docs/Tomcat/一个简单的Web服务器代码设计.md)

## Redis

- [深挖 Redis 6.0 源码——SDS](docs/Redis/redis-sds.md)

## Nacos

- [nacos 服务注册](docs/nacos/nacos-discovery.md)

## Sentinel

- [sentinel 时间窗口实现](docs/Sentinel/Sentinel时间窗口的实现.md)
- [Sentinel 底层 LongAdder 的计数实现](docs/Sentinel/Sentinel底层LongAdder的计数实现.md)
- [Sentinel 限流算法的实现](docs/Sentinel/Sentinel限流算法的实现.md)

## RocketMQ

- [RocketMQ NameServer 与 Broker 的通信](docs/rocketmq/rocketmq-nameserver-broker.md)
- [RocketMQ 生产者启动流程](docs/rocketmq/rocketmq-producer-start.md)
- [RocketMQ 消息发送流程](docs/rocketmq/rocketmq-send-message.md)
- [RocketMQ 消息发送存储流程](docs/rocketmq/rocketmq-send-store.md)
- [RocketMQ MappedFile 内存映射文件详解](docs/rocketmq/rocketmq-mappedfile-detail.md)
- [RocketMQ ConsumeQueue 详解](docs/rocketmq/rocketmq-consumequeue.md)
- [RocketMQ CommitLog 详解](docs/rocketmq/rocketmq-commitlog.md)
- [RocketMQ IndexFile 详解](docs/rocketmq/rocketmq-indexfile.md)
- [RocketMQ 消费者启动流程](docs/rocketmq/rocketmq-consumer-start.md)
- [RocketMQ 消息拉取流程](docs/rocketmq/rocketmq-pullmessage.md)
- [RocketMQ Broker 处理拉取消息请求流程](docs/rocketmq/rocketmq-pullmessage-processor.md)
- [RocketMQ 消息消费流程](docs/rocketmq/rocketmq-consume-message-process.md)

## 番外篇（JDK 1.8）

### 基础类库

- [String 类 源码赏析](docs/JDK/basic/String.md)
- [Thread 类 源码赏析](docs/JDK/basic/Thread.md)
- [ThreadLocal 类 源码赏析](docs/JDK/basic/ThreadLocal.md)

### 集合

- [HashMap 类 源码赏析](docs/JDK/collection/HashMap.md)
- [ConcurrentHashMap 类 源码赏析](docs/JDK/collection/ConcurrentHashMap.md)
- [LinkedHashMap 类 源码赏析](docs/JDK/collection/LinkedHashMap.md)
- [ArrayList 类 源码赏析](docs/JDK/collection/ArrayList.md)
- [LinkedList 类 源码赏析](docs/JDK/collection/LinkedList.md)
- [HashSet 类 源码赏析](docs/JDK/collection/HashSet.md)
- [TreeSet 类 源码赏析](docs/JDK/collection/TreeSet.md)

### 并发编程

- [JUC 并发包 UML 全量类图](docs/JDK/concurrentCoding/JUC并发包UML全量类图.md)
- [Executor 线程池组件 源码赏析](docs/JDK/concurrentCoding/Executor线程池组件.md)
- [Lock 锁组件 源码赏析](docs/JDK/concurrentCoding/Lock锁组件.md)
- [详解 AbstractQueuedSynchronizer 抽象类](docs/JDK/concurrentCoding/详解AbstractQueuedSynchronizer.md)
- [Semaphore 类 源码赏析](docs/JDK/concurrentCoding/Semaphore.md)

## 学习心得

### 个人经验

- [初级开发者应该从 Spring 源码中学什么](docs/LearningExperience/PersonalExperience/初级开发者应该从spring源码中学什么.md)

### 编码规范

- [一个程序员的自我修养](docs/LearningExperience/EncodingSpecification/一个程序员的自我修养.md)

### 设计模式

- [从 Spring 及 Mybatis 框架源码中学习设计模式(创建型)](<docs/LearningExperience/DesignPattern/从Spring及Mybatis框架源码中学习设计模式(创建型).md>)
- [从 Spring 及 Mybatis 框架源码中学习设计模式(行为型)](<docs/LearningExperience/DesignPattern/从Spring及Mybatis框架源码中学习设计模式(行为型).md>)
- [从 Spring 及 Mybatis 框架源码中学习设计模式(结构型)](<docs/LearningExperience/DesignPattern/从Spring及Mybatis框架源码中学习设计模式(结构型).md>)

### 多线程

- [Java 并发编程在各主流框架中的应用](docs/LearningExperience/ConcurrentProgramming/Java并发编程在各主流框架中的应用.md)

---

## Stars 趋势

[![Star History Chart](https://api.star-history.com/svg?repos=doocs/source-code-hunter&type=Date)](https://star-history.com/#doocs/source-code-hunter&Date)

## Doocs 社区优质项目

GitHub 技术社区 [Doocs](https://github.com/doocs)，致力于打造一个内容完整、持续成长的互联网开发者学习生态圈！以下是 Doocs 的一些优秀项目，欢迎各位开发者朋友持续保持关注。

| #   | 项目                                                              | 描述                                                                                             | 热度                                                                                                                            |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [advanced-java](https://github.com/doocs/advanced-java)           | 互联网 Java 工程师进阶知识完全扫盲：涵盖高并发、分布式、高可用、微服务、海量数据处理等领域知识。 | ![](https://badgen.net/github/stars/doocs/advanced-java) <br>![](https://badgen.net/github/forks/doocs/advanced-java)           |
| 2   | [leetcode](https://github.com/doocs/leetcode)                     | 多种编程语言实现 LeetCode、《剑指 Offer（第 2 版）》、《程序员面试金典（第 6 版）》题解。        | ![](https://badgen.net/github/stars/doocs/leetcode) <br>![](https://badgen.net/github/forks/doocs/leetcode)                     |
| 3   | [source-code-hunter](https://github.com/doocs/source-code-hunter) | 互联网常用组件框架源码分析。                                                                     | ![](https://badgen.net/github/stars/doocs/source-code-hunter) <br>![](https://badgen.net/github/forks/doocs/source-code-hunter) |
| 4   | [jvm](https://github.com/doocs/jvm)                               | Java 虚拟机底层原理知识总结。                                                                    | ![](https://badgen.net/github/stars/doocs/jvm) <br>![](https://badgen.net/github/forks/doocs/jvm)                               |
| 5   | [coding-interview](https://github.com/doocs/coding-interview)     | 代码面试题集，包括《剑指 Offer》、《编程之美》等。                                               | ![](https://badgen.net/github/stars/doocs/coding-interview) <br>![](https://badgen.net/github/forks/doocs/coding-interview)     |
| 6   | [md](https://github.com/doocs/md)                                 | 一款高度简洁的微信 Markdown 编辑器。                                                             | ![](https://badgen.net/github/stars/doocs/md) <br>![](https://badgen.net/github/forks/doocs/md)                                 |
| 7   | [technical-books](https://github.com/doocs/technical-books)       | 值得一看的技术书籍列表。                                                                         | ![](https://badgen.net/github/stars/doocs/technical-books) <br>![](https://badgen.net/github/forks/doocs/technical-books)       |

## 贡献者

感谢以下所有朋友对 [GitHub 技术社区 Doocs](https://github.com/doocs) 所做出的贡献，[参与项目维护请戳这儿](https://doocs.github.io/#/?id=how-to-join)。

<!-- ALL-CONTRIBUTORS-LIST: START - Do not remove or modify this section -->

<a href="https://opencollective.com/doocs/contributors.svg?width=890&button=true"><img src="https://opencollective.com/doocs/contributors.svg?width=890&button=false" /></a>

<!-- ALL-CONTRIBUTORS-LIST: END -->

## 公众号

[Doocs](https://github.com/doocs) 技术社区旗下唯一公众号「**Doocs**」​，欢迎扫码关注，**专注分享技术领域相关知识及行业最新资讯**。当然，也可以加我个人微信（备注：GitHub），拉你进技术交流群。

<table>
  <tr>
    <td align="center" style="width: 260px;">
      <img src="https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/gh/doocs/images/qrcode-for-doocs.png" style="width: 400px;"><br>
    </td>
    <td align="center" style="width: 260px;">
      <img src="https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/gh/doocs/images/qrcode-for-yanglbme.png" style="width: 400px;"><br>
    </td>
  </tr>
</table>

关注「**Doocs**」公众号，回复 **PDF**，即可获取 [互联网 Java 工程师进阶知识完全扫盲](https://github.com/doocs/advanced-java) 项目离线 PDF 文档（283 页精华），学习更加方便！

![](./images/pdf.png)
