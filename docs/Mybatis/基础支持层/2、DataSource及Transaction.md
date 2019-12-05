在数据持久层，数据源和事务是两个非常重要的组件，对数据持久层的影响很大，在实际开发中，一般会使用mybatis集成第三方数据源组件，如：c3p0、Druid，另外，mybatis也提供了自己的数据源实现。而事务方面，一般使用spring进行事务的管理。下面我们看一下mybatis是如何对这两部分进行封装的。
## 1 DataSource
常见的数据源都会实现javax.sql.DataSource接口，mybatis中提供了两个该接口的实现类，分别是：PooledDataSource和UnpooledDataSource，并使用不同的工厂类分别管理这两个类的对象。
### 1.1 DataSourceFactory
DataSourceFactory系列类的设计比较简单，DataSourceFactory作为顶级接口，UnpooledDataSourceFactory实现了该接口，PooledDataSourceFactory又继承了UnpooledDataSourceFactory。
```java
public interface DataSourceFactory {

  // 设置DataSource的属性，一般紧跟在DataSource初始化之后
  void setProperties(Properties props);

  // 获取DataSource对象
  DataSource getDataSource();
}


public class UnpooledDataSourceFactory implements DataSourceFactory {

  private static final String DRIVER_PROPERTY_PREFIX = "driver.";
  private static final int DRIVER_PROPERTY_PREFIX_LENGTH = DRIVER_PROPERTY_PREFIX.length();

  protected DataSource dataSource;

  // 在实例化该工厂时，就完成了DataSource的实例化
  public UnpooledDataSourceFactory() {
    this.dataSource = new UnpooledDataSource();
  }

  @Override
  public void setProperties(Properties properties) {
    Properties driverProperties = new Properties();
    // 创建dataSource对应的MetaObject
    MetaObject metaDataSource = SystemMetaObject.forObject(dataSource);
    // 处理properties中配置的数据源信息
    for (Object key : properties.keySet()) {
      String propertyName = (String) key;
      if (propertyName.startsWith(DRIVER_PROPERTY_PREFIX)) {
        // 以"driver."开头的配置项是对DataSource的配置，将其记录到driverProperties中
        String value = properties.getProperty(propertyName);
        driverProperties.setProperty(propertyName.substring(DRIVER_PROPERTY_PREFIX_LENGTH), value);
      } else if (metaDataSource.hasSetter(propertyName)) {
        String value = (String) properties.get(propertyName);
        Object convertedValue = convertValue(metaDataSource, propertyName, value);
        metaDataSource.setValue(propertyName, convertedValue);
      } else {
        throw new DataSourceException("Unknown DataSource property: " + propertyName);
      }
    }
    if (driverProperties.size() > 0) {
      // 设置数据源UnpooledDataSource的driverProperties属性，
      // PooledDataSource中持有UnpooledDataSource对象
      metaDataSource.setValue("driverProperties", driverProperties);
    }
  }

  @Override
  public DataSource getDataSource() {
    return dataSource;
  }
}


public class PooledDataSourceFactory extends UnpooledDataSourceFactory {

  // 与UnpooledDataSourceFactory的不同之处是，其初始化的DataSource为PooledDataSource
  public PooledDataSourceFactory() {
    this.dataSource = new PooledDataSource();
  }
}
```

