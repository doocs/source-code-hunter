## 1 事务处理的编程式使用
```java
    TransactionDefinition td = new DefaultTransactionDefinition();
    TransactionStatus ts = transactionManager.getTransaction(td);
    try {
        // 这里是需要进行事务处理的方法调用
    }
    catch (Exception e) {
        transactionManager.rollback(ts);
        throw e;
    }
    transactionManager.commit(ts);
```
在使用编程式事务处理的过程中，利用DefaultTransactionDefinition对象来持有事务处理属性。同时，在创建事务的过程中得到一个TransactionStatus对象，然后通过直接调用transactionManager的commit()和rollback()方法来完成事务处理。在这个编程式使用事务管理的
过程中，没有看到框架特性的使用，非常简单和直接，很好地说明了事务管理的基本实现过程，以及在Spring事务处理实现中涉及一些主要的类，比如TransationStatus、TransactionManager等，对这些类的使用与声明式事务处理的最终实现是一样的。

与编程式使用事务管理不同，在使用声明式事务处理的时候，因为涉及Spring框架对事务处理的统一管理，以及对并发事务和事务属性的处理，所以采用的是一个比较复杂的处理过程，但复杂归复杂，这个过程对使用声明式事务处理的应用来说，基本上是不可见的，而是由Spring框架来完成的。有了这些背景铺垫和前面对AOP封装事务处理的了解，下面来看看Spring是如何提供声明式事务处理的，Spring在这个相对较为复杂的过程中封装了什么。这层封装包括在事务处理中事务的创建、提交和回滚等比较核心的操作。

## 2 事务的创建
作为声明式事务处理实现的起始点，需要注意TransactionInterceptor拦截器的invoke()回调中使用的createTransactionIfNecessary()方法，这个方法是在TransactionInterceptor的基类TransactionAspectSupport中实现的。为了了解这个方法的实现，先分析一下TransactionInterceptor的基类实现TransactionAspectSupport，并以这个方法的实现为入口，了解Spring是如何根据当前的事务状态和事务属性配置完成事务创建的。

这个TransactionAspectSupport的createTransactionIfNecessary()方法作为事务创建的入口，其具体的实现时序如下图所示。在createTransactionIfNecessary()方法的调用中，会向AbstractTransactionManager执行getTransaction()方法，这个获取Transaction事务对象的过程，在AbstractTransactionManager实现中需要对事务的情况做出不同的处理，然后，创建一个TransactionStatus，并把这个TransactionStatus设置到对应的TransactionInfo中去，同时将TransactionInfo和当前的线程绑定，从而完成事务的创建过程。createTransactionIfNeccessary()方法调用中，可以看到两个重要的数据对象TransactionStatus和TransactionInfo的创建，这两个对象持有的数据是事务处理器对事务进行处理的主要依据，对这两个对象的使用贯穿着整个事务处理的全过程。

![avatar](images/springTransaction/调用createTransactionIfNecessary()方法的时序图.png)

