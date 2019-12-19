Executor是MyBatis的核心接口之一，其中定义了数据库操作的基本方法。在实际应用中经常涉及的SqISession接口的功能，都是基于Executor 接口实现的。
```java
public interface Executor {
  ResultHandler NO_RESULT_HANDLER = null;

  // 执行update、insert、delete三种类型的SQL语句
  int update(MappedStatement ms, Object parameter) throws SQLException;

  // 执行select类型的SQL语句，返回值分为结果对象列表或游标对象
  <E> List<E> query(MappedStatement ms, Object parameter, RowBounds rowBounds, ResultHandler resultHandler, CacheKey cacheKey, BoundSql boundSql) throws SQLException;

  <E> List<E> query(MappedStatement ms, Object parameter, RowBounds rowBounds, ResultHandler resultHandler) throws SQLException;

  <E> Cursor<E> queryCursor(MappedStatement ms, Object parameter, RowBounds rowBounds) throws SQLException;

  // 批量执行SQL语句
  List<BatchResult> flushStatements() throws SQLException;

  // 提交事务
  void commit(boolean required) throws SQLException;

  // 回滚事务
  void rollback(boolean required) throws SQLException;

  // 创建缓存中用到的CacheKey对象
  CacheKey createCacheKey(MappedStatement ms, Object parameterObject, RowBounds rowBounds, BoundSql boundSql);

  // 根据CacheKey对象查找缓存
  boolean isCached(MappedStatement ms, CacheKey key);

  // 清空一级缓存
  void clearLocalCache();

  // 延迟加载一级缓存中的数据
  void deferLoad(MappedStatement ms, MetaObject resultObject, String property, CacheKey key, Class<?> targetType);

  // 获取事务
  Transaction getTransaction();

  // 关闭事务
  void close(boolean forceRollback);

  // 是否关闭
  boolean isClosed();
}
```
## 1 BaseExecutor
BaseExecutor是一个实现了Executor接口的抽象类，它实现了Executor接口的大部分方法。BaseExecutor中主要提供了缓存管理和事务管理的基本功能，继承BaseExecutor的子类只要实现四个基本方法来完成数据库的相关操作即可，这四个方法分别是：doUpdate()方法、doQuery()方法、doQueryCursor()方法、doFlushStatement()方法。
```java
public abstract class BaseExecutor implements Executor {

  private static final Log log = LogFactory.getLog(BaseExecutor.class);

  // 事务对象，用于实现事务的提交、回滚和关闭
  protected Transaction transaction;
  // 其中封装的Executor对象
  protected Executor wrapper;

  // 延迟加载队列
  protected ConcurrentLinkedQueue<DeferredLoad> deferredLoads;
  // 一级缓存，用于缓存该Executor对象查询结果集映射得到的结果对象
  protected PerpetualCache localCache;
  // 一级缓存，用于缓存输出类型的参数
  protected PerpetualCache localOutputParameterCache;
  protected Configuration configuration;

  // 记录嵌套查询的层数
  protected int queryStack;
  // 是否关闭
  private boolean closed;
}
```
### 1.1 一级缓存简介
常见的应用系统中，数据库是比较珍贵的资源，很容易成为整个系统的瓶颈。在设计和维护系统时，会进行多方面的权衡，并且利用多种优化手段，减少对数据库的直接访问。
使用缓存是一种比较有效的优化手段，使用缓存可以减少应用系统与数据库的网络交互、减少数据库访问次数、降低数据库的负担、降低重复创建和销毁对象等一系列开销，从而提高整个系统的性能。
MyBatis提供的缓存功能，分别为一级缓存和二级缓存。BaseExecutor主要实现了一级缓存的相关内容。一级缓存是会话级缓存，在MyBatis中每创建一个SqlSession对象，就表示开启一次数据库会话。在一次会话中，应用程序可能会在短时间内(一个事务内)，反复执行完全相同的查询语句，如果不对数据进行缓存，那么每一次查询都会执行一次数据库查询操作，而多次完全相同的、时间间隔较短的查询语句得到的结果集极有可能完全相同，这会造成数据库资源的浪费。
为了避免上述问题，MyBatis会在Executor对象中建立一个简单的一级缓存，将每次查询的结果集缓存起来。在执行查询操作时，会先查询一级缓存，如果存在完全一样的查询情况，则直接从一级缓存中取出相应的结果对象并返回给用户，减少数据库访问次数，从而减小了数据库的压力。
一级缓存的生命周期与SqlSession相同，其实也就与SqISession中封装的Executor 对象的生命周期相同。当调用Executor对象的close()方法时（断开连接），该Executor 对象对应的一级缓存就会被废弃掉。一级缓存中对象的存活时间受很多方面的影响，例如，在调用Executor的update()方法时，也会先请空一级缓存。一级缓存默认是开启的，一般情况下，不需要用户进行特殊配置。
### 1.2 一级缓存的管理
BaseExecutor的query()方法会首先创建CacheKey对象，并根据该CacheKey对象查找一级缓存，如果缓存命中则返回缓存中记录的结果对象，如果缓存未命中则查询数据库得到结果集，之后将结果集映射成结果对象并保存到一级缓存中，同时返回结果对象。
```java
public abstract class BaseExecutor implements Executor {
  @Override
  public <E> List<E> query(MappedStatement ms, Object parameter, RowBounds rowBounds, ResultHandler resultHandler) throws SQLException {
    // 获取BoundSql对象
    BoundSql boundSql = ms.getBoundSql(parameter);
    // 创建CacheKey对象，该对象由多个参数组装而成
    CacheKey key = createCacheKey(ms, parameter, rowBounds, boundSql);
    // query方法的重载，进行后续处理
    return query(ms, parameter, rowBounds, resultHandler, key, boundSql);
 }

  @Override
  public CacheKey createCacheKey(MappedStatement ms, Object parameterObject, RowBounds rowBounds, BoundSql boundSql) {
    if (closed) {
      throw new ExecutorException("Executor was closed.");
    }
    // 可以看到CacheKey对象由MappedStatement的id、RowBounds的offset和limit
    // sql语句(包含占位符"?")、用户传递的实参组成
    CacheKey cacheKey = new CacheKey();
    cacheKey.update(ms.getId());
    cacheKey.update(rowBounds.getOffset());
    cacheKey.update(rowBounds.getLimit());
    cacheKey.update(boundSql.getSql());
    List<ParameterMapping> parameterMappings = boundSql.getParameterMappings();
    TypeHandlerRegistry typeHandlerRegistry = ms.getConfiguration().getTypeHandlerRegistry();
    // 获取用户传入的实参，并添加到CacheKey对象中
    for (ParameterMapping parameterMapping : parameterMappings) {
      // 过滤掉输出类型的参数
      if (parameterMapping.getMode() != ParameterMode.OUT) {
        Object value;
        String propertyName = parameterMapping.getProperty();
        if (boundSql.hasAdditionalParameter(propertyName)) {
          value = boundSql.getAdditionalParameter(propertyName);
        } else if (parameterObject == null) {
          value = null;
        } else if (typeHandlerRegistry.hasTypeHandler(parameterObject.getClass())) {
          value = parameterObject;
        } else {
          MetaObject metaObject = configuration.newMetaObject(parameterObject);
          value = metaObject.getValue(propertyName);
        }
        // 将实参添加到CacheKey对象中
        cacheKey.update(value);
      }
    }
    // 如果configuration的environment不为空，则将该environment的id
    // 添加到CacheKey对象中
    if (configuration.getEnvironment() != null) {
      cacheKey.update(configuration.getEnvironment().getId());
    }
    return cacheKey;
  }

  @Override
  public <E> List<E> query(MappedStatement ms, Object parameter, RowBounds rowBounds, ResultHandler resultHandler, CacheKey key, BoundSql boundSql) throws SQLException {
    // 检查当前Executor是否已关闭
    ErrorContext.instance().resource(ms.getResource()).activity("executing a query").object(ms.getId());
    if (closed) {
      throw new ExecutorException("Executor was closed.");
    }
    if (queryStack == 0 && ms.isFlushCacheRequired()) {
      // 非嵌套查询，且<select>节点配置的flushCache属性为true时，才会清空一级缓存
      clearLocalCache();
    }
    List<E> list;
    try {
      // 增加查询层数
      queryStack++;
      // 根据传入的CacheKey对象 查询一级缓存
      list = resultHandler == null ? (List<E>) localCache.getObject(key) : null;
      if (list != null) {
        // 针对存储过程调用的处理，在一级缓存命中时，获取缓存中保存的输出类型参数
        // 并设置到用户传入的实参parameter对象中
        handleLocallyCachedOutputParameters(ms, key, parameter, boundSql);
      } else {
        // 缓存未命中，则从数据库查询结果集，其中会调用doQuery()方法完成数据库查询操作，
        // 该方法为抽象方法，由BaseExecutor的子类实现
        list = queryFromDatabase(ms, parameter, rowBounds, resultHandler, key, boundSql);
      }
    } finally {
      // 当前查询完成，查询层数减少
      queryStack--;
    }
    if (queryStack == 0) {
      // 延迟加载的相关内容
      for (DeferredLoad deferredLoad : deferredLoads) {
        deferredLoad.load();
      }
      deferredLoads.clear();
      if (configuration.getLocalCacheScope() == LocalCacheScope.STATEMENT) {
        // issue #482
        clearLocalCache();
      }
    }
    return list;
  }
}
```
从上面的代码中可以看到，BaseExecutor的query()方法会根据flushCache属性和localCacheScope配置 决定是否清空一级缓存。
另外，BaseExecutor的update()方法在调用doUpdate()方法之前，也会清除一级缓存。update()方法负责执行insert、update、delete三类SQL 语句，它是调用doUpdate()方法实现的。
```java
  @Override
  public int update(MappedStatement ms, Object parameter) throws SQLException {
    // 判断当前的Executor是否已经关闭
    ErrorContext.instance().resource(ms.getResource()).activity("executing an update").object(ms.getId());
    if (closed) {
      throw new ExecutorException("Executor was closed.");
    }
    // 清除一级缓存，该方法会调用localCache和localOutputParameterCache
    // 的clear()方法清除缓存
    clearLocalCache();
    // 抽象方法，交由子类实现
    return doUpdate(ms, parameter);
  }

  @Override
  public void clearLocalCache() {
    if (!closed) {
      localCache.clear();
      localOutputParameterCache.clear();
    }
  }
```
### 1.3 事务相关操作
在BatchExecutor实现中，可以缓存多条SQL语句，等待合适时机将缓存的多条SQL 语句一并发送到数据库执行。Executor的flushStatements()方法主要是针对批处理多条SQL语句的，它会调用doFlushStatements()这个基本方法处理Executor中缓存的多条SQL语句。在BaseExecutor的commit()及rollback()等方法中都会首先调用flushStatements()方法，然后再执行相关事务操作。
```java
  @Override
  public void commit(boolean required) throws SQLException {
    // 检查当前连接是否已关闭
    if (closed) {
      throw new ExecutorException("Cannot commit, transaction is already closed");
    }
    // 清除一级缓存
    clearLocalCache();
    // 不执行Executor中缓存的SQL语句
    flushStatements();
    // 根据参数required决定是否提交事务
    if (required) {
      transaction.commit();
    }
  }

  @Override
  public List<BatchResult> flushStatements() throws SQLException {
    return flushStatements(false);
  }

  public List<BatchResult> flushStatements(boolean isRollBack) throws SQLException {
    if (closed) {
      throw new ExecutorException("Executor was closed.");
    }
    // 这是一个交由子类实现的抽象方法，参数isRollBack表示
    // 是否执行Executor中缓存的SQL语句，false表示执行，true表示不执行
    return doFlushStatements(isRollBack);
  }

  @Override
  public void rollback(boolean required) throws SQLException {
    if (!closed) {
      try {
        // 清除一级缓存
        clearLocalCache();
        // 批量执行缓存的sql语句
        flushStatements(true);
      } finally {
        // 根据required决定是否回滚事务
        if (required) {
          transaction.rollback();
        }
      }
    }
  }

  @Override
  public void close(boolean forceRollback) {
    try {
      try {
        // 根据forceRollback参数决定 是否强制回滚该事务
        rollback(forceRollback);
      } finally {
        if (transaction != null) {
          transaction.close();
        }
      }
    } catch (SQLException e) {
      // Ignore.  There's nothing that can be done at this point.
      log.warn("Unexpected exception on closing transaction.  Cause: " + e);
    } finally {
      transaction = null;
      deferredLoads = null;
      localCache = null;
      localOutputParameterCache = null;
      closed = true;
    }
  }
```
## 2 SimpleExecutor
SimpleExecutor继承了BaseExecutor抽象类，它是最简单的Executor接口实现。Executor组件使用了模板方法模式，一级缓存等固定不变的操作都封装到了BaseExecutor中，在SimpleExecutor中就不必再关心一级缓存等操作，只需要专注实现4 个基本方法的实现即可。
```java
public class SimpleExecutor extends BaseExecutor {

  public SimpleExecutor(Configuration configuration, Transaction transaction) {
    super(configuration, transaction);
  }

  @Override
  public <E> List<E> doQuery(MappedStatement ms, Object parameter, RowBounds rowBounds, ResultHandler resultHandler, BoundSql boundSql) throws SQLException {
    Statement stmt = null;
    try {
      // 获取配置对象
      Configuration configuration = ms.getConfiguration();
      // 创建StatementHandler对象
      StatementHandler handler = configuration.newStatementHandler(wrapper, ms, parameter, rowBounds, resultHandler, boundSql);
      // 完成Statement的创建和初始化，该方法首先会调用StatementHandler的prepare()方法
      // 创建Statement对象，然后调用StatementHandler的parameterize()方法处理占位符
      stmt = prepareStatement(handler, ms.getStatementLog());
      // 调用StatementHandler的query()方法，执行sql语句，并通过ResultSetHandler
      // 完成结果集的映射
      return handler.<E>query(stmt, resultHandler);
    } finally {
      // 关闭Statement对象
      closeStatement(stmt);
    }
  }

  private Statement prepareStatement(StatementHandler handler, Log statementLog) throws SQLException {
    Statement stmt;
    Connection connection = getConnection(statementLog);
    // 创建Statement对象
    stmt = handler.prepare(connection, transaction.getTimeout());
    // 处理占位符
    handler.parameterize(stmt);
    return stmt;
  }

  /**
   * 与前面doQuery()方法的实现非常类似
   */
  @Override
  public int doUpdate(MappedStatement ms, Object parameter) throws SQLException {
    Statement stmt = null;
    try {
      Configuration configuration = ms.getConfiguration();
      StatementHandler handler = configuration.newStatementHandler(this, ms, parameter, RowBounds.DEFAULT, null, null);
      stmt = prepareStatement(handler, ms.getStatementLog());
      return handler.update(stmt);
    } finally {
      closeStatement(stmt);
    }
  }

  @Override
  protected <E> Cursor<E> doQueryCursor(MappedStatement ms, Object parameter, RowBounds rowBounds, BoundSql boundSql) throws SQLException {
    Configuration configuration = ms.getConfiguration();
    StatementHandler handler = configuration.newStatementHandler(wrapper, ms, parameter, rowBounds, null, boundSql);
    Statement stmt = prepareStatement(handler, ms.getStatementLog());
    return handler.<E>queryCursor(stmt);
  }

  @Override
  public List<BatchResult> doFlushStatements(boolean isRollback) throws SQLException {
    // SimpleExecutor不提供sql语句批处理，所以直接返回空集合
    return Collections.emptyList();
  }

}
```
## 3 ReuseExecutor


## 4 BatchExecutor


## 5 CachingExecutor


