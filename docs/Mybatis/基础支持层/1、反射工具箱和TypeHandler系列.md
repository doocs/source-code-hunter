在 Mybatis 的基础支持层主要看一下支撑 ORM 实现 的底层代码。

## 1 反射工具包

### 1.1Reflector

Reflector 类 主要实现了对 JavaBean 的元数据属性的封装，比如：可读属性列表，可写属性列表；及反射操作的封装，如：属性对应的 setter 方法，getter 方法 的反射调用。源码实现如下：

```java
public class Reflector {

  /** JavaBean 的 Class类型，在调用 Reflector 的构造方法时初始化该值 */
  private final Class<?> type;

  /** 可读的属性列表 */
  private final String[] readablePropertyNames;
  private final String[] writablePropertyNames;

  /** key 属性名，value 该属性名对应的 setter方法调用器 */
  private final Map<String, Invoker> setMethods = new HashMap<>();
  private final Map<String, Invoker> getMethods = new HashMap<>();

  /** key 属性名称，value 该属性 setter方法的返回值类型 */
  private final Map<String, Class<?>> setTypes = new HashMap<>();
  private final Map<String, Class<?>> getTypes = new HashMap<>();

  /** type 的默认构造方法 */
  private Constructor<?> defaultConstructor;

  /** 所有属性名称的集合 */
  private Map<String, String> caseInsensitivePropertyMap = new HashMap<>();

  /**
   * 里面的大部分方法都是通过简单的 JDK反射操作 实现的
   * @param clazz
   */
  public Reflector(Class<?> clazz) {
    type = clazz;
    addDefaultConstructor(clazz);

    // 处理 clazz 中的 所有getter方法，填充 getMethods集合 和 getTypes集合
    addGetMethods(clazz);
    addSetMethods(clazz);

    // 处理没有 getter、setter方法 的字段
    addFields(clazz);

    // 根据 getMethods、setMethods集合 初始化可读、可写的属性
    readablePropertyNames = getMethods.keySet().toArray(new String[0]);
    writablePropertyNames = setMethods.keySet().toArray(new String[0]);

    // 初始化 caseInsensitivePropertyMap集合，key 属性名的大写，value 属性名
    for (String propName : readablePropertyNames) {
      caseInsensitivePropertyMap.put(propName.toUpperCase(Locale.ENGLISH), propName);
    }
    for (String propName : writablePropertyNames) {
      caseInsensitivePropertyMap.put(propName.toUpperCase(Locale.ENGLISH), propName);
    }
  }
}
```

### 1.2 ReflectorFactory

顾名思义，Reflector 的工厂模式，跟大部分工厂类一样，里面肯定有通过标识获取对象的方法。类的设计也遵照了 接口，实现类的模式，虽然本接口只有一个默认实现。

```java
public interface ReflectorFactory {

  boolean isClassCacheEnabled();

  void setClassCacheEnabled(boolean classCacheEnabled);

  /**
   * 主要看一下这个方法，通过 JavaBean 的 clazz 获取该 JavaBean 对应的 Reflector
   */
  Reflector findForClass(Class<?> type);
}

public class DefaultReflectorFactory implements ReflectorFactory {
  private boolean classCacheEnabled = true;

  /** 大部分容器及工厂设计模式的管用伎俩，key：JavaBean的clazz，value：JavaBean对应的Reflector实例 */
  private final ConcurrentMap<Class<?>, Reflector> reflectorMap = new ConcurrentHashMap<>();

  /**
   * 实例化一个 ConcurrentMap全局变量，然后暴露一个方法从 map 中获取目标对象，这种设计是很多框架都会用的
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
 * 支持定制化 ReflectorFactory
 */
public class CustomReflectorFactory extends DefaultReflectorFactory {

}
```

### 1.3 ObjectFactory

