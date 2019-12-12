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
mybatis不像hibernate那样，通过hql的方式直接帮助开发人员屏蔽不同数据库产品在sql语法上的差异，针对不同的数据库产品，mybatis往往要编写不同的sql语句。但在mybatis-config.xml配置文件中，可以通过&lt;databaseIdProvider&gt;定义所有支持的数据库产品的databaseId，然后在映射配置文件中定义sql语句节点时，通过databaseId指定该sql语句应用的数据库产品，也可以达到类似的屏蔽数据库产品的功能。

mybatis初始化时，会根据前面解析到的DataSource来确认当前使用的数据库产品，然后在解析映射文件时，加载不带databaseId属性的sql语句 及 带有databaseId属性的sql语句，其中，带有databaseId属性的sql语句优先级更高，会被优先选中。
```java
  /**
   * 解析<databaseIdProvider>节点，并创建指定的DatabaseIdProvider对象，
   * 该对象会返回databaseId的值，mybatis会根据databaseId选择对应的sql语句去执行
   */
  private void databaseIdProviderElement(XNode context) throws Exception {
    DatabaseIdProvider databaseIdProvider = null;
    if (context != null) {
      String type = context.getStringAttribute("type");
      // 为了保证兼容性，修改type取值
      if ("VENDOR".equals(type)) {
          type = "DB_VENDOR";
      }
      // 解析相关配置信息
      Properties properties = context.getChildrenAsProperties();
      // 创建DatabaseIdProvider对象
      databaseIdProvider = (DatabaseIdProvider) resolveClass(type).newInstance();
      // 配置DatabaseIdProvider，完成初始化
      databaseIdProvider.setProperties(properties);
    }
    Environment environment = configuration.getEnvironment();
    if (environment != null && databaseIdProvider != null) {
      // 根据前面解析到的DataSource获取databaseId，并记录到configuration的configuration属性上
      String databaseId = databaseIdProvider.getDatabaseId(environment.getDataSource());
      configuration.setDatabaseId(databaseId);
    }
  }
```
mybatis提供了DatabaseIdProvider接口，该接口的核心方法为getDatabaseId(DataSource dataSource)，主要根据dataSource查找对应的databaseId并返回。该接口的主要实现类为VendorDatabaseIdProvider。
```java
public class VendorDatabaseIdProvider implements DatabaseIdProvider {

  private static final Log log = LogFactory.getLog(VendorDatabaseIdProvider.class);

  private Properties properties;

  @Override
  public void setProperties(Properties p) {
    this.properties = p;
  }

  @Override
  public String getDatabaseId(DataSource dataSource) {
    if (dataSource == null) {
      throw new NullPointerException("dataSource cannot be null");
    }
    try {
      return getDatabaseName(dataSource);
    } catch (Exception e) {
      log.error("Could not get a databaseId from dataSource", e);
    }
    return null;
  }

  private String getDatabaseName(DataSource dataSource) throws SQLException {
    // 解析到数据库产品名
    String productName = getDatabaseProductName(dataSource);
    if (this.properties != null) {
      // 根据<databaseIdProvider>子节点配置的数据库产品 和 databaseId之间的对应关系，
      // 确定最终使用的databaseId
      for (Map.Entry<Object, Object> property : properties.entrySet()) {
        if (productName.contains((String) property.getKey())) {
          return (String) property.getValue();
        }
      }
      // 没有合适的databaseId，则返回null
      return null;
    }
    return productName;
  }

  // 根据dataSource获取 数据库产品名的具体实现
  private String getDatabaseProductName(DataSource dataSource) throws SQLException {
    Connection con = null;
    try {
      con = dataSource.getConnection();
      DatabaseMetaData metaData = con.getMetaData();
      return metaData.getDatabaseProductName();
    } finally {
      if (con != null) {
        try {
          con.close();
        } catch (SQLException e) {
          // ignored
        }
      }
    }
  }
}
```
### 2.4 解析&lt;mappers&gt;标签
mybatis初始化时，除了加载mybatis-config.xml文件，还会加载全部的映射配置文件，mybatis-config.xml文件的&lt;mapper&gt;节点会告诉mybatis去哪里查找映射配置文件，及使用了配置注解标识的接口。
```java
  /**
   * 解析<mappers>节点，本方法会创建XMLMapperBuilder对象加载映射文件，如果映射配置文件存在
   * 相应的Mapper接口，也会加载相应的Mapper接口，解析其中的注解 并完成向MapperRegistry的注册
   */
  private void mapperElement(XNode parent) throws Exception {
    if (parent != null) {
      // 处理<mappers>的子节点
      for (XNode child : parent.getChildren()) {
        if ("package".equals(child.getName())) {
          // 获取<package>子节点中的包名
          String mapperPackage = child.getStringAttribute("name");
          // 扫描指定的包目录，然后向MapperRegistry注册Mapper接口
          configuration.addMappers(mapperPackage);
        } else {
          // 获取<mapper>节点的resource、url、mapperClass属性，这三个属性互斥，只能有一个不为空
          // mybatis提供了通过包名、映射文件路径、类全名、URL四种方式引入映射器。
          // 映射器由一个接口和一个XML配置文件组成，XML文件中定义了一个命名空间namespace，
          // 它的值就是接口对应的全路径。
          String resource = child.getStringAttribute("resource");
          String url = child.getStringAttribute("url");
          String mapperClass = child.getStringAttribute("class");
          // 如果<mapper>节点指定了resource或是url属性，则创建XMLMapperBuilder对象解析
          // resource或是url属性指定的Mapper配置文件
          if (resource != null && url == null && mapperClass == null) {
            ErrorContext.instance().resource(resource);
            InputStream inputStream = Resources.getResourceAsStream(resource);
            XMLMapperBuilder mapperParser = new XMLMapperBuilder(inputStream, configuration, resource, configuration.getSqlFragments());
            mapperParser.parse();
          } else if (resource == null && url != null && mapperClass == null) {
            ErrorContext.instance().resource(url);
            InputStream inputStream = Resources.getUrlAsStream(url);
            XMLMapperBuilder mapperParser = new XMLMapperBuilder(inputStream, configuration, url, configuration.getSqlFragments());
            mapperParser.parse();
          } else if (resource == null && url == null && mapperClass != null) {
            // 如果<mapper>节点指定了class属性，则向MapperRegistry注册该Mapper接口
            Class<?> mapperInterface = Resources.classForName(mapperClass);
            configuration.addMapper(mapperInterface);
          } else {
            throw new BuilderException("A mapper element may only specify a url, resource or class, but not more than one.");
          }
        }
      }
    }
  }
```
## 3 XMLMapperBuilder
和XMLConfigBuilder一样，XMLMapperBuilder也继承了BaseBuilder，其主要负责解析映射配置文件，其解析配置文件的入口方法也是parse()，另外，XMLMapperBuilder也将各个节点的解析过程拆分成了一个个小方法，然后由configurationElement()方法统一调用。
```java
public class XMLMapperBuilder extends BaseBuilder {
  public void parse() {
    // 是否已经加载过该配置文件
    if (!configuration.isResourceLoaded(resource)) {
      // 解析<mapper>节点
      configurationElement(parser.evalNode("/mapper"));
      // 将resource添加到configuration的loadedResources属性中，
      // 该属性是一个HashSet<String>类型的集合，其中记录了已经加载过的映射文件
      configuration.addLoadedResource(resource);
      // 注册Mapper接口
      bindMapperForNamespace();
    }
    // 处理configurationElement()方法中解析失败的<resultMap>节点
    parsePendingResultMaps();
    // 处理configurationElement()方法中解析失败的<cacheRef>节点
    parsePendingCacheRefs();
    // 处理configurationElement()方法中解析失败的<statement>节点
    parsePendingStatements();
  }

  private void configurationElement(XNode context) {
    try {
      // 获取<mapper>节点的namespace属性
      String namespace = context.getStringAttribute("namespace");
      if (namespace == null || namespace.equals("")) {
        throw new BuilderException("Mapper's namespace cannot be empty");
      }
      // 使用MapperBuilderAssistant对象的currentNamespace属性 记录namespace命名空间
      builderAssistant.setCurrentNamespace(namespace);
      // 解析<cache-ref>节点，后面的解析方法 也都见名知意
      cacheRefElement(context.evalNode("cache-ref"));
      cacheElement(context.evalNode("cache"));
      parameterMapElement(context.evalNodes("/mapper/parameterMap"));
      resultMapElements(context.evalNodes("/mapper/resultMap"));
      sqlElement(context.evalNodes("/mapper/sql"));
      buildStatementFromContext(context.evalNodes("select|insert|update|delete"));
    } catch (Exception e) {
      throw new BuilderException("Error parsing Mapper XML. The XML location is '" + resource + "'. Cause: " + e, e);
    }
  }
}
```
XMLMapperBuilder也根据配置文件进行了一系列节点解析，我们着重分析一下比较重要且常见的&lt;resultMap&gt;节点和&lt;sql&gt;节点
### 3.1 解析&lt;resultMap&gt;节点
select语句查询得到的结果是一张二维表，水平方向上是一个个字段，垂直方向上是一条条记录。而Java是面向对象的程序设计语言，对象是根据类的定义创建的，类之间的引用关系可以认为是嵌套结构。JDBC编程中，为了将结果集中的数据映射成VO对象，我们需要自己写代码从结果集中获取数据，然后将数据封装成对应的VO对象，并设置好对象之间的关系，这种ORM的过程中存在大量重复的代码。

