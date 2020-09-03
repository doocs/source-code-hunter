StatementHandler 接口是 MyBatis 的核心接口之一，它完成了 MyBatis 中最核心的工作，也是 Executor 接口实现的基础。

StatementHandler 接口中的功能很多，例如创建 Statement 对象，为 SQL 语句绑定实参，执行 select、insert、update、delete 等多种类型的 SQL 语句，批量执行 SQL 语句，将结果集映射成结果对象。

```java
public interface StatementHandler {

  // 从连接中获取一个Statement
  Statement prepare(Connection connection, Integer transactionTimeout)
      throws SQLException;

  // 绑定statement执行时所需的实参
  void parameterize(Statement statement)
      throws SQLException;

  // 批量执行SQL语句
  void batch(Statement statement)
      throws SQLException;

  // 执行update/insert/delete语句
  int update(Statement statement)
      throws SQLException;

  // 执行select语句
  <E> List<E> query(Statement statement, ResultHandler resultHandler)
      throws SQLException;

  <E> Cursor<E> queryCursor(Statement statement)
      throws SQLException;

  BoundSql getBoundSql();

  // 获取参数处理器
  ParameterHandler getParameterHandler();

}
```

## RoutingStatementHandler

RoutingStatementHandler 使用了策略模式，RoutingStatementHandler 是策略类，而 SimpleStatementHandler、PreparedStatementHandler、CallableStatementHandler 则是实现了具体算法的实现类，RoutingStatementHandler 对象会根据 MappedStatement 对象的 StatementType 属性值选择使用相应的策略去执行。

```java
public class RoutingStatementHandler implements StatementHandler {

  // 持有的真正实现StatementHandler接口功能的对象
  private final StatementHandler delegate;

  public RoutingStatementHandler(Executor executor, MappedStatement ms, Object parameter, RowBounds rowBounds, ResultHandler resultHandler, BoundSql boundSql) {
    // RoutingStatementHandler的作用就是根据ms的配置，生成一个相对应的StatementHandler对象
    // 并设置到持有的delegate属性中，本对象的所有方法都是通过调用delegate的相应方法实现的
    switch (ms.getStatementType()) {
      case STATEMENT:
        delegate = new SimpleStatementHandler(executor, ms, parameter, rowBounds, resultHandler, boundSql);
        break;
      case PREPARED:
        delegate = new PreparedStatementHandler(executor, ms, parameter, rowBounds, resultHandler, boundSql);
        break;
      case CALLABLE:
        delegate = new CallableStatementHandler(executor, ms, parameter, rowBounds, resultHandler, boundSql);
        break;
      default:
        throw new ExecutorException("Unknown statement type: " + ms.getStatementType());
    }

  }

  @Override
  public Statement prepare(Connection connection, Integer transactionTimeout) throws SQLException {
    return delegate.prepare(connection, transactionTimeout);
  }

  @Override
  public void parameterize(Statement statement) throws SQLException {
    delegate.parameterize(statement);
  }

  @Override
  public void batch(Statement statement) throws SQLException {
    delegate.batch(statement);
  }

  @Override
  public int update(Statement statement) throws SQLException {
    return delegate.update(statement);
  }

  @Override
  public <E> List<E> query(Statement statement, ResultHandler resultHandler) throws SQLException {
    return delegate.query(statement, resultHandler);
  }

  @Override
  public <E> Cursor<E> queryCursor(Statement statement) throws SQLException {
    return delegate.queryCursor(statement);
  }

  @Override
  public BoundSql getBoundSql() {
    return delegate.getBoundSql();
  }

  @Override
  public ParameterHandler getParameterHandler() {
    return delegate.getParameterHandler();
  }
}
```

## BaseStatementHandler

看它以 Base 开头，就可以猜到 它是一个实现了 StatementHandler 接口的抽象类，这个类只提供了一些参数绑定相关的方法，并没有实现操作数据库的方法。