### 1.2 UnpooledDataSource
本实现类实现了DataSource接口中的getConnection()及其重载方法，用于获取数据库连接。其中的主要属性及方法如下：
```java
public class UnpooledDataSource implements DataSource {

  // 加载Driver驱动类的 类加载器
  private ClassLoader driverClassLoader;

  // 数据库连接驱动的相关配置，通过UnpooledDataSourceFactory的setProperties()方法设置进来的
  private Properties driverProperties;

  // 缓存所有已注册的数据库连接驱动Driver
  private static Map<String, Driver> registeredDrivers = new ConcurrentHashMap<>();

  // 数据库连接驱动名称
  private String driver;
  // 数据库url
  private String url;
  // 用户名
  private String username;
  // 密码
  private String password;

  // 是否自动提交事务
  private Boolean autoCommit;
  // 默认的事务隔离级别
  private Integer defaultTransactionIsolationLevel;
  // 默认的网络连接超时时间
  private Integer defaultNetworkTimeout;

  /**
   * UnpooledDataSource被加载时，会通过该静态代码块将已经在DriverManager
   * 中注册JDBC Driver复制一份到registeredDrivers
   */
  static {
    Enumeration<Driver> drivers = DriverManager.getDrivers();
    while (drivers.hasMoreElements()) {
      Driver driver = drivers.nextElement();
      registeredDrivers.put(driver.getClass().getName(), driver);
    }
  }

  // getConnection()及其重载方法、doGetConnection(String username, String password)方法
  // 最终都会调用本方法
  private Connection doGetConnection(Properties properties) throws SQLException {
    // 初始化数据库驱动，该方法会创建配置中指定的Driver对象，
    // 并将其注册到DriverManager和registeredDrivers中
    initializeDriver();
    Connection connection = DriverManager.getConnection(url, properties);
    // 配置数据库连接属性，如：连接超时时间、是否自动提交事务、事务隔离级别
    configureConnection(connection);
    return connection;
  }

  private synchronized void initializeDriver() throws SQLException {
    // 判断驱动是否已注册
    if (!registeredDrivers.containsKey(driver)) {
      Class<?> driverType;
      try {
        if (driverClassLoader != null) {
          // 注册驱动
          driverType = Class.forName(driver, true, driverClassLoader);
        } else {
          driverType = Resources.classForName(driver);
        }
        // 通过反射 获取Driver实例对象
        Driver driverInstance = (Driver)driverType.newInstance();
        // 注册驱动到DriverManager，DriverProxy是UnpooledDataSource的内部类
        // 也是Driver的静态代理类
        DriverManager.registerDriver(new DriverProxy(driverInstance));
        // 将driver缓存到registeredDrivers
        registeredDrivers.put(driver, driverInstance);
      } catch (Exception e) {
        throw new SQLException("Error setting driver on UnpooledDataSource. Cause: " + e);
      }
    }
  }

  private void configureConnection(Connection conn) throws SQLException {
    // 连接超时时间
    if (defaultNetworkTimeout != null) {
      conn.setNetworkTimeout(Executors.newSingleThreadExecutor(), defaultNetworkTimeout);
    }
    // 是否自动提交事务
    if (autoCommit != null && autoCommit != conn.getAutoCommit()) {
      conn.setAutoCommit(autoCommit);
    }
    // 事务隔离级别
    if (defaultTransactionIsolationLevel != null) {
      conn.setTransactionIsolation(defaultTransactionIsolationLevel);
    }
  }
}
```
### 1.3 PooledDataSource
数据库建立连接是非常耗时的，且并发的连接数也非常有限。而数据库连接池可以实现数据库的重用、提高响应速度、防止数据库因连接过多而假死等。
数据库连接池的设计思路一般为：
1. 连接池初始化时创建一定数量的连接，并添加到连接池中备用；
2. 当程序需要使用数据库连接时，从连接池中请求，用完后会将其返还给连接池，而不是直接关闭；
3. 连接池会控制总连接上限及空闲连接上线，如果连接池中的连接总数已达上限，且都被占用，后续的连接请求会进入阻塞队列等待，直到有连接可用；
4. 如果连接池中空闲连接较多，已达到空闲连接上限，则返回的连接会被关闭掉，以降低系统开销。

