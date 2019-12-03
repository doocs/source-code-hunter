基础支持层主要看一下mybatis实现ORM的基础代码实现。
## 反射工具包
### Reflector
Reflector类主要实现了对JavaBean的元数据属性的封装，比如：可读属性列表，可写属性列表；及反射操作的封装，如：属性对应的setter方法，getter方法的反射调用。源码实现如下：
```java
public class Reflector {

  /** JavaBean的Class类型，在调用Reflector的构造方法时初始化该值 */
  private final Class<?> type;

  /** 可读的属性列表 */
  private final String[] readablePropertyNames;
  private final String[] writablePropertyNames;

  /** key属性名，value该属性名对应的setter方法调用器 */
  private final Map<String, Invoker> setMethods = new HashMap<>();
  private final Map<String, Invoker> getMethods = new HashMap<>();

  /** key属性名称，value该属性setter方法的返回值类型 */
  private final Map<String, Class<?>> setTypes = new HashMap<>();
  private final Map<String, Class<?>> getTypes = new HashMap<>();

  /** type的默认构造方法 */
  private Constructor<?> defaultConstructor;

  /** 所有属性名称的集合 */
  private Map<String, String> caseInsensitivePropertyMap = new HashMap<>();

  /**
   * 里面的大部分方法都是通过简单的JDK反射操作实现的
   * @param clazz
   */
  public Reflector(Class<?> clazz) {
    type = clazz;
    addDefaultConstructor(clazz);

    // 处理clazz中的所有getter方法，填充getMethods集合和getTypes集合
    addGetMethods(clazz);
    addSetMethods(clazz);

    // 处理没有getter、setter方法的字段
    addFields(clazz);

    // 根据getMethods、setMethods集合初始化可读、可写的属性
    readablePropertyNames = getMethods.keySet().toArray(new String[0]);
    writablePropertyNames = setMethods.keySet().toArray(new String[0]);

    // 初始化caseInsensitivePropertyMap集合，key属性名的大写，value属性名
    for (String propName : readablePropertyNames) {
      caseInsensitivePropertyMap.put(propName.toUpperCase(Locale.ENGLISH), propName);
    }
    for (String propName : writablePropertyNames) {
      caseInsensitivePropertyMap.put(propName.toUpperCase(Locale.ENGLISH), propName);
    }
  }
}
```
### ReflectorFactory
顾名思义，Reflector的工厂模式，跟大部分工厂类一样，里面肯定有通过标识获取对象的方法。类的设计也遵照了 接口，实现类的模式，虽然本接口只有一个默认实现。
```java
public interface ReflectorFactory {

  boolean isClassCacheEnabled();

  void setClassCacheEnabled(boolean classCacheEnabled);

  /**
   * 主要看一下这个方法，通过JavaBean的clazz获取该JavaBean对应的Reflector
   */
  Reflector findForClass(Class<?> type);
}

public class DefaultReflectorFactory implements ReflectorFactory {
  private boolean classCacheEnabled = true;

  /** 大部分容器及工厂设计模式的管用伎俩，key：JavaBean的clazz，value：JavaBean对应的Reflector实例 */
  private final ConcurrentMap<Class<?>, Reflector> reflectorMap = new ConcurrentHashMap<>();

  /**
   * 实例化一个ConcurrentMap全局变量，然后暴露一个方法从map中获取目标对象，这种设计是很多框架都会用的
   */
  @Override
  public Reflector findForClass(Class<?> type) {
    if (classCacheEnabled) {
      // synchronized (type) removed see issue #461
      return reflectorMap.computeIfAbsent(type, Reflector::new);
    } else {
      return new Reflector(type);
    }
  }
  
  public DefaultReflectorFactory() {
  }

  @Override
  public boolean isClassCacheEnabled() {
    return classCacheEnabled;
  }

  @Override
  public void setClassCacheEnabled(boolean classCacheEnabled) {
    this.classCacheEnabled = classCacheEnabled;
  }
}

/**
 * 支持定制化ReflectorFactory
 */
public class CustomReflectorFactory extends DefaultReflectorFactory {

}
```
### ObjectFactory
改类也是接口+一个默认实现类，并且支持自定义扩展。
```java
/**
 * MyBatis uses an ObjectFactory to create all needed new Objects.
 */
public interface ObjectFactory {

  /**
   * Sets configuration properties.
   */
  default void setProperties(Properties properties) {
    // NOP
  }

  /**
   * Creates a new object with default constructor.
   */
  <T> T create(Class<T> type);

  /**
   * Creates a new object with the specified constructor and params.
   */
  <T> T create(Class<T> type, List<Class<?>> constructorArgTypes, List<Object> constructorArgs);

  /**
   * Returns true if this object can have a set of other objects.
   * It's main purpose is to support non-java.util.Collection objects like Scala collections.
   */
  <T> boolean isCollection(Class<T> type);

}

/**
 * ObjectFactory接口的唯一直接实现，反射工厂，根据传入的参数列表，选择
 * 合适的构造函数实例化对象，不传参数，则直接调用其午餐构造方法
 */
public class DefaultObjectFactory implements ObjectFactory, Serializable {

  private static final long serialVersionUID = -8855120656740914948L;

  @Override
  public <T> T create(Class<T> type) {
    return create(type, null, null);
  }

  @SuppressWarnings("unchecked")
  @Override
  public <T> T create(Class<T> type, List<Class<?>> constructorArgTypes, List<Object> constructorArgs) {
    Class<?> classToCreate = resolveInterface(type);
    // we know types are assignable
    return (T) instantiateClass(classToCreate, constructorArgTypes, constructorArgs);
  }

  /**
   * 通过反射来实例化给定的类，如果调用无参构造方法，则直接constructor.newInstance()
   * 如果有参，则根据参数类型和参数值进行调用
   */
  private  <T> T instantiateClass(Class<T> type, List<Class<?>> constructorArgTypes, List<Object> constructorArgs) {
    try {
      Constructor<T> constructor;
      if (constructorArgTypes == null || constructorArgs == null) {
        constructor = type.getDeclaredConstructor();
        try {
          return constructor.newInstance();
        } catch (IllegalAccessException e) {
          if (Reflector.canControlMemberAccessible()) {
            constructor.setAccessible(true);
            return constructor.newInstance();
          } else {
            throw e;
          }
        }
      }
      constructor = type.getDeclaredConstructor(constructorArgTypes.toArray(new Class[constructorArgTypes.size()]));
      try {
        return constructor.newInstance(constructorArgs.toArray(new Object[constructorArgs.size()]));
      } catch (IllegalAccessException e) {
        if (Reflector.canControlMemberAccessible()) {
          constructor.setAccessible(true);
          return constructor.newInstance(constructorArgs.toArray(new Object[constructorArgs.size()]));
        } else {
          throw e;
        }
      }
    } catch (Exception e) {
      String argTypes = Optional.ofNullable(constructorArgTypes).orElseGet(Collections::emptyList)
          .stream().map(Class::getSimpleName).collect(Collectors.joining(","));
      String argValues = Optional.ofNullable(constructorArgs).orElseGet(Collections::emptyList)
          .stream().map(String::valueOf).collect(Collectors.joining(","));
      throw new ReflectionException("Error instantiating " + type + " with invalid types (" + argTypes + ") or values (" + argValues + "). Cause: " + e, e);
    }
  }
}
```
## 类型转换
类型转换是实现ORM的重要一环，由于 数据库中的数据类型与Java语言的数据类型并不对等，所以在PrepareStatement为sql语句绑定参数时，需要从Java类型转换成JDBC类型，而从结果集获取数据时，又要将JDBC类型转换成Java类型，mybatis使用TypeHandler完成了上述的双向转换。
### JdbcType
mybatis通过JdbcType这个枚举类型代表了JDBC中的数据类型
```java
/**
 * 该枚举类描述了JDBC中的数据类型
 */
public enum JdbcType {
  /*
   * This is added to enable basic support for the
   * ARRAY data type - but a custom type handler is still required
   */
  ARRAY(Types.ARRAY),
  BIT(Types.BIT),
  TINYINT(Types.TINYINT),
  SMALLINT(Types.SMALLINT),
  INTEGER(Types.INTEGER),
  BIGINT(Types.BIGINT),
  FLOAT(Types.FLOAT),
  REAL(Types.REAL),
  DOUBLE(Types.DOUBLE),
  NUMERIC(Types.NUMERIC),
  DECIMAL(Types.DECIMAL),
  CHAR(Types.CHAR),
  VARCHAR(Types.VARCHAR),
  LONGVARCHAR(Types.LONGVARCHAR),
  DATE(Types.DATE),
  TIME(Types.TIME),
  TIMESTAMP(Types.TIMESTAMP),
  BINARY(Types.BINARY),
  VARBINARY(Types.VARBINARY),
  LONGVARBINARY(Types.LONGVARBINARY),
  NULL(Types.NULL),
  OTHER(Types.OTHER),
  BLOB(Types.BLOB),
  CLOB(Types.CLOB),
  BOOLEAN(Types.BOOLEAN),
  CURSOR(-10), // Oracle
  UNDEFINED(Integer.MIN_VALUE + 1000),
  NVARCHAR(Types.NVARCHAR), // JDK6
  NCHAR(Types.NCHAR), // JDK6
  NCLOB(Types.NCLOB), // JDK6
  STRUCT(Types.STRUCT),
  JAVA_OBJECT(Types.JAVA_OBJECT),
  DISTINCT(Types.DISTINCT),
  REF(Types.REF),
  DATALINK(Types.DATALINK),
  ROWID(Types.ROWID), // JDK6
  LONGNVARCHAR(Types.LONGNVARCHAR), // JDK6
  SQLXML(Types.SQLXML), // JDK6
  DATETIMEOFFSET(-155), // SQL Server 2008
  TIME_WITH_TIMEZONE(Types.TIME_WITH_TIMEZONE), // JDBC 4.2 JDK8
  TIMESTAMP_WITH_TIMEZONE(Types.TIMESTAMP_WITH_TIMEZONE); // JDBC 4.2 JDK8

  public final int TYPE_CODE;

  /** 该静态集合维护了 常量编码 与  JdbcType之间的关系 */
  private static Map<Integer,JdbcType> codeLookup = new HashMap<>();

  static {
    for (JdbcType type : JdbcType.values()) {
      codeLookup.put(type.TYPE_CODE, type);
    }
  }

  JdbcType(int code) {
    this.TYPE_CODE = code;
  }

  public static JdbcType forCode(int code)  {
    return codeLookup.get(code);
  }

}
```
### TypeHandler
TypeHandler是mybatis中所有类型转换器的顶层接口，主要用于 数据从Java类型到JdbcType类型的相互转换。
```java
public interface TypeHandler<T> {

  /** 通过PreparedStatement为SQL语句绑定参数时，将数据从Java类型转换为JDBC类型 */
  void setParameter(PreparedStatement ps, int i, T parameter, JdbcType jdbcType) throws SQLException;

  /** 从结果集获取数据时，将数据由JDBC类型转换成Java类型 */
  T getResult(ResultSet rs, String columnName) throws SQLException;

  T getResult(ResultSet rs, int columnIndex) throws SQLException;

  T getResult(CallableStatement cs, int columnIndex) throws SQLException;

}

/**
 * 可用于实现自定义的TypeHandler
 */
public abstract class BaseTypeHandler<T> extends TypeReference<T> implements TypeHandler<T> {

  /**
   * 只是处理了一些数据为空的特殊情况，非空数据的处理都交给子类去处理
   */
  @Override
  public void setParameter(PreparedStatement ps, int i, T parameter, JdbcType jdbcType) throws SQLException {
    if (parameter == null) {
      if (jdbcType == null) {
        throw new TypeException("JDBC requires that the JdbcType must be specified for all nullable parameters.");
      }
      try {
        ps.setNull(i, jdbcType.TYPE_CODE);
      } catch (SQLException e) {
        throw new TypeException("Error setting null for parameter #" + i + " with JdbcType " + jdbcType + " . "
              + "Try setting a different JdbcType for this parameter or a different jdbcTypeForNull configuration property. "
              + "Cause: " + e, e);
      }
    } else {
      try {
        setNonNullParameter(ps, i, parameter, jdbcType);
      } catch (Exception e) {
        throw new TypeException("Error setting non null for parameter #" + i + " with JdbcType " + jdbcType + " . "
              + "Try setting a different JdbcType for this parameter or a different configuration property. "
              + "Cause: " + e, e);
      }
    }
  }

  @Override
  public T getResult(ResultSet rs, String columnName) throws SQLException {
    try {
      return getNullableResult(rs, columnName);
    } catch (Exception e) {
      throw new ResultMapException("Error attempting to get column '" + columnName + "' from result set.  Cause: " + e, e);
    }
  }
}


public class IntegerTypeHandler extends BaseTypeHandler<Integer> {

  /**
   * NonNull就是NoneNull，非空的意思
   */
  @Override
  public void setNonNullParameter(PreparedStatement ps, int i, Integer parameter, JdbcType jdbcType)
      throws SQLException {
    // IntegerTypeHandler就调用PreparedStatement的setInt方法
    // BooleanTypeHandler就调用PreparedStatement的setBoolean方法
    // 其它的基本数据类型，以此类推
    ps.setInt(i, parameter);
  }

  @Override
  public Integer getNullableResult(ResultSet rs, String columnName)
      throws SQLException {
    int result = rs.getInt(columnName);
    return result == 0 && rs.wasNull() ? null : result;
  }

  @Override
  public Integer getNullableResult(ResultSet rs, int columnIndex)
      throws SQLException {
    int result = rs.getInt(columnIndex);
    return result == 0 && rs.wasNull() ? null : result;
  }

  @Override
  public Integer getNullableResult(CallableStatement cs, int columnIndex)
      throws SQLException {
    int result = cs.getInt(columnIndex);
    return result == 0 && cs.wasNull() ? null : result;
  }
}
```
TypeHandler主要用于单个参数的类型转换，如果多列值转换成一个Java对象，可以在映射文件中定义合适的映射规则<resultMap>