该类也是接口加一个默认实现类，并且支持自定义扩展，Mybatis 中有很多这样的设计方式。

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
 * ObjectFactory接口 的唯一直接实现，反射工厂，根据传入的参数列表，选择
 * 合适的构造函数实例化对象，不传参数，则直接调用其无参构造方法
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
   * 通过反射来实例化给定的类，如果调用无参构造方法，则直接 constructor.newInstance()
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

## 2 类型转换

类型转换是实现 ORM 的重要一环，由于数据库中的数据类型与 Java 语言 的数据类型并不对等，所以在 PrepareStatement 为 sql 语句 绑定参数时，需要从 Java 类型 转换成 JDBC 类型，而从结果集获取数据时，又要将 JDBC 类型 转换成 Java 类型，Mybatis 使用 TypeHandler 完成了上述的双向转换。

### 2.1 JdbcType

Mybatis 通过 JdbcType 这个枚举类型代表了 JDBC 中的数据类型。

```java
/**
 * 该枚举类描述了 JDBC 中的数据类型
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

  /** 该静态集合维护了 常量编码 与  JdbcType 之间的关系 */
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

### 2.2 TypeHandler

TypeHandler 是 Mybatis 中所有类型转换器的顶层接口，主要用于实现数据从 Java 类型 到 JdbcType 类型 的相互转换。

```java
public interface TypeHandler<T> {

  /** 通过 PreparedStatement 为 SQL语句 绑定参数时，将数据从 Java类型 转换为 JDBC类型 */
  void setParameter(PreparedStatement ps, int i, T parameter, JdbcType jdbcType) throws SQLException;

  /** 从结果集获取数据时，将数据由 JDBC类型 转换成 Java类型 */
  T getResult(ResultSet rs, String columnName) throws SQLException;

  T getResult(ResultSet rs, int columnIndex) throws SQLException;

  T getResult(CallableStatement cs, int columnIndex) throws SQLException;

}

