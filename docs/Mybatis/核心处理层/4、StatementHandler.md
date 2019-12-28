StatementHandler接口是MyBatis的核心接口之一，它完成了MyBatis中最核心的工作，也是Executor 接口实现的基础。

StatementHandler接口中的功能很多，例如创建Statement对象，为SQL语句绑定实参，执行select、insert、update、delete等多种类型的SQL语句，批量执行SQL语句，将结果集映射成结果对象。
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
RoutingStatementHandler使用了策略模式，RoutingStatementHandler是策略类，而SimpleStatementHandler、PreparedStatementHandler、CallableStatementHandler则是实现了具体算法的实现类，RoutingStatementHandler对象会根据MappedStatement对象的StatementType属性值选择使用相应的策略去执行。
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
看它以Base开头，就可以猜到 它是一个实现了StatementHandler接口的抽象类，这个类只提供了一些参数绑定相关的方法，并没有实现操作数据库的方法。 
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
BaseStatementHandler主要实现了StatementHandler接口中的prepare()方法，BaseStatementHandler依赖两个重要的组件，ParameterHandler和ResultSetHandler。
## ParameterHandler



## SimpleStatementHandler



## PreparedStatementHandler

