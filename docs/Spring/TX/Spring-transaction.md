# Spring 事务

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-Spring](https://github.com/SourceHot/spring-framework-read)

## 声明式事务

### Propagation

- 事务传播

```java
public enum Propagation {

   /**
    * 有事务则加入，没有则新建
    */
   REQUIRED(TransactionDefinition.PROPAGATION_REQUIRED),

   /**
    * 有事务就用，如果没有就不开启(继承关系)
    * @see org.springframework.transaction.support.AbstractPlatformTransactionManager#setTransactionSynchronization
    */
   SUPPORTS(TransactionDefinition.PROPAGATION_SUPPORTS),

   /**
    *  必须在已有事务中
    */
   MANDATORY(TransactionDefinition.PROPAGATION_MANDATORY),

   /**
    * 不管是否已有事务，都要开启新事务，老事务挂起
    * @see org.springframework.transaction.jta.JtaTransactionManager#setTransactionManager
    */
   REQUIRES_NEW(TransactionDefinition.PROPAGATION_REQUIRES_NEW),

   /**
    * 不开启事务
    * @see org.springframework.transaction.jta.JtaTransactionManager#setTransactionManager
    */
   NOT_SUPPORTED(TransactionDefinition.PROPAGATION_NOT_SUPPORTED),

   /**
    * 必须在没有事务的方法中调用，否则抛出异常
    */
   NEVER(TransactionDefinition.PROPAGATION_NEVER),

   /**
    * 果已有事务，则嵌套执行，如果没有，就新建(和REQUIRED类似，和REQUIRES_NEW容易混淆)
    * @see org.springframework.jdbc.datasource.DataSourceTransactionManager
    */
   NESTED(TransactionDefinition.PROPAGATION_NESTED);


   private final int value;


   Propagation(int value) {
      this.value = value;
   }

   public int value() {
      return this.value;
   }

}
```

### Isolation

- 事务级别

```java
public enum Isolation {

   /**
    * @see java.sql.Connection
    */
   DEFAULT(TransactionDefinition.ISOLATION_DEFAULT),

   /**
    * 读未提交
    *
    * @see java.sql.Connection#TRANSACTION_READ_UNCOMMITTED
    */
   READ_UNCOMMITTED(TransactionDefinition.ISOLATION_READ_UNCOMMITTED),

   /**
    * 读已提交
    *
    * @see java.sql.Connection#TRANSACTION_READ_COMMITTED
    */
   READ_COMMITTED(TransactionDefinition.ISOLATION_READ_COMMITTED),

   /**
    * 可重复读
    *
    * @see java.sql.Connection#TRANSACTION_REPEATABLE_READ
    */
   REPEATABLE_READ(TransactionDefinition.ISOLATION_REPEATABLE_READ),

   /**
    * 可串行化
    *
    * @see java.sql.Connection#TRANSACTION_SERIALIZABLE
    */
   SERIALIZABLE(TransactionDefinition.ISOLATION_SERIALIZABLE);


   private final int value;


   Isolation(int value) {
      this.value = value;
   }

   public int value() {
      return this.value;
   }

}
```

### EnableTransactionManagement

- 下面代码是一个注解方式的事务配置使用 `EnableTransactionManagement`来开启事务支持

```java
@ComponentScan(basePackages = "org.source.hot.spring.overview.ioc.tx.declarative")
@EnableTransactionManagement
public class TxConfig {

	@Bean // 数据源
	public DataSource dataSource() {
		DruidDataSource dataSource = new DruidDataSource();
		dataSource.setUsername("");
		dataSource.setPassword("");
		dataSource.setUrl("");
		dataSource.setDriverClassName(com.mysql.jdbc.Driver.class.getName());
		return dataSource;
	}

	@Bean
	public JdbcTemplate jdbcTemplate(DataSource dataSource) {
		return new JdbcTemplate(dataSource);
	}

	@Bean //事务管理器
	public PlatformTransactionManager platformTransactionManager(DataSource dataSource) {
		return new DataSourceTransactionManager(dataSource);
	}

}
```

- 注解源码如下,关注于`@Import(TransactionManagementConfigurationSelector.class)`

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Import(TransactionManagementConfigurationSelector.class)
public @interface EnableTransactionManagement {

   boolean proxyTargetClass() default false;

   AdviceMode mode() default AdviceMode.PROXY;

   int order() default Ordered.LOWEST_PRECEDENCE;

}
```

```java
public class TransactionManagementConfigurationSelector extends AdviceModeImportSelector<EnableTransactionManagement> {

   @Override
   protected String[] selectImports(AdviceMode adviceMode) {
      // 根据切面类型进行初始化
      switch (adviceMode) {
         case PROXY:
              // 默认值
            return new String[] {AutoProxyRegistrar.class.getName(),
                  ProxyTransactionManagementConfiguration.class.getName()};
         case ASPECTJ:
            return new String[] {determineTransactionAspectClass()};
         default:
            return null;
      }
   }

   private String determineTransactionAspectClass() {
      return (ClassUtils.isPresent("javax.transaction.Transactional", getClass().getClassLoader()) ?
            TransactionManagementConfigUtils.JTA_TRANSACTION_ASPECT_CONFIGURATION_CLASS_NAME :
            TransactionManagementConfigUtils.TRANSACTION_ASPECT_CONFIGURATION_CLASS_NAME);
   }

}
```

### ProxyTransactionManagementConfiguration

```java
@Configuration(proxyBeanMethods = false)
public class ProxyTransactionManagementConfiguration extends AbstractTransactionManagementConfiguration {


   /**
    * 事务切面
    * @param transactionAttributeSource
    * @param transactionInterceptor
    * @return
    */
   @Bean(name = TransactionManagementConfigUtils.TRANSACTION_ADVISOR_BEAN_NAME)
   @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
   public BeanFactoryTransactionAttributeSourceAdvisor transactionAdvisor(
         TransactionAttributeSource transactionAttributeSource,
         TransactionInterceptor transactionInterceptor) {
      // 事务切面
      BeanFactoryTransactionAttributeSourceAdvisor advisor = new BeanFactoryTransactionAttributeSourceAdvisor();
      // 事务属性
      advisor.setTransactionAttributeSource(transactionAttributeSource);
      advisor.setAdvice(transactionInterceptor);
      if (this.enableTx != null) {
         // 执行顺序
         advisor.setOrder(this.enableTx.<Integer>getNumber("order"));
      }
      return advisor;
   }

   @Bean
   @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
   public TransactionAttributeSource transactionAttributeSource() {
      return new AnnotationTransactionAttributeSource();
   }

   /***
    * 事务拦截器
    * @param transactionAttributeSource
    * @return
    */
   @Bean
   @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
   public TransactionInterceptor transactionInterceptor(
         TransactionAttributeSource transactionAttributeSource) {
      TransactionInterceptor interceptor = new TransactionInterceptor();
      interceptor.setTransactionAttributeSource(transactionAttributeSource);
      if (this.txManager != null) {
         // 事务管理器注入
         interceptor.setTransactionManager(this.txManager);
      }
      return interceptor;
   }

}
```

### TransactionInterceptor

![image-20200729144622440](/images/spring/image-20200729144622440.png)

- 实现了`org.aopalliance.intercept.MethodInterceptor`接口的方法

```java
@Override
@Nullable
public Object invoke(MethodInvocation invocation) throws Throwable {
   // Work out the target class: may be {@code null}.
   // The TransactionAttributeSource should be passed the target class
   // as well as the method, which may be from an interface.
   Class<?> targetClass = (invocation.getThis() != null ? AopUtils.getTargetClass(invocation.getThis()) : null);

   // Adapt to TransactionAspectSupport's invokeWithinTransaction...
   return invokeWithinTransaction(invocation.getMethod(), targetClass, invocation::proceed);
}
```

- 这段代码会在具有`Transactional` 的注解方法上生效

```java
@Service
public class IssueServiceImpl {

   @Autowired
   private JdbcTemplate jdbcTemplate;

   @Transactional()
   public boolean insertIssue() throws Exception {
      jdbcTemplate.execute("INSERT INTO `scrum`.`issue`() VALUES ()");

      throw new Exception("a");
   }

}


public class DeclarativeTransactionTest {

	public static void main(String[] args) throws Exception {

		AnnotationConfigApplicationContext applicationContext = new AnnotationConfigApplicationContext(
				TxConfig.class);
		IssueServiceImpl bean = applicationContext.getBean(IssueServiceImpl.class);
		bean.insertIssue();
		System.out.println();
		applicationContext.close();
	}


}
```

![image-20200729145518089](/images/spring/image-20200729145518089.png)

断点开始进行查阅. 再断点后执行一步会直接进入 cglib 代理对象

`org.springframework.aop.framework.CglibAopProxy.DynamicAdvisedInterceptor#intercept` 具体不展开，继续往下执行

![image-20200729145637688](/images/spring/image-20200729145637688.png)

走到`invoke`方法了

入参对象查看

![image-20200729145835608](/images/spring/image-20200729145835608.png)

- 获取事务属性

  ```java
  @Override
  @Nullable
  public TransactionAttribute getTransactionAttribute(Method method,
        @Nullable Class<?> targetClass) {
     if (method.getDeclaringClass() == Object.class) {
        return null;
     }

     // First, see if we have a cached value.
     // 尝试缓存中获取
     Object cacheKey = getCacheKey(method, targetClass);
     TransactionAttribute cached = this.attributeCache.get(cacheKey);
     if (cached != null) {
        // Value will either be canonical value indicating there is no transaction attribute,
        // or an actual transaction attribute.
        if (cached == NULL_TRANSACTION_ATTRIBUTE) {
           return null;
        } else {
           return cached;
        }
     } else {
        // We need to work it out.
        // 自行构建一个事务属性
        TransactionAttribute txAttr = computeTransactionAttribute(method, targetClass);
        // Put it in the cache.
        if (txAttr == null) {
           this.attributeCache.put(cacheKey, NULL_TRANSACTION_ATTRIBUTE);
        } else {
           String methodIdentification = ClassUtils
                 .getQualifiedMethodName(method, targetClass);
           if (txAttr instanceof DefaultTransactionAttribute) {
              ((DefaultTransactionAttribute) txAttr).setDescriptor(methodIdentification);
           }
           if (logger.isTraceEnabled()) {
              logger.trace("Adding transactional method '" + methodIdentification
                    + "' with attribute: " + txAttr);
           }
           this.attributeCache.put(cacheKey, txAttr);
        }
        return txAttr;
     }
  }


  	protected Object getCacheKey(Method method, @Nullable Class<?> targetClass) {
  		return new MethodClassKey(method, targetClass);
  	}

  ```

![image-20200729162023837](/images/spring/image-20200729162023837.png)

- 此处方法已经获取到了这个方法就是后面的一个切面

- 确定事务管理器

  ```java
  @Nullable
  protected TransactionManager determineTransactionManager(
        @Nullable TransactionAttribute txAttr) {
     // Do not attempt to lookup tx manager if no tx attributes are set
     // 空判断返回一个事务管理器
     if (txAttr == null || this.beanFactory == null) {
        return getTransactionManager();
     }

     // 属性是否有别名
     String qualifier = txAttr.getQualifier();
     // 如果有
     if (StringUtils.hasText(qualifier)) {
        // 从 ioc 容器中根据类型和名称获取事务管理器
        return determineQualifiedTransactionManager(this.beanFactory, qualifier);
     } else if (StringUtils.hasText(this.transactionManagerBeanName)) {
        // 从 ioc 容器中根据类型和名称获取事务管理器
        return determineQualifiedTransactionManager(this.beanFactory,
              this.transactionManagerBeanName);
     } else {
        // 通过get方法获取
        TransactionManager defaultTransactionManager = getTransactionManager();
        // 如果没有
        if (defaultTransactionManager == null) {
           // 尝试从缓存中获取
           defaultTransactionManager = this.transactionManagerCache
                 .get(DEFAULT_TRANSACTION_MANAGER_KEY);
           // 缓存里面没有从 ioc 容器中获取并且设置缓存
           if (defaultTransactionManager == null) {
              defaultTransactionManager = this.beanFactory.getBean(TransactionManager.class);
              this.transactionManagerCache.putIfAbsent(
                    DEFAULT_TRANSACTION_MANAGER_KEY, defaultTransactionManager);
           }
        }
        return defaultTransactionManager;
     }
  }
  ```

![image-20200729160650401](/images/spring/image-20200729160650401.png)

- 类型转换

  ```java
  @Nullable
  private PlatformTransactionManager asPlatformTransactionManager(
        @Nullable Object transactionManager) {
     if (transactionManager == null
           || transactionManager instanceof PlatformTransactionManager) {
        return (PlatformTransactionManager) transactionManager;
     } else {
        throw new IllegalStateException(
              "Specified transaction manager is not a PlatformTransactionManager: "
                    + transactionManager);
     }
  }
  ```

- 获取方法切面

  ```java
  private String methodIdentification(Method method, @Nullable Class<?> targetClass,
        @Nullable TransactionAttribute txAttr) {

     String methodIdentification = methodIdentification(method, targetClass);
     if (methodIdentification == null) {
        if (txAttr instanceof DefaultTransactionAttribute) {
           // 直接就获取了.方法签名.
           methodIdentification = ((DefaultTransactionAttribute) txAttr).getDescriptor();
        }
        if (methodIdentification == null) {
           methodIdentification = ClassUtils.getQualifiedMethodName(method, targetClass);
        }
     }
     return methodIdentification;
  }
  ```

![image-20200729161647214](/images/spring/image-20200729161647214.png)

- 创建一个新的事务根据事务传播性

  ```java
  	@SuppressWarnings("serial")
  	protected TransactionInfo createTransactionIfNecessary(@Nullable PlatformTransactionManager tm,
  			@Nullable TransactionAttribute txAttr, final String joinpointIdentification) {

  		// If no name specified, apply method identification as transaction name.
  		// 把切面的地址放进去
  		if (txAttr != null && txAttr.getName() == null) {
  			txAttr = new DelegatingTransactionAttribute(txAttr) {
  				@Override
  				public String getName() {
  					return joinpointIdentification;
  				}
  			};
  		}

  		TransactionStatus status = null;
  		if (txAttr != null) {
  			if (tm != null) {
  				// 事务状态
  				// 获取事务
  				status = tm.getTransaction(txAttr);
  			} else {
  				if (logger.isDebugEnabled()) {
  					logger.debug("Skipping transactional joinpoint [" + joinpointIdentification +
  							"] because no transaction manager has been configured");
  				}
  			}
  		}
  		// 处理出一个 TransactionInfo
  		return prepareTransactionInfo(tm, txAttr, joinpointIdentification, status);
  	}

  ```

![image-20200729163303000](/images/spring/image-20200729163303000.png)

- `tm.getTransaction`

  ```java
  @Override
  public final TransactionStatus getTransaction(@Nullable TransactionDefinition definition)
        throws TransactionException {

     // Use defaults if no transaction definition given.
     // 获取事务的定义
     TransactionDefinition def = (definition != null ? definition
           : TransactionDefinition.withDefaults());

     // 获取事务
     Object transaction = doGetTransaction();
     boolean debugEnabled = logger.isDebugEnabled();

     // 是否存在事务
     if (isExistingTransaction(transaction)) {
        // Existing transaction found -> check propagation behavior to find out how to behave.
        // 存在事务后处理什么操作
        return handleExistingTransaction(def, transaction, debugEnabled);
     }

     // Check definition settings for new transaction.
     // 超时的校验. 小于默认值抛出异常
     if (def.getTimeout() < TransactionDefinition.TIMEOUT_DEFAULT) {
        throw new InvalidTimeoutException("Invalid transaction timeout", def.getTimeout());
     }

     // No existing transaction found -> check propagation behavior to find out how to proceed.
     // 没有事务抛出异常
     if (def.getPropagationBehavior() == TransactionDefinition.PROPAGATION_MANDATORY) {
        throw new IllegalTransactionStateException(
              "No existing transaction found for transaction marked with propagation 'mandatory'");
     } else if (def.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRED ||
           def.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRES_NEW ||
           def.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NESTED) {
        SuspendedResourcesHolder suspendedResources = suspend(null);
        if (debugEnabled) {
           logger.debug("Creating new transaction with name [" + def.getName() + "]: " + def);
        }
        try {
           boolean newSynchronization = (getTransactionSynchronization()
                 != SYNCHRONIZATION_NEVER);
           DefaultTransactionStatus status = newTransactionStatus(
                 def, transaction, true, newSynchronization, debugEnabled,
                 suspendedResources);
           doBegin(transaction, def);
           prepareSynchronization(status, def);
           return status;
        } catch (RuntimeException | Error ex) {
           resume(null, suspendedResources);
           throw ex;
        }
     } else {
        // Create "empty" transaction: no actual transaction, but potentially synchronization.
        if (def.getIsolationLevel() != TransactionDefinition.ISOLATION_DEFAULT && logger
              .isWarnEnabled()) {
           logger.warn(
                 "Custom isolation level specified but no actual transaction initiated; " +
                       "isolation level will effectively be ignored: " + def);
        }
        boolean newSynchronization = (getTransactionSynchronization()
              == SYNCHRONIZATION_ALWAYS);
        return prepareTransactionStatus(def, null, true, newSynchronization, debugEnabled,
              null);
     }
  }
  ```

  - `org.springframework.transaction.support.AbstractPlatformTransactionManager#getTransaction`

  - `org.springframework.jdbc.datasource.DataSourceTransactionManager#doGetTransaction`

    ```java
    @Override
    protected Object doGetTransaction() {
       DataSourceTransactionObject txObject = new DataSourceTransactionObject();
       txObject.setSavepointAllowed(isNestedTransactionAllowed());
       // 数据库链接对象
       // 从事务管理器中获取数据库链接对象
       ConnectionHolder conHolder =
             (ConnectionHolder) TransactionSynchronizationManager
                   .getResource(obtainDataSource());
       txObject.setConnectionHolder(conHolder, false);
       return txObject;
    }
    ```

  - `org.springframework.transaction.support.AbstractPlatformTransactionManager#suspend`

    ```java
    @Nullable
    protected final SuspendedResourcesHolder suspend(@Nullable Object transaction)
          throws TransactionException {
       if (TransactionSynchronizationManager.isSynchronizationActive()) {
          List<TransactionSynchronization> suspendedSynchronizations = doSuspendSynchronization();
          try {
             Object suspendedResources = null;
             if (transaction != null) {
                suspendedResources = doSuspend(transaction);
             }
             // 线程名称
             String name = TransactionSynchronizationManager.getCurrentTransactionName();
             // 同步方法中设置
             TransactionSynchronizationManager.setCurrentTransactionName(null);
             // 只读设置
             boolean readOnly = TransactionSynchronizationManager.isCurrentTransactionReadOnly();
             // 同步方法中设置
             TransactionSynchronizationManager.setCurrentTransactionReadOnly(false);
             // 隔离级别
             Integer isolationLevel = TransactionSynchronizationManager
                   .getCurrentTransactionIsolationLevel();
             // 同步方法中设置
             TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(null);
             // 是否活跃
             boolean wasActive = TransactionSynchronizationManager.isActualTransactionActive();
             TransactionSynchronizationManager.setActualTransactionActive(false);
             return new SuspendedResourcesHolder(
                   suspendedResources, suspendedSynchronizations, name, readOnly,
                   isolationLevel, wasActive);
          } catch (RuntimeException | Error ex) {
             // doSuspend failed - original transaction is still active...
             doResumeSynchronization(suspendedSynchronizations);
             throw ex;
          }
       } else if (transaction != null) {
          // Transaction active but no synchronization active.
          Object suspendedResources = doSuspend(transaction);
          return new SuspendedResourcesHolder(suspendedResources);
       } else {
          // Neither transaction nor synchronization active.
          return null;
       }
    }
    ```

- `prepareTransactionInfo`简单的`new`对象并且绑定线程

  ```java
  protected TransactionInfo prepareTransactionInfo(@Nullable PlatformTransactionManager tm,
        @Nullable TransactionAttribute txAttr, String joinpointIdentification,
        @Nullable TransactionStatus status) {

     // 初始化
     TransactionInfo txInfo = new TransactionInfo(tm, txAttr, joinpointIdentification);
     if (txAttr != null) {
        // We need a transaction for this method...
        if (logger.isTraceEnabled()) {
           logger.trace(
                 "Getting transaction for [" + txInfo.getJoinpointIdentification() + "]");
        }
        // The transaction manager will flag an error if an incompatible tx already exists.
        txInfo.newTransactionStatus(status);
     } else {
        // The TransactionInfo.hasTransaction() method will return false. We created it only
        // to preserve the integrity of the ThreadLocal stack maintained in this class.
        if (logger.isTraceEnabled()) {
           logger.trace("No need to create transaction for [" + joinpointIdentification +
                 "]: This method is not transactional.");
        }
     }

     // We always bind the TransactionInfo to the thread, even if we didn't create
     // a new transaction here. This guarantees that the TransactionInfo stack
     // will be managed correctly even if no transaction was created by this aspect.
     // 和线程绑定
     txInfo.bindToThread();
     return txInfo;
  }
  ```

- `retVal = invocation.proceedWithInvocation();`

  - 这里走的是 CGLIB 的方法直接会执行结果将结果返回具体方法在

    `org.springframework.aop.framework.CglibAopProxy.CglibMethodInvocation#proceed`

  ```java
  		@Override
  		@Nullable
  		public Object proceed() throws Throwable {
  			try {
  				return super.proceed();
  			}
  			catch (RuntimeException ex) {
  				throw ex;
  			}
  			catch (Exception ex) {
  				if (ReflectionUtils.declaresException(getMethod(), ex.getClass())) {
  					throw ex;
  				}
  				else {
  					throw new UndeclaredThrowableException(ex);
  				}
  			}
  		}

  ```

- 如果没有异常就直接处理完成返回了

- 我们现在是有异常的

  ```java
  try {
     // This is an around advice: Invoke the next interceptor in the chain.
     // This will normally result in a target object being invoked.
     // 回调方法
     retVal = invocation.proceedWithInvocation();
  } catch (Throwable ex) {
     // target invocation exception
     // 回滚异常
     completeTransactionAfterThrowing(txInfo, ex);
     throw ex;
  } finally {
     // 消息清理
     cleanupTransactionInfo(txInfo);
  }
  ```

- `completeTransactionAfterThrowing`回滚异常的处理方法

  ```java
  protected void completeTransactionAfterThrowing(@Nullable TransactionInfo txInfo,
        Throwable ex) {
     if (txInfo != null && txInfo.getTransactionStatus() != null) {
        if (logger.isTraceEnabled()) {
           logger.trace("Completing transaction for [" + txInfo.getJoinpointIdentification() +
                 "] after exception: " + ex);
        }
        if (txInfo.transactionAttribute != null && txInfo.transactionAttribute.rollbackOn(ex)) {
           try {
              // 做回滚
              txInfo.getTransactionManager().rollback(txInfo.getTransactionStatus());
           } catch (TransactionSystemException ex2) {
              logger.error("Application exception overridden by rollback exception", ex);
              ex2.initApplicationException(ex);
              throw ex2;
           } catch (RuntimeException | Error ex2) {
              logger.error("Application exception overridden by rollback exception", ex);
              throw ex2;
           }
        } else {
           // We don't roll back on this exception.
           // Will still roll back if TransactionStatus.isRollbackOnly() is true.
           try {
              // org.springframework.transaction.support.AbstractPlatformTransactionManager.commit 的方法
              txInfo.getTransactionManager().commit(txInfo.getTransactionStatus());
           } catch (TransactionSystemException ex2) {
              logger.error("Application exception overridden by commit exception", ex);
              ex2.initApplicationException(ex);
              throw ex2;
           } catch (RuntimeException | Error ex2) {
              logger.error("Application exception overridden by commit exception", ex);
              throw ex2;
           }
        }
     }
  }
  ```

  - 整理一下这里的流程

    1. 有异常走回滚

       `txInfo.getTransactionManager().rollback(txInfo.getTransactionStatus())`

    2. 没有异常直接提交

       `txInfo.getTransactionManager().commit(txInfo.getTransactionStatus())`

  - **注意: 这里的异常如果是 exception 不会走回滚**

- 判断是否需要回滚

  ```
  txInfo.transactionAttribute.rollbackOn
  ```

  - 链路

    - `org.springframework.transaction.interceptor.DelegatingTransactionAttribute#rollbackOn`

      - `org.springframework.transaction.interceptor.RuleBasedTransactionAttribute#rollbackOn`

        ```java
        @Override
        public boolean rollbackOn(Throwable ex) {
           if (logger.isTraceEnabled()) {
              logger.trace(
                    "Applying rules to determine whether transaction should rollback on " + ex);
           }

           RollbackRuleAttribute winner = null;
           int deepest = Integer.MAX_VALUE;

           if (this.rollbackRules != null) {
              for (RollbackRuleAttribute rule : this.rollbackRules) {
                 int depth = rule.getDepth(ex);
                 if (depth >= 0 && depth < deepest) {
                    deepest = depth;
                    winner = rule;
                 }
              }
           }

           if (logger.isTraceEnabled()) {
              logger.trace("Winning rollback rule is: " + winner);
           }

           // User superclass behavior (rollback on unchecked) if no rule matches.
           if (winner == null) {
              logger.trace("No relevant rollback rule found: applying default rules");
              return super.rollbackOn(ex);
           }

           return !(winner instanceof NoRollbackRuleAttribute);
        }
        ```

        - `org.springframework.transaction.interceptor.DefaultTransactionAttribute#rollbackOn`

          ```java
          @Override
          public boolean rollbackOn(Throwable ex) {
             return (ex instanceof RuntimeException || ex instanceof Error);
          }
          ```

          - 这就是我们的异常判断是否需要回滚

- `cleanupTransactionInfo`

  数据清理

  ```java
  protected void cleanupTransactionInfo(@Nullable TransactionInfo txInfo) {
     if (txInfo != null) {
        txInfo.restoreThreadLocalStatus();
     }
  }
  ```

  ```java
  private void restoreThreadLocalStatus() {
     // Use stack to restore old transaction TransactionInfo.
     // Will be null if none was set.
     transactionInfoHolder.set(this.oldTransactionInfo);
  }
  ```

## 编程式事务

### DefaultTransactionDefinition

- 默认的事务定义
  - 常见属性
    1. timeout
    2. readOnly
    3. ....

### PlatformTransactionManager

```java
// 获取事务
TransactionStatus getTransaction(@Nullable TransactionDefinition definition)throws TransactionException;
// 提交事务
void commit(TransactionStatus status) throws TransactionException;
// 回滚事务
void rollback(TransactionStatus status) throws TransactionException;
```

- 贴出一部分

![image-20200728105926218](/images/spring/image-20200728105926218.png)

- AbstractPlatformTransactionManager 定义了一些基础属性 以及一些需要子类实现的方法

```java
// 属性
defaultTimeout
nestedTransactionAllowed
validateExistingTransaction
globalRollbackOnParticipationFailure
failEarlyOnGlobalRollbackOnly
rollbackOnCommitFailure
// 方法
doGetTransaction
isExistingTransaction
useSavepointForNestedTransaction
doBegin
doSuspend
doResume
shouldCommitOnGlobalRollbackOnly
prepareForCommit
doCommit
doRollback
doSetRollbackOnly
registerAfterCompletionWithExistingTransaction
doCleanupAfterCompletion

```

### DataSourceTransactionManager

- xml 配置如下

```xml
	<bean id="dataSource" class="com.alibaba.druid.pool.DruidDataSource">
		<property name="url"
				value=""/>
		<property name="username" value=""/>
		<property name="password" value=""/>
		<property name="driverClassName" value="com.mysql.jdbc.Driver"/>
	</bean>
	<bean id="jdbcTemplate" class="org.springframework.jdbc.core.JdbcTemplate">
		<property name="dataSource" ref="dataSource"/>
	</bean>
	<bean id="transactionManager"
			class="org.springframework.jdbc.datasource.DataSourceTransactionManager">
		<property name="dataSource" ref="dataSource"/>
	</bean>
```

- 两个属性，通常我们会配置 datasource

  ```java
  	@Nullable
  	private DataSource dataSource;

  	private boolean enforceReadOnly = false;
  ```

  - bean 的属性注入就不具体描述了

![image-20200728133037075](/images/spring/image-20200728133037075.png)

- `InitializingBean`

  - ```java
    @Override
    public void afterPropertiesSet() {
       if (getDataSource() == null) {
          throw new IllegalArgumentException("Property 'dataSource' is required");
       }
    }
    ```

    - 如果`dataSource`为空会抛出异常
    - 默认单例会注册到 ioc 容器中.后续注册流程不具体描述

- 方法注释

```java
	/**
	 * 获取datasource
	 */
	protected DataSource obtainDataSource() {
		DataSource dataSource = getDataSource();
		Assert.state(dataSource != null, "No DataSource set");
		return dataSource;
	}

	/**
	 * 创建事务
	 *
	 * @return 事务对象
	 */
	@Override
	protected Object doGetTransaction() {
		DataSourceTransactionObject txObject = new DataSourceTransactionObject();
		txObject.setSavepointAllowed(isNestedTransactionAllowed());
		// 数据库链接对象
		// 从事务管理器中获取数据库链接对象
		ConnectionHolder conHolder =
				(ConnectionHolder) TransactionSynchronizationManager
						.getResource(obtainDataSource());
		txObject.setConnectionHolder(conHolder, false);
		return txObject;
	}

	/**
	 * 是否存在事务
	 *
	 * @param transaction transaction object returned by doGetTransaction
	 * @return
	 */
	@Override
	protected boolean isExistingTransaction(Object transaction) {
		DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;
		return (txObject.hasConnectionHolder() && txObject.getConnectionHolder()
				.isTransactionActive());
	}


	/**
	 * This implementation sets the isolation level but ignores the timeout. 事务的开始方法
	 */
	@Override
	protected void doBegin(Object transaction, TransactionDefinition definition) {
		// 拿出事务
		DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;
		// 链接对象
		Connection con = null;

		try {
			if (!txObject.hasConnectionHolder() ||
					txObject.getConnectionHolder().isSynchronizedWithTransaction()) {
				// 数据库链接对象
				Connection newCon = obtainDataSource().getConnection();
				if (logger.isDebugEnabled()) {
					logger.debug("Acquired Connection [" + newCon + "] for JDBC transaction");
				}
				// 设置数据库连接
				txObject.setConnectionHolder(new ConnectionHolder(newCon), true);
			}
			// 拿出链接对象并且设置同步事务
			txObject.getConnectionHolder().setSynchronizedWithTransaction(true);
			// 链接对象赋值
			con = txObject.getConnectionHolder().getConnection();

			// 获取事务级别
			Integer previousIsolationLevel = DataSourceUtils
					.prepareConnectionForTransaction(con, definition);
			// 设置事务隔离级别
			txObject.setPreviousIsolationLevel(previousIsolationLevel);
			// 设置只读
			txObject.setReadOnly(definition.isReadOnly());

			// Switch to manual commit if necessary. This is very expensive in some JDBC drivers,
			// so we don't want to do it unnecessarily (for example if we've explicitly
			// configured the connection pool to set it already).
			// 判断是否自动提交
			if (con.getAutoCommit()) {
				txObject.setMustRestoreAutoCommit(true);
				if (logger.isDebugEnabled()) {
					logger.debug("Switching JDBC Connection [" + con + "] to manual commit");
				}
				con.setAutoCommit(false);
			}

			// 事务链接准备
			prepareTransactionalConnection(con, definition);
			// 事务激活
			txObject.getConnectionHolder().setTransactionActive(true);

			// 超时时间获取
			int timeout = determineTimeout(definition);
			// 默认超时时间设置
			if (timeout != TransactionDefinition.TIMEOUT_DEFAULT) {
				txObject.getConnectionHolder().setTimeoutInSeconds(timeout);
			}

			// Bind the connection holder to the thread.
			// 将链接和当前线程绑定
			if (txObject.isNewConnectionHolder()) {
				// k: datasource v: connectionHolder
				TransactionSynchronizationManager
						.bindResource(obtainDataSource(), txObject.getConnectionHolder());
			}
		} catch (Throwable ex) {
			if (txObject.isNewConnectionHolder()) {
				// 释放链接
				DataSourceUtils.releaseConnection(con, obtainDataSource());
				txObject.setConnectionHolder(null, false);
			}
			throw new CannotCreateTransactionException(
					"Could not open JDBC Connection for transaction", ex);
		}
	}


	/**
	 * 挂起事务
	 *
	 * @param transaction transaction object returned by {@code doGetTransaction}
	 * @return 移除的链接
	 */
	@Override
	protected Object doSuspend(Object transaction) {
		// 获取事务对象
		DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;
		// 连接置空
		txObject.setConnectionHolder(null);
		// 解除资源绑定
		return TransactionSynchronizationManager.unbindResource(obtainDataSource());
	}


	/**
	 * 恢复事务
	 *
	 * @param transaction        transaction object returned by {@code doGetTransaction}
	 * @param suspendedResources the object that holds suspended resources, as returned by
	 *                           doSuspend
	 */
	@Override
	protected void doResume(@Nullable Object transaction, Object suspendedResources) {
		// 资源绑定
		TransactionSynchronizationManager.bindResource(obtainDataSource(), suspendedResources);
	}


	/**
	 * 做提交
	 *
	 * @param status the status representation of the transaction
	 */
	@Override
	protected void doCommit(DefaultTransactionStatus status) {
		// 事务对象
		DataSourceTransactionObject txObject = (DataSourceTransactionObject) status
				.getTransaction();
		// 获取链接
		Connection con = txObject.getConnectionHolder().getConnection();
		if (status.isDebug()) {
			logger.debug("Committing JDBC transaction on Connection [" + con + "]");
		}
		try {
			// 链接提交
			con.commit();
		} catch (SQLException ex) {
			throw new TransactionSystemException("Could not commit JDBC transaction", ex);
		}
	}


	/**
	 * 事务回滚
	 *
	 * @param status the status representation of the transaction
	 */
	@Override
	protected void doRollback(DefaultTransactionStatus status) {

		// 事务对象
		DataSourceTransactionObject txObject = (DataSourceTransactionObject) status
				.getTransaction();
		// 链接对象
		Connection con = txObject.getConnectionHolder().getConnection();
		if (status.isDebug()) {
			logger.debug("Rolling back JDBC transaction on Connection [" + con + "]");
		}
		try {
			// 回滚方法
			con.rollback();
		} catch (SQLException ex) {
			throw new TransactionSystemException("Could not roll back JDBC transaction", ex);
		}
	}


	/**
	 * 设置回滚
	 *
	 * @param status the status representation of the transaction
	 */
	@Override
	protected void doSetRollbackOnly(DefaultTransactionStatus status) {
		DataSourceTransactionObject txObject = (DataSourceTransactionObject) status
				.getTransaction();
		if (status.isDebug()) {
			logger.debug(
					"Setting JDBC transaction [" + txObject.getConnectionHolder().getConnection() +
							"] rollback-only");
		}
		txObject.setRollbackOnly();
	}


	/**
	 * 清除
	 *
	 * @param transaction transaction object returned by {@code doGetTransaction}
	 */
	@Override
	protected void doCleanupAfterCompletion(Object transaction) {
		DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;

		// Remove the connection holder from the thread, if exposed.
		if (txObject.isNewConnectionHolder()) {
			// 释放datasource绑定的资源
			TransactionSynchronizationManager.unbindResource(obtainDataSource());
		}

		// Reset connection.
		Connection con = txObject.getConnectionHolder().getConnection();
		try {
			if (txObject.isMustRestoreAutoCommit()) {
				con.setAutoCommit(true);
			}
			// 重置链接
			DataSourceUtils.resetConnectionAfterTransaction(
					con, txObject.getPreviousIsolationLevel(), txObject.isReadOnly());
		} catch (Throwable ex) {
			logger.debug("Could not reset JDBC Connection after transaction", ex);
		}

		if (txObject.isNewConnectionHolder()) {
			if (logger.isDebugEnabled()) {
				logger.debug("Releasing JDBC Connection [" + con + "] after transaction");
			}
			DataSourceUtils.releaseConnection(con, this.dataSource);
		}

		txObject.getConnectionHolder().clear();
	}


	/**
	*
	* 事务准备
	*/
	protected void prepareTransactionalConnection(Connection con, TransactionDefinition definition)
			throws SQLException {

		if (isEnforceReadOnly() && definition.isReadOnly()) {
			try (Statement stmt = con.createStatement()) {
				// 执行sql 类似事务隔离级别
				stmt.executeUpdate("SET TRANSACTION READ ONLY");
			}
		}
	}
```

#### 内部类 DataSourceTransactionObject

```java
	private static class DataSourceTransactionObject extends JdbcTransactionObjectSupport {

		/**
		 * 是否有新的链接
		 */
		private boolean newConnectionHolder;

		/**
		 * 是否自动提交
		 */
		private boolean mustRestoreAutoCommit;
    }
```

### AbstractPlatformTransactionManager

- abstract 修饰具体定义的方法不具体展开。主要关注实现`org.springframework.transaction.PlatformTransactionManager`的几个方法

#### commit 方法

```java
@Override
public final void commit(TransactionStatus status) throws TransactionException {
   if (status.isCompleted()) {
      throw new IllegalTransactionStateException(
            "Transaction is already completed - do not call commit or rollback more than once per transaction");
   }

   // 事务状态
   DefaultTransactionStatus defStatus = (DefaultTransactionStatus) status;

   if (defStatus.isLocalRollbackOnly()) {
      if (defStatus.isDebug()) {
         logger.debug("Transactional code has requested rollback");
      }
      // 处理回滚
      processRollback(defStatus, false);
      return;
   }

   if (!shouldCommitOnGlobalRollbackOnly() && defStatus.isGlobalRollbackOnly()) {
      if (defStatus.isDebug()) {
         logger.debug(
               "Global transaction is marked as rollback-only but transactional code requested commit");
      }
      // 处理回滚
      processRollback(defStatus, true);
      return;
   }
   // 真正的处理提交
   processCommit(defStatus);
}
```

```java
private void processCommit(DefaultTransactionStatus status) throws TransactionException {
   try {
      boolean beforeCompletionInvoked = false;

      try {
         boolean unexpectedRollback = false;
         //
         prepareForCommit(status);
         triggerBeforeCommit(status);
         triggerBeforeCompletion(status);
         // 前置任务是否已经执行
         beforeCompletionInvoked = true;

         // 嵌套事务. 是否有保存点
         if (status.hasSavepoint()) {
            if (status.isDebug()) {
               logger.debug("Releasing transaction savepoint");
            }
            unexpectedRollback = status.isGlobalRollbackOnly();
            status.releaseHeldSavepoint();
         } else if (status.isNewTransaction()) {
            if (status.isDebug()) {
               logger.debug("Initiating transaction commit");
            }
            unexpectedRollback = status.isGlobalRollbackOnly();
            doCommit(status);
         } else if (isFailEarlyOnGlobalRollbackOnly()) {
            unexpectedRollback = status.isGlobalRollbackOnly();
         }

         // Throw UnexpectedRollbackException if we have a global rollback-only
         // marker but still didn't get a corresponding exception from commit.
         if (unexpectedRollback) {
            throw new UnexpectedRollbackException(
                  "Transaction silently rolled back because it has been marked as rollback-only");
         }
      } catch (UnexpectedRollbackException ex) {
         // can only be caused by doCommit
         // 事务的同步状态: 回滚
         triggerAfterCompletion(status, TransactionSynchronization.STATUS_ROLLED_BACK);
         throw ex;
      } catch (TransactionException ex) {
         // can only be caused by doCommit
         // 提交失败 做回滚
         if (isRollbackOnCommitFailure()) {
            doRollbackOnCommitException(status, ex);
         } else {
            // 事务的同步状态: 未知
            triggerAfterCompletion(status, TransactionSynchronization.STATUS_UNKNOWN);
         }
         throw ex;
      } catch (RuntimeException | Error ex) {
         if (!beforeCompletionInvoked) {
            triggerBeforeCompletion(status);
         }
         doRollbackOnCommitException(status, ex);
         throw ex;
      }

      // Trigger afterCommit callbacks, with an exception thrown there
      // propagated to callers but the transaction still considered as committed.
      try {
         triggerAfterCommit(status);
      } finally {
         triggerAfterCompletion(status, TransactionSynchronization.STATUS_COMMITTED);
      }

   } finally {
      // 完成后清理
      cleanupAfterCompletion(status);
   }
}
```

#### rollback 方法

```java
@Override
public final void rollback(TransactionStatus status) throws TransactionException {
   // 是否已完成
   if (status.isCompleted()) {
      throw new IllegalTransactionStateException(
            "Transaction is already completed - do not call commit or rollback more than once per transaction");
   }

   DefaultTransactionStatus defStatus = (DefaultTransactionStatus) status;
   // 执行回滚
   processRollback(defStatus, false);
}
```

```java
private void processRollback(DefaultTransactionStatus status, boolean unexpected) {
   try {
      boolean unexpectedRollback = unexpected;

      try {
         triggerBeforeCompletion(status);

         // 嵌套事务
         if (status.hasSavepoint()) {
            if (status.isDebug()) {
               logger.debug("Rolling back transaction to savepoint");
            }
            // 回滚保存点
            status.rollbackToHeldSavepoint();
         }
         // 独立事务
         else if (status.isNewTransaction()) {
            if (status.isDebug()) {
               logger.debug("Initiating transaction rollback");
            }
            // 执行回滚
            doRollback(status);
         } else {
            // Participating in larger transaction
            if (status.hasTransaction()) {
               if (status.isLocalRollbackOnly()
                     || isGlobalRollbackOnParticipationFailure()) {
                  if (status.isDebug()) {
                     logger.debug(
                           "Participating transaction failed - marking existing transaction as rollback-only");
                  }
                  // 设置回滚
                  doSetRollbackOnly(status);
               } else {
                  if (status.isDebug()) {
                     logger.debug(
                           "Participating transaction failed - letting transaction originator decide on rollback");
                  }
               }
            } else {
               logger.debug(
                     "Should roll back transaction but cannot - no transaction available");
            }
            // Unexpected rollback only matters here if we're asked to fail early
            if (!isFailEarlyOnGlobalRollbackOnly()) {
               unexpectedRollback = false;
            }
         }
      } catch (RuntimeException | Error ex) {
         triggerAfterCompletion(status, TransactionSynchronization.STATUS_UNKNOWN);
         throw ex;
      }

      triggerAfterCompletion(status, TransactionSynchronization.STATUS_ROLLED_BACK);

      // Raise UnexpectedRollbackException if we had a global rollback-only marker
      if (unexpectedRollback) {
         throw new UnexpectedRollbackException(
               "Transaction rolled back because it has been marked as rollback-only");
      }
   } finally {
      cleanupAfterCompletion(status);
   }
}
```

### TransactionSynchronizationManager

- 事务同步管理器

- 一些基本属性

```java
	/**
	 * 资源
	 */
	private static final ThreadLocal<Map<Object, Object>> resources =
			new NamedThreadLocal<>("Transactional resources");
	/**
	 * 同步器
	 */
	private static final ThreadLocal<Set<TransactionSynchronization>> synchronizations =
			new NamedThreadLocal<>("Transaction synchronizations");

	/**
	 * 事务名称
	 */
	private static final ThreadLocal<String> currentTransactionName =
			new NamedThreadLocal<>("Current transaction name");

	/**
	 * 是否只读
	 */
	private static final ThreadLocal<Boolean> currentTransactionReadOnly =
			new NamedThreadLocal<>("Current transaction read-only status");

	/**
	 * 事务隔离级别
	 */
	private static final ThreadLocal<Integer> currentTransactionIsolationLevel =
			new NamedThreadLocal<>("Current transaction isolation level");

	/**
	 * 事务激活状态
	 */
	private static final ThreadLocal<Boolean> actualTransactionActive =
			new NamedThreadLocal<>("Actual transaction active");
```

#### 资源方法

##### 获取资源

```java
public static Map<Object, Object> getResourceMap() {
   // 线程变量中获取
   Map<Object, Object> map = resources.get();
   // 判空 如果为空给个空map如果有就返回
   return (map != null ? Collections.unmodifiableMap(map) : Collections.emptyMap());
}
```

##### 判断是否存在资源

```java
public static boolean hasResource(Object key) {
   // 资源key获取
   // 通过 unwrapResourceIfNecessary 会走一次资源对象转换.
   // 1. InfrastructureProxy
   // 2. ScopedObject
   Object actualKey = TransactionSynchronizationUtils.unwrapResourceIfNecessary(key);
   Object value = doGetResource(actualKey);
   return (value != null);
}
```

- `unwrapResourceIfNecessary`方法会将资源具体化到接口，从接口中调用方法获取具体的资源

  ```java
  static Object unwrapResourceIfNecessary(Object resource) {
     Assert.notNull(resource, "Resource must not be null");
     Object resourceRef = resource;
     // unwrap infrastructure proxy
     if (resourceRef instanceof InfrastructureProxy) {
        resourceRef = ((InfrastructureProxy) resourceRef).getWrappedObject();
     }
     if (aopAvailable) {
        // now unwrap scoped proxy
        resourceRef = ScopedProxyUnwrapper.unwrapIfNecessary(resourceRef);
     }
     return resourceRef;
  }

  	private static class ScopedProxyUnwrapper {

  		public static Object unwrapIfNecessary(Object resource) {
  			if (resource instanceof ScopedObject) {
  				return ((ScopedObject) resource).getTargetObject();
  			} else {
  				return resource;
  			}
  		}
  	}

  ```

- `doGetResource` 方法去获取资源

  ```java
  @Nullable
  private static Object doGetResource(Object actualKey) {
     Map<Object, Object> map = resources.get();
     if (map == null) {
        return null;
     }
     Object value = map.get(actualKey);
     // Transparently remove ResourceHolder that was marked as void...
     // 如果资源是下面两种的其中一个就删除这个资源
     if (value instanceof ResourceHolder && ((ResourceHolder) value).isVoid()) {
        map.remove(actualKey);
        // Remove entire ThreadLocal if empty...
        if (map.isEmpty()) {
           resources.remove();
        }
        value = null;
     }
     return value;
  }
  ```

##### 资源绑定

```java
public static void bindResource(Object key, Object value) throws IllegalStateException {
   // 将资源转换为正真的key
   Object actualKey = TransactionSynchronizationUtils.unwrapResourceIfNecessary(key);
   Assert.notNull(value, "Value must not be null");
   Map<Object, Object> map = resources.get();
   // set ThreadLocal Map if none found
   // 资源对象为空初始化
   if (map == null) {
      map = new HashMap<>();
      resources.set(map);
   }
   // 原来的值
   Object oldValue = map.put(actualKey, value);
   // Transparently suppress a ResourceHolder that was marked as void...
   // 如果原来的值是下面的两种 抛出异常
   if (oldValue instanceof ResourceHolder && ((ResourceHolder) oldValue).isVoid()) {
      oldValue = null;
   }
   if (oldValue != null) {
      throw new IllegalStateException("Already value [" + oldValue + "] for key [" +
            actualKey + "] bound to thread [" + Thread.currentThread().getName() + "]");
   }
   if (logger.isTraceEnabled()) {
      logger.trace("Bound value [" + value + "] for key [" + actualKey + "] to thread [" +
            Thread.currentThread().getName() + "]");
   }
}
```

- debug 使用的是 druid 的数据源

![image-20200729090322058](/images/spring/image-20200729090322058.png)

- `unwrapResourceIfNecessary` 方法

```java
static Object unwrapResourceIfNecessary(Object resource) {
   Assert.notNull(resource, "Resource must not be null");
   Object resourceRef = resource;
   // unwrap infrastructure proxy
   if (resourceRef instanceof InfrastructureProxy) {
      resourceRef = ((InfrastructureProxy) resourceRef).getWrappedObject();
   }
   if (aopAvailable) {
      // now unwrap scoped proxy
      resourceRef = ScopedProxyUnwrapper.unwrapIfNecessary(resourceRef);
   }
   return resourceRef;
}
```

显然`com.alibaba.druid.pool.DruidDataSource`不是`InfrastructureProxy`

- `aopAvailable`

  ```java
  private static final boolean aopAvailable = ClassUtils.isPresent(
        "org.springframework.aop.scope.ScopedObject",
        TransactionSynchronizationUtils.class.getClassLoader());
  ```

  ```java
  public static boolean isPresent(String className, @Nullable ClassLoader classLoader) {
     try {
        forName(className, classLoader);
        return true;
     }
     catch (IllegalAccessError err) {
        throw new IllegalStateException("Readability mismatch in inheritance hierarchy of class [" +
              className + "]: " + err.getMessage(), err);
     }
     catch (Throwable ex) {
        // Typically ClassNotFoundException or NoClassDefFoundError...
        return false;
     }
  }
  ```

  看是否可以解析如果解析成功返回`true` 解析失败返回`false`

- `ScopedProxyUnwrapper.unwrapIfNecessary`

  ```java
  private static class ScopedProxyUnwrapper {

     public static Object unwrapIfNecessary(Object resource) {
        if (resource instanceof ScopedObject) {
           return ((ScopedObject) resource).getTargetObject();
        } else {
           return resource;
        }
     }
  }
  ```

  - `com.alibaba.druid.pool.DruidDataSource`不是`ScopedObject` 直接返回

后续就是一个`map`的`put`方法不具体展开

##### 解除资源绑定

```java
public static Object unbindResource(Object key) throws IllegalStateException {
   // 获取真正的资源对象
   Object actualKey = TransactionSynchronizationUtils.unwrapResourceIfNecessary(key);
   // map 移除key
   Object value = doUnbindResource(actualKey);
   if (value == null) {
      throw new IllegalStateException(
            "No value for key [" + actualKey + "] bound to thread [" + Thread
                  .currentThread().getName() + "]");
   }
   return value;
}


	@Nullable
	private static Object doUnbindResource(Object actualKey) {
		Map<Object, Object> map = resources.get();
		if (map == null) {
			return null;
		}
		Object value = map.remove(actualKey);
		// Remove entire ThreadLocal if empty...
		if (map.isEmpty()) {
			resources.remove();
		}
		// Transparently suppress a ResourceHolder that was marked as void...
		if (value instanceof ResourceHolder && ((ResourceHolder) value).isVoid()) {
			value = null;
		}
		if (value != null && logger.isTraceEnabled()) {
			logger.trace("Removed value [" + value + "] for key [" + actualKey + "] from thread [" +
					Thread.currentThread().getName() + "]");
		}
		return value;
	}

```

map 对象的 remove 操作

#### 其他

- 其他几个都是使用`ThreadLocal`进行数据设置操作即可.

---

### TransactionTemplate

- 属性

  ```java
  	@Nullable
  	private PlatformTransactionManager transactionManager;

  ```

  前文说到 `DataSourceTransactionManager` 实现了 `PlatformTransactionManager` 因此配置的时候我们有如下片段

  ```xml
  <bean id="transactionTemplate"
        class="org.springframework.transaction.support.TransactionTemplate">
     <property name="transactionManager" ref="transactionManager"/>
  </bean>
  ```

- 事务操作模板类图

  ![image-20200728094658684](/images/spring/image-20200728094658684.png)

- `org.springframework.beans.factory.InitializingBean`接口的实现

  ```java
  @Override
  public void afterPropertiesSet() {
  		if (this.transactionManager == null) {
  			throw new IllegalArgumentException("Property 'transactionManager' is required");
  		}
  	}
  ```

#### execute

```java
   @Override
   @Nullable
   public <T> T execute(TransactionCallback<T> action) throws TransactionException {
      Assert.state(this.transactionManager != null, "No PlatformTransactionManager set");

      // 事务管理是否是 xxx接口
      if (this.transactionManager instanceof CallbackPreferringPlatformTransactionManager) {
//       强转执行
         return ((CallbackPreferringPlatformTransactionManager) this.transactionManager)
               .execute(this, action);
      } else {
         // 获取事务状态
         TransactionStatus status = this.transactionManager.getTransaction(this);
         // 返回结果
         T result;
         try {
            // 事务回调执行
            result = action.doInTransaction(status);
         } catch (RuntimeException | Error ex) {
            // Transactional code threw application exception -> rollback
            // 回滚异常
            rollbackOnException(status, ex);
            throw ex;
         } catch (Throwable ex) {
            // Transactional code threw unexpected exception -> rollback
            // 回滚异常
            rollbackOnException(status, ex);
            throw new UndeclaredThrowableException(ex,
                  "TransactionCallback threw undeclared checked exception");
         }
         // 提交
         this.transactionManager.commit(status);
         return result;
      }
   }
```