```java
public abstract class BaseStatementHandler implements StatementHandler {

  // 持有的这些属性都是通过构造方法完成初始化的，typeHandlerRegistry、
  // objectFactory、parameterHandler等则是通过configuration属性获得的
  protected final Configuration configuration;
  protected final ObjectFactory objectFactory;
  protected final TypeHandlerRegistry typeHandlerRegistry;
  protected final ResultSetHandler resultSetHandler;
  // parameterHandler的功能主要是为SQL语句绑定实参，也就是使用传入的实参
  // 替换SQL语句中的占位符"?"
  protected final ParameterHandler parameterHandler;

  // 用来执行SQL语句的执行器
  protected final Executor executor;
  protected final MappedStatement mappedStatement;
  // 记录了用户设置的offset和limit，用于在结果集中定位
  // 映射的起始位置和结束位置
  protected final RowBounds rowBounds;

  protected BoundSql boundSql;

  // BaseStatementHandler的构造方法主要用于属性的初始化
  protected BaseStatementHandler(Executor executor, MappedStatement mappedStatement, Object parameterObject, RowBounds rowBounds, ResultHandler resultHandler, BoundSql boundSql) {
    this.configuration = mappedStatement.getConfiguration();
    this.executor = executor;
    this.mappedStatement = mappedStatement;
    this.rowBounds = rowBounds;

    this.typeHandlerRegistry = configuration.getTypeHandlerRegistry();
    this.objectFactory = configuration.getObjectFactory();

    if (boundSql == null) { // issue #435, get the key before calculating the statement
      // 其中调用了KeyGenerator的processBefore()方法
      // 用于初始化SQL语句的主键
      generateKeys(parameterObject);
      boundSql = mappedStatement.getBoundSql(parameterObject);
    }

    this.boundSql = boundSql;

    this.parameterHandler = configuration.newParameterHandler(mappedStatement, parameterObject, boundSql);
    this.resultSetHandler = configuration.newResultSetHandler(executor, mappedStatement, rowBounds, parameterHandler, resultHandler, boundSql);
  }

  protected void generateKeys(Object parameter) {
    KeyGenerator keyGenerator = mappedStatement.getKeyGenerator();
    ErrorContext.instance().store();
    keyGenerator.processBefore(executor, mappedStatement, null, parameter);
    ErrorContext.instance().recall();
  }

  @Override
  public BoundSql getBoundSql() {
    return boundSql;
  }

  @Override
  public ParameterHandler getParameterHandler() {
    return parameterHandler;
  }

  @Override
  public Statement prepare(Connection connection, Integer transactionTimeout) throws SQLException {
    ErrorContext.instance().sql(boundSql.getSql());
    Statement statement = null;
    try {
      // 这是一个抽象方法，用于初始化java.sql.Statement对象
      statement = instantiateStatement(connection);
      // 为Statement对象设置超时时间及fetchSize
      setStatementTimeout(statement, transactionTimeout);
      setFetchSize(statement);
      return statement;
    } catch (SQLException e) {
      closeStatement(statement);
      throw e;
    } catch (Exception e) {
      closeStatement(statement);
      throw new ExecutorException("Error preparing statement.  Cause: " + e, e);
    }
  }

  protected abstract Statement instantiateStatement(Connection connection) throws SQLException;

  protected void setStatementTimeout(Statement stmt, Integer transactionTimeout) throws SQLException {
    Integer queryTimeout = null;
    if (mappedStatement.getTimeout() != null) {
      queryTimeout = mappedStatement.getTimeout();
    } else if (configuration.getDefaultStatementTimeout() != null) {
      queryTimeout = configuration.getDefaultStatementTimeout();
    }
    if (queryTimeout != null) {
      stmt.setQueryTimeout(queryTimeout);
    }
    StatementUtil.applyTransactionTimeout(stmt, queryTimeout, transactionTimeout);
  }

  protected void setFetchSize(Statement stmt) throws SQLException {
    Integer fetchSize = mappedStatement.getFetchSize();
    if (fetchSize != null) {
      stmt.setFetchSize(fetchSize);
      return;
    }
    Integer defaultFetchSize = configuration.getDefaultFetchSize();
    if (defaultFetchSize != null) {
      stmt.setFetchSize(defaultFetchSize);
    }
  }

  protected void closeStatement(Statement statement) {
    try {
      if (statement != null) {
        statement.close();
      }
    } catch (SQLException e) {
      //ignore
    }
  }

}
```

