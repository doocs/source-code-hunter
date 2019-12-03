这篇文章分享一下 spring IoC 容器初始化第三部分的代码，也就是将前面解析得到的 BeanDefinition 注册进 IoC 容器，其实就是存入一个 ConcurrentHashMap<String, BeanDefinition> 中。

（PS：可以结合我 GitHub 上对 spring 框架源码的翻译注解一起看，会更有助于各位同学理解，地址：

spring-beans	 https://github.com/AmyliaY/spring-beans-reading

spring-context  https://github.com/AmyliaY/spring-context-reading
）
## 1、回过头看一下前面在 DefaultBeanDefinitionDocumentReader 中实现的 processBeanDefinition(Element ele, BeanDefinitionParserDelegate delegate) 方法
```java
	// 解析 Bean 定义资源 Document 对象的普通元素
	protected void processBeanDefinition(Element ele, BeanDefinitionParserDelegate delegate) {
		
		// BeanDefinitionHolder 是对 BeanDefinition 的封装，即 BeanDefinition 的封装类  
		// 对 Document 对象中 <Bean> 元素的解析由 BeanDefinitionParserDelegate 实现
		BeanDefinitionHolder bdHolder = delegate.parseBeanDefinitionElement(ele);
		if (bdHolder != null) {
			// 对 bdHolder 进行包装处理
			bdHolder = delegate.decorateBeanDefinitionIfRequired(ele, bdHolder);
			try {
				/**
				 * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
				 * 向 Spring IoC 容器注册解析 BeanDefinition，这是 BeanDefinition 向 IoC 容器注册的入口
				 * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
				 */
				BeanDefinitionReaderUtils.registerBeanDefinition(bdHolder, getReaderContext().getRegistry());
			}
			catch (BeanDefinitionStoreException ex) {
				getReaderContext().error("Failed to register bean definition with name '" +
						bdHolder.getBeanName() + "'", ele, ex);
			}
			// 在完成向 Spring IOC 容器注册解析得到的 Bean 定义之后，发送注册事件
			getReaderContext().fireComponentRegistered(new BeanComponentDefinition(bdHolder));
		}
	}
```
## 2、BeanDefinitionReaderUtils 的 registerBeanDefinition(BeanDefinitionHolder definitionHolder, BeanDefinitionRegistry registry) 方法
```java
	// 将解析的 BeanDefinitionHold 注册到容器中
	public static void registerBeanDefinition(
			BeanDefinitionHolder definitionHolder, BeanDefinitionRegistry registry)
			throws BeanDefinitionStoreException {

		// 获取解析的 BeanDefinition 的名称
		String beanName = definitionHolder.getBeanName();
		/**
		 * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
		 * 开始向 IOC 容器注册 BeanDefinition
		 * ！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！
		 */
		registry.registerBeanDefinition(beanName, definitionHolder.getBeanDefinition());

		// 如果解析的 BeanDefinition 有别名，向容器为其注册别名
		String[] aliases = definitionHolder.getAliases();
		if (aliases != null) {
			for (String aliase : aliases) {
				registry.registerAlias(beanName, aliase);
			}
		}
	}
```
## 3、BeanDefinitionRegistry 中的 registerBeanDefinition(String beanName, BeanDefinition beanDefinition) 方法在 DefaultListableBeanFactory 实现类中的具体实现
```java
	// 向 IoC 容器注册解析的 BeanDefinito
	public void registerBeanDefinition(String beanName, BeanDefinition beanDefinition)
			throws BeanDefinitionStoreException {

		Assert.hasText(beanName, "Bean name must not be empty");
		Assert.notNull(beanDefinition, "BeanDefinition must not be null");

		// 校验解析的 BeanDefiniton
		if (beanDefinition instanceof AbstractBeanDefinition) {
			try {
				((AbstractBeanDefinition) beanDefinition).validate();
			}
			catch (BeanDefinitionValidationException ex) {
				throw new BeanDefinitionStoreException(beanDefinition.getResourceDescription(), beanName,
						"Validation of bean definition failed", ex);
			}
		}

		// 注册的过程中需要线程同步，以保证数据的一致性
		synchronized (this.beanDefinitionMap) {
			Object oldBeanDefinition = this.beanDefinitionMap.get(beanName);
			
			// 检查是否有同名的 BeanDefinition 已经在 IOC 容器中注册，如果已经注册，  
	        // 并且不允许覆盖已注册的 BeanDefinition，则抛出注册失败异常，
			// allowBeanDefinitionOverriding 默认为 true
			if (oldBeanDefinition != null) {
				if (!this.allowBeanDefinitionOverriding) {
					throw new BeanDefinitionStoreException(beanDefinition.getResourceDescription(), beanName,
							"Cannot register bean definition [" + beanDefinition + "] for bean '" + beanName +
							"': There is already [" + oldBeanDefinition + "] bound.");
				}
				else {// 如果允许覆盖，则同名的 Bean，后注册的覆盖先注册的
					if (this.logger.isInfoEnabled()) {
						this.logger.info("Overriding bean definition for bean '" + beanName +
								"': replacing [" + oldBeanDefinition + "] with [" + beanDefinition + "]");
					}
				}
			}
			else {// IOC 容器中没有已经注册同名的 Bean，按正常注册流程注册
				this.beanDefinitionNames.add(beanName);
				this.frozenBeanDefinitionNames = null;
			}
			this.beanDefinitionMap.put(beanName, beanDefinition);
		}
		// 重置所有已经注册过的 BeanDefinition 的缓存
		resetBeanDefinition(beanName);
	}
```
## 最后看一下 spring 的 IoC 容器在代码中最直接的体现
```java
	// 存储注册信息的 BeanDefinition 集合，也就是所谓的 IoC 容器
	private final Map<String, BeanDefinition> beanDefinitionMap = new ConcurrentHashMap<String, BeanDefinition>(64);
```