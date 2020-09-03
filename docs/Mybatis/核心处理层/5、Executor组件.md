Executor 是 MyBatis 的核心接口之一，其中定义了数据库操作的基本方法。在实际应用中经常涉及的 SqISession 接口的功能，都是基于 Executor 接口实现的。

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

BaseExecutor 是一个实现了 Executor 接口的抽象类，它实现了 Executor 接口的大部分方法。BaseExecutor 中主要提供了缓存管理和事务管理的基本功能，继承 BaseExecutor 的子类只要实现四个基本方法来完成数据库的相关操作即可，这四个方法分别是：doUpdate()方法、doQuery()方法、doQueryCursor()方法、doFlushStatement()方法。

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

MyBatis 提供的缓存功能，分别为一级缓存和二级缓存。BaseExecutor 主要实现了一级缓存的相关内容。一级缓存是会话级缓存，在 MyBatis 中每创建一个 SqlSession 对象，就表示开启一次数据库会话。在一次会话中，应用程序可能会在短时间内(一个事务内)，反复执行完全相同的查询语句，如果不对数据进行缓存，那么每一次查询都会执行一次数据库查询操作，而多次完全相同的、时间间隔较短的查询语句得到的结果集极有可能完全相同，这会造成数据库资源的浪费。

为了避免上述问题，MyBatis 会在 Executor 对象中建立一个简单的一级缓存，将每次查询的结果集缓存起来。在执行查询操作时，会先查询一级缓存，如果存在完全一样的查询情况，则直接从一级缓存中取出相应的结果对象并返回给用户，减少数据库访问次数，从而减小了数据库的压力。

一级缓存的生命周期与 SqlSession 相同，其实也就与 SqISession 中封装的 Executor 对象的生命周期相同。当调用 Executor 对象的 close()方法时（断开连接），该 Executor 对象对应的一级缓存就会被废弃掉。一级缓存中对象的存活时间受很多方面的影响，例如，在调用 Executor 的 update()方法时，也会先请空一级缓存。一级缓存默认是开启的，一般情况下，不需要用户进行特殊配置。

### 1.2 一级缓存的管理

BaseExecutor 的 query()方法会首先创建 CacheKey 对象，并根据该 CacheKey 对象查找一级缓存，如果缓存命中则返回缓存中记录的结果对象，如果缓存未命中则查询数据库得到结果集，之后将结果集映射成结果对象并保存到一级缓存中，同时返回结果对象。

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

从上面的代码中可以看到，BaseExecutor 的 query()方法会根据 flushCache 属性和 localCacheScope 配置 决定是否清空一级缓存。

另外，BaseExecutor 的 update()方法在调用 doUpdate()方法之前，也会清除一级缓存。update()方法负责执行 insert、update、delete 三类 SQL 语句，它是调用 doUpdate()方法实现的。

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

在 BatchExecutor 实现中，可以缓存多条 SQL 语句，等待合适时机将缓存的多条 SQL 语句一并发送到数据库执行。Executor 的 flushStatements()方法主要是针对批处理多条 SQL 语句的，它会调用 doFlushStatements()这个基本方法处理 Executor 中缓存的多条 SQL 语句。在 BaseExecutor 的 commit()及 rollback()等方法中都会首先调用 flushStatements()方法，然后再执行相关事务操作。

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

SimpleExecutor 继承了 BaseExecutor 抽象类，它是最简单的 Executor 接口实现。Executor 组件使用了模板方法模式，一级缓存等固定不变的操作都封装到了 BaseExecutor 中，在 SimpleExecutor 中就不必再关心一级缓存等操作，只需要专注实现 4 个基本方法的实现即可。

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

在传统的 JDBC 编程中，复用 Statement 对象是常用的一种优化手段，该优化手段可以减少 SQL 预编译的开销以及创建和销毁 Statement 对象的开销，从而提高性能（Reuse，复用）。

ReuseExecutor 提供了 Statement 复用的功能，ReuseExecutor 中通过 statementMap 字段缓存使用过的 Statement 对象，key 是 SQL 语句，value 是 SQL 对应的 Statement 对象。