```java
public abstract class TransactionAspectSupport implements BeanFactoryAware, InitializingBean {
	/**
	 * 根据给定的方法和类，在必要时创建事务
	 */
	@Deprecated
	protected TransactionInfo createTransactionIfNecessary(Method method, Class targetClass) {
		// 根据给定的方法和类获取TransactionAttribute，
		// 如果TransactionAttribute为空，则该方法是非事务性的
		TransactionAttribute txAttr = getTransactionAttributeSource().getTransactionAttribute(method, targetClass);
		// 使用确定的事务管理器
		PlatformTransactionManager tm = determineTransactionManager(txAttr);
		return createTransactionIfNecessary(tm, txAttr, methodIdentification(method, targetClass));
	}

	/**
	 * 根据给定的TransactionAttribute创建事务
	 */
	@SuppressWarnings("serial")
	protected TransactionInfo createTransactionIfNecessary(
			PlatformTransactionManager tm, TransactionAttribute txAttr, final String joinpointIdentification) {

		// 如果未指定名称，则使用方法特征作为事务名称
		if (txAttr != null && txAttr.getName() == null) {
			txAttr = new DelegatingTransactionAttribute(txAttr) {
				@Override
				public String getName() {
					return joinpointIdentification;
				}
			};
		}

		// TransactionStatus封装了事务执行的状态信息
		TransactionStatus status = null;
		if (txAttr != null) {
			if (tm != null) {
				// 根据定义好的事务方法配置信息TransactionAttribute，通过
				// 平台事务管理器PlatformTransactionManager创建事务，同时返回
				// TransactionStatus来记录当前的事务状态，包括已经创建的事务
				status = tm.getTransaction(txAttr);
			}
			else {
				if (logger.isDebugEnabled()) {
					logger.debug("Skipping transactional joinpoint [" + joinpointIdentification +
							"] because no transaction manager has been configured");
				}
			}
		}
		// 准备TransactionInfo，TransactionInfo对象封装了事务处理的配置信息以及TransactionStatus
		return prepareTransactionInfo(tm, txAttr, joinpointIdentification, status);
	}

	protected TransactionInfo prepareTransactionInfo(PlatformTransactionManager tm,
			TransactionAttribute txAttr, String joinpointIdentification, TransactionStatus status) {

		TransactionInfo txInfo = new TransactionInfo(tm, txAttr, joinpointIdentification);
		if (txAttr != null) {
			if (logger.isTraceEnabled()) {
				logger.trace("Getting transaction for [" + txInfo.getJoinpointIdentification() + "]");
			}
			// 为TransactionInfo设置TransactionStatus，TransactionStatus持有管理事务处理
			// 需要的数据，如：transaction对象
			// 如果不兼容的TX已经存在，事务管理器将标记错误
			txInfo.newTransactionStatus(status);
		}
		else {
			if (logger.isTraceEnabled())
				logger.trace("Don't need to create transaction for [" + joinpointIdentification +
						"]: This method isn't transactional.");
		}

		// 这里把当前的TransactionInfo与线程绑定，同时在TransactionInfo中由一个变量来保存以前
		// 的TransactionInfo，这样就持有了一连串与事务处理相关的TransactionInfo
		// 虽然不一定要创建新的事务，但总会在请求事务时创建TransactionInfo
		txInfo.bindToThread();
		return txInfo;
	}
}
```
在以上的处理过程之后，可以看到，具体的事务创建可以交给事务处理器来完成。在事务的创建过程中，已经为事务的管理做好了准备，包括记录事务处理状态，以及绑定事务信息和线程等。下面到事务处理器中去了解一下更底层的事务创建过程。