BaseStatementHandler 主要实现了 StatementHandler 接口中的 prepare()方法，BaseStatementHandler 依赖两个重要的组件，ParameterHandler 和 ResultSetHandler。

## ParameterHandler 系列组件

我们要执行的 SQL 语句中可能包含占位符"?"，而每个"?"都对应了 BoundSql 中 parameterMappings 集合中的一个元素，在该 ParameterMapping 对象中记录了对应的参数名称以及该参数的相关属性。ParameterHandler 接口定义了一个非常重要的方法 setParameters()，该方法主要负责调用 PreparedStatement 的 set＊()系列方法，为 SQL 语句绑定实参。MyBatis 只为 ParameterHandler 接口提供了唯一一个实现类 DefaultParameterHandler。

```java
public interface ParameterHandler {

  // 获取用户传入的实参对象
  Object getParameterObject();

  // 本方法主要负责调用PreparedStatement.set*()方法，为SQL语句绑定实参。
  void setParameters(PreparedStatement ps)
      throws SQLException;

}


public class DefaultParameterHandler implements ParameterHandler {

  // 管理mybatis中所有的TypeHandler对象
  private final TypeHandlerRegistry typeHandlerRegistry;

  // 其中记录了SQL节点相应的配置信息
  private final MappedStatement mappedStatement;
  // 用户传入的实参对象
  private final Object parameterObject;
  // 其中记录了要执行的SQL语句，及参数信息
  private final BoundSql boundSql;
  private final Configuration configuration;

  // 构造方法主要为持有的属性 进行初始化
  public DefaultParameterHandler(MappedStatement mappedStatement, Object parameterObject, BoundSql boundSql) {
    this.mappedStatement = mappedStatement;
    this.configuration = mappedStatement.getConfiguration();
    this.typeHandlerRegistry = mappedStatement.getConfiguration().getTypeHandlerRegistry();
    this.parameterObject = parameterObject;
    this.boundSql = boundSql;
  }

  @Override
  public Object getParameterObject() {
    return parameterObject;
  }

  // 为PreparedStatement对象要执行的SQL语句中的占位符 设置对应的参数值
  @Override
  public void setParameters(PreparedStatement ps) {
    ErrorContext.instance().activity("setting parameters").object(mappedStatement.getParameterMap().getId());
    // 获取参数列表
    List<ParameterMapping> parameterMappings = boundSql.getParameterMappings();
    if (parameterMappings != null) {
      for (int i = 0; i < parameterMappings.size(); i++) {
        ParameterMapping parameterMapping = parameterMappings.get(i);
        // 过滤掉存储过程中的输出参数
        if (parameterMapping.getMode() != ParameterMode.OUT) {
          // 记录绑定的实参
          Object value;
          // 获取参数对应的属性名
          String propertyName = parameterMapping.getProperty();
          // 根据属性名 获取 实参值
          if (boundSql.hasAdditionalParameter(propertyName)) { // issue #448 ask first for additional params
            value = boundSql.getAdditionalParameter(propertyName);
          // 整个实参为空
          } else if (parameterObject == null) {
            value = null;
          // 如果实参可以直接通过TypeHandler转换成JdbcType
          } else if (typeHandlerRegistry.hasTypeHandler(parameterObject.getClass())) {
            value = parameterObject;
          } else {
            // 获取对象中相应的属性值 或查找Map对象中的值
            MetaObject metaObject = configuration.newMetaObject(parameterObject);
            value = metaObject.getValue(propertyName);
          }
          // 获取当前parameterMapping中的TypeHandler对象 及JdbcType对象
          TypeHandler typeHandler = parameterMapping.getTypeHandler();
          JdbcType jdbcType = parameterMapping.getJdbcType();
          if (value == null && jdbcType == null) {
            jdbcType = configuration.getJdbcTypeForNull();
          }
          try {
            // TypeHandler的setParameter()方法会调用PreparedStatement对象的
            // set*()系列方法，为SQL语句绑定相应的实参
            typeHandler.setParameter(ps, i + 1, value, jdbcType);
          } catch (TypeException | SQLException e) {
            throw new TypeException("Could not set parameters for mapping: " + parameterMapping + ". Cause: " + e, e);
          }
        }
      }
    }
  }

}
```