/**
 * 可用于实现自定义的 TypeHandler
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
   * NonNull 就是 NoneNull，非空的意思
   */
  @Override
  public void setNonNullParameter(PreparedStatement ps, int i, Integer parameter, JdbcType jdbcType)
      throws SQLException {
    // IntegerTypeHandler 就调用 PreparedStatement 的 setInt()方法
    // BooleanTypeHandler 就调用 PreparedStatement 的 setBoolean()方法
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

TypeHandler 主要用于单个参数的类型转换，如果要将多个列的值转换成一个 Java 对象，可以在映射文件中定义合适的映射规则 &lt;resultMap&gt; 完成映射。

### 2.3 TypeHandlerRegistry

TypeHandlerRegistry 主要负责管理所有已知的 TypeHandler，Mybatis 在初始化过程中会为所有已知的 TypeHandler 创建对象，并注册到 TypeHandlerRegistry。

```java
  // TypeHandlerRegistry 中的核心字段如下

  /** 该集合主要用于从结果集读取数据时，将数据从 JDBC类型 转换成 Java类型 */
  private final Map<JdbcType, TypeHandler<?>>  jdbcTypeHandlerMap = new EnumMap<>(JdbcType.class);

  /**
   * 记录了 Java类型 向指定 JdbcType 转换时，需要使用的 TypeHandler对象。
   * 如：String 可能转换成数据库的 char、varchar 等多种类型，所以存在一对多的关系
   */
  private final Map<Type, Map<JdbcType, TypeHandler<?>>> typeHandlerMap = new ConcurrentHashMap<>();

  /** key：TypeHandler 的类型；value：该 TypeHandler类型 对应的 TypeHandler对象 */
  private final Map<Class<?>, TypeHandler<?>> allTypeHandlersMap = new HashMap<>();
```

**1、注册 TypeHandler 对象**  
TypeHandlerRegistry 中的 register()方法 实现了注册 TypeHandler 对象 的功能，该方法存在多种重载，但大多数 register()方法 最终都会走 register(Type javaType, JdbcType jdbcType, TypeHandler<?> handler) 的处理逻辑，该重载方法中分别指定了 TypeHandler 能够处理的 Java 类型、JDBC 类型、TypeHandler 对象。

```java
  /**
   * TypeHandlerRegistry 中对 register()方法 实现了多种重载，本 register()方法
   * 被很多重载方法调用，用来完成注册功能。
   */
  private void register(Type javaType, JdbcType jdbcType, TypeHandler<?> handler) {
    if (javaType != null) {
      Map<JdbcType, TypeHandler<?>> map = typeHandlerMap.get(javaType);
      if (map == null || map == NULL_TYPE_HANDLER_MAP) {
        map = new HashMap<>();
        typeHandlerMap.put(javaType, map);
      }
      map.put(jdbcType, handler);
    }
    allTypeHandlersMap.put(handler.getClass(), handler);
  }
```

另外，TypeHandlerRegistry 还提供了扫描并注册指定包目录下 TypeHandler 实现类 的 register()方法 重载。

```java
  /**
   * 从指定 包名packageName 中获取自定义的 TypeHandler实现类
   */
  public void register(String packageName) {
    ResolverUtil<Class<?>> resolverUtil = new ResolverUtil<>();
    // 查找指定包下的 TypeHandler接口实现类
    resolverUtil.find(new ResolverUtil.IsA(TypeHandler.class), packageName);
    Set<Class<? extends Class<?>>> handlerSet = resolverUtil.getClasses();
    for (Class<?> type : handlerSet) {
      // 忽略掉 内部类、接口 及 抽象类
      if (!type.isAnonymousClass() && !type.isInterface() && !Modifier.isAbstract(type.getModifiers())) {
        register(type);
      }
    }
  }
```

最后看一下 TypeHandlerRegistry 的构造方法，其通过多种 register()方法 重载，完成了所有已知的 TypeHandler 的重载。

```java
  /**
   * 进行 Java 及 JDBC基本数据类型 的 TypeHandler 注册
   * 除了注册 Mybatis 提供的 基本TypeHandler 外，我们也可以添加自定义的 TypeHandler
   * 接口实现，在 mybatis-config.xml配置文件 中 <typeHandlers>节点 下添加相应的
   * <typeHandlers>节点配置，并指定自定义的 TypeHandler实现类。Mybatis 在初始化时
   * 会解析该节点，并将 TypeHandler类型 的对象注册到 TypeHandlerRegistry 中供 Mybatis 后续使用
   */
  public TypeHandlerRegistry() {
    register(Boolean.class, new BooleanTypeHandler());
    register(boolean.class, new BooleanTypeHandler());
    register(JdbcType.BOOLEAN, new BooleanTypeHandler());
    register(JdbcType.BIT, new BooleanTypeHandler());

    register(Byte.class, new ByteTypeHandler());
    register(byte.class, new ByteTypeHandler());
    register(JdbcType.TINYINT, new ByteTypeHandler());

    register(Short.class, new ShortTypeHandler());
    register(short.class, new ShortTypeHandler());
    register(JdbcType.SMALLINT, new ShortTypeHandler());

    register(Integer.class, new IntegerTypeHandler());
    register(int.class, new IntegerTypeHandler());
    register(JdbcType.INTEGER, new IntegerTypeHandler());

    register(Long.class, new LongTypeHandler());
    register(long.class, new LongTypeHandler());

    register(Float.class, new FloatTypeHandler());
    register(float.class, new FloatTypeHandler());
    register(JdbcType.FLOAT, new FloatTypeHandler());

    register(Double.class, new DoubleTypeHandler());
    register(double.class, new DoubleTypeHandler());
    register(JdbcType.DOUBLE, new DoubleTypeHandler());

    register(Reader.class, new ClobReaderTypeHandler());
    register(String.class, new StringTypeHandler());
    register(String.class, JdbcType.CHAR, new StringTypeHandler());
    register(String.class, JdbcType.CLOB, new ClobTypeHandler());
    register(String.class, JdbcType.VARCHAR, new StringTypeHandler());
    register(String.class, JdbcType.LONGVARCHAR, new StringTypeHandler());
    register(String.class, JdbcType.NVARCHAR, new NStringTypeHandler());
    register(String.class, JdbcType.NCHAR, new NStringTypeHandler());
    register(String.class, JdbcType.NCLOB, new NClobTypeHandler());
    register(JdbcType.CHAR, new StringTypeHandler());
    register(JdbcType.VARCHAR, new StringTypeHandler());
    register(JdbcType.CLOB, new ClobTypeHandler());
    register(JdbcType.LONGVARCHAR, new StringTypeHandler());
    register(JdbcType.NVARCHAR, new NStringTypeHandler());
    register(JdbcType.NCHAR, new NStringTypeHandler());
    register(JdbcType.NCLOB, new NClobTypeHandler());

    register(Object.class, JdbcType.ARRAY, new ArrayTypeHandler());
    register(JdbcType.ARRAY, new ArrayTypeHandler());

    register(BigInteger.class, new BigIntegerTypeHandler());
    register(JdbcType.BIGINT, new LongTypeHandler());

    register(BigDecimal.class, new BigDecimalTypeHandler());
    register(JdbcType.REAL, new BigDecimalTypeHandler());
    register(JdbcType.DECIMAL, new BigDecimalTypeHandler());
    register(JdbcType.NUMERIC, new BigDecimalTypeHandler());



    register(String.class, JdbcType.SQLXML, new SqlxmlTypeHandler());

    register(Instant.class, new InstantTypeHandler());
    register(LocalDateTime.class, new LocalDateTimeTypeHandler());
    register(LocalDate.class, new LocalDateTypeHandler());
    register(LocalTime.class, new LocalTimeTypeHandler());
    register(OffsetDateTime.class, new OffsetDateTimeTypeHandler());
    register(OffsetTime.class, new OffsetTimeTypeHandler());
    register(ZonedDateTime.class, new ZonedDateTimeTypeHandler());
    register(Month.class, new MonthTypeHandler());
    register(Year.class, new YearTypeHandler());
    register(YearMonth.class, new YearMonthTypeHandler());
    register(JapaneseDate.class, new JapaneseDateTypeHandler());
  }
```

**2、查找 TypeHandler**  
TypeHandlerRegistry 其实就是一个容器，前面注册了一堆东西，也就是为了方便获取，其对应的方法为 getTypeHandler()，该方法也存在多种重载，其中最重要的一个重载为 getTypeHandler(Type type, JdbcType jdbcType)，它会根据指定的 Java 类型 和 JdbcType 类型 查找相应的 TypeHandler 对象。

```java
  /**
   * 获取 TypeHandler对象
   * getTypeHandler()方法 亦存在多种重载，而本重载方法被其它多个重载方法调用
   */
  private <T> TypeHandler<T> getTypeHandler(Type type, JdbcType jdbcType) {
    if (ParamMap.class.equals(type)) {
      return null;
    }
    // Java数据类型 与 JDBC数据类型 的关系往往是一对多，
    // 所以一般会先根据 Java数据类型 获取 Map<JdbcType, TypeHandler<?>>对象
    // 再根据 JDBC数据类型 获取对应的 TypeHandler对象
    Map<JdbcType, TypeHandler<?>> jdbcHandlerMap = getJdbcHandlerMap(type);
    TypeHandler<?> handler = null;
    if (jdbcHandlerMap != null) {
      handler = jdbcHandlerMap.get(jdbcType);
      if (handler == null) {
        handler = jdbcHandlerMap.get(null);
      }
      if (handler == null) {
        // #591
        handler = pickSoleHandler(jdbcHandlerMap);
      }
    }
    // type drives generics here
    return (TypeHandler<T>) handler;
  }
```

除了 Mabatis 本身自带的 TypeHandler 实现，我们还可以添加自定义的 TypeHandler 实现类，在配置文件 mybatis-config.xml 中的 &lt;typeHandler&gt; 标签下配置好 自定义 TypeHandler，Mybatis 就会在初始化时解析该标签内容，完成 自定义 TypeHandler 的注册。