createTransactionIfNecessary()方法通过调用PlatformTransactionManager的getTransaction()方法，生成一个TransactionStatus对象，封装了底层事务对象的创建。可以看到，AbstractPlatformTransactionManager提供了创建事务的模板，这个模板会被具体的事务处理器所使用。从下面的代码中可以看到，AbstractPlatformTransactionManager会根据事务属性配置和当前进程绑定的事务信息，对事务是否需要创建，怎样创建 进行一些通用的处理，然后把事务创建的底层工作交给具体的事务处理器完成。尽管具体的事务处理器完成事务创建的过程各不相同，但是不同的事务处理器对事务属性和当前进程事务信息的处理都是相同的，在AbstractPlatformTransactionManager中完成了该实现，这个实现过程是Spring提供统一事务处理的一个重要部分。
```java
public abstract class AbstractPlatformTransactionManager implements PlatformTransactionManager, Serializable {

	//---------------------------------------------------------------------
	// PlatformTransactionManager的实现
	//---------------------------------------------------------------------

	public final TransactionStatus getTransaction(TransactionDefinition definition) throws TransactionException {
		// doGetTransaction()是抽象方法，Transaction对象的取得由具体的事务管理器
		// 实现，比如：DataSourceTransactionManager
		Object transaction = doGetTransaction();

		// 缓存debug标志，以避免重复检查
		boolean debugEnabled = logger.isDebugEnabled();

		if (definition == null) {
			// 如果没有给出事务定义，则使用默认值
			definition = new DefaultTransactionDefinition();
		}

		// 检查当前线程是否已经存在事务，如果已经存在事务，则根据事务属性中定义的 事务传播属性配置
		// 来处理事务的产生
		if (isExistingTransaction(transaction)) {
			// 对当前线程中已经有事务存在的情况进行处理，结果封装在TransactionStatus中
			return handleExistingTransaction(definition, transaction, debugEnabled);
		}

		// 检查definition中timeout属性的设置
		if (definition.getTimeout() < TransactionDefinition.TIMEOUT_DEFAULT) {
			throw new InvalidTimeoutException("Invalid transaction timeout", definition.getTimeout());
		}

		// 当前没有事务存在，这时需要根据事务属性设置来创建事务
		// 这里可以看到对事务传播属性配置的处理，比如：MANDATORY、REQUIRED、REQUIRES_NEW、NESTED等
		if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_MANDATORY) {
			throw new IllegalTransactionStateException(
					"No existing transaction found for transaction marked with propagation 'mandatory'");
		}
		else if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRED ||
				definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRES_NEW ||
			definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NESTED) {
			
			SuspendedResourcesHolder suspendedResources = suspend(null);
			if (debugEnabled) {
				logger.debug("Creating new transaction with name [" + definition.getName() + "]: " + definition);
			}
			try {
				boolean newSynchronization = (getTransactionSynchronization() != SYNCHRONIZATION_NEVER);
				// 将要返回的DefaultTransactionStatus对象，封装了事务执行情况
				DefaultTransactionStatus status = newTransactionStatus(
						definition, transaction, true, newSynchronization, debugEnabled, suspendedResources);
				// 创建事务，由具体的事务管理器来完成，如：DataSourceTransactionManager、HibernateTransactionManager
				doBegin(transaction, definition);
				prepareSynchronization(status, definition);
				return status;
			}
			catch (RuntimeException ex) {
				resume(null, suspendedResources);
				throw ex;
			}
			catch (Error err) {
				resume(null, suspendedResources);
				throw err;
			}
		}
		else {
			boolean newSynchronization = (getTransactionSynchronization() == SYNCHRONIZATION_ALWAYS);
			return prepareTransactionStatus(definition, null, true, newSynchronization, debugEnabled, null);
		}
	}
} 
```
从上面的代码中可以看到，AbstractTransactionManager提供的创建事务的实现模板，在这个模板的基础上，具体的事务处理器需要定义自己的实现来完成底层的事务创建工作，比如需要实现isExistingTransaction()和doBegin()方法。关于这些由具体事务处理器实现的方法会在下面结合具体的事务处理器实现，如：DataSourceTransactionManager、HibernateTransactionManager进行分析。

事务创建的结果是生成一个TransactionStatus对象， 通过这个对象来保存事务处理需要的基本信息，这个对象与前面提到过的TransactionInfo对象联系在一起， TransactionStatus是TransactionInfo的一个属性，然后会把TransactionInfo保存在ThreadLocal对象里，这样当前线程可以通过ThreadLocal对象取得TransactionInfo，以及与这个事务对应的TransactionStatus对象，从而把事务的处理信息与调用事务方法的当前线程绑定起来。在AbstractPlatformTransactionManager创建事务的过程中，可以看到TransactionStatus的创建过程。
```java
	/**
	 * 通过给定的参数，创建一个TransactionStatus实例
	 */
	protected DefaultTransactionStatus newTransactionStatus(
			TransactionDefinition definition, Object transaction, boolean newTransaction,
			boolean newSynchronization, boolean debug, Object suspendedResources) {

		// 这里判断是不是新事务，如果是新事务，需要把事务属性存放到当前线程中
		// TransactionSynchronizationManager维护了一系列的ThreadLocal变量
		// 来保持事务属性，比如，并发事务隔离级别，是否有活跃的事务等
		boolean actualNewSynchronization = newSynchronization &&
				!TransactionSynchronizationManager.isSynchronizationActive();
		// 把结果记录在DefaultTransactionStatus对象中并返回
		return new DefaultTransactionStatus(
				transaction, newTransaction, actualNewSynchronization,
				definition.isReadOnly(), debug, suspendedResources);
	}
```
新事务的创建是比较好理解的，这里需要根据事务属性配置进行创建。所谓创建，首先是把创建工作交给具体的事务处理器来完成，比如DataSourceTransactionManager，把创建的事务对象在TransactionStatus中保存下来，然后将其他的事务属性和线程ThreadLocal变量进行绑定。