ReuseExecutor.doQuery()、doQueryCursor()、doUpdate()方法的实现与 SimpleExecutor 中对应方法的实现一样，区别在于其中调用的 prepareStatement()方法，SimpleExecutor 每次都会通过 JDBC 的 Connection 对象创建新的 Statement 对象，而 ReuseExecutor 则会先尝试重用 StaternentMap 中缓存的 Statement 对象。

```java
  // 本map用于缓存使用过的Statement，以提升本框架的性能
  // key SQL语句，value 该SQL语句对应的Statement
  private final Map<String, Statement> statementMap = new HashMap<String, Statement>();

  private Statement prepareStatement(StatementHandler handler, Log statementLog) throws SQLException {
    Statement stmt;
    BoundSql boundSql = handler.getBoundSql();
    // 获取要执行的sql语句
    String sql = boundSql.getSql();
    // 如果之前执行过该sql，则从缓存中取出对应的Statement对象
    // 不再创建新的Statement，减少系统开销
    if (hasStatementFor(sql)) {
      stmt = getStatement(sql);
      // 修改超时时间
      applyTransactionTimeout(stmt);
    } else {
      // 获取数据库连接
      Connection connection = getConnection(statementLog);
      // 从连接中获取Statement对象
      stmt = handler.prepare(connection, transaction.getTimeout());
      // 将sql语句 和 其对应的Statement对象缓存起来
      putStatement(sql, stmt);
    }
    // 处理占位符
    handler.parameterize(stmt);
    return stmt;
  }

  /**
   * 当事务提交或回滚、连接关闭时，都需要关闭这些缓存的Statement对象。前面分析的BaseExecutor的
   * commit()、rollback()和close()方法中都会调用doFlushStatements()方法，
   * 所以在该方法中关闭Statement对象的逻辑非常合适
   */
  @Override
  public List<BatchResult> doFlushStatements(boolean isRollback) throws SQLException {
    // 遍历Statement对象集合，并依次关闭
    for (Statement stmt : statementMap.values()) {
      closeStatement(stmt);
    }
    // 清除对Statement对象的缓存
    statementMap.clear();
    // 返回一个空集合
    return Collections.emptyList();
  }
```

#### 拓展内容：SQL 预编译

**1、数据库预编译起源**

（1）数据库 SQL 语句编译特性

数据库接收到 sql 语句之后，需要词法和语义解析，以优化 sql 语句，制定执行计划。这需要花费一些时间。但是很多情况，我们的同一条 sql 语句可能会反复执行，或者每次执行的时候只有个别的值不同（比如：query 的 where 子句值不同，update 的 set 子句值不同，insert 的 values 值不同）。

（2）减少编译的方法

如果每次都需要经过上面的词法语义解析、语句优化、制定执行计划等，则效率就明显不行了。为了解决上面的问题，于是就有了预编译，预编译语句就是将这类语句中的值用占位符替代，可以视为将 sql 语句模板化或者说参数化。一次编译、多次运行，省去了解析优化等过程。

（3）缓存预编译

预编译语句被 DB 的编译器编译后的执行代码被缓存下来，那么下次调用时只要是相同的预编译语句就不需要重复编译，只要将参数直接传入编译过的语句执行代码中(相当于一个函数)就会得到执行。并不是所以预编译语句都一定会被缓存，数据库本身会用一种策略（内部机制）。

（4） 预编译的实现方法

预编译是通过 PreparedStatement 和占位符来实现的。

**2.预编译作用**

（1）减少编译次数 提升性能

预编译之后的 sql 多数情况下可以直接执行，DBMS（数据库管理系统）不需要再次编译。越复杂的 sql，往往编译的复杂度就越大。

（2）防止 SQL 注入

使用预编译，后面注入的参数将不会再次触发 SQL 编译。也就是说，对于后面注入的参数，系统将不会认为它会是一个 SQL 命令，而默认其是一个参数，参数中的 or 或 and 等（SQL 注入常用技俩）就不是 SQL 语法保留字了。

**3.mybatis 是如何实现预编译的**

mybatis 默认情况下，将对所有的 sql 进行预编译。mybatis 底层使用 PreparedStatement，过程是，先将带有占位符（即”?”）的 sql 模板发送至数据库服务器，由服务器对此无参数的 sql 进行编译后，将编译结果缓存，然后直接执行带有真实参数的 sql。核心是通过 “#{ }” 实现的。在预编译之前，#{ } 被解析为一个预编译语句（PreparedStatement）的占位符 ?。

