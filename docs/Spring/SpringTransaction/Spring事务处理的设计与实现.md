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



## 3 事务的挂起




## 4 事务的提交



## 5 事务的回滚