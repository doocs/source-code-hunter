# Spring 定时任务

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)

## EnableScheduling

- 首先关注的类为启动定时任务的注解`@EnableScheduling`

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Import(SchedulingConfiguration.class)
@Documented
public @interface EnableScheduling {

}
```

## SchedulingConfiguration

- 注册定时任务相关信息

```java
@Configuration
@Role(BeanDefinition.ROLE_INFRASTRUCTURE)
public class SchedulingConfiguration {

    /**
     * 开启定时任务
     * @return
     */
    @Bean(name = TaskManagementConfigUtils.SCHEDULED_ANNOTATION_PROCESSOR_BEAN_NAME)
    @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    public ScheduledAnnotationBeanPostProcessor scheduledAnnotationProcessor() {
        // 注册 ScheduledAnnotationBeanPostProcessor
        return new ScheduledAnnotationBeanPostProcessor();
    }

}
```

## ScheduledAnnotationBeanPostProcessor

- 关注 application 事件,以及 spring 生命周期相关的接口实现

```java
  /**
     * application 事件
     * @param event the event to respond to
     */
    @Override
    public void onApplicationEvent(ContextRefreshedEvent event) {
        if (event.getApplicationContext() == this.applicationContext) {
            // Running in an ApplicationContext -> register tasks this late...
            // giving other ContextRefreshedEvent listeners a chance to perform
            // their work at the same time (e.g. Spring Batch's job registration).
            // 注册定时任务
            finishRegistration();
        }
    }
```

```java
@Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        if (bean instanceof AopInfrastructureBean || bean instanceof TaskScheduler ||
                bean instanceof ScheduledExecutorService) {
            // Ignore AOP infrastructure such as scoped proxies.
            return bean;
        }

        // 当前类
        Class<?> targetClass = AopProxyUtils.ultimateTargetClass(bean);
        if (!this.nonAnnotatedClasses.contains(targetClass)) {
            // 方法扫描,存在 Scheduled、Schedules  注解的全部扫描
            Map<Method, Set<Scheduled>> annotatedMethods = MethodIntrospector.selectMethods(targetClass,
                    (MethodIntrospector.MetadataLookup<Set<Scheduled>>) method -> {

                        Set<Scheduled> scheduledMethods = AnnotatedElementUtils.getMergedRepeatableAnnotations(
                                method, Scheduled.class, Schedules.class);
                        return (!scheduledMethods.isEmpty() ? scheduledMethods : null);
                    });
            if (annotatedMethods.isEmpty()) {
                this.nonAnnotatedClasses.add(targetClass);
                if (logger.isTraceEnabled()) {
                    logger.trace("No @Scheduled annotations found on bean class: " + targetClass);
                }
            }
            else {
                // Non-empty set of methods
                annotatedMethods.forEach((method, scheduledMethods) ->
                        // 处理 scheduled 相关信息
                        scheduledMethods.forEach(scheduled -> processScheduled(scheduled, method, bean)));
                if (logger.isTraceEnabled()) {
                    logger.trace(annotatedMethods.size() + " @Scheduled methods processed on bean '" + beanName +
                            "': " + annotatedMethods);
                }
            }
        }
        return bean;
    }