为 SQL 语句绑定完实参之后，就可以调用 Statement 对象 相应的 execute 方法，将 SQL 语句交给数据库执行了。

## SimpleStatementHandler

SimpleStatementHandler 继承了 BaseStatementHandler 抽象类。其底层使用 java.sql.Statement 来完成数据库的相关操作，所以 SQL 语句中不存在占位符，所以 SimpleStatementHandler 的 parameterize()方法是空实现。SimpleStatementHandler 的 instantiateStatement()方法直接通过 JDBC Connection 创建 Statement 对象。

```java
public class SimpleStatementHandler extends BaseStatementHandler {

  // 构造方法主要用于属性的初始化
  public SimpleStatementHandler(Executor executor, MappedStatement mappedStatement, Object parameter, RowBounds rowBounds, ResultHandler resultHandler, BoundSql boundSql) {
    super(executor, mappedStatement, parameter, rowBounds, resultHandler, boundSql);
  }

  // 直接通过Connection创建Statement对象
  @Override
  protected Statement instantiateStatement(Connection connection) throws SQLException {
    if (mappedStatement.getResultSetType() == ResultSetType.DEFAULT) {
      // 如果结果集类型是DEFAULT默认的，则直接用connection创建Statement对象
      return connection.createStatement();
    } else {
      // 否则，设置结果集类型，设置结果集 只读
      return connection.createStatement(mappedStatement.getResultSetType().getValue(), ResultSet.CONCUR_READ_ONLY);
    }
  }

  // 上面创建的Statement对象会被本方法用于完成数据库查询操作
  @Override
  public <E> List<E> query(Statement statement, ResultHandler resultHandler) throws SQLException {
    // 获取SQL语句
    String sql = boundSql.getSql();
    // 发送请求 执行SQL语句
    statement.execute(sql);
    // 从statement中获取结果集，并进行映射处理
    return resultSetHandler.handleResultSets(statement);
  }

  // 下面的batch()及queryCursor()方法的实现与上面的query()方法非常类似
  @Override
  public void batch(Statement statement) throws SQLException {
    String sql = boundSql.getSql();
    statement.addBatch(sql);
  }

  @Override
  public <E> Cursor<E> queryCursor(Statement statement) throws SQLException {
    String sql = boundSql.getSql();
    statement.execute(sql);
    return resultSetHandler.handleCursorResultSets(statement);
  }

  // 本方法用于执行insert、delete、update等类型的SQL语句，并且会根据配置的
  // KeyGenerator获取数据库生成的主键
  @Override
  public int update(Statement statement) throws SQLException {
    // 获取SQL语句 及parameterObject
    String sql = boundSql.getSql();
    Object parameterObject = boundSql.getParameterObject();
    // 获取配置的KeyGenerator 数据库主键生成器
    KeyGenerator keyGenerator = mappedStatement.getKeyGenerator();
    int rows;
    if (keyGenerator instanceof Jdbc3KeyGenerator) {
      // 执行SQL语句
      statement.execute(sql, Statement.RETURN_GENERATED_KEYS);
      // 获取更新的条数
      rows = statement.getUpdateCount();
      // 将数据库生成的主键添加到parameterObject中
      keyGenerator.processAfter(executor, mappedStatement, statement, parameterObject);
    } else if (keyGenerator instanceof SelectKeyGenerator) {
      // 执行SQL语句
      statement.execute(sql);
      // 获取更新的条数
      rows = statement.getUpdateCount();
      // 执行<selectKey>节点中配置的SQL语句，将从数据库获取到的主键 添加到parameterObject中
      keyGenerator.processAfter(executor, mappedStatement, statement, parameterObject);
    } else {
      statement.execute(sql);
      rows = statement.getUpdateCount();
    }
    return rows;
  }

  @Override
  public void parameterize(Statement statement) {
    // N/A
  }

}
```

## PreparedStatementHandler