相对于创建全新事务的另一种情况是：在创建当前事务时，线程中已经有事务存在了。这种情况同样需要处理，在声明式事务处理中，在当前线程调用事务方法的时候，就会考虑事务的创建处理，这个处理在方法handleExistingTransaction()中完成。这里对现有事务的处理，会涉及事务传播属性的具体处理，比如PROPAGATION_NOT_SUPPORTED、PROPAGATION_ REQUIRES_ NEW等。
```java
	/**
	 * 为存在的事务创建一个TransactionStatus实例
	 */
	private TransactionStatus handleExistingTransaction(
			TransactionDefinition definition, Object transaction, boolean debugEnabled)
			throws TransactionException {

		// PROPAGATION_NEVER表示 以非事务方式执行，如果当前存在事务，则抛出异常
		if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NEVER) {
			throw new IllegalTransactionStateException(
					"Existing transaction found for transaction marked with propagation 'never'");
		}

		// PROPAGATION_NOT_SUPPORTED表示  以非事务方式执行操作，如果当前存在事务，就把当前事务挂起
		if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NOT_SUPPORTED) {
			if (debugEnabled) {
				logger.debug("Suspending current transaction");
			}
			Object suspendedResources = suspend(transaction);
			boolean newSynchronization = (getTransactionSynchronization() == SYNCHRONIZATION_ALWAYS);
			// 注意这里的参数，transaction为null，newTransaction为false，这意味着事务方法不需要
			// 放在事务环境中执行，同时挂起事务的信息记录也保存在TransactionStatus中，这里包括了
			// 进程ThreadLocal对事务信息的记录
			return prepareTransactionStatus(
					definition, null, false, newSynchronization, debugEnabled, suspendedResources);
		}

		// PROPAGATION_REQUIRES_NEW表示 新建事务，如果当前存在事务，把当前事务挂起
		if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRES_NEW) {
			if (debugEnabled) {
				logger.debug("Suspending current transaction, creating new transaction with name [" +
						definition.getName() + "]");
			}
			SuspendedResourcesHolder suspendedResources = suspend(transaction);
			try {
				boolean newSynchronization = (getTransactionSynchronization() != SYNCHRONIZATION_NEVER);
				// 挂起事务的信息记录保存在TransactionStatus中，这里包括了进程ThreadLocal对事务信息的记录
				DefaultTransactionStatus status = newTransactionStatus(
						definition, transaction, true, newSynchronization, debugEnabled, suspendedResources);
				doBegin(transaction, definition);
				prepareSynchronization(status, definition);
				return status;
			}
			catch (RuntimeException beginEx) {
				resumeAfterBeginException(transaction, suspendedResources, beginEx);
				throw beginEx;
			}
			catch (Error beginErr) {
				resumeAfterBeginException(transaction, suspendedResources, beginErr);
				throw beginErr;
			}
		}

		// PROPAGATION_NESTED表示 如果当前存在事务，则在嵌套事务内执行。如果当前没有事务，则执行与PROPAGATION_REQUIRED类似的操作
		if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NESTED) {
			if (!isNestedTransactionAllowed()) {
				throw new NestedTransactionNotSupportedException(
						"Transaction manager does not allow nested transactions by default - " +
						"specify 'nestedTransactionAllowed' property with value 'true'");
			}
			if (debugEnabled) {
				logger.debug("Creating nested transaction with name [" + definition.getName() + "]");
			}
			if (useSavepointForNestedTransaction()) {
				// 在spring管理的事务中 创建事务保存点
				DefaultTransactionStatus status =
						prepareTransactionStatus(definition, transaction, false, false, debugEnabled, null);
				status.createAndHoldSavepoint();
				return status;
			}
			else {
				boolean newSynchronization = (getTransactionSynchronization() != SYNCHRONIZATION_NEVER);
				DefaultTransactionStatus status = newTransactionStatus(
						definition, transaction, true, newSynchronization, debugEnabled, null);
				doBegin(transaction, definition);
				prepareSynchronization(status, definition);
				return status;
			}
		}

		if (debugEnabled) {
			logger.debug("Participating in existing transaction");
		}
		// 这里判断 在当前事务方法中的属性配置 与已有事务的属性配置是否一致，如果不一致，
		// 那么不执行事务方法 并抛出异常
		if (isValidateExistingTransaction()) {
			if (definition.getIsolationLevel() != TransactionDefinition.ISOLATION_DEFAULT) {
				Integer currentIsolationLevel = TransactionSynchronizationManager.getCurrentTransactionIsolationLevel();
				if (currentIsolationLevel == null || currentIsolationLevel != definition.getIsolationLevel()) {
					Constants isoConstants = DefaultTransactionDefinition.constants;
					throw new IllegalTransactionStateException("Participating transaction with definition [" +
							definition + "] specifies isolation level which is incompatible with existing transaction: " +
							(currentIsolationLevel != null ?
									isoConstants.toCode(currentIsolationLevel, DefaultTransactionDefinition.PREFIX_ISOLATION) :
									"(unknown)"));
				}
			}
			if (!definition.isReadOnly()) {
				if (TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
					throw new IllegalTransactionStateException("Participating transaction with definition [" +
							definition + "] is not marked as read-only but existing transaction is");
				}
			}
		}
		// 返回DefaultTransactionStatus，注意 第三个参数false 代表当前事务方法没有使用新的事务
		boolean newSynchronization = (getTransactionSynchronization() != SYNCHRONIZATION_NEVER);
		return prepareTransactionStatus(definition, transaction, false, newSynchronization, debugEnabled, null);
	}
```

