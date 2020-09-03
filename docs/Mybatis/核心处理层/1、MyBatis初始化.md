和 Spring 框架 的 IoC 容器初始化 一样，Mybatis 也会通过定位、解析相应的配置文件完成自己的初始化。Mybatis 的配置文件主要有 mybatis-config.xml 核心配置文件 及一系列映射配置文件，另外，Mybatis 也会根据注解进行配置。

## 1 BaseBuilder

Mybatis 初始化 的主要内容是加载并解析 mybatis-config.xml 配置文件、映射配置文件以及相关的注解信息。Mybatis 的初始化入口是 SqlSessionFactoryBuilder 的 build()方法。

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
   * build()方法 的主要实现
   */
  public SqlSessionFactory build(Reader reader, String environment, Properties properties) {
    try {
      // SqlSessionFactory 会创建 XMLConfigBuilder对象 来解析 mybatis-config.xml配置文件
      // XMLConfigBuilder 继承自 BaseBuilder抽象类，顾名思义这一系的类使用了 建造者设计模式
      XMLConfigBuilder parser = new XMLConfigBuilder(reader, environment, properties);
      // 解析配置文件的内容 到 Configuration对象，根据 Configuration对象
      // 创建 DefaultSqlSessionFactory对象，然后返回
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

BaseBuilder 中的核心字段如下：

```java
public abstract class BaseBuilder {

  // 保存了 Mybatis 的几乎所以核心配置信息，全局唯一
  protected final Configuration configuration;
  // 在 mybatis-config.xml 中可以通过 <typeAliases>标签 定义别名
  protected final TypeAliasRegistry typeAliasRegistry;
  // 在 mybatis-config.xml 中可以通过 <typeHandlers>标签 添加 自定义TypeHandler
  // TypeHandler 用于完成 JDBC数据类型 与 Java类型 的相互转换，所有的 TypeHandler
  // 都保存在 typeHandlerRegistry 中
  protected final TypeHandlerRegistry typeHandlerRegistry;

  public BaseBuilder(Configuration configuration) {
    this.configuration = configuration;
    this.typeAliasRegistry = this.configuration.getTypeAliasRegistry();
    this.typeHandlerRegistry = this.configuration.getTypeHandlerRegistry();
  }
}
```

BaseBuilder 中的 typeAliasRegistry 和 typeHandlerRegistry 字段 均来自于 configuration，通过 BaseBuilder 的构造方法可以看到详细内容。

## 2 XMLConfigBuilder

XMLConfigBuilder 是 BaseBuilder 的众多子类之一，主要负责解析 mybatis-config.xml 配置文件。它通过调用 parseConfiguration()方法 实现整个解析过程，其中，mybatis-config.xml 配置文件 中的每个节点都被封装成了一个个相应的解析方法，parseConfiguration()方法 只是依次调用了这些解析方法而已。

```java
public class XMLConfigBuilder extends BaseBuilder {

  // 标记是否解析过 mybatis-config.xml文件
  private boolean parsed;
  // 用于解析 mybatis-config.xml 的解析器
  private final XPathParser parser;
  // 标识 <environment>配置 的名称，默认读取 <environment>标签 的 default属性
  private String environment;
  // 创建并缓存 Reflector对象
  private final ReflectorFactory localReflectorFactory = new DefaultReflectorFactory();

  /**
   * 解析的入口，调用了 parseConfiguration() 进行后续的解析
   */
  public Configuration parse() {
    // parsed标志位 的处理
    if (parsed) {
      throw new BuilderException("Each XMLConfigBuilder can only be used once.");
    }
    parsed = true;
    // 在 mybatis-config.xml配置文件 中查找 <configuration>节点，并开始解析
    parseConfiguration(parser.evalNode("/configuration"));
    return configuration;
  }

  private void parseConfiguration(XNode root) {
    try {
      // 根据 root.evalNode("properties") 中的值就可以知道具体是解析哪个标签的方法咯
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

Mybatis 中的标签很多，所以相对应的解析方法也很多，这里挑几个比较重要的标签进行分析。

### 2.1 解析&lt;typeHandlers&gt;标签

```java
  private void typeHandlerElement(XNode parent) throws Exception {
    if (parent != null) {
      // 处理 <typeHandlers> 下的所有子标签
      for (XNode child : parent.getChildren()) {
        // 处理 <package> 标签
        if ("package".equals(child.getName())) {
          // 获取指定的包名
          String typeHandlerPackage = child.getStringAttribute("name");
          // 通过 typeHandlerRegistry 的 register(packageName)方法
          // 扫描指定包中的所有 TypeHandler类，并进行注册
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
   * Mybatis 可以配置多个 <environment>环境，分别用于开发、测试及生产等，
   * 但每个 SqlSessionFactory实例 只能选择其一
   */
  private void environmentsElement(XNode context) throws Exception {
    if (context != null) {
      // 如果未指定 XMLConfigBuilder 的 environment字段，则使用 default属性 指定的 <environment>环境
      if (environment == null) {
        environment = context.getStringAttribute("default");
      }
      // 遍历 <environment>节点
      for (XNode child : context.getChildren()) {
        String id = child.getStringAttribute("id");
        if (isSpecifiedEnvironment(id)) {
          // 实例化 TransactionFactory
          TransactionFactory txFactory = transactionManagerElement(child.evalNode("transactionManager"));
          // 创建 DataSourceFactory 和 DataSource
          DataSourceFactory dsFactory = dataSourceElement(child.evalNode("dataSource"));
          DataSource dataSource = dsFactory.getDataSource();
          // 创建的 Environment对象 中封装了上面的 TransactionFactory对象 和 DataSource对象
          Environment.Builder environmentBuilder = new Environment.Builder(id)
              .transactionFactory(txFactory)
              .dataSource(dataSource);
          // 为 configuration 注入 environment属性值
          configuration.setEnvironment(environmentBuilder.build());
        }
      }
    }
  }
```

### 2.3 解析&lt;databaseIdProvider&gt;标签

Mybatis 不像 Hibernate 那样，通过 HQL 的方式直接帮助开发人员屏蔽不同数据库产品在 sql 语法 上的差异，针对不同的数据库产品， Mybatis 往往要编写不同的 sql 语句。但在 mybatis-config.xml 配置文件 中，可以通过 &lt;databaseIdProvider&gt; 定义所有支持的数据库产品的 databaseId，然后在映射配置文件中定义 sql 语句节点 时，通过 databaseId 指定该 sql 语句 应用的数据库产品，也可以达到类似的屏蔽数据库产品的功能。

Mybatis 初始化时，会根据前面解析到的 DataSource 来确认当前使用的数据库产品，然后在解析映射文件时，加载不带 databaseId 属性 的 sql 语句 及带有 databaseId 属性 的 sql 语句，其中，带有 databaseId 属性 的 sql 语句 优先级更高，会被优先选中。

```java
  /**
   * 解析 <databaseIdProvider>节点，并创建指定的 DatabaseIdProvider对象，
   * 该对象会返回 databaseId的值，Mybatis 会根据 databaseId 选择对应的 sql语句 去执行
   */
  private void databaseIdProviderElement(XNode context) throws Exception {
    DatabaseIdProvider databaseIdProvider = null;
    if (context != null) {
      String type = context.getStringAttribute("type");
      // 为了保证兼容性，修改 type取值
      if ("VENDOR".equals(type)) {
          type = "DB_VENDOR";
      }
      // 解析相关配置信息
      Properties properties = context.getChildrenAsProperties();
      // 创建 DatabaseIdProvider对象
      databaseIdProvider = (DatabaseIdProvider) resolveClass(type).newInstance();
      // 配置 DatabaseIdProvider，完成初始化
      databaseIdProvider.setProperties(properties);
    }
    Environment environment = configuration.getEnvironment();
    if (environment != null && databaseIdProvider != null) {
      // 根据前面解析到的 DataSource 获取 databaseId，并记录到 configuration 的 configuration属性 上
      String databaseId = databaseIdProvider.getDatabaseId(environment.getDataSource());
      configuration.setDatabaseId(databaseId);
    }
  }
```

Mybatis 提供了 DatabaseIdProvider 接口，该接口的核心方法为 getDatabaseId(DataSource dataSource)，主要根据 dataSource 查找对应的 databaseId 并返回。该接口的主要实现类为 VendorDatabaseIdProvider。

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
      // 根据 <databaseIdProvider>子节点 配置的数据库产品和 databaseId 之间的对应关系，
      // 确定最终使用的 databaseId
      for (Map.Entry<Object, Object> property : properties.entrySet()) {
        if (productName.contains((String) property.getKey())) {
          return (String) property.getValue();
        }
      }
      // 没有合适的 databaseId，则返回 null
      return null;
    }
    return productName;
  }

  // 根据 dataSource 获取 数据库产品名的具体实现
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

Mybatis 初始化时，除了加载 mybatis-config.xml 文件，还会加载全部的映射配置文件，mybatis-config.xml 文件的 &lt;mapper&gt;节点 会告诉 Mybatis 去哪里查找映射配置文件，及使用了配置注解标识的接口。

```java
  /**
   * 解析 <mappers>节点，本方法会创建 XMLMapperBuilder对象 加载映射文件，如果映射配置文件存在
   * 相应的 Mapper接口，也会加载相应的 Mapper接口，解析其中的注解 并完成向 MapperRegistry 的注册
   */
  private void mapperElement(XNode parent) throws Exception {
    if (parent != null) {
      // 处理 <mappers> 的子节点
      for (XNode child : parent.getChildren()) {
        if ("package".equals(child.getName())) {
          // 获取 <package>子节点 中的包名
          String mapperPackage = child.getStringAttribute("name");
          // 扫描指定的包目录，然后向 MapperRegistry 注册 Mapper接口
          configuration.addMappers(mapperPackage);
        } else {
          // 获取 <mapper>节点 的 resource、url、mapperClass属性，这三个属性互斥，只能有一个不为空
          // Mybatis 提供了通过包名、映射文件路径、类全名、URL 四种方式引入映射器。
          // 映射器由一个接口和一个 XML配置文件 组成，XML文件 中定义了一个 命名空间namespace，
          // 它的值就是接口对应的全路径。
          String resource = child.getStringAttribute("resource");
          String url = child.getStringAttribute("url");
          String mapperClass = child.getStringAttribute("class");
          // 如果 <mapper>节点 指定了 resource 或是 url属性，则创建 XMLMapperBuilder对象 解析
          // resource 或是 url属性 指定的 Mapper配置文件
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
            // 如果 <mapper>节点 指定了 class属性，则向 MapperRegistry 注册 该Mapper接口
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

和 XMLConfigBuilder 一样，XMLMapperBuilder 也继承了 BaseBuilder，其主要负责解析映射配置文件，其解析配置文件的入口方法也是 parse()，另外，XMLMapperBuilder 也将各个节点的解析过程拆分成了一个个小方法，然后由 configurationElement()方法 统一调用。

```java
public class XMLMapperBuilder extends BaseBuilder {
  public void parse() {
    // 是否已经加载过该配置文件
    if (!configuration.isResourceLoaded(resource)) {
      // 解析 <mapper>节点
      configurationElement(parser.evalNode("/mapper"));
      // 将 resource 添加到 configuration 的 loadedResources属性 中，
      // 该属性是一个 HashSet<String>类型的集合，其中记录了已经加载过的映射文件
      configuration.addLoadedResource(resource);
      // 注册 Mapper接口
      bindMapperForNamespace();
    }
    // 处理 configurationElement()方法 中解析失败的 <resultMap>节点
    parsePendingResultMaps();
    // 处理 configurationElement()方法 中解析失败的 <cacheRef>节点
    parsePendingCacheRefs();
    // 处理 configurationElement()方法 中解析失败的 <statement>节点
    parsePendingStatements();
  }

  private void configurationElement(XNode context) {
    try {
      // 获取 <mapper>节点 的 namespace属性
      String namespace = context.getStringAttribute("namespace");
      if (namespace == null || namespace.equals("")) {
        throw new BuilderException("Mapper's namespace cannot be empty");
      }
      // 使用 MapperBuilderAssistant对象 的 currentNamespace属性 记录 namespace命名空间
      builderAssistant.setCurrentNamespace(namespace);
      // 解析 <cache-ref>节点，后面的解析方法 也都见名知意
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

XMLMapperBuilder 也根据配置文件进行了一系列节点解析，我们着重分析一下比较重要且常见的 &lt;resultMap&gt;节点 和 &lt;sql&gt;节点

### 3.1 解析&lt;resultMap&gt;节点

select 语句 查询得到的结果是一张二维表，水平方向上是一个个字段，垂直方向上是一条条记录。而 Java 是面向对象的程序设计语言，对象是根据类的定义创建的，类之间的引用关系可以认为是嵌套结构。JDBC 编程 中，为了将结果集中的数据映射成 VO 对象，我们需要自己写代码从结果集中获取数据，然后将数据封装成对应的 VO 对象，并设置好对象之间的关系，这种 ORM 的过程中存在大量重复的代码。

Mybatis 通过 &lt;resultMap&gt;节点 定义了 ORM 规则，可以满足大部分的映射需求，减少重复代码，提高开发效率。

在分析 &lt;resultMap&gt;节点 的解析过程之前，先看一下该过程使用的数据结构。每个 ResultMapping 对象 记录了结果集中的一列与 JavaBean 中一个属性之间的映射关系。&lt;resultMap&gt;节点 下除了 &lt;discriminator&gt;子节点 的其它子节点，都会被解析成对应的 ResultMapping 对象。

```java
public class ResultMapping {

  private Configuration configuration;
  // 对应节点的 property属性，表示 该列进行映射的属性
  private String property;
  // 对应节点的 column属性，表示 从数据库中得到的列名或列名的别名
  private String column;
  // 表示 一个 JavaBean 的完全限定名，或一个类型别名
  private Class<?> javaType;
  // 进行映射列的 JDBC类型
  private JdbcType jdbcType;
  // 类型处理器
  private TypeHandler<?> typeHandler;
  // 该属性通过 id 引用了另一个 <resultMap>节点，它负责将结果集中的一部分列映射成
  // 它所关联的结果对象。这样我们就可以通过 join方式 进行关联查询，然后直接映射成
  // 多个对象，并同时设置这些对象之间的组合关系(nested嵌套的)
  private String nestedResultMapId;
  // 该属性通过 id 引用了另一个 <select>节点，它会把指定的列值传入 select属性 指定的
  // select语句 中作为参数进行查询。使用该属性可能会导致 ORM 中的 N+1问题，请谨慎使用
  private String nestedQueryId;
  private Set<String> notNullColumns;
  private String columnPrefix;
  // 处理后的标志，共有两个：id 和 constructor
  private List<ResultFlag> flags;
  private List<ResultMapping> composites;
  private String resultSet;
  private String foreignColumn;
  // 是否延迟加载
  private boolean lazy;
}
```

另一个比较重要的类是 ResultMap，每个 &lt;resultMap&gt;节点 都会被解析成一个 ResultMap 对象，其中每个节点所定义的映射关系，则使用 ResultMapping 对象 表示。

```java
public class ResultMap {
  private Configuration configuration;

  // 这些属性一一对应了 <resultMap> 中的属性
  private String id;
  private Class<?> type;
  // 记录了除 <discriminator>节点 之外的其它映射关系(即，ResultMapping对象集合)
  private List<ResultMapping> resultMappings;
  // 记录了映射关系中带有 ID标志 的映射关系，如：<id>节点 和 <constructor>节点 的 <idArg>子节点
  private List<ResultMapping> idResultMappings;
  // 记录了映射关系中带有 Constructor标志 的映射关系，如：<constructor>所有子元素
  private List<ResultMapping> constructorResultMappings;
  // 记录了映射关系中不带有 Constructor标志 的映射关系
  private List<ResultMapping> propertyResultMappings;
  // 记录了所有映射关系中涉及的 column属性 的集合
  private Set<String> mappedColumns;
  // 记录了所有映射关系中涉及的 property属性 的集合
  private Set<String> mappedProperties;
  // 鉴别器，对应 <discriminator>节点
  private Discriminator discriminator;
  // 是否含有嵌套的结果映射，如果某个映射关系中存在 resultMap属性，
  // 且不存在 resultSet属性，则为true
  private boolean hasNestedResultMaps;
  // 是否含有嵌套查询，如果某个属性映射存在 select属性，则为true
  private boolean hasNestedQueries;
  // 是否开启自动映射
  private Boolean autoMapping;
}
```

了解了 ResultMapping 和 ResultMap 记录的信息之后，下面开始介绍 &lt;resultMap&gt;节点 的解析过程。在 XMLMapperBuilder 中通过 resultMapElements()方法 解析映射配置文件中的全部 &lt;resultMap&gt;节点，该方法会循环调用 resultMapElement()方法 处理每个 &lt;resultMap&gt; 节点。

```java
  private ResultMap resultMapElement(XNode resultMapNode) throws Exception {
    return resultMapElement(resultMapNode, Collections.<ResultMapping> emptyList());
  }

  private ResultMap resultMapElement(XNode resultMapNode, List<ResultMapping> additionalResultMappings) throws Exception {
    ErrorContext.instance().activity("processing " + resultMapNode.getValueBasedIdentifier());
    // <resultMap> 的 id属性，默认值会拼装所有父节点的 id 或 value 或 property属性值
    String id = resultMapNode.getStringAttribute("id",
        resultMapNode.getValueBasedIdentifier());
    // <resultMap> 的 type属性，表示结果集将被映射成 type 指定类型的对象
    String type = resultMapNode.getStringAttribute("type",
        resultMapNode.getStringAttribute("ofType",
            resultMapNode.getStringAttribute("resultType",
                resultMapNode.getStringAttribute("javaType"))));
    // 该属性指定了该 <resultMap>节点 的继承关系
    String extend = resultMapNode.getStringAttribute("extends");
    // 为 true 则启动自动映射功能，该功能会自动查找与列明相同的属性名，并调用 setter方法，
    // 为 false，则需要在 <resultMap>节点 内注明映射关系才会调用对应的 setter方法
    Boolean autoMapping = resultMapNode.getBooleanAttribute("autoMapping");
    // 解析 type类型
    Class<?> typeClass = resolveClass(type);
    Discriminator discriminator = null;
    // 该集合用来记录解析结果
    List<ResultMapping> resultMappings = new ArrayList<ResultMapping>();
    resultMappings.addAll(additionalResultMappings);
    // 获取并处理 <resultMap> 的子节点
    List<XNode> resultChildren = resultMapNode.getChildren();
    // child 单数形式，children 复数形式
    for (XNode resultChild : resultChildren) {
      // 处理 <constructor>节点
      if ("constructor".equals(resultChild.getName())) {
        processConstructorElement(resultChild, typeClass, resultMappings);
      // 处理 <discriminator>节点
      } else if ("discriminator".equals(resultChild.getName())) {
        discriminator = processDiscriminatorElement(resultChild, typeClass, resultMappings);
      } else {
        // 处理 <id>, <result>, <association>, <collection> 等节点
        List<ResultFlag> flags = new ArrayList<ResultFlag>();
        if ("id".equals(resultChild.getName())) {
          flags.add(ResultFlag.ID);
        }
        // 创建 ResultMapping对象，并添加到 resultMappings集合
        resultMappings.add(buildResultMappingFromContext(resultChild, typeClass, flags));
      }
    }
    ResultMapResolver resultMapResolver = new ResultMapResolver(builderAssistant, id, typeClass, extend, discriminator, resultMappings, autoMapping);
    try {
      return resultMapResolver.resolve();
    } catch (IncompleteElementException  e) {
      configuration.addIncompleteResultMap(resultMapResolver);
      throw e;
    }
  }
```

从上面的代码我们可以看到，Mybatis 从 &lt;resultMap&gt;节点 获取到 id 属性 和 type 属性值 之后，就会通过 XMLMapperBuilder 的 buildResultMappingFromContext()方法 为 &lt;result&gt;节点 创建对应的 ResultMapping 对象。

```java
  /**
   * 根据上下文环境构建 ResultMapping
   */
  private ResultMapping buildResultMappingFromContext(XNode context, Class<?> resultType, List<ResultFlag> flags) throws Exception {
    // 获取各个节点的属性，见文知意
    String property;
    if (flags.contains(ResultFlag.CONSTRUCTOR)) {
      property = context.getStringAttribute("name");
    } else {
      property = context.getStringAttribute("property");
    }
    String column = context.getStringAttribute("column");
    String javaType = context.getStringAttribute("javaType");
    String jdbcType = context.getStringAttribute("jdbcType");
    String nestedSelect = context.getStringAttribute("select");
    String nestedResultMap = context.getStringAttribute("resultMap",
        processNestedResultMappings(context, Collections.<ResultMapping> emptyList()));
    String notNullColumn = context.getStringAttribute("notNullColumn");
    String columnPrefix = context.getStringAttribute("columnPrefix");
    String typeHandler = context.getStringAttribute("typeHandler");
    String resultSet = context.getStringAttribute("resultSet");
    String foreignColumn = context.getStringAttribute("foreignColumn");
    boolean lazy = "lazy".equals(context.getStringAttribute("fetchType", configuration.isLazyLoadingEnabled() ? "lazy" : "eager"));
    Class<?> javaTypeClass = resolveClass(javaType);
    @SuppressWarnings("unchecked")
    Class<? extends TypeHandler<?>> typeHandlerClass = (Class<? extends TypeHandler<?>>) resolveClass(typeHandler);
    JdbcType jdbcTypeEnum = resolveJdbcType(jdbcType);
    // 创建 ResultMapping对象 并返回
    return builderAssistant.buildResultMapping(resultType, property, column, javaTypeClass, jdbcTypeEnum, nestedSelect, nestedResultMap, notNullColumn, columnPrefix, typeHandlerClass, flags, resultSet, foreignColumn, lazy);
  }
```

得到 ResultMapping 对象集合 之后，会调用 ResultMapResolver 的 resolve()方法，该方法会调用 MapperBuilderAssistant 的 addResultMap()方法 创建 ResultMap 对象，并将 ResultMap 对象 添加到 Configuration 的 resultMaps 集合 中保存。

```java
public class MapperBuilderAssistant extends BaseBuilder {
  public ResultMap addResultMap(String id, Class<?> type, String extend,
      Discriminator discriminator, List<ResultMapping> resultMappings, Boolean autoMapping) {
    // ResultMap 的 完整id 是 "namespace.id" 的格式
    id = applyCurrentNamespace(id, false);
    // 获取 父ResultMap 的 完整id
    extend = applyCurrentNamespace(extend, true);

    // 针对 extend属性 进行的处理
    if (extend != null) {
      if (!configuration.hasResultMap(extend)) {
        throw new IncompleteElementException("Could not find a parent resultmap with id '" + extend + "'");
      }
      // 父ResultMap对象
      ResultMap resultMap = configuration.getResultMap(extend);
      // 父ResultMap对象 的 ResultMapping集合
      List<ResultMapping> extendedResultMappings = new ArrayList<ResultMapping>(resultMap.getResultMappings());
      // 删除需要覆盖的 ResultMapping集合
      extendedResultMappings.removeAll(resultMappings);
      // Remove parent constructor if this resultMap declares a constructor.
      boolean declaresConstructor = false;
      for (ResultMapping resultMapping : resultMappings) {
        if (resultMapping.getFlags().contains(ResultFlag.CONSTRUCTOR)) {
          declaresConstructor = true;
          break;
        }
      }
      if (declaresConstructor) {
        Iterator<ResultMapping> extendedResultMappingsIter = extendedResultMappings.iterator();
        while (extendedResultMappingsIter.hasNext()) {
          if (extendedResultMappingsIter.next().getFlags().contains(ResultFlag.CONSTRUCTOR)) {
            extendedResultMappingsIter.remove();
          }
        }
      }
      // 添加需要被继承下来的 ResultMapping集合
      resultMappings.addAll(extendedResultMappings);
    }
    ResultMap resultMap = new ResultMap.Builder(configuration, id, type, resultMappings, autoMapping)
        .discriminator(discriminator)
        .build();
    configuration.addResultMap(resultMap);
    return resultMap;
  }
}
```

### 3.2 解析&lt;sql&gt;节点

在映射配置文件中，可以使用 &lt;sql&gt;节点 定义可重用的 SQL 语句片段，当需要重用 &lt;sql&gt;节点 中定义的 SQL 语句片段 时，只需要使用 &lt;include&gt;节点 引入相应的片段即可，这样，在编写 SQL 语句 以及维护这些 SQL 语句 时，都会比较方便。XMLMapperBuilder 的 sqlElement()方法 负责解析映射配置文件中定义的 全部&lt;sql&gt;节点。

```java
  private void sqlElement(List<XNode> list) throws Exception {
    if (configuration.getDatabaseId() != null) {
      sqlElement(list, configuration.getDatabaseId());
    }
    sqlElement(list, null);
  }

  private void sqlElement(List<XNode> list, String requiredDatabaseId) throws Exception {
    // 遍历 <sql>节点
    for (XNode context : list) {
      String databaseId = context.getStringAttribute("databaseId");
      String id = context.getStringAttribute("id");
      // 为 id 添加命名空间
      id = builderAssistant.applyCurrentNamespace(id, false);
      // 检测 <sql> 的 databaseId 与当前 Configuration 中记录的 databaseId 是否一致
      if (databaseIdMatchesCurrent(id, databaseId, requiredDatabaseId)) {
        // 记录到 sqlFragments(Map<String, XNode>) 中保存
        sqlFragments.put(id, context);
      }
    }
  }
```

## 4 XMLStatementBuilder

## 5 绑定 Mapper 接口

通过之前对 binding 模块 的解析可知，每个映射配置文件的命名空间可以绑定一个 Mapper 接口，并注册到 MapperRegistry 中。XMLMapperBuilder 的 bindMapperForNamespace()方法 中，完成了映射配置文件与对应 Mapper 接口 的绑定。

```java
public class XMLMapperBuilder extends BaseBuilder {
  private void bindMapperForNamespace() {
    // 获取映射配置文件的命名空间
    String namespace = builderAssistant.getCurrentNamespace();
    if (namespace != null) {
      Class<?> boundType = null;
      try {
        // 解析命名空间对应的类型
        boundType = Resources.classForName(namespace);
      } catch (ClassNotFoundException e) {
        //ignore, bound type is not required
      }
      if (boundType != null) {
        // 是否已加载 boundType接口
        if (!configuration.hasMapper(boundType)) {
          // 追加个 "namespace:" 的前缀，并添加到 Configuration 的 loadedResources集合 中
          configuration.addLoadedResource("namespace:" + namespace);
          // 添加到 Configuration的mapperRegistry集合 中，另外，往这个方法栈的更深处看 会发现
          // 其创建了 MapperAnnotationBuilder对象，并调用了该对象的 parse()方法 解析 Mapper接口
          configuration.addMapper(boundType);
        }
      }
    }
  }
}

public class MapperRegistry {
  public <T> void addMapper(Class<T> type) {
    if (type.isInterface()) {
      if (hasMapper(type)) {
        throw new BindingException("Type " + type + " is already known to the MapperRegistry.");
      }
      boolean loadCompleted = false;
      try {
        knownMappers.put(type, new MapperProxyFactory<T>(type));
        // 解析 Mapper接口 type 中的信息
        MapperAnnotationBuilder parser = new MapperAnnotationBuilder(config, type);
        parser.parse();
        loadCompleted = true;
      } finally {
        if (!loadCompleted) {
          knownMappers.remove(type);
        }
      }
    }
  }
}

public class MapperAnnotationBuilder {
  public void parse() {
    String resource = type.toString();
    // 是否已经加载过该接口
    if (!configuration.isResourceLoaded(resource)) {
      // 检查是否加载过该接口对应的映射文件，如果未加载，则创建 XMLMapperBuilder对象
      // 解析对应的映射文件，该过程就是前面介绍的映射配置文件解析过程
      loadXmlResource();
      configuration.addLoadedResource(resource);
      assistant.setCurrentNamespace(type.getName());
      // 解析 @CacheNamespace注解
      parseCache();
      // 解析 @CacheNamespaceRef注解
      parseCacheRef();
      // type接口 的所有方法
      Method[] methods = type.getMethods();
      for (Method method : methods) {
        try {
          if (!method.isBridge()) {
            // 解析 SelectKey、ResultMap 等注解，并创建 MappedStatement对象
            parseStatement(method);
          }
        } catch (IncompleteElementException e) {
          // 如果解析过程出现 IncompleteElementException异常，可能是因为引用了
          // 未解析的注解，这里将出现异常的方法记录下来，后面提供补偿机制，重新进行解析
          configuration.addIncompleteMethod(new MethodResolver(this, method));
        }
      }
    }
    // 遍历 configuration 中的 incompleteMethods集合，集合中记录了未解析的方法
    // 重新调用这些方法进行解析
    parsePendingMethods();
  }
}
```

另外，在 MapperAnnotationBuilder 的 parse()方法 中解析的注解，都能在映射配置文件中找到与之对应的 XML 节点，且两者的解析过程也非常相似。
