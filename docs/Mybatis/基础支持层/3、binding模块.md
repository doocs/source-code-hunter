binding模块主要为了解决一个历史遗留问题，原先查询一个VO对象时需要调用SqlSession.queryForObject(“selectXXVOById”, primaryKey)方法，执行指定的sql语句，第一个参数selectXXVOById指定了执行的sql语句id，如果我们不小心写错了参数，mybatis是无法在初始化时发现这个错误的，只会在实际调用queryForObject(“selectXXVOById”, primaryKey)方法时才会抛出异常，这对于工程师来说是非常难受的，就像泛型出来之前，很多类型转换不会在编译期发现错误一样。
而binding模块就像Java的泛型机制一样，将程序的错误提前暴露出来，为开发人员省去不少排查问题的精力。
binding模块的解决方案是，定义一个Mapper接口，在接口中定义sql语句对应的方法名(Id)及参数，这些方法在mybatis的初始化过程中，会与该Mapper接口对应的映射配置文件中的sql语句相关联，如果存在无法关联的sql语句，mybatis就会抛出异常，帮助我们及时发现问题。示例代码如下：
```java
public interface HeroMapper {
	// 映射文件中会存在一个<select>节点，id为“selectHeroVOById”
	public HeroVO selectHeroVOById(int id);
}

// 首先，获取HeroMapper对应的代理对象
HeroMapper heroMapper = session.getMapper(HeroMapper.class);
// 直接调用HeroMapper接口中的方法 获取结果集
HeroVO heroVO = heroMapper.selectHeroVOById("23333");
```
## 1 MapperRegistry和MapperProxyFactory
MapperRegistry是Mapper接口及其对应的代理对象工厂的注册中心。Configuration是mybatis中全局性的配置对象，根据mybatis的核心配置文件mybatis-config.xml解析而成。Configuration通过mapperRegistry属性持有该对象。
mybatis在初始化过程中会读取映射配置文件和Mapper接口中的注解信息，并调用MapperRegistry的addMappers()方法填充knownMappers集合，在需要执行某sql语句时，会先调用getMapper()方法获取实现了Mapper接口的动态代理对象。
```java
public class MapperRegistry {

  // mybatis全局唯一的配置对象，包含了几乎所有配置信息
  private final Configuration config;
  // key：Mapper接口，value：MapperProxyFactory为Mapper接口创建代理对象的工厂
  private final Map<Class<?>, MapperProxyFactory<?>> knownMappers = new HashMap<>();

  // 下面的两个重载方法 通过扫描指定的包目录，获取所有的Mapper接口
  public void addMappers(String packageName) {
    addMappers(packageName, Object.class);
  }

  public void addMappers(String packageName, Class<?> superType) {
    ResolverUtil<Class<?>> resolverUtil = new ResolverUtil<>();
    resolverUtil.find(new ResolverUtil.IsA(superType), packageName);
    Set<Class<? extends Class<?>>> mapperSet = resolverUtil.getClasses();
    for (Class<?> mapperClass : mapperSet) {
      addMapper(mapperClass);
    }
  }

  public <T> void addMapper(Class<T> type) {
    // 该type是不是接口
    if (type.isInterface()) {
      // 是否已经加载过
      if (hasMapper(type)) {
        throw new BindingException("Type " + type + " is already known to the MapperRegistry.");
      }
      boolean loadCompleted = false;
      try {
        // 将Mapper接口的Class对象 和 对应的MapperProxyFactory对象添加到knownMappers集合
        knownMappers.put(type, new MapperProxyFactory<>(type));
        // XML解析和注解的处理
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

  @SuppressWarnings("unchecked")
  public <T> T getMapper(Class<T> type, SqlSession sqlSession) {
    // 获取type对应的MapperProxyFactory对象
    final MapperProxyFactory<T> mapperProxyFactory = (MapperProxyFactory<T>) knownMappers.get(type);
    if (mapperProxyFactory == null) {
      throw new BindingException("Type " + type + " is not known to the MapperRegistry.");
    }
    try {
      // 根据sqlSession创建 type接口的代理对象
      return mapperProxyFactory.newInstance(sqlSession);
    } catch (Exception e) {
      throw new BindingException("Error getting mapper instance. Cause: " + e, e);
    }
  }

  // 获取所有的MapperProxyFactory
  public Collection<Class<?>> getMappers() {
    return Collections.unmodifiableCollection(knownMappers.keySet());
  }

  // 初始化的时候会持有Configuration对象
  public MapperRegistry(Configuration config) {
    this.config = config;
  }

  // 是否存在指定的MapperProxyFactory
  public <T> boolean hasMapper(Class<T> type) {
    return knownMappers.containsKey(type);
  }
}
```
MapperProxyFactory主要负责创建代理对象。
```java
public class MapperProxyFactory<T> {

  // 要创建的动态代理对象 所实现的接口
  private final Class<T> mapperInterface;
  // 缓存mapperInterface接口中Method对象和其对应的MapperMethod对象
  private final Map<Method, MapperMethod> methodCache = new ConcurrentHashMap<>();

  // 初始化时为mapperInterface注入值
  public MapperProxyFactory(Class<T> mapperInterface) {
    this.mapperInterface = mapperInterface;
  }

  public Class<T> getMapperInterface() {
    return mapperInterface;
  }

  public Map<Method, MapperMethod> getMethodCache() {
    return methodCache;
  }

  public T newInstance(SqlSession sqlSession) {
    // 每都会创建一个新的MapperProxy对象
    final MapperProxy<T> mapperProxy = new MapperProxy<>(sqlSession, mapperInterface, methodCache);
    return newInstance(mapperProxy);
  }

  /**
   * 非常眼熟的JDK动态代理 代码，创建了实现mapperInterface接口的代理对象
   * 根据国际惯例，mapperProxy对应的类 肯定实现了InvocationHandler接口，
   * 为mapperInterface接口方法的调用织入统一处理逻辑
   */
  protected T newInstance(MapperProxy<T> mapperProxy) {
    return (T) Proxy.newProxyInstance(mapperInterface.getClassLoader(), new Class[] { mapperInterface }, mapperProxy);
  }
}
```
## 2 MapperProxy
MapperProxy实现了InvocationHandler接口，为Mapper接口的方法调用织入了统一处理。
```java
public class MapperProxy<T> implements InvocationHandler, Serializable {

  private static final long serialVersionUID = -6424540398559729838L;
  // 记录关联的sqlSession对象
  private final SqlSession sqlSession;
  // 对应的Mapper接口的Class对象
  private final Class<T> mapperInterface;
  // 用于缓存MapperMethod对象，key：Mapper接口中方法对应的Method对象，
  // value：MapperMethod对象（该对象会完成参数转换 及 sql语句的执行功能）
  private final Map<Method, MapperMethod> methodCache;

  public MapperProxy(SqlSession sqlSession, Class<T> mapperInterface, Map<Method, MapperMethod> methodCache) {
    this.sqlSession = sqlSession;
    this.mapperInterface = mapperInterface;
    this.methodCache = methodCache;
  }

  // 为被代理对象的方法 织入统一处理
  public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
    try {
      // 如果目标方法继承自Object，则直接调用目标方法
      if (Object.class.equals(method.getDeclaringClass())) {
        return method.invoke(this, args);
      } else if (method.isDefault()) {
        return invokeDefaultMethod(proxy, method, args);
      }
    } catch (Throwable t) {
      throw ExceptionUtil.unwrapThrowable(t);
    }
    // 从缓存中获取mapperMethod对象，如果没有就创建新的
    final MapperMethod mapperMethod = cachedMapperMethod(method);
    // 执行sql语句，返回结果集
    return mapperMethod.execute(sqlSession, args);
  }

  // 主要负责维护methodCache 缓存
  private MapperMethod cachedMapperMethod(Method method) {
    // 这里用到了Java8的新特性，computeIfAbsent()是Java8的新方法，Lambda表达式也是Java8中最重要的新特性之一
    // computeIfAbsent()方法表示 当前map中，若key对应的value为空，则执行传入的Lambda表达式，将key和表达式的value
    // 存入当前map，并返回value值
    // 在这段代码中的意思是：若methodCache中没有method对应的value，就执行右侧的Lambda表达式，并将表达式的结果
    // 存入methodCache 并 返回
    return methodCache.computeIfAbsent(method, k -> new MapperMethod(mapperInterface, method, sqlSession.getConfiguration()));
  }
}
```
## 3 MapperMethod
MapperMethod中封装了Mapper接口中对应方法的信息，和对应sql语句的信息，是连接Mapper接口及映射配置文件中定义的sql语句的桥梁。
MapperMethod中持有两个非常重要的属性，这两个属性对应的类 都是MapperMethod中的静态内部类。另外，MapperMethod在被实例化时就对这两个属性进行了初始化。
```java
public class MapperMethod {

  /** 下面这俩货都是内部类，而且还是public static的 */
  private final SqlCommand command;
  private final MethodSignature method;

  public MapperMethod(Class<?> mapperInterface, Method method, Configuration config) {
    this.command = new SqlCommand(config, mapperInterface, method);
    this.method = new MethodSignature(config, mapperInterface, method);
  }
}
```
MapperMethod中的核心方法execute()就主要用到了这两个类，所以我们先看一下SqlCommand和MethodSignature的源码。
### 3.1 SqlCommand
```java
  public static class SqlCommand {

    // sql语句的id
    private final String name;
    // sql语句的类型，SqlCommandType是枚举类型，持有常用的 增、删、改、查等操作类型
    private final SqlCommandType type;

    public SqlCommand(Configuration configuration, Class<?> mapperInterface, Method method) {
      // 方法名
      final String methodName = method.getName();
      // 该方法对应的类的Class对象
      final Class<?> declaringClass = method.getDeclaringClass();
      // MappedStatement封装了sql语句相关的信息，在mybatis初始化时创建
      MappedStatement ms = resolveMappedStatement(mapperInterface, methodName, declaringClass, configuration);
      if (ms == null) {
        // 处理Flush注解
        if (method.getAnnotation(Flush.class) != null) {
          name = null;
          type = SqlCommandType.FLUSH;
        } else {
          throw new BindingException("Invalid bound statement (not found): "
              + mapperInterface.getName() + "." + methodName);
        }
      } else {
        // 初始化name 和 type
        name = ms.getId();
        type = ms.getSqlCommandType();
        if (type == SqlCommandType.UNKNOWN) {
          throw new BindingException("Unknown execution method for: " + name);
        }
      }
    }

    private MappedStatement resolveMappedStatement(Class<?> mapperInterface, String methodName,
                                                   Class<?> declaringClass, Configuration configuration) {
      // sql语句的名称默认是由Mapper接口方法的 包名.类名.方法名
      String statementId = mapperInterface.getName() + "." + methodName;
      // 检测是否有该名称的sql语句
      if (configuration.hasStatement(statementId)) {
        // 从configuration的mappedStatements容器中获取statementId对应的MappedStatement对象
        return configuration.getMappedStatement(statementId);
        // 如果此方法不是mapperInterface接口定义的，则返回空
      } else if (mapperInterface.equals(declaringClass)) {
        return null;
      }
      // 对mapperInterface的父接口 进行递归处理
      for (Class<?> superInterface : mapperInterface.getInterfaces()) {
        if (declaringClass.isAssignableFrom(superInterface)) {
          MappedStatement ms = resolveMappedStatement(superInterface, methodName,
            declaringClass, configuration);
          if (ms != null) {
            return ms;
          }
        }
      }
      return null;
    }

    public String getName() {
      return name;
    }

    public SqlCommandType getType() {
      return type;
    }
  }
```
### 3.2 MethodSignature
```java
  public static class MethodSignature {

    // 返回值类型是否为 集合 或 数组
    private final boolean returnsMany;
    // 返回值类型是否为 Map类型
    private final boolean returnsMap;
    // 返回值类型是否为void
    private final boolean returnsVoid;
    // 返回值类型是否为Cursor
    private final boolean returnsCursor;
    // 返回值类型是否为Optional
    private final boolean returnsOptional;
    // 返回值类型的Class对象
    private final Class<?> returnType;
    // 如果返回值类型为Map，则用该字段记录了作为key的列名
    private final String mapKey;
    // 标记该方法参数列表中ResultHandler类型参数的位置
    private final Integer resultHandlerIndex;
    // 标记该方法参数列表中RowBounds类型参数的位置
    private final Integer rowBoundsIndex;

    /**
     * 顾名思义，这是一个处理Mapper接口中 方法参数列表的解析器，它使用了一个SortedMap<Integer, String>
     * 类型的容器 记录了参数在参数列表中的位置索引 与 参数名之间的对应关系，key参数在参数列表中的索引位置，
     * value参数名(参数名可用@Param注解指定，默认使用参数索引作为其名称)
     */
    private final ParamNameResolver paramNameResolver;

    /**
     * MethodSignature的构造方法会解析对应的method，并初始化上述字段
     */
    public MethodSignature(Configuration configuration, Class<?> mapperInterface, Method method) {
      // 获取method方法的返回值类型
      Type resolvedReturnType = TypeParameterResolver.resolveReturnType(method, mapperInterface);
      if (resolvedReturnType instanceof Class<?>) {
        this.returnType = (Class<?>) resolvedReturnType;
      } else if (resolvedReturnType instanceof ParameterizedType) {
        this.returnType = (Class<?>) ((ParameterizedType) resolvedReturnType).getRawType();
      } else {
        this.returnType = method.getReturnType();
      }
      // 对MethodSignature持有的各属性 进行初始化
      this.returnsVoid = void.class.equals(this.returnType);
      this.returnsMany = configuration.getObjectFactory().isCollection(this.returnType) || this.returnType.isArray();
      this.returnsCursor = Cursor.class.equals(this.returnType);
      this.returnsOptional = Optional.class.equals(this.returnType);
      this.mapKey = getMapKey(method);
      this.returnsMap = this.mapKey != null;
      this.rowBoundsIndex = getUniqueParamIndex(method, RowBounds.class);
      this.resultHandlerIndex = getUniqueParamIndex(method, ResultHandler.class);
      this.paramNameResolver = new ParamNameResolver(configuration, method);
    }

    /**
     * 查找指定类型的参数在参数列表中的位置，要查找的参数类型在参数列表中必须是唯一的
     * 如果参数列表中存在多个 要查找的参数类型，则会抛出异常
     */
    private Integer getUniqueParamIndex(Method method, Class<?> paramType) {
      Integer index = null;
      final Class<?>[] argTypes = method.getParameterTypes();
      for (int i = 0; i < argTypes.length; i++) {
        if (paramType.isAssignableFrom(argTypes[i])) {
          if (index == null) {
            index = i;
          } else {
            throw new BindingException(method.getName() + " cannot have multiple " + paramType.getSimpleName() + " parameters");
          }
        }
      }
      return index;
    }
  }
```
### 3.3 execute()方法
execute()方法会根据sql语句的类型(CRUD)调用SqlSession对应的方法完成数据库操作，SqlSession是mybatis的核心组件之一，后面会详细解读。
```java
public class MapperMethod {
  public Object execute(SqlSession sqlSession, Object[] args) {
    Object result;
    // 根据sql语句的类型 调用sqlSession对应的方法
    switch (command.getType()) {
      case INSERT: {
        // 使用ParamNameResolver处理args实参列表，将用户传入的实参与
        // 指定参数名称关联起来
        Object param = method.convertArgsToSqlCommandParam(args);
        // 获取返回结果，rowCountResult()方法会 根据method属性中的returnType，
        // 对结果的类型进行转换
        result = rowCountResult(sqlSession.insert(command.getName(), param));
        break;
      }
      case UPDATE: {
        Object param = method.convertArgsToSqlCommandParam(args);
        result = rowCountResult(sqlSession.update(command.getName(), param));
        break;
      }
      case DELETE: {
        Object param = method.convertArgsToSqlCommandParam(args);
        result = rowCountResult(sqlSession.delete(command.getName(), param));
        break;
      }
      case SELECT:
        // 处理返回值为void且ResultSet通过ResultHandler处理的方法
        if (method.returnsVoid() && method.hasResultHandler()) {
          executeWithResultHandler(sqlSession, args);
          result = null;
        // 处理返回值为集合 或 数组的方法
        } else if (method.returnsMany()) {
          result = executeForMany(sqlSession, args);
        // 处理返回值为Map的方法
        } else if (method.returnsMap()) {
          result = executeForMap(sqlSession, args);
        // 处理返回值为Cursor的方法
        } else if (method.returnsCursor()) {
          result = executeForCursor(sqlSession, args);
        } else {
        // 处理返回值为单一对象的方法
          Object param = method.convertArgsToSqlCommandParam(args);
          result = sqlSession.selectOne(command.getName(), param);
          // 处理返回值为Optional的方法
          if (method.returnsOptional()
              && (result == null || !method.getReturnType().equals(result.getClass()))) {
            result = Optional.ofNullable(result);
          }
        }
        break;
      case FLUSH:
        result = sqlSession.flushStatements();
        break;
      default:
        throw new BindingException("Unknown execution method for: " + command.getName());
    }
    if (result == null && method.getReturnType().isPrimitive() && !method.returnsVoid()) {
      throw new BindingException("Mapper method '" + command.getName()
          + " attempted to return null from a method with a primitive return type (" + method.getReturnType() + ").");
    }
    return result;
  }

  /**
   * 当执行insert、update、delete类型的sql语句时，其执行结果都要经过本方法处理
   */
  private Object rowCountResult(int rowCount) {
    final Object result;
    // 方法的返回值为void时
    if (method.returnsVoid()) {
      result = null;
    // 方法的返回值为Integer时
    } else if (Integer.class.equals(method.getReturnType()) || Integer.TYPE.equals(method.getReturnType())) {
      result = rowCount;
    // 方法的返回值为Long时
    } else if (Long.class.equals(method.getReturnType()) || Long.TYPE.equals(method.getReturnType())) {
      result = (long)rowCount;
    // 方法的返回值为Boolean时
    } else if (Boolean.class.equals(method.getReturnType()) || Boolean.TYPE.equals(method.getReturnType())) {
      result = rowCount > 0;
    } else {
      throw new BindingException("Mapper method '" + command.getName() + "' has an unsupported return type: " + method.getReturnType());
    }
    return result;
  }

  /**
   * 如果Mapper接口中定义的方法准备使用ResultHandler处理查询结果集，则通过此方法处理
   */
  private void executeWithResultHandler(SqlSession sqlSession, Object[] args) {
    // 获取sql语句对应的MappedStatement对象，该对象中记录了sql语句相关信息
    MappedStatement ms = sqlSession.getConfiguration().getMappedStatement(command.getName());
    // 当使用ResultHandler处理结果集时，必须指定ResultMap或ResultType
    if (!StatementType.CALLABLE.equals(ms.getStatementType())
        && void.class.equals(ms.getResultMaps().get(0).getType())) {
      throw new BindingException("method " + command.getName()
          + " needs either a @ResultMap annotation, a @ResultType annotation,"
          + " or a resultType attribute in XML so a ResultHandler can be used as a parameter.");
    }
    // 转换实参列表
    Object param = method.convertArgsToSqlCommandParam(args);
    // 如果实参列表中有RowBounds类型参数
    if (method.hasRowBounds()) {
      // 从args参数列表中获取RowBounds对象
      RowBounds rowBounds = method.extractRowBounds(args);
      // 执行查询，并用指定的ResultHandler处理结果对象
      sqlSession.select(command.getName(), param, rowBounds, method.extractResultHandler(args));
    } else {
      sqlSession.select(command.getName(), param, method.extractResultHandler(args));
    }
  }

  /**
   * 如果Mapper接口中对应方法的返回值为集合(Collection接口实现类) 或 数组，
   * 则调用本方法将结果集处理成 相应的集合或数组
   */
  private <E> Object executeForMany(SqlSession sqlSession, Object[] args) {
    List<E> result;
    // 参数列表转换
    Object param = method.convertArgsToSqlCommandParam(args);
    // 参数列表中是否有RowBounds类型的参数
    if (method.hasRowBounds()) {
      RowBounds rowBounds = method.extractRowBounds(args);
      // 这里使用了selectList()方法进行查询，所以返回的结果集就是List类型的
      result = sqlSession.selectList(command.getName(), param, rowBounds);
    } else {
      result = sqlSession.selectList(command.getName(), param);
    }
    // 将结果集转换为数组或Collection集合
    if (!method.getReturnType().isAssignableFrom(result.getClass())) {
      if (method.getReturnType().isArray()) {
        return convertToArray(result);
      } else {
        return convertToDeclaredCollection(sqlSession.getConfiguration(), result);
      }
    }
    return result;
  }

  /**
   * 将结果集转换成Collection集合
   */
  private <E> Object convertToDeclaredCollection(Configuration config, List<E> list) {
    // 使用前面介绍的ObjectFactory，通过反射方式创建集合对象
    Object collection = config.getObjectFactory().create(method.getReturnType());
    MetaObject metaObject = config.newMetaObject(collection);
    // 实际上就是调用了Collection的addAll()方法
    metaObject.addAll(list);
    return collection;
  }

  /**
   * 本方法和上面的convertToDeclaredCollection()功能类似，主要负责将结果对象转换成数组
   */
  @SuppressWarnings("unchecked")
  private <E> Object convertToArray(List<E> list) {
    // 获取数组中元素的类型Class
    Class<?> arrayComponentType = method.getReturnType().getComponentType();
    // 根据元素类型 和 元素数量 初始化数组
    Object array = Array.newInstance(arrayComponentType, list.size());
    // 将List转换成数组
    if (arrayComponentType.isPrimitive()) {
      for (int i = 0; i < list.size(); i++) {
        Array.set(array, i, list.get(i));
      }
      return array;
    } else {
      return list.toArray((E[])array);
    }
  }

  /**
   * 如果Mapper接口中对应方法的返回值为类型为Map，则调用此方法执行sql语句
   */
  private <K, V> Map<K, V> executeForMap(SqlSession sqlSession, Object[] args) {
    Map<K, V> result;
    // 转换实参列表
    Object param = method.convertArgsToSqlCommandParam(args);
    if (method.hasRowBounds()) {
      RowBounds rowBounds = method.extractRowBounds(args);
      // 注意这里调用的是sqlSession的selectMap方法，使用返回的是一个Map类型结果集
      result = sqlSession.selectMap(command.getName(), param, method.getMapKey(), rowBounds);
    } else {
      result = sqlSession.selectMap(command.getName(), param, method.getMapKey());
    }
    return result;
  }

  /**
   * 本方法与上面的executeForMap()方法类似，只不过sqlSession调用的是selectCursor()
   */
  private <T> Cursor<T> executeForCursor(SqlSession sqlSession, Object[] args) {
    Cursor<T> result;
    Object param = method.convertArgsToSqlCommandParam(args);
    if (method.hasRowBounds()) {
      RowBounds rowBounds = method.extractRowBounds(args);
      result = sqlSession.selectCursor(command.getName(), param, rowBounds);
    } else {
      result = sqlSession.selectCursor(command.getName(), param);
    }
    return result;
  }
}
```