## 3 事务的挂起
事务的挂起牵涉线程与事务处理信息的保存，下面看一下事务挂起的实现。
```java
	/**
	 * 挂起给定的事务。先挂起事务同步，然后委托给doSuspend()模板方法，
	 * 该方法返回的SuspendedResourcesHolder对象，会作为参数传递给TransactionStatus
	 */
	protected final SuspendedResourcesHolder suspend(Object transaction) throws TransactionException {
		if (TransactionSynchronizationManager.isSynchronizationActive()) {
			List<TransactionSynchronization> suspendedSynchronizations = doSuspendSynchronization();
			try {
				Object suspendedResources = null;
				// 把挂起事务的处理交给具体事务处理器去完成，如果具体的事务处理器不支持事务挂起，
				// 就抛出异常
				if (transaction != null) {
					suspendedResources = doSuspend(transaction);
				}
				// 这里在线程中保存与事务处理有关的信息，并重置线程中相关的ThreadLocal变量
				String name = TransactionSynchronizationManager.getCurrentTransactionName();
				TransactionSynchronizationManager.setCurrentTransactionName(null);
				boolean readOnly = TransactionSynchronizationManager.isCurrentTransactionReadOnly();
				TransactionSynchronizationManager.setCurrentTransactionReadOnly(false);
				Integer isolationLevel = TransactionSynchronizationManager.getCurrentTransactionIsolationLevel();
				TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(null);
				boolean wasActive = TransactionSynchronizationManager.isActualTransactionActive();
				TransactionSynchronizationManager.setActualTransactionActive(false);
				return new SuspendedResourcesHolder(
						suspendedResources, suspendedSynchronizations, name, readOnly, isolationLevel, wasActive);
			}
			// 若doSuspend()方法出现RuntimeException异常或Error错误，则初始的事务依然存在
			catch (RuntimeException ex) {
				doResumeSynchronization(suspendedSynchronizations);
				throw ex;
			}
			catch (Error err) {
				doResumeSynchronization(suspendedSynchronizations);
				throw err;
			}
		}
		else if (transaction != null) {
			Object suspendedResources = doSuspend(transaction);
			return new SuspendedResourcesHolder(suspendedResources);
		}
		else {
			return null;
		}
	}
```
基于以上内容，就可以完成声明式事务处理的创建了。声明式事务处理能使事务处理应用的开发变得简单，但是简单的背后，蕴含着平台付出的许多努力。

