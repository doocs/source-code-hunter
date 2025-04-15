import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "Source Code Hunter",
  description: "读尽天下源码，心中自然无码——源码猎人",
  head: [
    ['meta', { name: 'keywords', content: 'doc,docs,doocs,documentation,github,gitee,source-code-hunter' }],
    ['meta', { name: 'description', content: '读尽天下源码，心中自然无码——源码猎人' }],
    ['link', { rel: 'icon', type: 'image/png', href: 'https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/favicon-32x32.png' }]
  ],
  themeConfig: {
    search: {
      provider: 'local'
    },
    footer: {
      message: 'Released under the CC-BY-SA-4.0 license.',
      copyright: `Copyright © 2018-${new Date().getFullYear()} <a href="https://github.com/doocs">Doocs</a>`
    },
    logo: 'https://fastly.jsdelivr.net/gh/doocs/source-code-hunter@main/images/favicon-32x32.png',
    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    },
    editLink: {
      pattern: 'https://github.com/doocs/source-code-hunter/edit/main/docs/:path',
      text: '在 GitHub 编辑'
    },
    nav: [
      { text: '首页', link: '/' },
      { text: 'Spring系列', link: '/Spring/IoC/1、BeanDefinition的资源定位过程' },
      { text: 'Mybatis', link: '/Mybatis/基础支持层/1、反射工具箱和TypeHandler系列' },
      { text: 'Netty', link: '/Netty/IOTechnologyBase/把被说烂的BIO、NIO、AIO再从头到尾扯一遍' },
      { text: 'Dubbo', link: '/Dubbo/architectureDesign/Dubbo整体架构' },
      { text: 'Tomcat', link: '/Tomcat/servlet-api源码赏析' },
      { text: 'Redis', link: '/Redis/redis-sds' },
      { text: 'JDK 1.8', link: '/JDK/basic/String' },
      { text: '学习心得', link: '/LearningExperience/PersonalExperience/初级开发者应该从spring源码中学什么' }
    ],
    sidebar: [
      {
        text: 'Spring 系列',
        collapsed: true,
        items: [
          {
            text: 'IoC 容器',
            collapsed: true,
            items: [
              { text: 'BeanDefinition 的资源定位过程', link: '/Spring/IoC/1、BeanDefinition的资源定位过程' },
              { text: '将 bean 解析封装成 BeanDefinition', link: '/Spring/IoC/2、将bean解析封装成BeanDefinition' },
              { text: '将 BeanDefinition 注册进 IoC 容器', link: '/Spring/IoC/3、将BeanDefinition注册进IoC容器' },
              { text: '依赖注入(DI)', link: '/Spring/IoC/4、依赖注入(DI)' },
              { text: 'BeanFactoryPostProcessor', link: '/Spring/IoC/BeanFactoryPostProcessor' },
              { text: 'BeanPostProcessor', link: '/Spring/IoC/BeanPostProcessor' },
              { text: 'Spring BeanFactory 源码解析', link: '/Spring/clazz/Spring-beanFactory' },
              { text: '循环依赖', link: '/Spring/IoC/循环依赖' },
            ],
          },
          {
            text: 'AOP',
            collapsed: true,
            items: [
              { text: 'AOP 源码实现及分析', link: '/Spring/AOP/AOP源码实现及分析' },
              { text: 'JDK 动态代理的实现原理解析', link: '/Spring/AOP/JDK动态代理的实现原理解析' },
              { text: 'Spring AOP 如何生效', link: '/Spring/AOP/Spring-Aop如何生效' },
            ],
          },
          {
            text: 'SpringMVC',
            collapsed: true,
            items: [
              { text: 'IoC 容器在 Web 环境中的启动', link: '/Spring/SpringMVC/IoC容器在Web环境中的启动' },
              { text: 'SpringMVC 的设计与实现', link: '/Spring/SpringMVC/SpringMVC的设计与实现' },
              { text: 'SpringMVC 跨域解析', link: '/Spring/SpringMVC/SpringMVC-CROS' },
              { text: 'Spring-MVC-HandlerMapping', link: '/Spring/mvc/Spring-MVC-HandlerMapping' },
              { text: 'Spring-mvc-MappingRegistry', link: '/Spring/mvc/Spring-mvc-MappingRegistry' },
            ],
          },
          {
            text: 'SpringJDBC',
            collapsed: true,
            items: [
              { text: '努力编写中...', link: '' },
            ],
          },
          {
            text: 'Spring 事务',
            collapsed: true,
            items: [
              { text: 'Spring 与事务处理', link: '/Spring/SpringTransaction/Spring与事务处理' },
              { text: 'Spring 声明式事务处理', link: '/Spring/SpringTransaction/Spring声明式事务处理' },
              { text: 'Spring 事务处理的设计与实现', link: '/Spring/SpringTransaction/Spring事务处理的设计与实现' },
              { text: 'Spring 事务管理器的设计与实现', link: '/Spring/SpringTransaction/Spring事务管理器的设计与实现' },
              { text: 'Spring 事务解析', link: '/Spring/TX/Spring-transaction' },
            ],
          },
          {
            text: 'Spring 源码故事（瞎编版）',
            collapsed: true,
            items: [
              { text: '面筋哥 IoC 容器的一天(上)', link: '/Spring/Spring源码故事（瞎编版）/面筋哥IoC容器的一天(上)' },
            ],
          },
          {
            text: 'Spring 整体脉络',
            collapsed: true,
            items: [
              { text: '16 张图解锁 Spring 的整体脉络', link: '/Spring/Spring整体脉络/16张图解锁Spring的整体脉络' },
            ],
          },
          {
            text: 'Spring 类解析',
            collapsed: true,
            items: [
              { text: 'Spring 自定义标签解析', link: '/Spring/clazz/Spring-Custom-label-resolution' },
              { text: 'Spring Scan 包扫描', link: '/Spring/clazz/Spring-scan' },
              { text: 'Spring 注解工具类', link: '/Spring/clazz/Spring-AnnotationUtils' },
              { text: 'Spring 别名注册', link: '/Spring/clazz/Spring-SimpleAliasRegistry' },
              { text: 'Spring 标签解析类', link: '/Spring/clazz/Spring-BeanDefinitionParserDelegate' },
              { text: 'Spring ApplicationListener', link: '/Spring/clazz/Spring-ApplicationListener' },
              { text: 'Spring messageSource', link: '/Spring/clazz/Spring-MessageSource' },
              { text: 'Spring 自定义属性解析器', link: '/Spring/clazz/Spring-Custom-attribute-resolver' },
              { text: 'Spring 排序工具', link: '/Spring/clazz/Spring-OrderUtils' },
              { text: 'Spring-import 注解', link: '/Spring/clazz/Spring-Import' },
              { text: 'Spring-定时任务', link: '/Spring/clazz/Spring-Scheduling' },
              { text: 'Spring StopWatch', link: '/Spring/clazz/Spring-StopWatch' },
              { text: 'Spring 元数据', link: '/Spring/clazz/Spring-Metadata' },
              { text: 'Spring 条件接口', link: '/Spring/clazz/Spring-Conditional' },
              { text: 'Spring MultiValueMap', link: '/Spring/clazz/Spring-MultiValueMap' },
              { text: 'Spring MethodOverride', link: '/Spring/clazz/Spring-MethodOverride' },
              { text: 'Spring BeanDefinitionReaderUtils', link: '/Spring/clazz/Spring-BeanDefinitionReaderUtils' },
              { text: 'Spring PropertyPlaceholderHelper', link: '/Spring/clazz/Spring-PropertyPlaceholderHelper' },
              { text: 'Spring PropertySources', link: '/Spring/clazz/Spring-PropertySources' },
              { text: 'Spring-AnnotationFormatterFactory', link: '/Spring/clazz/format/Spring-AnnotationFormatterFactory' },
              { text: 'Spring-Formatter', link: '/Spring/clazz/format/Spring-Formatter' },
              { text: 'Spring-Parser', link: '/Spring/clazz/format/Spring-Parser' },
              { text: 'Spring-Printer', link: '/Spring/clazz/format/Spring-Printer' },
            ],
          },
          {
            text: 'Spring5 新特性',
            collapsed: true,
            items: [
              { text: 'Spring5-spring.components 解析', link: '/Spring/Spring5新特性/Spring-spring-components' },
            ],
          },
          {
            text: 'Spring RMI',
            collapsed: true,
            items: [
              { text: 'Spring RMI', link: '/Spring/RMI/Spring-RMI' },
            ],
          },
          {
            text: 'Spring Message',
            collapsed: true,
            items: [
              { text: 'Spring EnableJMS', link: '/Spring/message/Spring-EnableJms' },
              { text: 'Spring JmsTemplate', link: '/Spring/message/Spring-JmsTemplate' },
              { text: 'Spring MessageConverter', link: '/Spring/message/Spring-MessageConverter' },
            ],
          },
          {
            text: 'SpringBoot',
            collapsed: true,
            items: [
              { text: 'SpringBoot run 方法解析', link: '/SpringBoot/Spring-Boot-Run' },
              { text: 'SpringBoot 配置加载解析', link: '/SpringBoot/SpringBoot-application-load' },
              { text: 'SpringBoot 自动装配', link: '/SpringBoot/SpringBoot-自动装配' },
              { text: 'SpringBoot ConfigurationProperties', link: '/SpringBoot/SpringBoot-ConfigurationProperties' },
              { text: 'SpringBoot 日志系统', link: '/SpringBoot/SpringBoot-LogSystem' },
              { text: 'SpringBoot ConditionalOnBean', link: '/SpringBoot/SpringBoot-ConditionalOnBean' },
            ],
          },
          {
            text: 'Spring Cloud',
            collapsed: true,
            items: [
              { text: 'Spring Cloud Commons 源码', link: '/SpringCloud/spring-cloud-commons-source-note' },
              { text: 'Spring Cloud OpenFeign 源码', link: '/SpringCloud/spring-cloud-openfeign-source-note' },
              { text: 'Spring Cloud Gateway 源码', link: '/SpringCloud/spring-cloud-gateway-source-note' },
            ],
          },
          {
            text: 'SpringSecurity',
            collapsed: true,
            items: [
              { text: 'SpringSecurity 请求全过程解析', link: '/SpringSecurity/SpringSecurity请求全过程解析' },
              // { text: 'SpringSecurity 自定义用户认证', link: '/SpringSecurity/SpringSecurity自定义用户认证' },
              // { text: 'SpringSecurity 流程补充', link: '/SpringSecurity/SpringSecurity流程补充' },
            ],
          },
        ],
      },
      {
        text: 'MyBatis',
        collapsed: true,
        items: [
          {
            text: '基础支持层',
            collapsed: true,
            items: [
              { text: '反射工具箱和 TypeHandler 系列', link: '/Mybatis/基础支持层/1、反射工具箱和TypeHandler系列' },
              { text: 'DataSource 及 Transaction 模块', link: '/Mybatis/基础支持层/2、DataSource及Transaction模块' },
              { text: 'binding 模块', link: '/Mybatis/基础支持层/3、binding模块' },
              { text: '缓存模块', link: '/Mybatis/基础支持层/4、缓存模块' },
            ],
          },
          {
            text: '核心处理层',
            collapsed: true,
            items: [
              { text: 'MyBatis 初始化', link: '/Mybatis/核心处理层/1、MyBatis初始化' },
              { text: 'SqlNode 和 SqlSource', link: '/Mybatis/核心处理层/2、SqlNode和SqlSource' },
              { text: 'ResultSetHandler', link: '/Mybatis/核心处理层/3、ResultSetHandler' },
              { text: 'StatementHandler', link: '/Mybatis/核心处理层/4、StatementHandler' },
              { text: 'Executor 组件', link: '/Mybatis/核心处理层/5、Executor组件' },
              { text: 'SqlSession 组件', link: '/Mybatis/核心处理层/6、SqlSession组件' },
            ],
          },
          {
            text: '类解析',
            collapsed: true,
            items: [
              { text: 'Mybatis-Cache', link: '/Mybatis/基础支持层/Mybatis-Cache' },
              { text: 'Mybatis-log', link: '/Mybatis/基础支持层/Mybatis-log' },
              { text: 'Mybatis-Reflector', link: '/Mybatis/基础支持层/Mybatis-Reflector' },
              { text: 'Mybatis-Alias', link: '/Mybatis/核心处理层/Mybatis-Alias' },
              { text: 'Mybatis-Cursor', link: '/Mybatis/核心处理层/Mybatis-Cursor' },
              { text: 'Mybatis-DataSource', link: '/Mybatis/核心处理层/Mybatis-DataSource' },
              { text: 'Mybatis-DynamicSqlSource', link: '/Mybatis/核心处理层/Mybatis-DynamicSqlSource' },
              { text: 'Mybatis-MapperMethod', link: '/Mybatis/核心处理层/Mybatis-MapperMethod' },
              { text: 'Mybatis-MetaObject', link: '/Mybatis/核心处理层/Mybatis-MetaObject' },
              { text: 'Mybatis-MethodSignature', link: '/Mybatis/核心处理层/Mybatis-MethodSignature' },
              { text: 'Mybatis-ObjectWrapper', link: '/Mybatis/核心处理层/Mybatis-ObjectWrapper' },
              { text: 'Mybatis-ParamNameResolver', link: '/Mybatis/核心处理层/Mybatis-ParamNameResolver' },
              { text: 'Mybatis-SqlCommand', link: '/Mybatis/核心处理层/Mybatis-SqlCommand' },
              { text: 'Mybatis-GenericTokenParser', link: '/Mybatis/核心处理层/Mybatis-GenericTokenParser' },
            ],
          },
        ],
      },
      {
        text: 'Netty',
        collapsed: true,
        items: [
          {
            text: '网络 IO 技术基础',
            collapsed: true,
            items: [
              { text: '把被说烂的 BIO、NIO、AIO 再从头到尾扯一遍', link: '/Netty/IOTechnologyBase/把被说烂的BIO、NIO、AIO再从头到尾扯一遍' },
              { text: 'IO 模型', link: '/Netty/IOTechnologyBase/IO模型' },
              { text: '四种 IO 编程及对比', link: '/Netty/IOTechnologyBase/四种IO编程及对比' },
            ],
          },
          {
            text: 'JDK1.8 NIO 包 核心组件源码剖析',
            collapsed: true,
            items: [
              { text: 'Selector、SelectionKey 及 Channel 组件', link: '/Netty/IOTechnologyBase/Selector、SelectionKey及Channel组件' },
            ],
          },
          {
            text: 'Netty 粘拆包及解决方案',
            collapsed: true,
            items: [
              { text: 'TCP 粘拆包问题及 Netty 中的解决方案', link: '/Netty/TCP粘拆包/TCP粘拆包问题及Netty中的解决方案' },
            ],
          },
          {
            text: 'Netty 多协议开发',
            collapsed: true,
            items: [
              { text: '基于 HTTP 协议的 Netty 开发', link: '/Netty/Netty多协议开发/基于HTTP协议的Netty开发' },
              { text: '基于 WebSocket 协议的 Netty 开发', link: '/Netty/Netty多协议开发/基于WebSocket协议的Netty开发' },
              { text: '基于自定义协议的 Netty 开发', link: '/Netty/Netty多协议开发/基于自定义协议的Netty开发' },
            ],
          },
          {
            text: '基于 Netty 开发服务端及客户端',
            collapsed: true,
            items: [
              { text: '基于 Netty 的服务端开发', link: '/Netty/基于Netty开发服务端及客户端/基于Netty的服务端开发' },
              { text: '基于 Netty 的客户端开发', link: '/Netty/基于Netty开发服务端及客户端/基于Netty的客户端开发' },
            ],
          },
          {
            text: 'Netty 主要组件的源码分析',
            collapsed: true,
            items: [
              { text: 'ByteBuf 组件', link: '/Netty/Netty主要组件源码分析/ByteBuf组件' },
              { text: 'Channel 组件 和 Unsafe 组件', link: '/Netty/Netty主要组件源码分析/Channel和Unsafe组件' },
              { text: 'EventLoop 组件', link: '/Netty/Netty主要组件源码分析/EventLoop组件' },
              { text: 'ChannelPipeline 和 ChannelHandler 组件', link: '/Netty/Netty主要组件源码分析/ChannelPipeline和ChannelHandler组件' },
              { text: 'Future 和 Promise 组件', link: '/Netty/Netty主要组件源码分析/Future和Promise组件' },
            ],
          },
          {
            text: 'Netty 高级特性',
            collapsed: true,
            items: [
              { text: 'Netty 架构设计', link: '/Netty/AdvancedFeaturesOfNetty/Netty架构设计' },
              { text: 'Netty 高性能之道', link: '/Netty/AdvancedFeaturesOfNetty/Netty高性能之道' },
            ],
          },
          {
            text: 'Netty 技术细节源码分析',
            collapsed: true,
            items: [
              { text: 'FastThreadLocal 源码分析', link: '/Netty/Netty技术细节源码分析/FastThreadLocal源码分析' },
              { text: 'Recycler 对象池原理分析', link: '/Netty/Netty技术细节源码分析/Recycler对象池原理分析' },
              { text: 'MpscLinkedQueue 队列原理分析', link: '/Netty/Netty技术细节源码分析/MpscLinkedQueue队列原理分析' },
              { text: 'HashedWheelTimer 时间轮原理分析', link: '/Netty/Netty技术细节源码分析/HashedWheelTimer时间轮原理分析' },
              { text: 'HashedWheelTimer & schedule', link: '/Netty/Netty技术细节源码分析/HashedWheelTimer&schedule' },
              { text: 'ByteBuf 的内存泄漏原因与检测原理', link: '/Netty/Netty技术细节源码分析/ByteBuf的内存泄漏原因与检测原理' },
              { text: '内存池之 PoolChunk 设计与实现', link: '/Netty/Netty技术细节源码分析/内存池之PoolChunk设计与实现' },
              { text: '内存池之从内存池申请内存', link: '/Netty/Netty技术细节源码分析/内存池之从内存池申请内存' },
            ],
          },
        ],
      },
      {
        text: 'Dubbo',
        collapsed: true,
        items: [
          {
            text: '架构设计',
            collapsed: true,
            items: [
              { text: 'Dubbo 整体架构', link: '/Dubbo/architectureDesign/Dubbo整体架构' },
            ],
          },
          {
            text: 'SPI 机制',
            collapsed: true,
            items: [
              { text: 'Dubbo 与 Java 的 SPI 机制', link: '/Dubbo/SPI/Dubbo与Java的SPI机制' },
            ],
          },
          {
            text: '注册中心',
            collapsed: true,
            items: [
              { text: 'Dubbo 注册中心模块简析', link: '/Dubbo/registry/Dubbo注册中心模块简析' },
              { text: '注册中心的 Zookeeper 实现', link: '/Dubbo/registry/注册中心的Zookeeper实现' },
            ],
          },
          {
            text: '远程通信',
            collapsed: true,
            items: [
              { text: 'Dubbo 远程通信模块简析', link: '/Dubbo/remote/Dubbo远程通信模块简析' },
              { text: 'Transport 组件', link: '/Dubbo/remote/Transport组件' },
              { text: 'Exchange 组件', link: '/Dubbo/remote/Exchange组件' },
              { text: 'Buffer 组件', link: '/Dubbo/remote/Buffer组件' },
              { text: '基于 Netty 实现远程通信', link: '/Dubbo/remote/基于Netty实现远程通信' },
              { text: '基于 HTTP 实现远程通信', link: '/Dubbo/remote/基于HTTP实现远程通信' },
            ],
          },
          {
            text: 'RPC',
            collapsed: true,
            items: [
              { text: 'RPC 模块简析', link: '/Dubbo/RPC/RPC模块简析' },
              { text: 'Protocol 组件', link: '/Dubbo/RPC/Protocol组件' },
              { text: 'Proxy 组件', link: '/Dubbo/RPC/Proxy组件' },
              { text: 'Dubbo 协议', link: '/Dubbo/RPC/Dubbo协议' },
              { text: 'Hessian 协议', link: '/Dubbo/RPC/Hessian协议' },
            ],
          },
          {
            text: '集群',
            collapsed: true,
            items: [
              { text: 'Dubbo 集群模块简析', link: '/Dubbo/cluster/Dubbo集群模块简析' },
              { text: '负载均衡', link: '/Dubbo/cluster/负载均衡' },
              { text: '集群容错', link: '/Dubbo/cluster/集群容错' },
              { text: 'mock 与服务降级', link: '/Dubbo/cluster/mock与服务降级' },
            ],
          },
        ],
      },
      {
        text: 'Tomcat',
        collapsed: true,
        items: [
          {
            text: 'Servlet 与 Servlet 容器',
            collapsed: true,
            items: [
              { text: 'servlet-api 源码赏析', link: '/Tomcat/servlet-api源码赏析' },
              { text: '一个简单的 Servlet 容器', link: '/Tomcat/一个简单的servlet容器代码设计' },
              { text: 'Servlet 容器详解', link: '/Tomcat/servlet容器详解' },
            ],
          },
          {
            text: 'Web 容器',
            collapsed: true,
            items: [
              { text: '一个简单的 Web 服务器', link: '/Tomcat/一个简单的Web服务器代码设计' },
            ],
          },
        ],
      },
      {
        text: 'Redis',
        collapsed: true,
        items: [
          { text: '深挖 Redis 6.0 源码——SDS', link: '/Redis/redis-sds' },
        ],
      },
      {
        text: 'Nacos',
        collapsed: true,
        items: [
          { text: 'nacos 服务注册', link: '/nacos/nacos-discovery' },
        ],
      },
      {
        text: 'Sentinel',
        collapsed: true,
        items: [
          { text: 'sentinel 时间窗口实现', link: '/Sentinel/Sentinel时间窗口的实现' },
          { text: 'Sentinel 底层 LongAdder 的计数实现', link: '/Sentinel/Sentinel底层LongAdder的计数实现' },
          { text: 'Sentinel 限流算法的实现', link: '/Sentinel/Sentinel限流算法的实现' },
        ],
      },
      {
        text: 'RocketMQ',
        collapsed: true,
        items: [
          { text: 'RocketMQ NameServer 与 Broker 的通信', link: '/rocketmq/rocketmq-nameserver-broker' },
          { text: 'RocketMQ 生产者启动流程', link: '/rocketmq/rocketmq-producer-start' },
          { text: 'RocketMQ 消息发送流程', link: '/rocketmq/rocketmq-send-message' },
          { text: 'RocketMQ 消息发送存储流程', link: '/rocketmq/rocketmq-send-store' },
          { text: 'RocketMQ MappedFile 内存映射文件详解', link: '/rocketmq/rocketmq-mappedfile-detail' },
          { text: 'RocketMQ ConsumeQueue 详解', link: '/rocketmq/rocketmq-consumequeue' },
          { text: 'RocketMQ CommitLog 详解', link: '/rocketmq/rocketmq-commitlog' },
          { text: 'RocketMQ IndexFile 详解', link: '/rocketmq/rocketmq-indexfile' },
          { text: 'RocketMQ 消费者启动流程', link: '/rocketmq/rocketmq-consumer-start' },
          { text: 'RocketMQ 消息拉取流程', link: '/rocketmq/rocketmq-pullmessage' },
          { text: 'RocketMQ Broker 处理拉取消息请求流程', link: '/rocketmq/rocketmq-pullmessage-processor' },
          { text: 'RocketMQ 消息消费流程', link: '/rocketmq/rocketmq-consume-message-process' },
        ],
      },
      {
        text: '番外篇（JDK 1.8）',
        collapsed: true,
        items: [
          {
            text: '基础类库',
            collapsed: true,
            items: [
              { text: 'String 类 源码赏析', link: '/JDK/basic/String' },
              { text: 'Thread 类 源码赏析', link: '/JDK/basic/Thread' },
              { text: 'ThreadLocal 类 源码赏析', link: '/JDK/basic/ThreadLocal' },
            ],
          },
          {
            text: '集合',
            collapsed: true,
            items: [
              { text: 'HashMap 类 源码赏析', link: '/JDK/collection/HashMap' },
              { text: 'ConcurrentHashMap 类 源码赏析', link: '/JDK/collection/ConcurrentHashMap' },
              { text: 'LinkedHashMap 类 源码赏析', link: '/JDK/collection/LinkedHashMap' },
              { text: 'ArrayList 类 源码赏析', link: '/JDK/collection/ArrayList' },
              { text: 'LinkedList 类 源码赏析', link: '/JDK/collection/LinkedList' },
              { text: 'HashSet 类 源码赏析', link: '/JDK/collection/HashSet' },
              { text: 'TreeSet 类 源码赏析', link: '/JDK/collection/TreeSet' },
            ],
          },
          {
            text: '并发编程',
            collapsed: true,
            items: [
              { text: 'JUC 并发包 UML 全量类图', link: '/JDK/concurrentCoding/JUC并发包UML全量类图' },
              { text: 'Executor 线程池组件 源码赏析', link: '/JDK/concurrentCoding/Executor线程池组件' },
              { text: 'Lock 锁组件 源码赏析', link: '/JDK/concurrentCoding/Lock锁组件' },
              { text: '详解 AbstractQueuedSynchronizer 抽象类', link: '/JDK/concurrentCoding/详解AbstractQueuedSynchronizer' },
              { text: 'Semaphore 类 源码赏析', link: '/JDK/concurrentCoding/Semaphore' },
            ],
          },
        ],
      },
      {
        text: '学习心得',
        collapsed: true,
        items: [
          {
            text: '个人经验',
            collapsed: true,
            items: [
              { text: '初级开发者应该从 Spring 源码中学什么', link: '/LearningExperience/PersonalExperience/初级开发者应该从spring源码中学什么' },
            ],
          },
          {
            text: '设计模式',
            collapsed: true,
            items: [
              { text: '从 Spring 及 Mybatis 框架源码中学习设计模式(创建型)', link: '/LearningExperience/DesignPattern/从Spring及Mybatis框架源码中学习设计模式(创建型)' },
              { text: '从 Spring 及 Mybatis 框架源码中学习设计模式(行为型)', link: '/LearningExperience/DesignPattern/从Spring及Mybatis框架源码中学习设计模式(行为型)' },
              { text: '从 Spring 及 Mybatis 框架源码中学习设计模式(结构型)', link: '/LearningExperience/DesignPattern/从Spring及Mybatis框架源码中学习设计模式(结构型)' },
            ],
          },
          {
            text: '多线程',
            collapsed: true,
            items: [
              { text: 'Java 并发编程在各主流框架中的应用', link: '/LearningExperience/ConcurrentProgramming/Java并发编程在各主流框架中的应用' },
            ],
          },
        ],
      },
    ],    
    socialLinks: [
      { icon: 'github', link: 'https://github.com/doocs/source-code-hunter' }
    ],
  }
})