PooledDataSource实现了简易的数据库连接池功能，其创建数据库连接的功能依赖了上面的UnpooledDataSource。
#### 1.3.1 PooledConnection
PooledDataSource通过管理PooledConnection来实现对java.sql.Connection的管理。PooledConnection封装了java.sql.Connection数据库连接对象及其代理对象（JDK动态代理生成的）。PooledConnection继承了JDK动态代理的InvocationHandler接口。
```java
class PooledConnection implements InvocationHandler {

  // 记录当前PooledConnection对象所属的PooledDataSource对象
  // 当调用close()方法时会将PooledConnection放回该PooledDataSource
  private final PooledDataSource dataSource;
  // 真正的数据库连接对象
  private final Connection realConnection;
  // 代理连接对象
  private final Connection proxyConnection;
  // 从连接池中取出该连接时的时间戳
  private long checkoutTimestamp;
  // 创建该连接时的时间戳
  private long createdTimestamp;
  // 最后一次使用的 时间戳
  private long lastUsedTimestamp;
  // 由 数据库URL、用户名、密码 计算出来的hash值，可用于标识该连接所在的连接池
  private int connectionTypeCode;
  // 检测当前PooledConnection连接池连接对象是否有效，主要用于 防止程序通过close()方法将
  // 连接还给连接池之后，依然通过该连接操作数据库
  private boolean valid;

  /**
   * invoke()方法是本类的重点实现，也是proxyConnection代理连接对象的代理逻辑实现
   * 它会对close()方法的调用进行处理，并在调用realConnection的方法之前进行校验
   */
  @Override
  public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
    String methodName = method.getName();
    // 如果调用的是close()方法，则将其放进连接池，而不是真的关闭连接
    if (CLOSE.hashCode() == methodName.hashCode() && CLOSE.equals(methodName)) {
      dataSource.pushConnection(this);
      return null;
    }
    try {
      if (!Object.class.equals(method.getDeclaringClass())) {
        // 通过上面的valid字段 校验连接是否有效
        checkConnection();
      }
      // 调用realConnection的对应方法
      return method.invoke(realConnection, args);
    } catch (Throwable t) {
      throw ExceptionUtil.unwrapThrowable(t);
    }

  }

  private void checkConnection() throws SQLException {
    if (!valid) {
      throw new SQLException("Error accessing PooledConnection. Connection is invalid.");
    }
  }
}
```
#### 1.3.2 PoolState
PoolState主要用于管理PooledConnection对象状态，其通过持有两个List&lt;PooledConnection&gt;集合分别管理空闲状态的连接 和 活跃状态的连接。另外，PoolState还定义了一系列用于统计的字段。
```java
public class PoolState {

  // 所属的连接池对象
  protected PooledDataSource dataSource;

  // 空闲的连接
  protected final List<PooledConnection> idleConnections = new ArrayList<>();
  // 活跃的连接
  protected final List<PooledConnection> activeConnections = new ArrayList<>();

  // 请求数据库连接的次数
  protected long requestCount = 0;
  // 获取连接的累计时间（accumulate累计）
  protected long accumulatedRequestTime = 0;
  // CheckoutTime = 记录 应用从连接池取出连接到归还连接的时长
  // accumulatedCheckoutTime = 所有连接累计的CheckoutTime
  protected long accumulatedCheckoutTime = 0;
  // 超时连接的个数（当连接长时间未归还给连接池时，会被认为连接超时）
  protected long claimedOverdueConnectionCount = 0;
  // 累计超时时间
  protected long accumulatedCheckoutTimeOfOverdueConnections = 0;
  // 累计等待时间
  protected long accumulatedWaitTime = 0;
  // 等待次数
  protected long hadToWaitCount = 0;
  // 无效的连接数
  protected long badConnectionCount = 0;

  public PoolState(PooledDataSource dataSource) {
    this.dataSource = dataSource;
  }

  public synchronized long getRequestCount() {
    return requestCount;
  }

  public synchronized long getAverageRequestTime() {
    return requestCount == 0 ? 0 : accumulatedRequestTime / requestCount;
  }

  public synchronized long getAverageWaitTime() {
    return hadToWaitCount == 0 ? 0 : accumulatedWaitTime / hadToWaitCount;

  }

  public synchronized long getHadToWaitCount() {
    return hadToWaitCount;
  }

  public synchronized long getBadConnectionCount() {
    return badConnectionCount;
  }

  public synchronized long getClaimedOverdueConnectionCount() {
    return claimedOverdueConnectionCount;
  }

  public synchronized long getAverageOverdueCheckoutTime() {
    return claimedOverdueConnectionCount == 0 ? 0 : accumulatedCheckoutTimeOfOverdueConnections / claimedOverdueConnectionCount;
  }

  public synchronized long getAverageCheckoutTime() {
    return requestCount == 0 ? 0 : accumulatedCheckoutTime / requestCount;
  }

  public synchronized int getIdleConnectionCount() {
    return idleConnections.size();
  }

  public synchronized int getActiveConnectionCount() {
    return activeConnections.size();
  }

  @Override
  public synchronized String toString() {
    StringBuilder builder = new StringBuilder();
    builder.append("\n===CONFINGURATION==============================================");
    builder.append("\n jdbcDriver                     ").append(dataSource.getDriver());
    builder.append("\n jdbcUrl                        ").append(dataSource.getUrl());
    builder.append("\n jdbcUsername                   ").append(dataSource.getUsername());
    builder.append("\n jdbcPassword                   ").append(dataSource.getPassword() == null ? "NULL" : "************");
    builder.append("\n poolMaxActiveConnections       ").append(dataSource.poolMaximumActiveConnections);
    builder.append("\n poolMaxIdleConnections         ").append(dataSource.poolMaximumIdleConnections);
    builder.append("\n poolMaxCheckoutTime            ").append(dataSource.poolMaximumCheckoutTime);
    builder.append("\n poolTimeToWait                 ").append(dataSource.poolTimeToWait);
    builder.append("\n poolPingEnabled                ").append(dataSource.poolPingEnabled);
    builder.append("\n poolPingQuery                  ").append(dataSource.poolPingQuery);
    builder.append("\n poolPingConnectionsNotUsedFor  ").append(dataSource.poolPingConnectionsNotUsedFor);
    builder.append("\n ---STATUS-----------------------------------------------------");
    builder.append("\n activeConnections              ").append(getActiveConnectionCount());
    builder.append("\n idleConnections                ").append(getIdleConnectionCount());
    builder.append("\n requestCount                   ").append(getRequestCount());
    builder.append("\n averageRequestTime             ").append(getAverageRequestTime());
    builder.append("\n averageCheckoutTime            ").append(getAverageCheckoutTime());
    builder.append("\n claimedOverdue                 ").append(getClaimedOverdueConnectionCount());
    builder.append("\n averageOverdueCheckoutTime     ").append(getAverageOverdueCheckoutTime());
    builder.append("\n hadToWait                      ").append(getHadToWaitCount());
    builder.append("\n averageWaitTime                ").append(getAverageWaitTime());
    builder.append("\n badConnectionCount             ").append(getBadConnectionCount());
    builder.append("\n===============================================================");
    return builder.toString();
  }
}
```
#### 1.3.3 PooledDataSource
PooledDataSource管理的数据库连接对象 是由其持有的UnpooledDataSource对象创建的，并由PoolState管理所有连接的状态。
PooledDataSource的getConnection()方法会首先调用popConnection()方法获取PooledConnection对象，然后通过PooledConnection的getProxyConnection()方法获取数据库连接的代理对象。popConnection()方法是PooledDataSource的核心逻辑之一，其整体的逻辑关系如下图：