## 4 事务的提交
下面来看看事务提交是如何实现的。有了前面的对事务创建的分析，下面来分析一下在Spring中，声明式事务处理的事务提交是如何完成的。事务提交的调用入口是TransactionInteceptor的invoke()方法，事务提交的具体实现则在其基类TransactionAspectSupport的commitTransactionAfterReturning(TransactionInfo txInfo)方法中。可以看到，txInfo是TransactionInfo对象，这个参数TransactionInfo对象是
创建事务时生成的。同时，Spring的事务管理框架生成的TransactionStatus对象就包含在TransactionInfo对象中。这个commitTransactionAfterReturning()方法在TransactionInteceptor的实现部分是比较简单的，它通过直接调用事务处理器来完成事务提交。
```java
	/**
	 * 在事务方法成功调用后执行，若出现异常，则不执行。如果不创建事务，则不执行任何操作。
	 */
	protected void commitTransactionAfterReturning(TransactionInfo txInfo) {
		if (txInfo != null && txInfo.hasTransaction()) {
			if (logger.isTraceEnabled()) {
				logger.trace("Completing transaction for [" + txInfo.getJoinpointIdentification() + "]");
			}
			txInfo.getTransactionManager().commit(txInfo.getTransactionStatus());
		}
	}
```
与前面分析事务的创建过程一样，我们需要到事务管理器中去看看事务是如何提交的。同样，在AbstractPlatformTransactionManager中也有一个模板方法支持具体的事务管理器对事务提交的实现，在AbstractPlatformTransactionManager中，这个模板方法的实现与前面我们看到的getTransaction()很类似。
```java
	/**
	 * 处理实际提交的事务
	 */
	private void processCommit(DefaultTransactionStatus status) throws TransactionException {
		try {
			boolean beforeCompletionInvoked = false;
			try {
				// 事务提交的准备工作由具体的事务管理器来完成
				prepareForCommit(status);
				triggerBeforeCommit(status);
				triggerBeforeCompletion(status);
				beforeCompletionInvoked = true;
				boolean globalRollbackOnly = false;
				if (status.isNewTransaction() || isFailEarlyOnGlobalRollbackOnly()) {
					globalRollbackOnly = status.isGlobalRollbackOnly();
				}
				// 嵌套事务的处理
				if (status.hasSavepoint()) {
					if (status.isDebug()) {
						logger.debug("Releasing transaction savepoint");
					}
					status.releaseHeldSavepoint();
				}
				// 如果当前事务是一个新事务，调用具体事务处理器的doCommit()实现；否则，
				// 不提交，由已经存在的事务来完成提交
				else if (status.isNewTransaction()) {
					if (status.isDebug()) {
						logger.debug("Initiating transaction commit");
					}
					// 该实现由具体的事务管理器来完成
					doCommit(status);
				}
				// 如果我们有一个全局仅回滚标记，但仍然没有从commit中获得相应的异常，
				// 则抛出UnexpectedRollbackException
				if (globalRollbackOnly) {
					throw new UnexpectedRollbackException(
							"Transaction silently rolled back because it has been marked as rollback-only");
				}
			}
			catch (UnexpectedRollbackException ex) {
				// can only be caused by doCommit
				triggerAfterCompletion(status, TransactionSynchronization.STATUS_ROLLED_BACK);
				throw ex;
			}
			catch (TransactionException ex) {
				// can only be caused by doCommit
				if (isRollbackOnCommitFailure()) {
					doRollbackOnCommitException(status, ex);
				}
				else {
					triggerAfterCompletion(status, TransactionSynchronization.STATUS_UNKNOWN);
				}
				throw ex;
			}
			catch (RuntimeException ex) {
				if (!beforeCompletionInvoked) {
					triggerBeforeCompletion(status);
				}
				doRollbackOnCommitException(status, ex);
				throw ex;
			}
			catch (Error err) {
				if (!beforeCompletionInvoked) {
					triggerBeforeCompletion(status);
				}
				doRollbackOnCommitException(status, err);
				throw err;
			}

			// 触发器afterCommit()回调，其中抛出的异常已传播到调用方，但该事务仍被视为已提交
			try {
				triggerAfterCommit(status);
			}
			finally {
				triggerAfterCompletion(status, TransactionSynchronization.STATUS_COMMITTED);
			}

		}
		finally {
			cleanupAfterCompletion(status);
		}
	}
```
可以看到，事务提交的准备都是由具体的事务处理器来实现的。当然，对这些事务提交的处理，需要通过对TransactionStatus保存的事务处理的相关状态进行判断。提交过程涉及AbstractPlatformTransactionManager中的doCommit()和prepareForCommit()方法，它们都是抽象方法，都在具体的事务处理器中完成实现，在下面对具体事务处理器的实现原理的分析中，可以看到对这些实现方法的具体分析。

