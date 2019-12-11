和spring框架的IoC容器初始化一样，mybatis也会通过定位、解析相应的配置文件完成自己的初始化。mybatis的配置文件主要有mybatis-config.xml核心配置文件及一系列映射配置文件，另外，mybatis也会根据注解进行配置。
## 1 BaseBuilder
mybatis初始化的主要内容是加载并解析mybatis-config.xml配置文件、映射配置文件以及相关的注解信息。mybatis的初始化入口是SqlSessionFactoryBuilder的build()方法。
```java
public class SqlSessionFactoryBuilder {

  public SqlSessionFactory build(Reader reader) {
    return build(reader, null, null);
  }

  public SqlSessionFactory build(Reader reader, String environment) {
    return build(reader, environment, null);
  }

  public SqlSessionFactory build(Reader reader, Properties properties) {
    return build(reader, null, properties);
  }

  /**
   * build方法的主要实现
   */
  public SqlSessionFactory build(Reader reader, String environment, Properties properties) {
    try {
      // SqlSessionFactory会创建XMLConfigBuilder对象来解析mybatis-config.xml配置文件
      // XMLConfigBuilder继承自BaseBuilder抽象类，顾名思义这一系的类使用了 建造者设计模式
      XMLConfigBuilder parser = new XMLConfigBuilder(reader, environment, properties);
      // 解析配置文件的内容 到Configuration对象，根据到Configuration对象
      // 创建DefaultSqlSessionFactory对象，然后返回
      return build(parser.parse());
    } catch (Exception e) {
      throw ExceptionFactory.wrapException("Error building SqlSession.", e);
    } finally {
      ErrorContext.instance().reset();
      try {
        // 关闭配置文件输入流
        reader.close();
      } catch (IOException e) {
        // Intentionally ignore. Prefer previous error.
      }
    }
  }

  public SqlSessionFactory build(Configuration config) {
    return new DefaultSqlSessionFactory(config);
  }
```
BaseBuilder中的核心字段如下：
```java
public abstract class BaseBuilder {

  // 保存了mybatis的几乎所以核心配置信息，全局唯一
  protected final Configuration configuration;
  // 在mybatis-config.xml中可以通过<typeAliases>标签定义别名
  protected final TypeAliasRegistry typeAliasRegistry;
  // 在mybatis-config.xml中可以通过<typeHandlers>标签添加自定义TypeHandler
  // TypeHandler用于完成JDBC数据类型与Java类型的相互转换，所有的TypeHandler
  // 都保存在typeHandlerRegistry中
  protected final TypeHandlerRegistry typeHandlerRegistry;
  
  public BaseBuilder(Configuration configuration) {
    this.configuration = configuration;
    this.typeAliasRegistry = this.configuration.getTypeAliasRegistry();
    this.typeHandlerRegistry = this.configuration.getTypeHandlerRegistry();
  }
}
```
BaseBuilder中的typeAliasRegistry和typeHandlerRegistry字段均来自于configuration，通过BaseBuilder的构造方法可以看到详细内容。
## 2 XMLConfigBuilder
XMLConfigBuilder是BaseBuilder的众多子类之一，主要负责解析mybatis-config.xml配置文件。它通过调用parseConfiguration()方法实现整个解析过程，其中，mybatis-config.xml配置文件中的每个节点都被封装成了一个个相应的解析方法，parseConfiguration()方法只是依次调用了这些解析方法而已。
```java
public class XMLConfigBuilder extends BaseBuilder {

  // 标记是否解析过mybatis-config.xml文件
  private boolean parsed;
  // 用于解析mybatis-config.xml的解析器
  private final XPathParser parser;
  // 标识<environment>配置的名称，默认读取<environment>标签的default属性
  private String environment;
  // 创建并缓存Reflector对象
  private final ReflectorFactory localReflectorFactory = new DefaultReflectorFactory();

  /**
   * 解析的入口，调用了parseConfiguration()进行后续的解析
   */
  public Configuration parse() {
    // parsed标志位的处理
    if (parsed) {
      throw new BuilderException("Each XMLConfigBuilder can only be used once.");
    }
    parsed = true;
    // 在mybatis-config.xml配置文件中查找<configuration>节点，并开始解析
    parseConfiguration(parser.evalNode("/configuration"));
    return configuration;
  }

  private void parseConfiguration(XNode root) {
    try {
      // 根据root.evalNode("properties")中的值就可以知道具体是解析哪个标签的方法咯
      propertiesElement(root.evalNode("properties"));
      Properties settings = settingsAsProperties(root.evalNode("settings"));
      loadCustomVfs(settings);
      typeAliasesElement(root.evalNode("typeAliases"));
      pluginElement(root.evalNode("plugins"));
      objectFactoryElement(root.evalNode("objectFactory"));
      objectWrapperFactoryElement(root.evalNode("objectWrapperFactory"));
      reflectorFactoryElement(root.evalNode("reflectorFactory"));
      settingsElement(settings);
      // read it after objectFactory and objectWrapperFactory issue #631
      environmentsElement(root.evalNode("environments"));
      databaseIdProviderElement(root.evalNode("databaseIdProvider"));
      typeHandlerElement(root.evalNode("typeHandlers"));
      mapperElement(root.evalNode("mappers"));
    } catch (Exception e) {
      throw new BuilderException("Error parsing SQL Mapper Configuration. Cause: " + e, e);
    }
  }
```
mybatis中的标签很多，所以相对应的解析方法也很多，这里挑几个比较重要的标签进行分析。
### 2.1 解析&lt;typeHandlers&gt;标签
```java
  private void typeHandlerElement(XNode parent) throws Exception {
    if (parent != null) {
      // 处理<typeHandlers>下的所有子标签
      for (XNode child : parent.getChildren()) {
        // 处理<package>标签
        if ("package".equals(child.getName())) {
          // 获取指定的包名
          String typeHandlerPackage = child.getStringAttribute("name");
          // 通过typeHandlerRegistry的register(packageName)方法
          // 扫描指定包中的所有TypeHandler类，并进行注册
          typeHandlerRegistry.register(typeHandlerPackage);
        } else {
          // Java数据类型
          String javaTypeName = child.getStringAttribute("javaType");
          // JDBC数据类型
          String jdbcTypeName = child.getStringAttribute("jdbcType");
          String handlerTypeName = child.getStringAttribute("handler");
          Class<?> javaTypeClass = resolveClass(javaTypeName);
          JdbcType jdbcType = resolveJdbcType(jdbcTypeName);
          Class<?> typeHandlerClass = resolveClass(handlerTypeName);
          // 注册
          if (javaTypeClass != null) {
            if (jdbcType == null) {
              typeHandlerRegistry.register(javaTypeClass, typeHandlerClass);
            } else {
              typeHandlerRegistry.register(javaTypeClass, jdbcType, typeHandlerClass);
            }
          } else {
            typeHandlerRegistry.register(typeHandlerClass);
          }
        }
      }
    }
  }
```
### 2.2 解析&lt;environments&gt;标签
```java
  /**
   * mybatis可以配置多个<environment>环境，分别用于开发、测试及生产等，
   * 但每个SqlSessionFactory实例只能选择其一
   */
  private void environmentsElement(XNode context) throws Exception {
    if (context != null) {
      // 如果未指定XMLConfigBuilder的environment字段，则使用default属性指定的<environment>环境
      if (environment == null) {
        environment = context.getStringAttribute("default");
      }
      // 遍历<environment>节点
      for (XNode child : context.getChildren()) {
        String id = child.getStringAttribute("id");
        if (isSpecifiedEnvironment(id)) {
          // 实例化TransactionFactory
          TransactionFactory txFactory = transactionManagerElement(child.evalNode("transactionManager"));
          // 创建DataSourceFactory和DataSource
          DataSourceFactory dsFactory = dataSourceElement(child.evalNode("dataSource"));
          DataSource dataSource = dsFactory.getDataSource();
          // 创建的Environment对象中封装了上面的TransactionFactory对象和DataSource对象
          Environment.Builder environmentBuilder = new Environment.Builder(id)
              .transactionFactory(txFactory)
              .dataSource(dataSource);
          // 为configuration注入environment属性值
          configuration.setEnvironment(environmentBuilder.build());
        }
      }
    }
  }
```
### 2.3 解析&lt;databaseIdProvider&gt;标签
```java

```
### 2.4 解析&lt;mappers&gt;标签
```java

```








