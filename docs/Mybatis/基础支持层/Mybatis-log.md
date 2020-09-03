# mybatis 日志源码

- Author: [HuiFer](https://github.com/huifer)
- Description: 该文介绍 mybatis 日志相关源码
- 源码阅读工程: [SourceHot-Mybatis](https://github.com/SourceHot/mybatis-read.git)

## 核心类

- `org.apache.ibatis.logging.Log`
- `org.apache.ibatis.logging.LogFactory`
- 多个日志实现
  - `org.apache.ibatis.logging.log4j2.Log4j2Impl`
  - `org.apache.ibatis.logging.slf4j.Slf4jLocationAwareLoggerImpl`
  - ...

## 源码流程

- mybatis 提供了一个日志接口,内容如下.

```java
/**
 * mybatis 的日志接口,提供日志级别
 * <ol>
 *     <li>error</li>
 *     <li>debug</li>
 *     <li>trace</li>
 *     <li>warn</li>
 * </ol>
 * <p>通过自己定义的接口来实现各大日志框架的内容达到高可用</p>
 * @author Clinton Begin
 */
public interface Log {

    boolean isDebugEnabled();

    boolean isTraceEnabled();

    void error(String s, Throwable e);

    void error(String s);

    void debug(String s);

    void trace(String s);

    void warn(String s);
}
```

- 有了日志接口必然有实现类, mybatis 有`log4j2` 、 `slf4j` 等日志的相关实现 , 下面是`Slf4jImpl`的代码,其他代码也是一样的模式进行初始化就不再重复贴代码了.

```java
public class Slf4jImpl implements Log {

    private Log log;

    /**
     * 创建日志实例
     * @param clazz
     */
    public Slf4jImpl(String clazz) {
        Logger logger = LoggerFactory.getLogger(clazz);

        if (logger instanceof LocationAwareLogger) {
            try {
                // check for slf4j >= 1.6 method signature
                logger.getClass().getMethod("log", Marker.class, String.class, int.class, String.class, Object[].class, Throwable.class);
                log = new Slf4jLocationAwareLoggerImpl((LocationAwareLogger) logger);
                return;
            } catch (SecurityException | NoSuchMethodException e) {
                // fail-back to Slf4jLoggerImpl
            }
        }

        // Logger is not LocationAwareLogger or slf4j version < 1.6
        log = new Slf4jLoggerImpl(logger);
    }

    @Override
    public boolean isDebugEnabled() {
        return log.isDebugEnabled();
    }

    @Override
    public boolean isTraceEnabled() {
        return log.isTraceEnabled();
    }

    @Override
    public void error(String s, Throwable e) {
        log.error(s, e);
    }

    @Override
    public void error(String s) {
        log.error(s);
    }

    @Override
    public void debug(String s) {
        log.debug(s);
    }

    @Override
    public void trace(String s) {
        log.trace(s);
    }

    @Override
    public void warn(String s) {
        log.warn(s);
    }

}

```

- 通过上述方法来达到统一接口多个实现,这个在开发中也经常使用.多日志的实现方法有了还缺一个创建方法,创建方法由`org.apache.ibatis.logging.LogFactory`提供

```java

/**
 * <p>日志工厂，实现内容:</p>
 * <ol>
 *     <li>org.slf4j.Logger 日志框架 slf4j</li>
 *     <li>org.apache.commons.logging.Log 日志框架 apache</li>
 *     <li>org.apache.logging.log4j.Logger 日志框架 log4j2</li>
 *     <li>org.apache.log4j.Logger 日志框架 log4j </li>
 *     <li>java.util.logging.Logger 日志框架,JDK的logger</li>
 *
 * </ol>
 * @author Clinton Begin
 * @author Eduardo Macarron
 */
public final class LogFactory {

    /**
     * Marker to be used by logging implementations that support markers.
     */
    public static final String MARKER = "MYBATIS";

    private static Constructor<? extends Log> logConstructor;

    /**
     * 日志的实现类的具体选择
     */
    static {
        // slf4j 日志
        tryImplementation(LogFactory::useSlf4jLogging);
        // apache 日志
        tryImplementation(LogFactory::useCommonsLogging);
        // log4j2 日志
        tryImplementation(LogFactory::useLog4J2Logging);
        // log4 日志
        tryImplementation(LogFactory::useLog4JLogging);
        // JDK 日志
        tryImplementation(LogFactory::useJdkLogging);
        // 空 日志
        tryImplementation(LogFactory::useNoLogging);
    }

    /**
     * 私有化构造方法,这是一个单例
     */
    private LogFactory() {
        // disable construction
    }

    public static Log getLog(Class<?> aClass) {
        return getLog(aClass.getName());
    }

    public static Log getLog(String logger) {
        try {
            return logConstructor.newInstance(logger);
        } catch (Throwable t) {
            throw new LogException("Error creating logger for logger " + logger + ".  Cause: " + t, t);
        }
    }

    public static synchronized void useCustomLogging(Class<? extends Log> clazz) {
        setImplementation(clazz);
    }

    public static synchronized void useSlf4jLogging() {
        setImplementation(org.apache.ibatis.logging.slf4j.Slf4jImpl.class);
    }

    public static synchronized void useCommonsLogging() {
        setImplementation(org.apache.ibatis.logging.commons.JakartaCommonsLoggingImpl.class);
    }

    public static synchronized void useLog4JLogging() {
        setImplementation(org.apache.ibatis.logging.log4j.Log4jImpl.class);
    }

    public static synchronized void useLog4J2Logging() {
        setImplementation(org.apache.ibatis.logging.log4j2.Log4j2Impl.class);
    }

    public static synchronized void useJdkLogging() {
        setImplementation(org.apache.ibatis.logging.jdk14.Jdk14LoggingImpl.class);
    }

    public static synchronized void useStdOutLogging() {
        setImplementation(org.apache.ibatis.logging.stdout.StdOutImpl.class);
    }

    public static synchronized void useNoLogging() {
        setImplementation(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
    }

    /**
     * 选择具体的日志实现
     */
    private static void tryImplementation(Runnable runnable) {
        if (logConstructor == null) {
            try {
                // run()? 似乎违背了代码的语义, 看静态方法.静态方法多行同类型的操作我认为是一个多线程
                runnable.run();
            } catch (Throwable t) {
                // ignore
            }
        }
    }

    /**
     * 选择具体的日志实现
     */
    private static void setImplementation(Class<? extends Log> implClass) {
        try {
            Constructor<? extends Log> candidate = implClass.getConstructor(String.class);
            Log log = candidate.newInstance(LogFactory.class.getName());
            if (log.isDebugEnabled()) {
                log.debug("Logging initialized using '" + implClass + "' adapter.");
            }
            logConstructor = candidate;
        } catch (Throwable t) {
            throw new LogException("Error setting Log implementation.  Cause: " + t, t);
        }
    }

}

```

- `LogFactory`是一个单例对象,对外公开`getLog`方法在使用时直接`private static final Log log = LogFactory.getLog(CglibProxyFactory.class);`即可

- 在 `org.apache.ibatis.session.Configuration` 中可以看到下面这些注册方法

```java
        // 日志实现类
        typeAliasRegistry.registerAlias("SLF4J", Slf4jImpl.class);
        typeAliasRegistry.registerAlias("COMMONS_LOGGING", JakartaCommonsLoggingImpl.class);
        typeAliasRegistry.registerAlias("LOG4J", Log4jImpl.class);
        typeAliasRegistry.registerAlias("LOG4J2", Log4j2Impl.class);
        typeAliasRegistry.registerAlias("JDK_LOGGING", Jdk14LoggingImpl.class);
        typeAliasRegistry.registerAlias("STDOUT_LOGGING", StdOutImpl.class);
        typeAliasRegistry.registerAlias("NO_LOGGING", NoLoggingImpl.class);

```