## 5 事务的回滚
除了事务的创建、挂起和提交外，再来看一看事务的回滚是如何完成的。回滚处理和事务提交非常相似。
```java
	/**
	 * 处理实际的事务回滚
	 */
	private void processRollback(DefaultTransactionStatus status) {
		try {
			try {
				triggerBeforeCompletion(status);
				// 嵌套事务的回滚处理
				if (status.hasSavepoint()) {
					if (status.isDebug()) {
						logger.debug("Rolling back transaction to savepoint");
					}
					status.rollbackToHeldSavepoint();
				}
				// 当前事务调用方法中，新建事务的回滚处理
				else if (status.isNewTransaction()) {
					if (status.isDebug()) {
						logger.debug("Initiating transaction rollback");
					}
					doRollback(status);
				}
				// 当前事务调用方法中，没有新建事务的回滚处理
				else if (status.hasTransaction()) {
					if (status.isLocalRollbackOnly() || isGlobalRollbackOnParticipationFailure()) {
						if (status.isDebug()) {
							logger.debug("Participating transaction failed - marking existing transaction as rollback-only");
						}
						doSetRollbackOnly(status);
					}
					// 由线程中的前一个事务来处理回滚，这里不执行任何操作
					else {
						if (status.isDebug()) {
							logger.debug("Participating transaction failed - letting transaction originator decide on rollback");
						}
					}
				}
				else {
					logger.debug("Should roll back transaction but cannot - no transaction available");
				}
			}
			catch (RuntimeException ex) {
				triggerAfterCompletion(status, TransactionSynchronization.STATUS_UNKNOWN);
				throw ex;
			}
			catch (Error err) {
				triggerAfterCompletion(status, TransactionSynchronization.STATUS_UNKNOWN);
				throw err;
			}
			triggerAfterCompletion(status, TransactionSynchronization.STATUS_ROLLED_BACK);
		}
		finally {
			cleanupAfterCompletion(status);
		}
	}
```
以上对事务的创建、提交和回滚的实现原理进行了分析，这些过程的实现都比较复杂，一方面 这些处理会涉及很多事务属性的处理；另一方面 会涉及事务处理过程中状态的设置，同时在事务处理的过程中，有许多处理也需要根据相应的状态来完成。这样看来，在实现事务处理的基本过程中就会产生许多事务处理的操作分支。

但总的来说，在事务执行的实现过程中，作为执行控制的TransactionInfo对象和TransactionStatus对象特别值得我们注意，比如它们如何与线程进行绑定，如何记录事务的执行情况等。如果大家在配置事务属性时有什么疑惑，不妨直接看看这些事务属性的处理过程，通过对这些实现原理的了解，可以极大地提高对这些事务处理属性使用的理解程度。
