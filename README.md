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

### SpringMVC
- [温习一下servlet](/docs/Spring/SpringMVC/温习一下servlet.md)
- [IoC 容器在 Web 环境中的启动](/docs/Spring/SpringMVC/IoC容器在Web环境中的启动.md)
- [SpringMVC 的设计与实现](/docs/Spring/SpringMVC/SpringMVC的设计与实现.md)

### SpringJDBC


### Spring事务
- [Spring与事务处理](/docs/Spring/SpringTransaction/Spring与事务处理.md)
- [Spring声明式事务处理](/docs/Spring/SpringTransaction/Spring声明式事务处理.md)
- [Spring事务处理的设计与实现](/docs/Spring/SpringTransaction/Spring事务处理的设计与实现.md)
- [Spring事务处理器的设计与实现](/docs/Spring/SpringTransaction/Spring事务处理器的设计与实现.md)

### Spring源码故事（瞎编版）
- [面筋哥 IoC 容器的一天(上)](/docs/Spring/Spring源码故事（瞎编版）/面筋哥IoC容器的一天(上).md)

## MyBatis
### 基础支持层
- [反射工具箱和TypeHandler系列](docs/Mybatis/基础支持层/1、反射工具箱和TypeHandler系列.md)
- [DataSource及Transaction模块](docs/Mybatis/基础支持层/2、DataSource及Transaction模块.md)
- [binding模块](docs/Mybatis/基础支持层/3、binding模块.md)
- [缓存模块](docs/Mybatis/基础支持层/4、缓存模块.md)
### 核心处理层
- [MyBatis初始化](docs/Mybatis/核心处理层/1、MyBatis初始化.md)
- [SqlNode和SqlSource](docs/Mybatis/核心处理层/2、SqlNode和SqlSource.md)
- [ResultSetHandler](docs/Mybatis/核心处理层/3、ResultSetHandler.md)
- [StatementHandler](docs/Mybatis/核心处理层/4、StatementHandler.md)
- [Executor组件](docs/Mybatis/核心处理层/5、Executor组件.md)
- [SqlSession组件](docs/Mybatis/核心处理层/6、SqlSession组件.md)
## Netty
### IO
- [把被说烂的BIO、NIO、AIO再从头到尾扯一遍](docs/Netty/IO/把被说烂的BIO、NIO、AIO再从头到尾扯一遍.md)

### 设计原理

## Redis

## Tomcat

## 学习心得
### 个人经验
- [初级开发者应该从 spring 源码中学什么](docs/学习心得/个人经验/初级开发者应该从spring源码中学什么.md)

### 编码规范

### 设计模式

## 贡献者
感谢以下所有朋友对 [GitHub 技术社区 Doocs](https://github.com/doocs) 所做出的贡献，[参与项目维护请戳这儿](https://doocs.github.io/#/?id=how-to-join)。

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->

<a href="https://opencollective.com/doocs/contributors.svg?width=890&button=true"><img src="https://opencollective.com/doocs/contributors.svg?width=890&button=false" /></a>

<!-- ALL-CONTRIBUTORS-LIST:END -->