```

- 处理定时任务注解

```java
protected void processScheduled(Scheduled scheduled, Method method, Object bean) {
        try {
            Runnable runnable = createRunnable(bean, method);
            boolean processedSchedule = false;
            String errorMessage =
                    "Exactly one of the 'cron', 'fixedDelay(String)', or 'fixedRate(String)' attributes is required";

            Set<ScheduledTask> tasks = new LinkedHashSet<>(4);

            // Determine initial delay
            // 是否延迟执行
            long initialDelay = scheduled.initialDelay();
            // 延迟执行时间
            String initialDelayString = scheduled.initialDelayString();
            // 是否有延迟执行的时间
            if (StringUtils.hasText(initialDelayString)) {
                Assert.isTrue(initialDelay < 0, "Specify 'initialDelay' or 'initialDelayString', not both");
                if (this.embeddedValueResolver != null) {
                    initialDelayString = this.embeddedValueResolver.resolveStringValue(initialDelayString);
                }
                if (StringUtils.hasLength(initialDelayString)) {
                    try {
                        initialDelay = parseDelayAsLong(initialDelayString);
                    }
                    catch (RuntimeException ex) {
                        throw new IllegalArgumentException(
                                "Invalid initialDelayString value \"" + initialDelayString + "\" - cannot parse into long");
                    }
                }
            }

            // Check cron expression
            // 获取cron表达式
            String cron = scheduled.cron();
            // cron表达式是否存在
            if (StringUtils.hasText(cron)) {
                // 获取时区
                String zone = scheduled.zone();
                if (this.embeddedValueResolver != null) {
                    // 字符串转换
                    cron = this.embeddedValueResolver.resolveStringValue(cron);
                    zone = this.embeddedValueResolver.resolveStringValue(zone);
                }
                if (StringUtils.hasLength(cron)) {
                    // cron 是否延迟
                    Assert.isTrue(initialDelay == -1, "'initialDelay' not supported for cron triggers");
                    processedSchedule = true;
                    if (!Scheduled.CRON_DISABLED.equals(cron)) {
                        TimeZone timeZone;
                        if (StringUtils.hasText(zone)) {
                            // 时区解析
                            timeZone = StringUtils.parseTimeZoneString(zone);
                        }
                        else {
                            // 默认时区获取
                            timeZone = TimeZone.getDefault();
                        }
                        // 创建任务
                        tasks.add(this.registrar.scheduleCronTask(new CronTask(runnable, new CronTrigger(cron, timeZone))));
                    }
                }
            }

            // At this point we don't need to differentiate between initial delay set or not anymore
            if (initialDelay < 0) {
                initialDelay = 0;
            }

            // Check fixed delay
            // 获取间隔调用时间
            long fixedDelay = scheduled.fixedDelay();
            // 间隔时间>0
            if (fixedDelay >= 0) {
                Assert.isTrue(!processedSchedule, errorMessage);
                processedSchedule = true;
                // 创建任务,间隔时间定时任务
                tasks.add(this.registrar.scheduleFixedDelayTask(new FixedDelayTask(runnable, fixedDelay, initialDelay)));
            }
            // 延迟时间
            String fixedDelayString = scheduled.fixedDelayString();
            if (StringUtils.hasText(fixedDelayString)) {
                if (this.embeddedValueResolver != null) {
                    fixedDelayString = this.embeddedValueResolver.resolveStringValue(fixedDelayString);
                }
                if (StringUtils.hasLength(fixedDelayString)) {
                    Assert.isTrue(!processedSchedule, errorMessage);
                    processedSchedule = true;
                    try {
                        fixedDelay = parseDelayAsLong(fixedDelayString);
                    }
                    catch (RuntimeException ex) {
                        throw new IllegalArgumentException(
                                "Invalid fixedDelayString value \"" + fixedDelayString + "\" - cannot parse into long");
                    }
                    // 创建延迟时间任务
                    tasks.add(this.registrar.scheduleFixedDelayTask(new FixedDelayTask(runnable, fixedDelay, initialDelay)));
                }
            }

            // Check fixed rate
            // 获取调用频率
            long fixedRate = scheduled.fixedRate();
            if (fixedRate >= 0) {
                Assert.isTrue(!processedSchedule, errorMessage);
                processedSchedule = true;
                // 创建调用频率的定时任务
                tasks.add(this.registrar.scheduleFixedRateTask(new FixedRateTask(runnable, fixedRate, initialDelay)));
            }
            String fixedRateString = scheduled.fixedRateString();
            if (StringUtils.hasText(fixedRateString)) {
                if (this.embeddedValueResolver != null) {
                    fixedRateString = this.embeddedValueResolver.resolveStringValue(fixedRateString);
                }
                if (StringUtils.hasLength(fixedRateString)) {
                    Assert.isTrue(!processedSchedule, errorMessage);
                    processedSchedule = true;
                    try {
                        fixedRate = parseDelayAsLong(fixedRateString);
                    }
                    catch (RuntimeException ex) {
                        throw new IllegalArgumentException(
                                "Invalid fixedRateString value \"" + fixedRateString + "\" - cannot parse into long");
                    }
                    tasks.add(this.registrar.scheduleFixedRateTask(new FixedRateTask(runnable, fixedRate, initialDelay)));
                }
            }

            // Check whether we had any attribute set
            Assert.isTrue(processedSchedule, errorMessage);

            // Finally register the scheduled tasks
            synchronized (this.scheduledTasks) {
                // 定时任务注册
                Set<ScheduledTask> regTasks = this.scheduledTasks.computeIfAbsent(bean, key -> new LinkedHashSet<>(4));
                regTasks.addAll(tasks);
            }
        }
        catch (IllegalArgumentException ex) {
            throw new IllegalStateException(
                    "Encountered invalid @Scheduled method '" + method.getName() + "': " + ex.getMessage());
        }
    }
```

## 定时任务

- CronTask
  - cron 定时任务
- FixedDelayTask
  - 间隔时间的定时任务
- FixedRateTask
  - 调用频率的定时任务
- ScheduledTask
  - 定时任务对象

### cron 表达式解析

- `org.springframework.scheduling.support.CronSequenceGenerator.doParse`

```java
    private void doParse(String[] fields) {
        setNumberHits(this.seconds, fields[0], 0, 60);
        setNumberHits(this.minutes, fields[1], 0, 60);
        setNumberHits(this.hours, fields[2], 0, 24);
        setDaysOfMonth(this.daysOfMonth, fields[3]);
        setMonths(this.months, fields[4]);
        setDays(this.daysOfWeek, replaceOrdinals(fields[5], "SUN,MON,TUE,WED,THU,FRI,SAT"), 8);

        if (this.daysOfWeek.get(7)) {
            // Sunday can be represented as 0 or 7
            this.daysOfWeek.set(0);
            this.daysOfWeek.clear(7);
        }
    }

```

### 执行定时任务

- 这里以 CronTask 任务进行分析,其他定时任务同理
  - `org.springframework.scheduling.config.ScheduledTaskRegistrar.scheduleCronTask`

```java
    @Nullable
    public ScheduledTask scheduleCronTask(CronTask task) {
        // 从未执行的任务列表中删除,并且获取这个任务
        ScheduledTask scheduledTask = this.unresolvedTasks.remove(task);
        boolean newTask = false;
        // 没有这个任务
        if (scheduledTask == null) {
            scheduledTask = new ScheduledTask(task);
            newTask = true;
        }
        // 任务调度器是否为空
        if (this.taskScheduler != null) {

            scheduledTask.future = this.taskScheduler.schedule(task.getRunnable(), task.getTrigger());
        }
        else {
            // 添加到cron任务列表
            addCronTask(task);
            // 保存到没有执行的任务中
            this.unresolvedTasks.put(task, scheduledTask);
        }
        return (newTask ? scheduledTask : null);
    }

```