mybatis通过&lt;resultMap&gt;节点定义了ORM规则，可以满足大部分的映射需求，减少重复代码，提高开发效率。

在分析&lt;resultMap&gt;节点的解析过程之前，先看一下该过程使用的数据结构。每个ResultMapping对象记录了结果集中的一列与JavaBean中一个属性之间的映射关系。&lt;resultMap&gt;节点下除了&lt;discriminator&gt;子节点的其它子节点 都会被解析成对应的ResultMapping对象。
```java
public class ResultMapping {

  private Configuration configuration;
  // 对应节点的property属性，表示 该列进行映射的属性
  private String property;
  // 对应节点的column属性，表示 从数据库中得到的列名或列名的别名
  private String column;
  // 表示 一个JavaBean的完全限定名，或一个类型别名
  private Class<?> javaType;
  // 进行映射列的JDBC类型
  private JdbcType jdbcType;
  // 类型处理器
  private TypeHandler<?> typeHandler;
  // 该属性通过id引用了另一个<resultMap>节点，它负责将结果集中的一部分列映射成
  // 它所关联的结果对象。这样我们就可以通过join方式进行关联查询，然后直接映射成
  // 多个对象，并同时设置这些对象之间的组合关系(nested嵌套的)
  private String nestedResultMapId;
  // 该属性通过id引用了另一个<select>节点，它会把指定的列值传入select属性指定的
  // select语句中 作为参数进行查询。使用该属性可能会导致ORM中的N+1问题，请谨慎使用
  private String nestedQueryId;
  private Set<String> notNullColumns;
  private String columnPrefix;
  // 处理后的标志，共有两个：id和constructor
  private List<ResultFlag> flags;
  private List<ResultMapping> composites;
  private String resultSet;
  private String foreignColumn;
  // 是否延迟加载
  private boolean lazy;
}
```

### 3.2 解析&lt;sql&gt;节点


## 4 XMLStatementBuilder

## 5 绑定Mapper接口