```sql
// sqlMap 中如下的 sql 语句
select * from user where name = #{name};
// 解析成为预编译语句
select * from user where name = ?;
```

## 4 BatchExecutor

应用系统在执行一条 SQL 语句时，会将 SQL 语句以及相关参数通过网络发送到数据库系统。对于频繁操作数据库的应用系统来说，如果执行一条 SQL 语句就向数据库发送一次请求，很多时间会浪费在网络通信上。使用批量处理的优化方式可以在客户端缓存多条 SQL 语句，并在合适的时机将多条 SQL 语句打包发送给数据库执行，从而减少网络方面的开销，提升系统的性能。

需要注意的是，在批量执行多条 SQL 语句时，每次向数据库发送的 SQL 语句条数
是有上限的，若超出上限，数据库会拒绝执行这些 SQL 语句井抛出异常，所以批量发送 SQL 语句的时机很重要。

mybatis 的 BatchExecutor 实现了批处理多条 SQL 语句的功能。

```java
public class BatchExecutor extends BaseExecutor {

  public static final int BATCH_UPDATE_RETURN_VALUE = Integer.MIN_VALUE + 1002;
  // 缓存多个Statement对象，其中每个Statement对象中都可以缓存多条
  // 结构相同 但参数不同的sql语句
  private final List<Statement> statementList = new ArrayList<Statement>();
  // 记录批处理的结果，BatchResult中通过updateCounts字段
  // 记录每个Statement对象 执行批处理的结果
  private final List<BatchResult> batchResultList = new ArrayList<BatchResult>();
  // 记录当前执行的sql语句
  private String currentSql;
  // 记录当前执行的MappedStatement对象
  private MappedStatement currentStatement;

  /**
   * JDBC中的批处理只支持insert、update、delete等类型的SQL语句，不支持select类型的
   * SQL语句，所以doUpdate()方法是BatchExecutor中最重要的一个方法。
   * 本方法在添加一条SQL语句时，首先会将currentSql字段记录的SQL语句以及currentStatement字段
   * 记录的MappedStatement对象与当前添加的SQL以及MappedStatement对象进行比较，
   * 如果相同则添加到同一个Statement对象中等待执行，如果不同则创建新的Statement对象
   * 井将其缓存到statementList集合中等待执行
   */
  @Override
  public int doUpdate(MappedStatement ms, Object parameterObject) throws SQLException {
    // 获取configuration配置对象
    final Configuration configuration = ms.getConfiguration();
    // 实例化一个StatementHandler，并返回
    final StatementHandler handler = configuration.newStatementHandler(this, ms, parameterObject, RowBounds.DEFAULT, null, null);
    // 获取需要执行的sql语句
    final BoundSql boundSql = handler.getBoundSql();
    final String sql = boundSql.getSql();
    final Statement stmt;
    // 判断要执行的sql语句结构 及 MappedStatement对象 是否与上次的相同
    if (sql.equals(currentSql) && ms.equals(currentStatement)) {
      // 相同则添加到同一个Statement对象中等待执行
      // 首先获取statementList集合中最后一个Statement对象
      int last = statementList.size() - 1;
      stmt = statementList.get(last);
      // 重新设置事务超时时间
      applyTransactionTimeout(stmt);
      // 绑定实参，处理占位符？
      handler.parameterize(stmt);
      // 查找对应的BatchResult对象，并记录用户传入的实参
      BatchResult batchResult = batchResultList.get(last);
      batchResult.addParameterObject(parameterObject);
    } else {
      // 不同则创建新的Statement对象井将其缓存到statementList集合中等待执行
      Connection connection = getConnection(ms.getStatementLog());
      // 创建新的Statement对象
      stmt = handler.prepare(connection, transaction.getTimeout());
      // 绑定实参，处理占位符？
      handler.parameterize(stmt);
      // 记录本次的sql语句 及 Statement对象
      currentSql = sql;
      currentStatement = ms;
      // 将新创建的Statement对象添加到statementList集合
      statementList.add(stmt);
      // 添加新的BatchResult对象
      batchResultList.add(new BatchResult(ms, sql, parameterObject));
    }
    // 底层通过调用java.sql.Statement的addBatch()方法添加sql语句
    handler.batch(stmt);
    return BATCH_UPDATE_RETURN_VALUE;
  }

  /**
   * 上面的doUpdate()方法负责添加待执行的sql语句，
   * 而doFlushStatements()方法则将上面添加的sql语句进行批量处理
   */
  @Override
  public List<BatchResult> doFlushStatements(boolean isRollback) throws SQLException {
    try {
      // 用于存储批处理结果的集合
      List<BatchResult> results = new ArrayList<BatchResult>();
      // 如果要回滚 则返回一个空集合
      if (isRollback) {
        return Collections.emptyList();
      }
      // 批处理statementList集合中的所以Statement对象
      for (int i = 0, n = statementList.size(); i < n; i++) {
        // 获取Statement对象 和其对应的 BatchResult对象
        Statement stmt = statementList.get(i);
        applyTransactionTimeout(stmt);
        BatchResult batchResult = batchResultList.get(i);
        try {
          // 调用Statement对象的executeBatch()方法，批量执行其中记录的sql语句
          // 将执行返回的int[]数组set进batchResult的updateCounts字段，
          // 其中的每一个int值都代表了对应的sql语句 影响的记录条数
          batchResult.setUpdateCounts(stmt.executeBatch());
          MappedStatement ms = batchResult.getMappedStatement();
          List<Object> parameterObjects = batchResult.getParameterObjects();
          // 获取配置的KeyGenerator对象
          KeyGenerator keyGenerator = ms.getKeyGenerator();
          if (Jdbc3KeyGenerator.class.equals(keyGenerator.getClass())) {
            Jdbc3KeyGenerator jdbc3KeyGenerator = (Jdbc3KeyGenerator) keyGenerator;
            // 获取数据库生成的主键 并设置到parameterObjects中
            jdbc3KeyGenerator.processBatch(ms, stmt, parameterObjects);
          } else if (!NoKeyGenerator.class.equals(keyGenerator.getClass())) {
            // 对于其它类型的KeyGenerator，则调用其processAfter进行处理
            for (Object parameter : parameterObjects) {
              keyGenerator.processAfter(this, ms, stmt, parameter);
            }
          }
          closeStatement(stmt);
        } catch (BatchUpdateException e) {
          StringBuilder message = new StringBuilder();
          message.append(batchResult.getMappedStatement().getId())
                  .append(" (batch index #")
                  .append(i + 1)
                  .append(")")
                  .append(" failed.");
          if (i > 0) {
            message.append(" ")
                    .append(i)
                    .append(" prior sub executor(s) completed successfully, but will be rolled back.");
          }
          throw new BatchExecutorException(message.toString(), e, results, batchResult);
        }
        // 添加处理完的BatchResult对象到要返回的List<BatchResult>集合中
        results.add(batchResult);
      }
      return results;
    } finally {
      // 关闭所有的Statement对象
      for (Statement stmt : statementList) {
        closeStatement(stmt);
      }
      // 清空currentSql、statementList、batchResultList对象
      currentSql = null;
      statementList.clear();
      batchResultList.clear();
    }
  }
}
```

通过了解 JDBC 的批处理功能 我们可以知道，Statement 中可以添加不同语句结构的 SQL，但是每添加一个新结构的 SQL 语句都会触发一次编译操作。而 PreparedStatement 中只能添加同一语句结构的 SQL 语句，只会触发一次编译操作，但是可以通过绑定多组不同的实参实现批处理。通过上面对 doUpdate()方法的分析可知，BatchExecutor 会将连续添加的、相同语句结构的 SQL 语句添加到同一个 Statement/PreparedStatement 对象中，这样可以有效地减少编译操作的次数。

BatchExecutor 中 doQuery()和 doQueryCursor()方法的实现与前面介绍的 SimpleExecutor 类似，主要区别就是 BatchExecutor 中的这两个方法在最开始都会先调用 flushStatements()方法，执行缓存的 SQL 语句，以保证 从数据库中查询到的数据是最新的。

CachingExecutor 中为 Executor 对象增加了二级缓存相关功能，而 mybatis 的二级缓存在实际使用中往往利大于弊，被 redis 等产品所替代，所以这里不做分析。