PreparedStatementHandler 底层依赖于 java.sql.PreparedStatement 来完成数据库的相关操作。其中的 parameterize()方法中，会调用前面介绍的 ParameterHandler 的 setParameters()方法 完成 SQL 语句的参数绑定。instantiateStatement()方法直接调用 JDBC Connection 的 prepareStatement()方法创建 PreparedStatement 对象。

```java
public class PreparedStatementHandler extends BaseStatementHandler {

  // 构造方法主要用于属性的初始化
  public PreparedStatementHandler(Executor executor, MappedStatement mappedStatement, Object parameter, RowBounds rowBounds, ResultHandler resultHandler, BoundSql boundSql) {
    super(executor, mappedStatement, parameter, rowBounds, resultHandler, boundSql);
  }

  @Override
  protected Statement instantiateStatement(Connection connection) throws SQLException {
    // 获取SQL语句
    String sql = boundSql.getSql();
    // 根据mappedStatement持有的KeyGenerator的类型进行不同的处理
    if (mappedStatement.getKeyGenerator() instanceof Jdbc3KeyGenerator) {
      // 获取主键列
      String[] keyColumnNames = mappedStatement.getKeyColumns();
      if (keyColumnNames == null) {
        // 返回数据库生成的主键
        return connection.prepareStatement(sql, PreparedStatement.RETURN_GENERATED_KEYS);
      } else {
        // 在insert语句执行完后，会将keyColumnNames指定的列返回
        return connection.prepareStatement(sql, keyColumnNames);
      }
    } else if (mappedStatement.getResultSetType() == ResultSetType.DEFAULT) {
      // 如果结果集类型是DEFAULT默认的，则直接通过connection获取PreparedStatement对象
      return connection.prepareStatement(sql);
    } else {
      // 否则，设置结果集类型，设置结果集为只读
      return connection.prepareStatement(sql, mappedStatement.getResultSetType().getValue(), ResultSet.CONCUR_READ_ONLY);
    }
  }

  // 因为是PrepareStatement对象，所以需要处理占位符"?"
  // 使用了前面介绍的ParameterHandler组件完成
  @Override
  public void parameterize(Statement statement) throws SQLException {
    parameterHandler.setParameters((PreparedStatement) statement);
  }

  // 下面的这些方法，除了多了一步 将Statement对象强转成PreparedStatement对象
  // 其它的几乎与SimpleStatementHandler一样
  @Override
  public <E> List<E> query(Statement statement, ResultHandler resultHandler) throws SQLException {
    PreparedStatement ps = (PreparedStatement) statement;
    ps.execute();
    return resultSetHandler.handleResultSets(ps);
  }

  @Override
  public void batch(Statement statement) throws SQLException {
    PreparedStatement ps = (PreparedStatement) statement;
    ps.addBatch();
  }

  @Override
  public <E> Cursor<E> queryCursor(Statement statement) throws SQLException {
    PreparedStatement ps = (PreparedStatement) statement;
    ps.execute();
    return resultSetHandler.handleCursorResultSets(ps);
  }

  @Override
  public int update(Statement statement) throws SQLException {
    PreparedStatement ps = (PreparedStatement) statement;
    ps.execute();
    int rows = ps.getUpdateCount();
    Object parameterObject = boundSql.getParameterObject();
    KeyGenerator keyGenerator = mappedStatement.getKeyGenerator();
    keyGenerator.processAfter(executor, mappedStatement, ps, parameterObject);
    return rows;
  }

}
```

另外，StatementHandler 接口还有一个 CallableStatementHandler 的实现。其底层依赖于 java.sql.CallableStatement 调用指定的存储过程，其 parameterize()方法也会调用 ParameterHandler 的 setParameters()方法完成 SQL 语句的参数绑定，并指定输出参数的索引位置和 JDBC 类型。其余方法与前面介绍的 ResultSetHandler 实现类似，唯一区别是会调用 ResultSetHandler 的 handleOutputParameters()方法 处理输出参数。

看到这里，我们可以发现 StatementHandler 组件依赖 ParameterHandler 组件 和 ResultSetHandler 组件 完成了 MyBatis 的核心功能，它控制着参数绑定、SQL 语句执行、结果集映射等一系列核心流程。