![avatar](/images/mybatis连接池获取连接逻辑图.png)

```java
public class PooledDataSource implements DataSource {

  private static final Log log = LogFactory.getLog(PooledDataSource.class);

  // 管理连接池状态 并统计连接信息
  private final PoolState state = new PoolState(this);

  // 该对象用于生成真正的数据库连接对象，构造函数中会初始化该字段
  private final UnpooledDataSource dataSource;

  // 最大活跃连接数
  protected int poolMaximumActiveConnections = 10;
  // 最大空闲连接数
  protected int poolMaximumIdleConnections = 5;
  // 最大Checkout时长
  protected int poolMaximumCheckoutTime = 20000;
  // 在无法获取连接时，线程需要等待的时间
  protected int poolTimeToWait = 20000;
  // 本地坏连接最大数
  protected int poolMaximumLocalBadConnectionTolerance = 3;
  // 检测数据库连接是否可用时，给数据库发送的sql语句
  protected String poolPingQuery = "NO PING QUERY SET";
  // 是否允许发送上述语句
  protected boolean poolPingEnabled;
  // 当连接超过poolPingConnectionsNotUsedFor毫秒未使用，
  // 就发送一次上述sql，检测连接连接是否正常
  protected int poolPingConnectionsNotUsedFor;

  // 根据数据库URL、用户名、密码 生成的一个hash值，
  // 该hash值用于标记当前的连接池，在构造函数中初始化
  private int expectedConnectionTypeCode;
}
```

## 2 Transaction


