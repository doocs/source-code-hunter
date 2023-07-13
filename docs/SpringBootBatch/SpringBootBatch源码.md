# SpringBootBatch 源码

## 加载

版本使用 2.7.13

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-dependencies</artifactId>
    <version>2.7.13</version>
    <scope>import</scope>
    <type>pom</type>
</dependency>
```

> spring-autoconfigure-metadata.properties

```properties
org.springframework.boot.autoconfigure.batch.BatchAutoConfiguration=
org.springframework.boot.autoconfigure.batch.BatchAutoConfiguration$DataSourceInitializerConfiguration=
org.springframework.boot.autoconfigure.batch.BatchAutoConfiguration$DataSourceInitializerConfiguration.ConditionalOnBean=javax.sql.DataSource
org.springframework.boot.autoconfigure.batch.BatchAutoConfiguration$DataSourceInitializerConfiguration.ConditionalOnClass=org.springframework.jdbc.datasource.init.DatabasePopulator
org.springframework.boot.autoconfigure.batch.BatchAutoConfiguration.AutoConfigureAfter=org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration
org.springframework.boot.autoconfigure.batch.BatchAutoConfiguration.ConditionalOnBean=org.springframework.batch.core.launch.JobLauncher
org.springframework.boot.autoconfigure.batch.BatchAutoConfiguration.ConditionalOnClass=javax.sql.DataSource,org.springframework.batch.core.launch.JobLauncher
org.springframework.boot.autoconfigure.batch.BatchConfigurerConfiguration=
org.springframework.boot.autoconfigure.batch.BatchConfigurerConfiguration$JpaBatchConfiguration=
org.springframework.boot.autoconfigure.batch.BatchConfigurerConfiguration$JpaBatchConfiguration.ConditionalOnBean=
org.springframework.boot.autoconfigure.batch.BatchConfigurerConfiguration$JpaBatchConfiguration.ConditionalOnClass=javax.persistence.EntityManagerFactory
org.springframework.boot.autoconfigure.batch.BatchConfigurerConfiguration.ConditionalOnBean=javax.sql.DataSource
org.springframework.boot.autoconfigure.batch.BatchConfigurerConfiguration.ConditionalOnClass=org.springframework.transaction.PlatformTransactionManager
```

### @EnableBatchProcessing

启动首先添加`@EnableBatchProcessing`，这个类引入了`BatchConfigurationSelector`.

#### BatchConfigurationSelector

这里面主要是判断`modular`决定加载`ModularBatchConfiguration`还是`SimpleBatchConfiguration`

##### SimpleBatchConfiguration

这个类继承了`AbstractBatchConfiguration`。因为继承了`InitializingBean`执行`afterPropertiesSet`
,创建出俩个类`jobBuilderFactory`和 `stepBuilderFactory`.

###### JobBuilderFactory

JobBuilderFactory 需要`jobRepository`。`SimpleBatchConfiguration#jobRepository()`
方法，进入`SimpleBatchConfiguration#createLazyProxy(AtomicReference<T> reference, Class<T> type)`。
是使用`ProxyFactory`构建出代理对象，`Advice`使用`PassthruAdvice`类。
关键是`TargetSource`属性，使用`ReferenceTargetSource`类继承了`AbstractLazyCreationTargetSource`，这是 aop 中`TargetSource`
，一种懒加载方式。在`ReferenceTargetSource#createObject()`中调用了`initialize`方法。
接着进入`initialize`方法

```java
/**
 * Sets up the basic components by extracting them from the {@link BatchConfigurer configurer}, defaulting to some
 * sensible values as long as a unique DataSource is available.
 *
 * @throws Exception if there is a problem in the configurer
 */
protected void initialize() throws Exception {
    if (initialized) {
        return;
    }
    BatchConfigurer configurer = getConfigurer(context.getBeansOfType(BatchConfigurer.class).values());
    jobRepository.set(configurer.getJobRepository());
    jobLauncher.set(configurer.getJobLauncher());
    transactionManager.set(configurer.getTransactionManager());
    jobRegistry.set(new MapJobRegistry());
    jobExplorer.set(configurer.getJobExplorer());
    initialized = true;
}
```

> BatchConfigurer configurer=getConfigurer(context.getBeansOfType(BatchConfigurer.class).values());

```java
protected BatchConfigurer getConfigurer(Collection<BatchConfigurer> configurers) throws Exception {
    if (this.configurer != null) {
        return this.configurer;
    }
    if (configurers == null || configurers.isEmpty()) {
        if (dataSource == null) {
            DefaultBatchConfigurer configurer = new DefaultBatchConfigurer();
            configurer.initialize();
            this.configurer = configurer;
            return configurer;
        } else {
            DefaultBatchConfigurer configurer = new DefaultBatchConfigurer(dataSource);
            configurer.initialize();
            this.configurer = configurer;
            return configurer;
        }
    }
    if (configurers.size() > 1) {
        throw new IllegalStateException(
                "To use a custom BatchConfigurer the context must contain precisely one, found "
                        + configurers.size());
    }
    this.configurer = configurers.iterator().next();
    return this.configurer;
}
```

从 spring 中获取 `BatchConfigurer`，没有使用 `DefaultBatchConfigurer`，并调用 `configurer.initialize()`

1. 获取所有的`BatchConfigurer`类，进入`AbstractBatchConfiguration#getConfigurer`
   方法。如果为空就创建一个`DefaultBatchConfigurer`，并执行`configurer.initialize();`方法，`DefaultBatchConfigurer`后面单独讲。
2. 这里的`JobRepository`，`JobLauncher`，`JobRegistry`，`PlatformTransactionManager`，`JobExplorer`都是使用`AtomicReference`
   原子性封装的。把`initialized`设置为 true，只允许初始化一次

现在`JobRepository`，`JobLauncher`，`JobRegistry`，`PlatformTransactionManager`，`JobExplorer`5 个类就全部初始化好了，

###### stepBuilderFactory

与上面一样，只不过初始化过了，就不会再初始化，直接获取值（注意：这里的都是使用`AbstractLazyCreationTargetSource`
创建代理对象，都是懒加载的）。

## 使用

首先弄清楚类直接关系，不使用数据库。所以所有默认，使用刚刚我们看过的源码默认创建的类就好了。
我们使用`SimpleBatchConfiguration`进行讲解

这里需要设置`spring.batch.job.enabled`为 false，不然会加载`BatchAutoConfiguration#jobLauncherApplicationRunner`类，启动的时候会执行
job。`BatchProperties`类放在`BatchAutoConfiguration`类中讲解

> BatchConfig

```java

@Configuration
@EnableBatchProcessing
public class BatchConfig {

    @Autowired
    JobBuilderFactory jobBuilders;

    @Autowired
    StepBuilderFactory stepBuilders;

    @Bean
    public Job footballjob() {
        return jobBuilders.get("test-job")
                .start(step())
                .build();
    }

    @Bean
    public Step step() {
        return stepBuilders.get("test-step")
                .<Integer, Integer>chunk(2)
                .reader(itemReader())
                .writer(itemWriter())
                .build();
    }


    @Bean
    public ItemReader<Integer> itemReader() {
        return new ItemReader<Integer>() {
            final AtomicInteger atomicInteger = new AtomicInteger();

            @Override
            public Integer read() throws UnexpectedInputException, ParseException, NonTransientResourceException {
                if (atomicInteger.compareAndSet(10, 0)) {
                    return null;
                }
                atomicInteger.getAndIncrement();
                return atomicInteger.intValue();
            }
        };
    }

    @Bean
    public ItemWriter<Integer> itemWriter() {
        return new ItemWriter<Integer>() {
            @Override
            public void write(List<? extends Integer> items) {
                System.out.println("一次读取：" + Arrays.toString(items.toArray()));
            }
        };

    }
}
```

### Step

使用`JobBuilderFactory`创建出`Step`。`JobBuilderFactory`在上面`AbstractBatchConfiguration`中创建了。

```java
@Bean
public Step step() {
    TaskletStep taskletStep = stepBuilders.get("test-step")
            .<Integer, Integer>chunk(2)
            .reader(itemReader())
            .writer(itemWriter())
            .listener(new StepExecutionListener() {
                @Override
                public void beforeStep(StepExecution stepExecution) {
                    System.out.println("step-我是beforeJob--" + stepExecution);
                }

                @Override
                public ExitStatus afterStep(StepExecution stepExecution) {
                    System.out.println("step-我是beforeJob--" + stepExecution);
                    return stepExecution.getExitStatus();
                }
            })
//                .startLimit(2)
            .build();

    taskletStep.setAllowStartIfComplete(true);
    return taskletStep;
}
```

#### stepBuilders.get("test-stop")

`StepBuilderFactory`只有一个方法 get

```java
public StepBuilder get(String name) {
    StepBuilder builder = new StepBuilder(name).repository(jobRepository).transactionManager(
            transactionManager);
    return builder;
}
```

`stepBuilders.get("test-stop")`创建一个`StepBuilder`。

`StepBuilder` 继承`StepBuilderHelper<StepBuilder>`，`StepBuilderHelper`
中有个`protected final CommonStepProperties properties;`属性。
对`CommonStepProperties`中`name`，`JobRepository`和`PlatformTransactionManager`进行赋值。

#### <Integer, Integer>chunk(2)

```java
/**
 * Build a step that processes items in chunks with the size provided. To extend the step to being fault tolerant,
 * call the {@link SimpleStepBuilder#faultTolerant()} method on the builder. In most cases you will want to
 * parameterize your call to this method, to preserve the type safety of your readers and writers, e.g.
 *
 * <pre>
 * new StepBuilder(&quot;step1&quot;).&lt;Order, Ledger&gt; chunk(100).reader(new OrderReader()).writer(new LedgerWriter())
 * // ... etc.
 * </pre>
 *
 * @param chunkSize the chunk size (commit interval)
 * @return a {@link SimpleStepBuilder}
 * @param <I> the type of item to be processed as input
 * @param <O> the type of item to be output
 */
public<I, O> SimpleStepBuilder<I, O> chunk(int chunkSize){
    return new SimpleStepBuilder<I, O>(this).chunk(chunkSize);
}
```

创建一个`SimpleStepBuilder`，并确定泛型，设置一个`chunkSize`
大小。翻译一下注释`构建一个步骤，以提供的大小分块处理项目。要将步骤扩展为容错，请在构建器上调用SimpleStepBuilder.faultTolerant()方法。在大多数情况下，您需要参数化对此方法的调用，以保护读者和作者的类型安全`
，chunkSize – 块大小（提交间隔）。
接下来都是操作`SimpleStepBuilder`类。这个大小也就是是每次读取多少次。
`SimpleStepBuilder`继承`AbstractTaskletStepBuilder<SimpleStepBuilder<I, O>>`
类。`AbstractTaskletStepBuilder<SimpleStepBuilder<I, O>>`也是继承`StepBuilderHelper<AbstractTaskletStepBuilder<B>>`。

#### .reader(itemReader())

这里就是读取，需要一个`ItemReader<? extends I> reader`对象。
创建一个

```java
@Bean
public ItemReader<Integer> itemReader() {
    return new ItemReader<Integer>() {
        final AtomicInteger atomicInteger = new AtomicInteger();

        @Override
        public Integer read() throws UnexpectedInputException, ParseException, NonTransientResourceException {
            if (atomicInteger.compareAndSet(10, 0)) {
                return null;
            }
            atomicInteger.getAndIncrement();
            return atomicInteger.intValue();
        }
    };
}
```

每次读取 1 个值，总共读取 10 个值。返回 null 表示没有数据了。

#### .writer(itemWriter())

与上面一样。这里的泛型要注意，是根据`.<Integer, Integer>chunk(2)`进行确认的，前面 Integer 表示`reader`
返回值，后面表示`writer`入参。

```java
@Bean
public ItemWriter<Integer> itemWriter() {
    return new ItemWriter<Integer>() {
        @Override
        public void write(List<? extends Integer> items) {
            System.out.println("一次读取：" + Arrays.toString(items.toArray()));
        }
    };
}
```

#### .build();

```java
/**
 * Build a step with the reader, writer, processor as provided.
 *
 * @see org.springframework.batch.core.step.builder.AbstractTaskletStepBuilder#build()
 */
@Override
public TaskletStep build() {
    registerStepListenerAsItemListener();
    registerAsStreamsAndListeners(reader, processor, writer);
    return super.build();
}
```

`registerStepListenerAsItemListener()`：注册监听器，`ItemReadListener`,`ItemProcessListener`,`ItemWriteListener`.

`registerAsStreamsAndListeners`：注册`ItemStream`，`StepListenerMetaData`
中的所有接口，`StepExecutionListener`，`ChunkListener`,`ItemReadListener`,`ItemProcessListener`和`ItemWriteListener`.

`AbstractListenerFactoryBean.isListener(delegate, StepListener.class, StepListenerMetaData.values());`进行判断

```java
BEFORE_STEP("beforeStep","before-step-method",BeforeStep.class,StepExecutionListener.class,StepExecution.class),
AFTER_STEP("afterStep","after-step-method",AfterStep.class,StepExecutionListener.class,StepExecution.class),
BEFORE_CHUNK("beforeChunk","before-chunk-method",BeforeChunk.class,ChunkListener.class,ChunkContext.class),
AFTER_CHUNK("afterChunk","after-chunk-method",AfterChunk.class,ChunkListener.class,ChunkContext.class),
AFTER_CHUNK_ERROR("afterChunkError","after-chunk-error-method",AfterChunkError.class,ChunkListener.class,ChunkContext.class),
BEFORE_READ("beforeRead","before-read-method",BeforeRead.class,ItemReadListener.class),
AFTER_READ("afterRead","after-read-method",AfterRead.class,ItemReadListener.class,Object.class),
ON_READ_ERROR("onReadError","on-read-error-method",OnReadError.class,ItemReadListener.class,Exception.class),
BEFORE_PROCESS("beforeProcess","before-process-method",BeforeProcess.class,ItemProcessListener.class,Object.class),
AFTER_PROCESS("afterProcess","after-process-method",AfterProcess.class,ItemProcessListener.class,Object.class,Object.class),
ON_PROCESS_ERROR("onProcessError","on-process-error-method",OnProcessError.class,ItemProcessListener.class,Object.class,Exception.class),
BEFORE_WRITE("beforeWrite","before-write-method",BeforeWrite.class,ItemWriteListener.class,List.class),
AFTER_WRITE("afterWrite","after-write-method",AfterWrite.class,ItemWriteListener.class,List.class),
ON_WRITE_ERROR("onWriteError","on-write-error-method",OnWriteError.class,ItemWriteListener.class,Exception.class,List.class),
ON_SKIP_IN_READ("onSkipInRead","on-skip-in-read-method",OnSkipInRead.class,SkipListener.class,Throwable.class),
ON_SKIP_IN_PROCESS("onSkipInProcess","on-skip-in-process-method",OnSkipInProcess.class,SkipListener.class,Object.class,Throwable.class),
ON_SKIP_IN_WRITE("onSkipInWrite","on-skip-in-write-method",OnSkipInWrite.class,SkipListener.class,Object.class,Throwable.class);
```

这些监听器之类的后面单独讲，所有这些之类的顶级接口`StepListener`。

> super.build();

```java
public TaskletStep build() {

    registerStepListenerAsChunkListener();

    TaskletStep step = new TaskletStep(getName());

    super.enhance(step);

    step.setChunkListeners(chunkListeners.toArray(new ChunkListener[0]));

    if (transactionAttribute != null) {
        step.setTransactionAttribute(transactionAttribute);
    }

    if (stepOperations == null) {

        stepOperations = new RepeatTemplate();

        if (taskExecutor != null) {
            TaskExecutorRepeatTemplate repeatTemplate = new TaskExecutorRepeatTemplate();
            repeatTemplate.setTaskExecutor(taskExecutor);
            repeatTemplate.setThrottleLimit(throttleLimit);
            stepOperations = repeatTemplate;
        }

        ((RepeatTemplate) stepOperations).setExceptionHandler(exceptionHandler);

    }
    step.setStepOperations(stepOperations);
    step.setTasklet(createTasklet());

    step.setStreams(streams.toArray(new ItemStream[0]));

    try {
        step.afterPropertiesSet();
    } catch (Exception e) {
        throw new StepBuilderException(e);
    }

    return step;

}
```

###### super.enhance(step);

把`CommonStepProperties`中的`jobRepository`,`allowStartIfComplete`，`startLimit`和`stepExecutionListeners`赋值给`step`.

> RepeatOperations

注释翻译后：批处理模板实现的简单实现 RepeatOperations 和基类。提供包含拦截器和策略的框架。子类只需要提供一个获取下一个结果的方法，以及一个等待所有结果从并发进程或线程返回的方法。
注意：模板在迭代过程中累积抛出的异常，当主循环结束时（即完成对项目的处理），它们都会一起处理。不希望在引发异常时停止执行的客户端可以使用在收到异常时未完成的特定
CompletionPolicy 。这不是默认行为。
想要在 引发 RepeatCallback 异常时执行某些业务操作的客户端可以考虑使用自定义，而不是尝试自定义 RepeatListener
CompletionPolicy.这通常是一个更友好的接口来实现，该方法在回调的结果中传递，如果业务处理抛出异常， RepeatListener.after(
RepeatContext, RepeatStatus) 这将是一个实例 Throwable 。
如果不将异常传播到调用方，则还需要提供非默认值 CompletionPolicy ，但这可能是现成的，业务操作仅在拦截器中实现。

taskExecutor：一般用来设置线程池线程池。这里我们也没有设置这个值。

((RepeatTemplate) stepOperations).setExceptionHandler(exceptionHandler);：异常处理，默认抛出异常，`DefaultExceptionHandler`
类。

> step.setStepOperations(stepOperations);

赋值给 step

> step.setTasklet(createTasklet());

```java
@Override
protected Tasklet createTasklet() {
    Assert.state(reader != null, "ItemReader must be provided");
    Assert.state(writer != null, "ItemWriter must be provided");
    RepeatOperations repeatOperations = createChunkOperations();
    SimpleChunkProvider<I> chunkProvider = new SimpleChunkProvider<>(getReader(), repeatOperations);
    SimpleChunkProcessor<I, O> chunkProcessor = new SimpleChunkProcessor<>(getProcessor(), getWriter());
    chunkProvider.setListeners(new ArrayList<>(itemListeners));
    chunkProcessor.setListeners(new ArrayList<>(itemListeners));
    ChunkOrientedTasklet<I> tasklet = new ChunkOrientedTasklet<>(chunkProvider, chunkProcessor);
    tasklet.setBuffering(!readerTransactionalQueue);
    return tasklet;
}
```

`createChunkOperations();`：重复处理类，这里也是`RepeatTemplate`。

```java
protected RepeatOperations createChunkOperations() {
    RepeatOperations repeatOperations = chunkOperations;
    if (repeatOperations == null) {
        RepeatTemplate repeatTemplate = new RepeatTemplate();
        repeatTemplate.setCompletionPolicy(getChunkCompletionPolicy());
        repeatOperations = repeatTemplate;
    }
    return repeatOperations;
}
```

里面的`repeatTemplate.setCompletionPolicy(getChunkCompletionPolicy());`。

```java
/**
 * @return a {@link CompletionPolicy} consistent with the chunk size and injected policy (if present).
 */
protected CompletionPolicy getChunkCompletionPolicy() {
    Assert.state(!(completionPolicy != null && chunkSize > 0),
            "You must specify either a chunkCompletionPolicy or a commitInterval but not both.");
    Assert.state(chunkSize >= 0, "The commitInterval must be positive or zero (for default value).");

    if (completionPolicy != null) {
        return completionPolicy;
    }
    if (chunkSize == 0) {
        if (logger.isInfoEnabled()) {
            logger.info("Setting commit interval to default value (" + DEFAULT_COMMIT_INTERVAL + ")");
        }
        chunkSize = DEFAULT_COMMIT_INTERVAL;
    }
    return new SimpleCompletionPolicy(chunkSize);
}
```

每次处理大小：`在固定数量的操作后终止批处理的策略。维护内部状态并增加计数器，因此成功使用此策略需要每个批处理项仅调用一次isComplete()。使用标准的RepeatTemplate应确保保留此合同，但需要仔细监控。`
留心观察一下就会发现，这个值是`.<Integer, Integer>chunk(2)`这里的
2，里面还可以传一个` chunk(CompletionPolicy completionPolicy)`。

`SimpleStepBuilder#createTasklet()`创建一个`ChunkOrientedTasklet`。里面有俩个属性`chunkProvider`和`chunkProcessor`。

> SimpleChunkProvider<I> chunkProvider = new SimpleChunkProvider<>(getReader(), repeatOperations);

然后创建`SimpleChunkProvider`对象，`getReader()`就是`ItemReader`,`repeatOperations`就是`SimpleCompletionPolicy`。

> impleChunkProcessor<I, O> chunkProcessor = new SimpleChunkProcessor<>(getProcessor(), getWriter());

`getProcessor()`：就是`processor(Function<? super I, ? extends O> function)`,`stepBuilders.get().processor()`里面的值。

使用`chunkProvider, chunkProcessor`构建出`ChunkOrientedTasklet`返回给`step`的`tasklet`。

```java
/**
 * Public setter for the {@link Tasklet}.
 *
 * @param tasklet the {@link Tasklet} to set
 */
public void setTasklet(Tasklet tasklet) {
    this.tasklet = tasklet;
    if (tasklet instanceof StepExecutionListener) {
        registerStepExecutionListener((StepExecutionListener) tasklet);
    }
}
```

这里默认构建出来的不是`StepExecutionListener`。是`ChunkOrientedTasklet`。这里不是主体流程，下面补充。

> step.afterPropertiesSet();

里面就是一些校验了。

### Job

使用`JobBuilderFactory`创建出`Step`。`JobBuilderFactory`在上面`AbstractBatchConfiguration`创建了。

```java
@Bean
public Job footballjob() {
    return jobBuilders.get("test")
            .start(step())
            .build();
}
```

#### jobBuilders.get("test")

与 step 基本一样，先创建`JobBuilder`。 `Flow`下面单独讲。

#### .start(step())

```java
/**
 * Create a new job builder that will execute a step or sequence of steps.
 *
 * @param step a step to execute
 * @return a {@link SimpleJobBuilder}
 */
public SimpleJobBuilder start(Step step) {
    return new SimpleJobBuilder(this).start(step);
}
```

创建一个`SimpleJobBuilder`，set 属性`    private List<Step> steps = new ArrayList<>();`。

#### .build();

```java
public Job build() {
    if (builder != null) {
        return builder.end().build();
    }
    SimpleJob job = new SimpleJob(getName());
    super.enhance(job);
    job.setSteps(steps);
    try {
        job.afterPropertiesSet();
    } catch (Exception e) {
        throw new JobBuilderException(e);
    }
    return job;
}
```

真正构建出来的是`SimpleJob`对象。

> super.enhance(job);

```java
protected void enhance(Job target) {
    if (target instanceof AbstractJob) {
        AbstractJob job = (AbstractJob) target;
        job.setJobRepository(properties.getJobRepository());
        JobParametersIncrementer jobParametersIncrementer = properties.getJobParametersIncrementer();
        if (jobParametersIncrementer != null) {
            job.setJobParametersIncrementer(jobParametersIncrementer);
        }
        JobParametersValidator jobParametersValidator = properties.getJobParametersValidator();
        if (jobParametersValidator != null) {
            job.setJobParametersValidator(jobParametersValidator);
        }
        Boolean restartable = properties.getRestartable();
        if (restartable != null) {
            job.setRestartable(restartable);
        }
        List<JobExecutionListener> listeners = properties.getJobExecutionListeners();
        if (!listeners.isEmpty()) {
            job.setJobExecutionListeners(listeners.toArray(new JobExecutionListener[0]));
        }
    }
}
```

把`CommonJobProperties properties`的属性赋值，比如`JobRepository`，`JobParametersIncrementer`，`JobParametersValidator`
和`Restartable`.

> job.setJobExecutionListeners(listeners.toArray(new JobExecutionListener[0]));

```java
List<JobExecutionListener> listeners = properties.getJobExecutionListeners();
if (!listeners.isEmpty()) {
    job.setJobExecutionListeners(listeners.toArray(new JobExecutionListener[0]));
}
```

获取里面的`JobExecutionListener`set。

> job.setSteps(steps);

里面所有的`steps`。

> job.afterPropertiesSet();

一些校验

### JobLauncher

真正的使用类，在 spring-boot 中`ApplicationRunner`
也是使用这个`JobLauncherApplicationRunner#executeRegisteredJobs(JobParameters jobParameters)`。

```java
@RestController
public class BatchController {

    @Autowired
    JobLauncher jobLauncher;

    @Autowired
    Job footballjob;


    @GetMapping("/batch")
    public String getBatch() throws JobInstanceAlreadyCompleteException, JobExecutionAlreadyRunningException, JobParametersInvalidException, JobRestartException {
        JobParameters jobParameters = new JobParametersBuilder().toJobParameters();
        jobLauncher.run(footballjob, jobParameters);
        return "batch";
    }
}
```

`JobParameters`下面单独讲解。

`JobLauncher`对象在`SimpleBatchConfiguration`中使用懒加载的代理对象创建出来的。

`Job`是上面我们自己创建的。

进入到`SimpleJobLauncher#run(final Job job, final JobParameters jobParameters)`中。

#### `JobExecution lastExecution = jobRepository.getLastJobExecution(job.getName(), jobParameters);`

```java
@Override
@Nullable
public JobExecution getLastJobExecution(String jobName, JobParameters jobParameters) {
    JobInstance jobInstance = jobInstanceDao.getJobInstance(jobName, jobParameters);
    if (jobInstance == null) {
        return null;
    }
    JobExecution jobExecution = jobExecutionDao.getLastJobExecution(jobInstance);

    if (jobExecution != null) {
        jobExecution.setExecutionContext(ecDao.getExecutionContext(jobExecution));
        stepExecutionDao.addStepExecutions(jobExecution);
    }
    return jobExecution;

}
```

`MapJobInstanceDao`已弃用 从 v4.3 开始，赞成使用 与 JdbcJobInstanceDao 内存数据库一起使用。计划在 v5.0 中删除。

`MapJobInstanceDao#getJobInstance`，第一次进来是获取不到的，直接返回 null。

#### job.getJobParametersValidator().validate(jobParameters);

校验参数。我们没填。

#### jobExecution = jobRepository.createJobExecution(job.getName(), jobParameters);

创建一个`JobExecution`

`SimpleJobRepository#createJobExecution(String jobName, JobParameters jobParameters)`

```java
@Override
public JobExecution createJobExecution(String jobName, JobParameters jobParameters) {
    JobInstance jobInstance = jobInstanceDao.getJobInstance(jobName, jobParameters);
    ExecutionContext executionContext;
    if (jobInstance != null) {
        List<JobExecution> executions = jobExecutionDao.findJobExecutions(jobInstance);
        if (executions.isEmpty()) {
            throw new IllegalStateException("Cannot find any job execution for job instance: " + jobInstance);
        }
        for (JobExecution execution : executions) {
            if (execution.isRunning() || execution.isStopping()) {
                throw new JobExecutionAlreadyRunningException("A job execution for this job is already running: "
                        + jobInstance);
            }
            BatchStatus status = execution.getStatus();
            if (status == BatchStatus.UNKNOWN) {
                throw new JobRestartException("Cannot restart job from UNKNOWN status. "
                        + "The last execution ended with a failure that could not be rolled back, "
                        + "so it may be dangerous to proceed. Manual intervention is probably necessary.");
            }
            Collection<JobParameter> allJobParameters = execution.getJobParameters().getParameters().values();
            long identifyingJobParametersCount = allJobParameters.stream().filter(JobParameter::isIdentifying).count();
            if (identifyingJobParametersCount > 0 && (status == BatchStatus.COMPLETED || status == BatchStatus.ABANDONED)) {
                throw new JobInstanceAlreadyCompleteException(
                        "A job instance already exists and is complete for parameters=" + jobParameters
                                + ".  If you want to run this job again, change the parameters.");
            }
        }
        executionContext = ecDao.getExecutionContext(jobExecutionDao.getLastJobExecution(jobInstance));
    } else {
        // no job found, create one
        jobInstance = jobInstanceDao.createJobInstance(jobName, jobParameters);
        executionContext = new ExecutionContext();
    }
    JobExecution jobExecution = new JobExecution(jobInstance, jobParameters, null);
    jobExecution.setExecutionContext(executionContext);
    jobExecution.setLastUpdated(new Date(System.currentTimeMillis()));
    // Save the JobExecution so that it picks up an ID (useful for clients
    // monitoring asynchronous executions):
    jobExecutionDao.saveJobExecution(jobExecution);
    ecDao.saveExecutionContext(jobExecution);
    return jobExecution;
}
```

首先`JobInstance jobInstance = jobInstanceDao.getJobInstance(jobName, jobParameters);`。这里的`jobInstanceDao`是
Mapxxx，注意这几个类都是过时的，我们先把流程弄懂在看这些细节。
为空，去到`else`。

##### jobInstanceDao#createJobInstance(String jobName, JobParameters jobParameters)

```java
@Override
public JobInstance createJobInstance(String jobName, JobParameters jobParameters) {
    Assert.state(getJobInstance(jobName, jobParameters) == null, "JobInstance must not already exist");
    JobInstance jobInstance = new JobInstance(currentId.getAndIncrement(), jobName);
    jobInstance.incrementVersion();
    jobInstances.put(jobName + "|" + jobKeyGenerator.generateKey(jobParameters), jobInstance);
    return jobInstance;
}
```

就是`Map<String, JobInstance> jobInstances = new ConcurrentHashMap<>();`put
了一个值。后面`jobKeyGenerator.generateKey(jobParameters)`默认为一个 md5 加密算法。
现在`MapJobInstanceDao#jobInstances`就有值了。接着回到`SimpleJobRepository`类。

这里有个地方需要注意，这些类都是一些代理对象，使用代理类懒加载的。断点打在实现类上就好了！

##### executionContext = new ExecutionContext();

里面维护了一个`dirty`和`Map<String, Object> map`。

##### JobExecution

接着创建一个`JobExecution`对象。继承了`Entity`对象。
把`ExecutionContext`赋值。
最后修改时间赋值为当前时间。
这个类里面关注`jobParameters`和`jobInstance`对象。`jobInstanceDao`创建的`jobInstance`对象。

##### jobExecutionDao.saveJobExecution(jobExecution);

```java
Assert.isTrue(jobExecution.getId() == null, "jobExecution id is not null");
Long newId = currentId.getAndIncrement();
jobExecution.setId(newId);
jobExecution.incrementVersion();
executionsById.put(newId, copy(jobExecution));
```

来到`MapJobExecutionDao`类，这 4 个`Dao`后面单独讲解。现在都是使用 MapxxxDao。

里面有一个`ConcurrentMap<Long, JobExecution> executionsById = new ConcurrentHashMap<>();`
和`AtomicLong currentId = new AtomicLong(0L);`

版本号和值加一，并且存入 map 中，如果是数据库，就会存入数据库。逻辑基本一致。

##### ecDao.saveExecutionContext(jobExecution);

```java
@Override
public void saveExecutionContext(JobExecution jobExecution) {
    updateExecutionContext(jobExecution);
}

@Override
public void updateExecutionContext(JobExecution jobExecution) {
    ExecutionContext executionContext = jobExecution.getExecutionContext();
    if (executionContext != null) {
        contexts.put(ContextKey.job(jobExecution.getId()), copy(executionContext));
    }
}
```

值放入`ConcurrentMap<ContextKey, ExecutionContext> contexts = TransactionAwareProxyFactory.createAppendOnlyTransactionalMap()`
中

#### taskExecutor.execute(new Runnable() )

```java
try {
    taskExecutor.execute(new Runnable() {
        @Override
        public void run() {
            try {
                job.execute(jobExecution);
            } catch (Throwable t) {
                rethrow(t);
            }
        }

        private void rethrow(Throwable t) {
            if (t instanceof RuntimeException) {
                throw (RuntimeException) t;
            } else if (t instanceof Error) {
                throw (Error) t;
            }
            throw new IllegalStateException(t);
        }
    });
} catch (TaskRejectedException e) {
    jobExecution.upgradeStatus(BatchStatus.FAILED);
    if (jobExecution.getExitStatus().equals(ExitStatus.UNKNOWN)) {
        jobExecution.setExitStatus(ExitStatus.FAILED.addExitDescription(e));
    }
    jobRepository.update(jobExecution);
}
```

`taskExecutor`是在`afterPropertiesSet()`方法创建的，为`SyncTaskExecutor`
。这个是在`DefaultBatchConfigurer#createJobLauncher()`中调用。

这里主要就是俩行代码

执行`job.execute(jobExecution);`，出现异常执行`rethrow(t);`。

##### job.execute(jobExecution execution)

job 是`SimpleJob`类。进入`AbstractJob#execute(JobExecution execution)`方法。

```java
@Override
public final void execute(JobExecution execution) {
    Assert.notNull(execution, "jobExecution must not be null");
    if (logger.isDebugEnabled()) {
        logger.debug("Job execution starting: " + execution);
    }
    JobSynchronizationManager.register(execution);
    LongTaskTimer longTaskTimer = BatchMetrics.createLongTaskTimer("job.active", "Active jobs",
            Tag.of("name", execution.getJobInstance().getJobName()));
    LongTaskTimer.Sample longTaskTimerSample = longTaskTimer.start();
    Timer.Sample timerSample = BatchMetrics.createTimerSample();
    try {
        jobParametersValidator.validate(execution.getJobParameters());
        if (execution.getStatus() != BatchStatus.STOPPING) {
            execution.setStartTime(new Date());
            updateStatus(execution, BatchStatus.STARTED);
            listener.beforeJob(execution);
            try {
                doExecute(execution);
                if (logger.isDebugEnabled()) {
                    logger.debug("Job execution complete: " + execution);
                }
            } catch (RepeatException e) {
                throw e.getCause();
            }
        } else {
            // The job was already stopped before we even got this far. Deal
            // with it in the same way as any other interruption.
            execution.setStatus(BatchStatus.STOPPED);
            execution.setExitStatus(ExitStatus.COMPLETED);
            if (logger.isDebugEnabled()) {
                logger.debug("Job execution was stopped: " + execution);
            }
        }
    } catch (JobInterruptedException e) {
        if (logger.isInfoEnabled()) {
            logger.info("Encountered interruption executing job: "
                    + e.getMessage());
        }
        if (logger.isDebugEnabled()) {
            logger.debug("Full exception", e);
        }
        execution.setExitStatus(getDefaultExitStatusForFailure(e, execution));
        execution.setStatus(BatchStatus.max(BatchStatus.STOPPED, e.getStatus()));
        execution.addFailureException(e);
    } catch (Throwable t) {
        logger.error("Encountered fatal error executing job", t);
        execution.setExitStatus(getDefaultExitStatusForFailure(t, execution));
        execution.setStatus(BatchStatus.FAILED);
        execution.addFailureException(t);
    } finally {
        try {
            if (execution.getStatus().isLessThanOrEqualTo(BatchStatus.STOPPED)
                    && execution.getStepExecutions().isEmpty()) {
                ExitStatus exitStatus = execution.getExitStatus();
                ExitStatus newExitStatus =
                        ExitStatus.NOOP.addExitDescription("All steps already completed or no steps configured for this job.");
                execution.setExitStatus(exitStatus.and(newExitStatus));
            }
            timerSample.stop(BatchMetrics.createTimer("job", "Job duration",
                    Tag.of("name", execution.getJobInstance().getJobName()),
                    Tag.of("status", execution.getExitStatus().getExitCode())
            ));
            longTaskTimerSample.stop();
            execution.setEndTime(new Date());
            try {
                listener.afterJob(execution);
            } catch (Exception e) {
                logger.error("Exception encountered in afterJob callback", e);
            }
            jobRepository.update(execution);
        } finally {
            JobSynchronizationManager.release();
        }
    }
}
```

##### JobSynchronizationManager.register(execution);

```java
@Nullable
public C register(@Nullable E execution) {
    if (execution == null) {
        return null;
    }
    getCurrent().push(execution);
    C context;
    synchronized (contexts) {
        context = contexts.get(execution);
        if (context == null) {
            context = createNewContext(execution, null);
            contexts.put(execution, context);
        }
    }
    increment();
    return context;
}
```

`SynchronizationManagerSupport`的泛型为`JobExecution, JobContext`

```java
    /**
 * 当前执行的存储; 必须是ThreadLocal的，因为它需要在不属于步骤/作业的组件中定位上下文 (如重新补水作用域代理时)。不使用InheritableThreadLocal，因为如果一个步骤试图运行多个子步骤 (例如分区)，会有副作用。
 * 堆栈用于覆盖单线程的情况，从而使API与多线程相同。
 */
private final ThreadLocal<Stack<E>>executionHolder=new ThreadLocal<>();

/**
 * 每个执行的引用计数器: 有多少个线程正在使用同一个？
 */
private final Map<E, AtomicInteger> counts=new ConcurrentHashMap<>();

/**
 * 从正在运行的执行到关联上下文的简单映射。
 */
private final Map<E, C> contexts=new ConcurrentHashMap<>();
```

> `increment();`

```java
public void increment() {
    E current = getCurrent().peek();
    if (current != null) {
        AtomicInteger count;
        synchronized (counts) {
            count = counts.get(current);
            if (count == null) {
                count = new AtomicInteger();
                counts.put(current, count);
            }
        }
        count.incrementAndGet();
    }
}
```

简单来说就是里面三个属性不存在就创建。存在把`executionHolder`更新。`count`++。

`SynchronizationManagerSupport`类维护了三个对象

```java
    /**
 * Storage for the current execution; has to be ThreadLocal because it
 * is needed to locate a context in components that are not part of a
 * step/job (like when re-hydrating a scoped proxy). Doesn't use
 * InheritableThreadLocal because there are side effects if a step is trying
 * to run multiple child steps (e.g. with partitioning). The Stack is used
 * to cover the single threaded case, so that the API is the same as
 * multi-threaded.
 */
private final ThreadLocal<Stack<E>>executionHolder=new ThreadLocal<>();

/**
 * Reference counter for each execution: how many threads are using the
 * same one?
 */
private final Map<E, AtomicInteger> counts=new ConcurrentHashMap<>();

/**
 * Simple map from a running execution to the associated context.
 */
private final Map<E, C> contexts=new ConcurrentHashMap<>();
```

接着回到`AbstractJob`类

`LongTaskTimer`：计时器。

> jobParametersValidator.validate(execution.getJobParameters());

参数没有，跳过

> if (execution.getStatus() != BatchStatus.STOPPING) {

默认状态为`BatchStatus.STARTING`。

> execution.setStartTime(new Date());

设置当前开始时间

##### updateStatus(execution, BatchStatus.STARTED);

```java
private void updateStatus(JobExecution jobExecution, BatchStatus status) {
    jobExecution.setStatus(status);
    jobRepository.update(jobExecution);
}
```

> jobExecution.setStatus(status);

设置当前状态.

> jobRepository.update(jobExecution);

更新当前`jobExecution`。

`SimpleJobRepository#update(JobExecution jobExecution)`

```java
@Override
public void update(JobExecution jobExecution) {

    Assert.notNull(jobExecution, "JobExecution cannot be null.");
    Assert.notNull(jobExecution.getJobId(), "JobExecution must have a Job ID set.");
    Assert.notNull(jobExecution.getId(), "JobExecution must be already saved (have an id assigned).");

    jobExecution.setLastUpdated(new Date(System.currentTimeMillis()));

    jobExecutionDao.synchronizeStatus(jobExecution);
    if (jobExecution.getStatus() == BatchStatus.STOPPING && jobExecution.getEndTime() != null) {
        if (logger.isInfoEnabled()) {
            logger.info("Upgrading job execution status from STOPPING to STOPPED since it has already ended.");
        }
        jobExecution.upgradeStatus(BatchStatus.STOPPED);
    }
    jobExecutionDao.updateJobExecution(jobExecution);
}
```

先判断不能为空，设置最后修改时间。

> jobExecutionDao.synchronizeStatus(jobExecution);

`MapJobExecutionDao#synchronizeStatus(JobExecution jobExecution)`

```java
@Override
public void synchronizeStatus(JobExecution jobExecution) {
    JobExecution saved = getJobExecution(jobExecution.getId());
    if (saved.getVersion().intValue() != jobExecution.getVersion().intValue()) {
        jobExecution.upgradeStatus(saved.getStatus());
        jobExecution.setVersion(saved.getVersion());
    }
}
```

版本不一样就更新，然后版本++，这里版本没有改变。回到`SimpleJobRepository#update(JobExecution jobExecution)`
。如果状态`STOPPING`并且结束时间不为空，就使用`jobExecution`更新。这里也没有结束，不需要更新。

> jobExecutionDao.updateJobExecution(jobExecution);

`MapJobExecutionDao#updateJobExecution(JobExecution jobExecution)`

```java
@Override
public void updateJobExecution(JobExecution jobExecution) {
    Long id = jobExecution.getId();
    Assert.notNull(id, "JobExecution is expected to have an id (should be saved already)");
    JobExecution persistedExecution = executionsById.get(id);
    Assert.notNull(persistedExecution, "JobExecution must already be saved");

    synchronized (jobExecution) {
        if (!persistedExecution.getVersion().equals(jobExecution.getVersion())) {
            throw new OptimisticLockingFailureException("Attempt to update job execution id=" + id
                    + " with wrong version (" + jobExecution.getVersion() + "), where current version is "
                    + persistedExecution.getVersion());
        }
        jobExecution.incrementVersion();
        executionsById.put(id, copy(jobExecution));
    }
}
```

首先校验不能为空，版本不一致就抛出异常，这里基本都是使用乐观锁。官网有介绍。接着更新版本，保存数据。
到此这一步结束了，主要是跟新版本，把版本从`STARTING`跟新为`BatchStatus.STARTED`。
回到`AbstractJob#execute(JobExecution execution)`，接着执行。

##### listener.beforeJob(execution);

这里就是监听器的前处理器，我们回头找一下会有哪一些监听器会注入。这个监听器主要有俩个方法`beforeJob(JobExecution jobExecution)`
和`afterJob(JobExecution jobExecution);`。

主要是`SimpleJobBuilder#build()`->`super.enhance(job);`->`job.setJobExecutionListeners(listeners.toArray(new JobExecutionListener[0]));`
这一段加入的。也就是`JobBuilderHelper#properties#jobExecutionListeners`这个属性里面的值。
也就是我们如果有`jobBuilders.get("test").listener(new MyJobExecutionListener)`。就会创建一个监听器。

还有一种方法：

`JobBuilderHelper#listener(Object listener)`

```java
/**
 * Registers objects using the annotation based listener configuration.
 *
 * @param listener the object that has a method configured with listener annotation
 * @return this for fluent chaining
 */
public B listener(Object listener) {
    Set<Method> jobExecutionListenerMethods = new HashSet<>();
    jobExecutionListenerMethods.addAll(ReflectionUtils.findMethod(listener.getClass(), BeforeJob.class));
    jobExecutionListenerMethods.addAll(ReflectionUtils.findMethod(listener.getClass(), AfterJob.class));

    if (jobExecutionListenerMethods.size() > 0) {
        JobListenerFactoryBean factory = new JobListenerFactoryBean();
        factory.setDelegate(listener);
        properties.addJobExecutionListener((JobExecutionListener) factory.getObject());
    }

    @SuppressWarnings("unchecked")
    B result = (B) this;
    return result;
}
```

参数是一个 object，里面只要有`BeforeJob.class`或者`AfterJob.class`注解也是`JobExecutionListener`
监听器。现在看这个名字就能理解为什么是`JobExecution`了。

接着回到`AbstractJob#execute(JobExecution execution)`

##### doExecute(execution);

```java
@Override
protected void doExecute(JobExecution execution) throws JobInterruptedException, JobRestartException,
        StartLimitExceededException {
    StepExecution stepExecution = null;
    for (Step step : steps) {
        stepExecution = handleStep(step, execution);
        if (stepExecution.getStatus() != BatchStatus.COMPLETED) {
            break;
        }
    }

    //
    // Update the job status to be the same as the last step
    //
    if (stepExecution != null) {
        if (logger.isDebugEnabled()) {
            logger.debug("Upgrading JobExecution status: " + stepExecution);
        }
        execution.upgradeStatus(stepExecution.getStatus());
        execution.setExitStatus(stepExecution.getExitStatus());
    }
}
```

循环所有的`steps`。

> stepExecution = handleStep(step, execution);

```java
protected final StepExecution handleStep(Step step, JobExecution execution)
        throws JobInterruptedException, JobRestartException,
        StartLimitExceededException {
    return stepHandler.handleStep(step, execution);

}
```

这里的`stepHandler`对象，是`AbstractJob#setJobRepository(JobRepository jobRepository)`的时候创建的。代码如下

```java
public void setJobRepository(JobRepository jobRepository) {
    this.jobRepository = jobRepository;
    stepHandler = new SimpleStepHandler(jobRepository);
}
```

###### SimpleStepHandler#handleStep(Step step, JobExecution execution)

接着到了`SimpleStepHandler#handleStep(Step step, JobExecution execution)`

```java
@Override
public StepExecution handleStep(Step step, JobExecution execution) throws JobInterruptedException,
        JobRestartException, StartLimitExceededException {
    if (execution.isStopping()) {
        throw new JobInterruptedException("JobExecution interrupted.");
    }
    JobInstance jobInstance = execution.getJobInstance();
    StepExecution lastStepExecution = jobRepository.getLastStepExecution(jobInstance, step.getName());
    if (stepExecutionPartOfExistingJobExecution(execution, lastStepExecution)) {
        lastStepExecution = null;
    }
    StepExecution currentStepExecution = lastStepExecution;
    if (shouldStart(lastStepExecution, execution, step)) {
        currentStepExecution = execution.createStepExecution(step.getName());
        boolean isRestart = (lastStepExecution != null && !lastStepExecution.getStatus().equals(
                BatchStatus.COMPLETED));
        if (isRestart) {
            currentStepExecution.setExecutionContext(lastStepExecution.getExecutionContext());
            if (lastStepExecution.getExecutionContext().containsKey("batch.executed")) {
                currentStepExecution.getExecutionContext().remove("batch.executed");
            }
        } else {
            currentStepExecution.setExecutionContext(new ExecutionContext(executionContext));
        }
        jobRepository.add(currentStepExecution);
        try {
            step.execute(currentStepExecution);
            currentStepExecution.getExecutionContext().put("batch.executed", true);
        } catch (JobInterruptedException e) {
            execution.setStatus(BatchStatus.STOPPING);
            throw e;
        }
        jobRepository.updateExecutionContext(execution);
        if (currentStepExecution.getStatus() == BatchStatus.STOPPING
                || currentStepExecution.getStatus() == BatchStatus.STOPPED) {
            // Ensure that the job gets the message that it is stopping
            execution.setStatus(BatchStatus.STOPPING);
            throw new JobInterruptedException("Job interrupted by step execution");
        }
    }
    return currentStepExecution;
}
```

首先获取`JobInstance`对象，是`MapJobInstanceDao`对象创建的。

> StepExecution lastStepExecution = jobRepository.getLastStepExecution(jobInstance, step.getName());

`SimpleJobRepository#getLastStepExecution(JobInstance jobInstance, String stepName)`

```java
@Override
@Nullable
public StepExecution getLastStepExecution(JobInstance jobInstance, String stepName) {
    StepExecution latest = stepExecutionDao.getLastStepExecution(jobInstance, stepName);

    if (latest != null) {
        ExecutionContext stepExecutionContext = ecDao.getExecutionContext(latest);
        latest.setExecutionContext(stepExecutionContext);
        ExecutionContext jobExecutionContext = ecDao.getExecutionContext(latest.getJobExecution());
        latest.getJobExecution().setExecutionContext(jobExecutionContext);
    }

    return latest;
}
```

进入`MapStepExecutionDao#getLastStepExecution(JobInstance jobInstance, String stepName)`

```java
@Override
public StepExecution getLastStepExecution(JobInstance jobInstance, String stepName) {
    StepExecution latest = null;
    for (StepExecution stepExecution : executionsByStepExecutionId.values()) {
        if (!stepExecution.getStepName().equals(stepName)
                || stepExecution.getJobExecution().getJobInstance().getInstanceId() != jobInstance.getInstanceId()) {
            continue;
        }
        if (latest == null) {
            latest = stepExecution;
        }
        if (latest.getStartTime().getTime() < stepExecution.getStartTime().getTime()) {
            latest = stepExecution;
        }
        if (latest.getStartTime().getTime() == stepExecution.getStartTime().getTime() &&
                latest.getId() < stepExecution.getId()) {
            latest = stepExecution;
        }
    }
    return latest;
}
```

第一次进来这里是没有值的，直接返回 null。
回到`SimpleStepHandler#handleStep(Step step, JobExecution execution)`

`stepExecutionPartOfExistingJobExecution(execution, lastStepExecution)`为 false

接着`shouldStart(lastStepExecution, execution, step)`

> `SimpleStepHandler#shouldStart(StepExecution lastStepExecution, JobExecution jobExecution, Step step)`

```java
// 给定一个步骤和配置，如果该步骤应该开始，则返回 true；如果不应该启动，则返回 false；如果作业应该完成，则抛出异常。
protected boolean shouldStart(StepExecution lastStepExecution, JobExecution jobExecution, Step step)
        throws JobRestartException, StartLimitExceededException {

    BatchStatus stepStatus;
    if (lastStepExecution == null) {
        stepStatus = BatchStatus.STARTING;
    } else {
        stepStatus = lastStepExecution.getStatus();
    }

    if (stepStatus == BatchStatus.UNKNOWN) {
        throw new JobRestartException("Cannot restart step from UNKNOWN status. "
                + "The last execution ended with a failure that could not be rolled back, "
                + "so it may be dangerous to proceed. Manual intervention is probably necessary.");
    }

    if ((stepStatus == BatchStatus.COMPLETED && !step.isAllowStartIfComplete())
            || stepStatus == BatchStatus.ABANDONED) {
        // step is complete, false should be returned, indicating that the
        // step should not be started
        if (logger.isInfoEnabled()) {
            logger.info("Step already complete or not restartable, so no action to execute: " + lastStepExecution);
        }
        return false;
    }

    if (jobRepository.getStepExecutionCount(jobExecution.getJobInstance(), step.getName()) < step.getStartLimit()) {
        // step start count is less than start max, return true
        return true;
    } else {
        // start max has been exceeded, throw an exception.
        throw new StartLimitExceededException("Maximum start limit exceeded for step: " + step.getName()
                + "StartMax: " + step.getStartLimit());
    }
}
```

`lastStepExecution`为空，`stepStatus`设置为`BatchStatus.STARTING`。

`step.isAllowStartIfComplete()`是否能够重复执行

```java
@Bean
public Step step() {
    TaskletStep taskletStep = stepBuilders.get("test-step")
            .<Integer, Integer>chunk(2)
            .reader(itemReader())
            .writer(itemWriter())
            .startLimit(2)
            .build();
    taskletStep.setAllowStartIfComplete(true);
    return taskletStep;
}
```

改一下，设置成重复执行。`taskletStep.setAllowStartIfComplete(true);`
，如果不能重复执行打印日志`Step already complete or not restartable, so no action to execute`。

`jobRepository.getStepExecutionCount(jobExecution.getJobInstance(), step.getName()) < step.getStartLimit()`。
`startLimit(2)`。最多允许执行几次，每执行一次，`StepExecutionDao#executionsByStepExecutionId`
中的数据就会多一条。根据`startLimit`判断是否还能重复执行。
继续执行会报错`org.springframework.batch.core.StartLimitExceededException: Maximum start limit exceeded for step: test-stepStartMax: 2`

> currentStepExecution = execution.createStepExecution(step.getName());

```java
public StepExecution createStepExecution(String stepName) {
    StepExecution stepExecution = new StepExecution(stepName, this);
    this.stepExecutions.add(stepExecution);
    return stepExecution;
}
```

创建一个`StepExecution`并返回。`stepExecutions.add`

> boolean isRestart = (lastStepExecution != null && !lastStepExecution.getStatus().equals(BatchStatus.COMPLETED));

`lastStepExecution`为空。进入 else。

> `currentStepExecution.setExecutionContext(new ExecutionContext(executionContext));`

普通 set，`executionContext`也是一个普通的`new ExecutionContext()`。构造器方法中 new 的。

> jobRepository.add(currentStepExecution);

`SimpleJobRepository#add(StepExecution stepExecution)`

```java
@Override
public void add(StepExecution stepExecution) {
    validateStepExecution(stepExecution);

    stepExecution.setLastUpdated(new Date(System.currentTimeMillis()));
    stepExecutionDao.saveStepExecution(stepExecution);
    ecDao.saveExecutionContext(stepExecution);
}
```

`validateStepExecution(stepExecution)`：校验
`stepExecution.setLastUpdated(new Date(System.currentTimeMillis()));`：设置最后修改时间

> stepExecutionDao.saveStepExecution(stepExecution);

```java
@Override
public void saveStepExecution(StepExecution stepExecution) {
    Assert.isTrue(stepExecution.getId() == null, "stepExecution id was not null");
    Assert.isTrue(stepExecution.getVersion() == null, "stepExecution version was not null");
    Assert.notNull(stepExecution.getJobExecutionId(), "JobExecution must be saved already.");
    Map<Long, StepExecution> executions = executionsByJobExecutionId.get(stepExecution.getJobExecutionId());
    if (executions == null) {
        executions = new ConcurrentHashMap<>();
        executionsByJobExecutionId.put(stepExecution.getJobExecutionId(), executions);
    }
    stepExecution.setId(currentId.incrementAndGet());
    stepExecution.incrementVersion();
    StepExecution copy = copy(stepExecution);
    executions.put(stepExecution.getId(), copy);
    executionsByStepExecutionId.put(stepExecution.getId(), copy);

}
```

先校验，再新增一条数据。 `StepExecution`里面包含了`JobExecution`。 `JobExecutionDao`维护`jobExecution`的 Id。`StepExecution`
维护`StepExecution`的 Id。

> ecDao.saveExecutionContext(stepExecution);

```java
@Override
public void saveExecutionContext(StepExecution stepExecution) {
    updateExecutionContext(stepExecution);
}

@Override
public void updateExecutionContext(StepExecution stepExecution) {
    ExecutionContext executionContext = stepExecution.getExecutionContext();
    if (executionContext != null) {
        contexts.put(ContextKey.step(stepExecution.getId()), copy(executionContext));
    }
}
```

新增一条数据。前面已经新增了一条`job`。现在新增的是`step`。

> `step.execute(currentStepExecution);`

继续回到`SimpleStepHandler#handleStep(Step step, JobExecution execution)`。
`AbstractStep#execute(StepExecution stepExecution)`

```java
/**
 * Template method for step execution logic - calls abstract methods for resource initialization (
 * {@link #open(ExecutionContext)}), execution logic ({@link #doExecute(StepExecution)}) and resource closing (
 * {@link #close(ExecutionContext)}).
 */
@Override
public final void execute(StepExecution stepExecution) throws JobInterruptedException,
        UnexpectedJobExecutionException {

    Assert.notNull(stepExecution, "stepExecution must not be null");

    if (logger.isDebugEnabled()) {
        logger.debug("Executing: id=" + stepExecution.getId());
    }
    stepExecution.setStartTime(new Date());
    stepExecution.setStatus(BatchStatus.STARTED);
    Timer.Sample sample = BatchMetrics.createTimerSample();
    getJobRepository().update(stepExecution);

    // Start with a default value that will be trumped by anything
    ExitStatus exitStatus = ExitStatus.EXECUTING;

    doExecutionRegistration(stepExecution);

    try {
        getCompositeListener().beforeStep(stepExecution);
        open(stepExecution.getExecutionContext());

        try {
            doExecute(stepExecution);
        } catch (RepeatException e) {
            throw e.getCause();
        }
        exitStatus = ExitStatus.COMPLETED.and(stepExecution.getExitStatus());

        // Check if someone is trying to stop us
        if (stepExecution.isTerminateOnly()) {
            throw new JobInterruptedException("JobExecution interrupted.");
        }

        // Need to upgrade here not set, in case the execution was stopped
        stepExecution.upgradeStatus(BatchStatus.COMPLETED);
        if (logger.isDebugEnabled()) {
            logger.debug("Step execution success: id=" + stepExecution.getId());
        }
    } catch (Throwable e) {
        stepExecution.upgradeStatus(determineBatchStatus(e));
        exitStatus = exitStatus.and(getDefaultExitStatusForFailure(e));
        stepExecution.addFailureException(e);
        if (stepExecution.getStatus() == BatchStatus.STOPPED) {
            logger.info(String.format("Encountered interruption executing step %s in job %s : %s", name, stepExecution.getJobExecution().getJobInstance().getJobName(), e.getMessage()));
            if (logger.isDebugEnabled()) {
                logger.debug("Full exception", e);
            }
        } else {
            logger.error(String.format("Encountered an error executing step %s in job %s", name, stepExecution.getJobExecution().getJobInstance().getJobName()), e);
        }
    } finally {

        try {
            // Update the step execution to the latest known value so the
            // listeners can act on it
            exitStatus = exitStatus.and(stepExecution.getExitStatus());
            stepExecution.setExitStatus(exitStatus);
            exitStatus = exitStatus.and(getCompositeListener().afterStep(stepExecution));
        } catch (Exception e) {
            logger.error(String.format("Exception in afterStep callback in step %s in job %s", name, stepExecution.getJobExecution().getJobInstance().getJobName()), e);
        }

        try {
            getJobRepository().updateExecutionContext(stepExecution);
        } catch (Exception e) {
            stepExecution.setStatus(BatchStatus.UNKNOWN);
            exitStatus = exitStatus.and(ExitStatus.UNKNOWN);
            stepExecution.addFailureException(e);
            logger.error(String.format("Encountered an error saving batch meta data for step %s in job %s. "
                    + "This job is now in an unknown state and should not be restarted.", name, stepExecution.getJobExecution().getJobInstance().getJobName()), e);
        }

        sample.stop(BatchMetrics.createTimer("step", "Step duration",
                Tag.of("job.name", stepExecution.getJobExecution().getJobInstance().getJobName()),
                Tag.of("name", stepExecution.getStepName()),
                Tag.of("status", stepExecution.getExitStatus().getExitCode())
        ));
        stepExecution.setEndTime(new Date());
        stepExecution.setExitStatus(exitStatus);
        Duration stepExecutionDuration = BatchMetrics.calculateDuration(stepExecution.getStartTime(), stepExecution.getEndTime());
        if (logger.isInfoEnabled()) {
            logger.info("Step: [" + stepExecution.getStepName() + "] executed in " + BatchMetrics.formatDuration(stepExecutionDuration));
        }
        try {
            getJobRepository().update(stepExecution);
        } catch (Exception e) {
            stepExecution.setStatus(BatchStatus.UNKNOWN);
            stepExecution.setExitStatus(exitStatus.and(ExitStatus.UNKNOWN));
            stepExecution.addFailureException(e);
            logger.error(String.format("Encountered an error saving batch meta data for step %s in job %s. "
                    + "This job is now in an unknown state and should not be restarted.", name, stepExecution.getJobExecution().getJobInstance().getJobName()), e);
        }

        try {
            close(stepExecution.getExecutionContext());
        } catch (Exception e) {
            logger.error(String.format("Exception while closing step execution resources in step %s in job %s", name, stepExecution.getJobExecution().getJobInstance().getJobName()), e);
            stepExecution.addFailureException(e);
        }

        doExecutionRelease();

        if (logger.isDebugEnabled()) {
            logger.debug("Step execution complete: " + stepExecution.getSummary());
        }
    }
}
```

前面几行校验，打印日志，计时器。

> getJobRepository().update(stepExecution);

```java
@Override
public void update(StepExecution stepExecution) {
    validateStepExecution(stepExecution);
    Assert.notNull(stepExecution.getId(), "StepExecution must already be saved (have an id assigned)");

    stepExecution.setLastUpdated(new Date(System.currentTimeMillis()));
    stepExecutionDao.updateStepExecution(stepExecution);
    checkForInterruption(stepExecution);
}
```

校验参数，设置最后修改时间。

> `stepExecutionDao.updateStepExecution(stepExecution);`

跟前面一样，版本号升级，新增一条数据。这里有俩个 Map，`executionsByStepExecutionId`和`executionsByJobExecutionId`

`executionsByJobExecutionId`：
`private Map<Long, Map<Long, StepExecution>> executionsByJobExecutionId = new ConcurrentHashMap<>();`
key 为`Job`的 id。然后`job`有多个`Step`。泛型里面的 map 就是`Step`的 id 和对象。

`executionsByStepExecutionId`：
`private Map<Long, StepExecution> executionsByStepExecutionId = new ConcurrentHashMap<>();`
key 为 Step 的 id

> checkForInterruption(stepExecution);

回到`SimpleJobRepository#update(StepExecution stepExecution)`。

```java
/**
 * Check to determine whether or not the JobExecution that is the parent of
 * the provided StepExecution has been interrupted. If, after synchronizing
 * the status with the database, the status has been updated to STOPPING,
 * then the job has been interrupted.
 *
 * @param stepExecution
 */
private void checkForInterruption(StepExecution stepExecution) {
    JobExecution jobExecution = stepExecution.getJobExecution();
    jobExecutionDao.synchronizeStatus(jobExecution);
    if (jobExecution.isStopping()) {
        logger.info("Parent JobExecution is stopped, so passing message on to StepExecution");
        stepExecution.setTerminateOnly();
    }
}
```

检查以确定作为所提供的 StepExecution 的父级 JobExecution 是否已被中断。如果与数据库同步状态后，状态已更新为
STOPPING，则作业已中断。
`jobExecutionDao.synchronizeStatus(jobExecution);`：版本号是否改变了。

> ExitStatus exitStatus = ExitStatus.EXECUTING;

回到`AbstractStep#execute(StepExecution stepExecution)`方法，创建`exitStatus`

> doExecutionRegistration(stepExecution);

前面是`JobSynchronizationManager.register(execution);`。注入的是 job，现在这个是 step。逻辑一样的。

> getCompositeListener().beforeStep(stepExecution);

跟 job 也基本一致，在` taskletStep = stepBuilders.get("test-step").listener(new StepExecutionListener() {`
中或者`listener(Object listener)`里面存在`BeforeStep.class`和`AfterStep.class`注解的方法。 可以得出`xxExecutionListener`
是比较前面执行的。

> open(stepExecution.getExecutionContext());

```java
@Override
protected void open(ExecutionContext ctx) throws Exception {
    stream.open(ctx);
}
```

里面的`stream`存在一个`private final List<ItemStream> streams = new ArrayList<>();`属性，也就是`ItemStream`对象。里面的
open 方法会在这里执行。

> doExecute(stepExecution);

```java
@Override
protected void doExecute(StepExecution stepExecution) throws Exception {
    stepExecution.getExecutionContext().put(TASKLET_TYPE_KEY, tasklet.getClass().getName());
    stepExecution.getExecutionContext().put(STEP_TYPE_KEY, this.getClass().getName());
    stream.update(stepExecution.getExecutionContext());
    getJobRepository().updateExecutionContext(stepExecution);
    final Semaphore semaphore = createSemaphore();
    stepOperations.iterate(new StepContextRepeatCallback(stepExecution) {
        @Override
        public RepeatStatus doInChunkContext(RepeatContext repeatContext, ChunkContext chunkContext)
                throws Exception {
            StepExecution stepExecution = chunkContext.getStepContext().getStepExecution();
            interruptionPolicy.checkInterrupted(stepExecution);

            RepeatStatus result;
            try {
                result = new TransactionTemplate(transactionManager, transactionAttribute)
                        .execute(new ChunkTransactionCallback(chunkContext, semaphore));
            } catch (UncheckedTransactionException e) {
                throw (Exception) e.getCause();
            }
            chunkListener.afterChunk(chunkContext);
            interruptionPolicy.checkInterrupted(stepExecution);
            return result == null ? RepeatStatus.FINISHED : result;
        }
    });
}
```

首先在`stepExecution#ExecutionContext`set 了`batch.taskletType`和`batch.stepType`
。接着执行了`stream.update(stepExecution.getExecutionContext());`。与上面一样，`ItemStream#update`方法都在这里执行的。

又是更新`getJobRepository().updateExecutionContext(stepExecution);`
。与上面一样。里面主要就是环境更新`ecDao.updateExecutionContext(stepExecution);`。

> final Semaphore semaphore = createSemaphore();

每个步骤执行共享信号量，因此其他步骤执行可以并行运行而不需要锁，这里只是 new 一个对象，不是使用。

> stepOperations.iterate(new StepContextRepeatCallback(stepExecution)

`stepOperations`是一个`RepeatTemplate`对象，实现了`RepeatOperations`
。里面只有一个方法。`RepeatStatus#iterate(RepeatCallback callback)`。

`RepeatTemplate#iterate(RepeatCallback callback)`

```java
/**
 * Execute the batch callback until the completion policy decides that we
 * are finished. Wait for the whole batch to finish before returning even if
 * the task executor is asynchronous.
 *
 * @see org.springframework.batch.repeat.RepeatOperations#iterate(org.springframework.batch.repeat.RepeatCallback)
 */
@Override
public RepeatStatus iterate(RepeatCallback callback) {

    RepeatContext outer = RepeatSynchronizationManager.getContext();

    RepeatStatus result = RepeatStatus.CONTINUABLE;
    try {
        // This works with an asynchronous TaskExecutor: the
        // interceptors have to wait for the child processes.
        result = executeInternal(callback);
    } finally {
        RepeatSynchronizationManager.clear();
        if (outer != null) {
            RepeatSynchronizationManager.register(outer);
        }
    }

    return result;
}
```

第一次进来`outer`为空，进入`result = executeInternal(callback);`方法。

```java
private RepeatStatus executeInternal(final RepeatCallback callback) {

    // Reset the termination policy if there is one...
    RepeatContext context = start();

    // Make sure if we are already marked complete before we start then no
    // processing takes place.
    boolean running = !isMarkedComplete(context);

    for (RepeatListener interceptor : listeners) {
        interceptor.open(context);
        running = running && !isMarkedComplete(context);
        if (!running)
            break;
    }
    // Return value, default is to allow continued processing.
    RepeatStatus result = RepeatStatus.CONTINUABLE;

    RepeatInternalState state = createInternalState(context);
    // This is the list of exceptions thrown by all active callbacks
    Collection<Throwable> throwables = state.getThrowables();
    // Keep a separate list of exceptions we handled that need to be
    // rethrown
    Collection<Throwable> deferred = new ArrayList<>();

    try {

        while (running) {

            /*
             * Run the before interceptors here, not in the task executor so
             * that they all happen in the same thread - it's easier for
             * tracking batch status, amongst other things.
             */
            for (int i = 0; i < listeners.length; i++) {
                RepeatListener interceptor = listeners[i];
                interceptor.before(context);
                // Allow before interceptors to veto the batch by setting
                // flag.
                running = running && !isMarkedComplete(context);
            }

            // Check that we are still running (should always be true) ...
            if (running) {

                try {

                    result = getNextResult(context, callback, state);
                    executeAfterInterceptors(context, result);

                } catch (Throwable throwable) {
                    doHandle(throwable, context, deferred);
                }

                // N.B. the order may be important here:
                if (isComplete(context, result) || isMarkedComplete(context) || !deferred.isEmpty()) {
                    running = false;
                }

            }

        }

        result = result.and(waitForResults(state));
        for (Throwable throwable : throwables) {
            doHandle(throwable, context, deferred);
        }
        // Explicitly drop any references to internal state...
        state = null;
    }
    /*
     * No need for explicit catch here - if the business processing threw an
     * exception it was already handled by the helper methods. An exception
     * here is necessarily fatal.
     */ finally {
        try {
            if (!deferred.isEmpty()) {
                Throwable throwable = deferred.iterator().next();
                if (logger.isDebugEnabled()) {
                    logger.debug("Handling fatal exception explicitly (rethrowing first of " + deferred.size() + "): "
                            + throwable.getClass().getName() + ": " + throwable.getMessage());
                }
                rethrow(throwable);
            }
        } finally {
            try {
                for (int i = listeners.length; i-- > 0; ) {
                    RepeatListener interceptor = listeners[i];
                    interceptor.close(context);
                }
            } finally {
                context.close();
            }
        }
    }
    return result;
}
```

> RepeatContext context = start();

```java
/**
 * Delegate to the {@link CompletionPolicy}.
 *
 * @return a {@link RepeatContext} object that can be used by the implementation to store
 * internal state for a batch step.
 * @see org.springframework.batch.repeat.CompletionPolicy#start(RepeatContext)
 */
protected RepeatContext start() {
    RepeatContext parent = RepeatSynchronizationManager.getContext();
    RepeatContext context = completionPolicy.start(parent);
    RepeatSynchronizationManager.register(context);
    logger.debug("Starting repeat context.");
    return context;
}
```

往`RepeatSynchronizationManager#ThreadLocal<RepeatContext> contextHolder = new ThreadLocal<>()`中新增一个`RepeatContext`
。这里新增的是一个`RepeatContextSupport`对象。

> boolean running = !isMarkedComplete(context);

确保我们在开始之前是否已标记为完成，则不会进行任何处理。

```java
private boolean isMarkedComplete(RepeatContext context) {
    boolean complete = context.isCompleteOnly();
    if (context.getParent() != null) {
        complete = complete || isMarkedComplete(context.getParent());
    }
    if (complete) {
        logger.debug("Repeat is complete according to context alone.");
    }
    return complete;

}
```

`complete`默认为 false，取反`running`为 true。

> listeners

这个对象是在 builder 中赋值的，我们没有进行别的处理。

> RepeatStatus result = RepeatStatus.CONTINUABLE;

返回值，默认是允许继续处理。

> RepeatInternalState state = createInternalState(context);

```java
protected RepeatInternalState createInternalState(RepeatContext context) {
    return new RepeatInternalStateSupport();
}
```

> Collection<Throwable> throwables = state.getThrowables();

这是所有活动回调抛出的异常列表

> Collection<Throwable> deferred = new ArrayList<>();

保留我们处理过的需要重新抛出的异常的单独列表

接下来进入 while 循环，`running`为 true，第一个 for 循环`listeners`值为空，跳过。

判断 if 进入。

> result = getNextResult(context, callback, state);

```java
protected RepeatStatus getNextResult(RepeatContext context, RepeatCallback callback, RepeatInternalState state)
        throws Throwable {
    update(context);
    if (logger.isDebugEnabled()) {
        logger.debug("Repeat operation about to start at count=" + context.getStartedCount());
    }
    return callback.doInIteration(context);

}
```

解释一下三个参数，`context`，前面方法`start()`中 new 出来的`RepeatContextSupport`，当前里面什么都没有。
`callback`是 new 的一个`new StepContextRepeatCallback(stepExecution)`对象。
`state`是` new RepeatInternalStateSupport()`对象。在前面调用`createInternalState(context)`创建出来的。

> update(context);

更新`context`，这里更新就是把`RepeatContextSupport#count`++，次数加一。

> return callback.doInIteration(context);

`StepContextRepeatCallback#doInIteration(RepeatContext context)`

```java
@Override
public RepeatStatus doInIteration(RepeatContext context) throws Exception {

    // The StepContext has to be the same for all chunks,
    // otherwise step-scoped beans will be re-initialised for each chunk.
    StepContext stepContext = StepSynchronizationManager.register(stepExecution);
    if (logger.isDebugEnabled()) {
        logger.debug("Preparing chunk execution for StepContext: " + ObjectUtils.identityToString(stepContext));
    }

    ChunkContext chunkContext = attributeQueue.poll();
    if (chunkContext == null) {
        chunkContext = new ChunkContext(stepContext);
    }

    try {
        if (logger.isDebugEnabled()) {
            logger.debug("Chunk execution starting: queue size=" + attributeQueue.size());
        }
        return doInChunkContext(context, chunkContext);
    } finally {
        // Still some stuff to do with the data in this chunk,
        // pass it back.
        if (!chunkContext.isComplete()) {
            attributeQueue.add(chunkContext);
        }
        StepSynchronizationManager.close();
    }
}
```

> StepContext stepContext = StepSynchronizationManager.register(stepExecution);

简单来说就是`SynchronizationManagerSupport#counts`++。

接着 `chunkContext = new ChunkContext(stepContext);`

> doInChunkContext(context, chunkContext);

```java
@Override
public RepeatStatus doInChunkContext(RepeatContext repeatContext, ChunkContext chunkContext)
        throws Exception {

    StepExecution stepExecution = chunkContext.getStepContext().getStepExecution();

    // Before starting a new transaction, check for
    // interruption.
    interruptionPolicy.checkInterrupted(stepExecution);

    RepeatStatus result;
    try {
        result = new TransactionTemplate(transactionManager, transactionAttribute)
                .execute(new ChunkTransactionCallback(chunkContext, semaphore));
    } catch (UncheckedTransactionException e) {
        // Allow checked exceptions to be thrown inside callback
        throw (Exception) e.getCause();
    }

    chunkListener.afterChunk(chunkContext);

    // Check for interruption after transaction as well, so that
    // the interrupted exception is correctly propagated up to
    // caller
    interruptionPolicy.checkInterrupted(stepExecution);

    return result == null ? RepeatStatus.FINISHED : result;
}
```

执行` doInChunkContext(RepeatContext repeatContext, ChunkContext chunkContext)`
。这个是在`TaskletStep#doExecute(StepExecution stepExecution)`
中，`stepOperations.iterate(new StepContextRepeatCallback(stepExecution) {`
里面的`doInChunkContext(RepeatContext repeatContext, ChunkContext chunkContext)`方法。

> `StepExecution stepExecution = chunkContext.getStepContext().getStepExecution();`

获取`stepExecution`，`StepContext`里面存有`StepExecution`。

> interruptionPolicy.checkInterrupted(stepExecution);

在开始新事务之前，检查是否有中断。

> result = new TransactionTemplate(transactionManager, transactionAttribute)

创建一个`TransactionTemplate`。`transactionManager`是默认的`ResourcelessTransactionManager`。

`transactionAttribute`是`new DefaultTransactionAttribute(`。

> .execute(new ChunkTransactionCallback(chunkContext, semaphore));

执行 execute 方法。使用`ChunkTransactionCallback`包装`chunkContext, semaphore`俩个属性。

```java
@Override
@Nullable
public <T> T execute(TransactionCallback<T> action) throws TransactionException {
    Assert.state(this.transactionManager != null, "No PlatformTransactionManager set");

    if (this.transactionManager instanceof CallbackPreferringPlatformTransactionManager) {
        return ((CallbackPreferringPlatformTransactionManager) this.transactionManager).execute(this, action);
    } else {
        TransactionStatus status = this.transactionManager.getTransaction(this);
        T result;
        try {
            result = action.doInTransaction(status);
        } catch (RuntimeException | Error ex) {
            // Transactional code threw application exception -> rollback
            rollbackOnException(status, ex);
            throw ex;
        } catch (Throwable ex) {
            // Transactional code threw unexpected exception -> rollback
            rollbackOnException(status, ex);
            throw new UndeclaredThrowableException(ex, "TransactionCallback threw undeclared checked exception");
        }
        this.transactionManager.commit(status);
        return result;
    }
}
```

进入 else，里面大概逻辑就是成功就提交，失败就回滚。主要方法在`result = action.doInTransaction(status);`中。

> result = action.doInTransaction(status);

`TransactionCallback<T> action`对象为`ChunkTransactionCallback`

```java
@Override
public RepeatStatus doInTransaction(TransactionStatus status) {
    TransactionSynchronizationManager.registerSynchronization(this);

    RepeatStatus result = RepeatStatus.CONTINUABLE;

    StepContribution contribution = stepExecution.createStepContribution();

    chunkListener.beforeChunk(chunkContext);

    // In case we need to push it back to its old value
    // after a commit fails...
    oldVersion = new StepExecution(stepExecution.getStepName(), stepExecution.getJobExecution());
    copy(stepExecution, oldVersion);
    try {
        try {
            try {
                result = tasklet.execute(contribution, chunkContext);
                if (result == null) {
                    result = RepeatStatus.FINISHED;
                }
            } catch (Exception e) {
                if (transactionAttribute.rollbackOn(e)) {
                    chunkContext.setAttribute(ChunkListener.ROLLBACK_EXCEPTION_KEY, e);
                    throw e;
                }
            }
        } finally {

            // If the step operations are asynchronous then we need
            // to synchronize changes to the step execution (at a
            // minimum). Take the lock *before* changing the step
            // execution.
            try {
                semaphore.acquire();
                locked = true;
            } catch (InterruptedException e) {
                logger.error("Thread interrupted while locking for repository update");
                stepExecution.setStatus(BatchStatus.STOPPED);
                stepExecution.setTerminateOnly();
                Thread.currentThread().interrupt();
            }

            // Apply the contribution to the step
            // even if unsuccessful
            if (logger.isDebugEnabled()) {
                logger.debug("Applying contribution: " + contribution);
            }
            stepExecution.apply(contribution);

        }

        stepExecutionUpdated = true;

        stream.update(stepExecution.getExecutionContext());

        try {
            // Going to attempt a commit. If it fails this flag will
            // stay false and we can use that later.
            getJobRepository().updateExecutionContext(stepExecution);
            stepExecution.incrementCommitCount();
            if (logger.isDebugEnabled()) {
                logger.debug("Saving step execution before commit: " + stepExecution);
            }
            getJobRepository().update(stepExecution);
        } catch (Exception e) {
            // If we get to here there was a problem saving the step
            // execution and we have to fail.
            String msg = "JobRepository failure forcing rollback";
            logger.error(msg, e);
            throw new FatalStepExecutionException(msg, e);
        }
    } catch (Error e) {
        if (logger.isDebugEnabled()) {
            logger.debug("Rollback for Error: " + e.getClass().getName() + ": " + e.getMessage());
        }
        rollback(stepExecution);
        throw e;
    } catch (RuntimeException e) {
        if (logger.isDebugEnabled()) {
            logger.debug("Rollback for RuntimeException: " + e.getClass().getName() + ": " + e.getMessage());
        }
        rollback(stepExecution);
        throw e;
    } catch (Exception e) {
        if (logger.isDebugEnabled()) {
            logger.debug("Rollback for Exception: " + e.getClass().getName() + ": " + e.getMessage());
        }
        rollback(stepExecution);
        // Allow checked exceptions
        throw new UncheckedTransactionException(e);
    }

    return result;

}
```

> TransactionSynchronizationManager.registerSynchronization(this);

为当前线程注册一个新的事务同步。通常由资源管理代码调用。

> RepeatStatus result = RepeatStatus.CONTINUABLE;

默认返回。

> StepContribution contribution = stepExecution.createStepContribution();

创建一个`StepContribution`。`return new StepContribution(this);`

> chunkListener.beforeChunk(chunkContext);

里面的`chunkListener`前处理器。 也是在 builder 中 set 的。与监听器逻辑一样。打开`ChunkListener`类，把注释翻译一下，对照这里就知道了。

> oldVersion = new StepExecution(stepExecution.getStepName(), stepExecution.getJobExecution()); copy(stepExecution,
> oldVersion);

如果提交失败后我们需要将其推回到旧值......，赋值一份用来进行回滚。

> result = tasklet.execute(contribution, chunkContext);

`tasklet`是`SimpleStepBuilder#createTasklet()`里面创建的。也就是`ChunkOrientedTasklet`。

```java
public RepeatStatus execute(StepContribution contribution, ChunkContext chunkContext) throws Exception {
    @SuppressWarnings("unchecked")
    Chunk<I> inputs = (Chunk<I>) chunkContext.getAttribute(INPUTS_KEY);
    if (inputs == null) {
        inputs = chunkProvider.provide(contribution);
        if (buffering) {
            chunkContext.setAttribute(INPUTS_KEY, inputs);
        }
    }
    chunkProcessor.process(contribution, inputs);
    chunkProvider.postProcess(contribution, inputs);
    // Allow a message coming back from the processor to say that we
    // are not done yet
    if (inputs.isBusy()) {
        logger.debug("Inputs still busy");
        return RepeatStatus.CONTINUABLE;
    }
    chunkContext.removeAttribute(INPUTS_KEY);
    chunkContext.setComplete();
    if (logger.isDebugEnabled()) {
        logger.debug("Inputs not busy, ended: " + inputs.isEnd());
    }
    return RepeatStatus.continueIf(!inputs.isEnd());
}
```

这里又是使用`repeatOperations#.iterate(new RepeatCallback()`。这里有个点需要注意一下，在 builder
中。存在俩个`RepeatOperations`对象。一个是`SimpleStepBuilder#RepeatOperations chunkOperations`。名字中有个`chunk`
的。还有一个在父类`AbstractTaskletStepBuilder#RepeatOperations stepOperations`中。
`chunkOperations`在这里使用的，父类的在`TaskletStep#doExecute(StepExecution stepExecution)`中使用的。

```java
@Override
public Chunk<I> provide(final StepContribution contribution) throws Exception {
    final Chunk<I> inputs = new Chunk<>();
    repeatOperations.iterate(new RepeatCallback() {
        @Override
        public RepeatStatus doInIteration(final RepeatContext context) throws Exception {
            I item = null;
            Timer.Sample sample = Timer.start(Metrics.globalRegistry);
            String status = BatchMetrics.STATUS_SUCCESS;
            try {
                item = read(contribution, inputs);
            } catch (SkipOverflowException e) {
                // read() tells us about an excess of skips by throwing an
                // exception
                status = BatchMetrics.STATUS_FAILURE;
                return RepeatStatus.FINISHED;
            } finally {
                stopTimer(sample, contribution.getStepExecution(), status);
            }
            if (item == null) {
                inputs.setEnd();
                return RepeatStatus.FINISHED;
            }
            inputs.add(item);
            contribution.incrementReadCount();
            return RepeatStatus.CONTINUABLE;
        }

    });

    return inputs;

}
```

这里的`repeatOperations`也是`RepeatTemplate`。逻辑与前面的都一致，只不过`RepeatCallback`
不同，直接进入`RepeatCallback#doInIteration(final RepeatContext context)`方法。

> chunkProvider.provide(contribution);

这个就是读取数据接口了。先看看参数。`StepContribution`里面只有一个`stepExecution`。`chunkProvider`
是`SimpleChunkProvider<I> chunkProvider = new SimpleChunkProvider<>(getReader(), repeatOperations);`
这样的，`repeatOperations`是一个`RepeatTemplate`。

进入方法。

```java
@Override
public Chunk<I> provide(final StepContribution contribution) throws Exception {

    final Chunk<I> inputs = new Chunk<>();
    repeatOperations.iterate(new RepeatCallback() {

        @Override
        public RepeatStatus doInIteration(final RepeatContext context) throws Exception {
            I item = null;
            Timer.Sample sample = Timer.start(Metrics.globalRegistry);
            String status = BatchMetrics.STATUS_SUCCESS;
            try {
                item = read(contribution, inputs);
            } catch (SkipOverflowException e) {
                // read() tells us about an excess of skips by throwing an
                // exception
                status = BatchMetrics.STATUS_FAILURE;
                return RepeatStatus.FINISHED;
            } finally {
                stopTimer(sample, contribution.getStepExecution(), status);
            }
            if (item == null) {
                inputs.setEnd();
                return RepeatStatus.FINISHED;
            }
            inputs.add(item);
            contribution.incrementReadCount();
            return RepeatStatus.CONTINUABLE;
        }

    });

    return inputs;

}
```

只关注一些关键代码，整体逻辑就是执行`item = read(contribution, inputs);`，出错返回` RepeatStatus.FINISHED`
，正常就把值放入`final Chunk<I> inputs = new Chunk<>();`中，并且执行`contribution.incrementReadCount();`->
把里面的`readCount++`。

关键点：`item == null`，就表示后面没有数据了，设置 end 为结束。这就是为什么我们返回 null，就结束，如果不返回 null，就会一直执行下去。

> item = read(contribution, inputs);

进入 `doRead()`

```java
/**
 * Surrounds the read call with listener callbacks.
 *
 * @return the item or {@code null} if the data source is exhausted
 * @throws Exception is thrown if error occurs during read.
 */
@Nullable
protected final I doRead() throws Exception {
    try {
        listener.beforeRead();
        I item = itemReader.read();
        if (item != null) {
            listener.afterRead(item);
        }
        return item;
    } catch (Exception e) {
        if (logger.isDebugEnabled()) {
            logger.debug(e.getMessage() + " : " + e.getClass().getName());
        }
        listener.onReadError(e);
        throw e;
    }
}
```

listener.beforeRead(); `ItemReadListener#beforeRead()`方法。

> I item = itemReader.read();

这个就是我们自己写的类了。执行里面的方法，返回一个值。

> listener.afterRead(item);

返回值不为空，执行`ItemReadListener#afterRead`方法。

接着`ChunkOrientedTasklet#execute(StepContribution contribution, ChunkContext chunkContext)`。

> chunkProcessor.process(contribution, inputs);

`inputs` 就是我们自己写的返回的值。`contribution` 中的 `readCount++`。

`chunkProcessor`
是`SimpleChunkProcessor<I, O> chunkProcessor = new SimpleChunkProcessor<>(getProcessor(), getWriter());`

```java
@Override
public final void process(StepContribution contribution, Chunk<I> inputs) throws Exception {

    // Allow temporary state to be stored in the user data field
    initializeUserData(inputs);

    // If there is no input we don't have to do anything more
    if (isComplete(inputs)) {
        return;
    }

    // Make the transformation, calling remove() on the inputs iterator if
    // any items are filtered. Might throw exception and cause rollback.
    Chunk<O> outputs = transform(contribution, inputs);

    // Adjust the filter count based on available data
    contribution.incrementFilterCount(getFilterCount(inputs, outputs));

    // Adjust the outputs if necessary for housekeeping purposes, and then
    // write them out...
    write(contribution, inputs, getAdjustedOutputs(inputs, outputs));

}
```

> initializeUserData(inputs);

允许临时状态存储在用户数据字段中，

```java
protected void initializeUserData(Chunk<I> inputs){
    inputs.setUserData(inputs.size());
}
```

> isComplete(inputs)

如果没有输入，我们不需要做任何事情

> Chunk<O> outputs = transform(contribution, inputs);

进行转换，如果过滤了任何项目，则在输入迭代器上调用 remove()。可能会抛出异常并导致回滚。

```java
protected Chunk<O> transform(StepContribution contribution, Chunk<I> inputs) throws Exception {
    Chunk<O> outputs = new Chunk<>();
    for (Chunk<I>.ChunkIterator iterator = inputs.iterator(); iterator.hasNext(); ) {
        final I item = iterator.next();
        O output;
        Timer.Sample sample = BatchMetrics.createTimerSample();
        String status = BatchMetrics.STATUS_SUCCESS;
        try {
            output = doProcess(item);
        } catch (Exception e) {
            /*
             * For a simple chunk processor (no fault tolerance) we are done
             * here, so prevent any more processing of these inputs.
             */
            inputs.clear();
            status = BatchMetrics.STATUS_FAILURE;
            throw e;
        } finally {
            stopTimer(sample, contribution.getStepExecution(), "item.process", status, "Item processing");
        }
        if (output != null) {
            outputs.add(output);
        } else {
            iterator.remove();
        }
    }
    return outputs;
}
```

只看一个方法，output = doProcess(item);

> doProcess(item)

```java
protected final O doProcess(I item) throws Exception {

    if (itemProcessor == null) {
        @SuppressWarnings("unchecked")
        O result = (O) item;
        return result;
    }

    try {
        listener.beforeProcess(item);
        O result = itemProcessor.process(item);
        listener.afterProcess(item, result);
        return result;
    } catch (Exception e) {
        listener.onProcessError(item, e);
        throw e;
    }

}
```

`itemProcessor`为空直接返回，如果存在。
先执行`listener.beforeProcess(item);`(`ItemProcessListener#beforeProcess`)。
然后存在`ItemProcessor`类，就执行。这个里面是一个数据转换，我读取数据，不能够直接写入就需要在这里进行一次转换，再进行写入。
最后再执行一次`ItemProcessListener#afterProcess`。并返回结果。 如果没有`ItemProcessor`，里面的`ItemProcessListener`
就不会执行。这里需要注意。
接着回到上面。

> contribution.incrementFilterCount(getFilterCount(inputs, outputs));

维护里面的`filterCount`。看看有没有过滤的数据。

> write(contribution, inputs, getAdjustedOutputs(inputs, outputs));

如果需要的话，调整输出以进行内务处理，然后将它们写出来......

```java
/**
 * Simple implementation delegates to the {@link #doWrite(List)} method and
 * increments the write count in the contribution. Subclasses can handle
 * more complicated scenarios, e.g.with fault tolerance. If output items are
 * skipped they should be removed from the inputs as well.
 *
 * @param contribution the current step contribution
 * @param inputs       the inputs that gave rise to the outputs
 * @param outputs      the outputs to write
 * @throws Exception if there is a problem
 */
protected void write(StepContribution contribution, Chunk<I> inputs, Chunk<O> outputs) throws Exception {
    Timer.Sample sample = BatchMetrics.createTimerSample();
    String status = BatchMetrics.STATUS_SUCCESS;
    try {
        doWrite(outputs.getItems());
    } catch (Exception e) {
        /*
         * For a simple chunk processor (no fault tolerance) we are done
         * here, so prevent any more processing of these inputs.
         */
        inputs.clear();
        status = BatchMetrics.STATUS_FAILURE;
        throw e;
    } finally {
        stopTimer(sample, contribution.getStepExecution(), "chunk.write", status, "Chunk writing");
    }
    contribution.incrementWriteCount(outputs.size());
}
```

关键俩句，`doWrite(outputs.getItems());`和 `contribution.incrementWriteCount(outputs.size());`。后面就是添加 `WriteCount`。

> doWrite(outputs.getItems())

```java
protected final void doWrite(List<O> items) throws Exception {

    if (itemWriter == null) {
        return;
    }

    try {
        listener.beforeWrite(items);
        writeItems(items);
        doAfterWrite(items);
    } catch (Exception e) {
        doOnWriteError(e, items);
        throw e;
    }

}
```

`listener.beforeWrite(items)`：首先`ItemWriteListener#beforeWrite`方法。
`writeItems(items);`:自己写的`itemWriter`。执行里面的方法。
`doAfterWrite(items)`：执行`ItemWriteListener#afterWrite`方法。

这里我们要注意，这只是一次，也就是我们写的 `stepBuilders.get("test-step").<Integer, Integer>chunk(2)`,读取俩次值放入 Chunk
中，再`RepeatTemplate#iterate(RepeatCallback callback)`
调用 `RepeatTemplate#executeInternal(final RepeatCallback callback)`里面。有个 while
循环，出去条件就是`isComplete(context, result) || isMarkedComplete(context) || !deferred.isEmpty()`
。这一段我们方法放在外面的`RepeatTemplate`中进行讲解。

> chunkProvider.postProcess(contribution, inputs);

当前实现类没有处理。

> inputs.isBusy()

值为 false。

下面就是删除当前`INPUTS_KEY`的值，设置`Complete`为 true。

> RepeatStatus.continueIf(!inputs.isEnd());

这是很重要的一点，是否已经结束。上面讲到过。是否已经结束了。

又回到`TaskletStep#doInTransaction(TransactionStatus status)`
，刚刚所有的方法都在`tasklet.execute(contribution, chunkContext)`中。

然后接着执行 finally 中的代码。
semaphore.acquire(); 信号量，锁上。
locked = true; 锁=true。

如果步骤操作是异步的，那么我们需要将更改同步到步骤执行（至少）。在更改步骤执行之前锁定。

继续执行`stepExecution.apply(contribution);`

```java
public synchronized void apply(StepContribution contribution) {
    readSkipCount += contribution.getReadSkipCount();
    writeSkipCount += contribution.getWriteSkipCount();
    processSkipCount += contribution.getProcessSkipCount();
    filterCount += contribution.getFilterCount();
    readCount += contribution.getReadCount();
    writeCount += contribution.getWriteCount();
    exitStatus = exitStatus.and(contribution.getExitStatus());
}
```

相加。

> stepExecutionUpdated = true;

等到使用再讲解。

> stream.update(stepExecution.getExecutionContext());

现在到了`ItemStream#update(ExecutionContext executionContext)`了。

> getJobRepository().updateExecutionContext(stepExecution);

`MapExecutionContextDao` 更新。

> getJobRepository().update(stepExecution);

后面详细讲解。就是更新 map。数据库就更新数据库，同步 job 状态。

接着返回状态，回到了 TransactionTemplate#execute(TransactionCallback<T> action)。提交事务，返回状态。

又回到`TaskletStep#doExecute(StepExecution stepExecution)`
中`stepOperations.iterate(new StepContextRepeatCallback(stepExecution) {`里面。
这里面其实是在`RepeatTemplate#iterate(RepeatCallback callback)`调用的`executeInternal(callback)`这里。这里调用的具体逻辑下面仔细讲解。

先看`TaskletStep#doExecute(StepExecution stepExecution)`中`chunkListener.afterChunk(chunkContext);`
。执行`ChunkListener#afterChunk`。后面 interruptionPolicy.checkInterrupted(stepExecution); 判断线程是否被中短。

继续往下执行，回到 `RepeatTemplate#executeInternal(final RepeatCallback callback)`。

> executeAfterInterceptors(context, result);

执行`RepeatListener#after`。

> isComplete(context, result) || isMarkedComplete(context) || !deferred.isEmpty()

顺序在这里可能很重要。

```java
protected boolean isComplete(RepeatContext context, RepeatStatus result) {
    boolean complete = completionPolicy.isComplete(context, result);
    if (complete) {
        logger.debug("Repeat is complete according to policy and result value.");
    }
    return complete;
}
```

状态是否为`RepeatStatus#CONTINUABLE`。

```java
private boolean isMarkedComplete(RepeatContext context) {
    boolean complete = context.isCompleteOnly();
    if (context.getParent() != null) {
        complete = complete || isMarkedComplete(context.getParent());
    }
    if (complete) {
        logger.debug("Repeat is complete according to context alone.");
    }
    return complete;

}
```

检查上一层。

> deferred.isEmpty()

在 `doHandle(throwable, context, deferred);`中的，如果有异常，这个里面就有值。

现在没有进入，`running`还是 true，所以继续执行。这个`RepeatTemplate`是外层的，里面真正执行`ItemReader`和`ItemWriter`
的是一个叫`RepeatOperations chunkOperations`的`RepeatTemplate` 执行的。

执行完了之后，就到了`result = result.and(waitForResults(state));`。为 ture，这个值在这个地方没有用的。

剩下就是`RepeatListener#close`。`context.close();`

回到 `AbstractStep#execute(StepExecution stepExecution)`。剩下的都是一些资源清除，catch 块里面的内容了，感兴趣的可以自己看看。
关键的就是
`getJobRepository().updateExecutionContext(stepExecution);`
`getJobRepository().update(stepExecution);`
`close(stepExecution.getExecutionContext());`
`doExecutionRelease();`

回到`SimpleStepHandler#handleStep(Step step, JobExecution execution)`
。刚刚我们所有方法都是在`step.execute(currentStepExecution);`中执行的。继续也是一些异常处理,关键就下面几句。
`currentStepExecution.getExecutionContext().put("batch.executed", true);`
`jobRepository.updateExecutionContext(execution);`

回到`SimpleJob#doExecute(JobExecution execution)`里面，我们把所有的`steps`执行完了。然后状态更改。

```java
execution.upgradeStatus(stepExecution.getStatus());
        execution.setExitStatus(stepExecution.getExitStatus());
```

回到`AbstractJob#execute(JobExecution execution)`，里面的`doExecute(execution);`执行完成，后面又是一些状态更新，数据保存。

`listener.afterJob(execution);`：`JobExecutionListener#afterJob`
`jobRepository.update(execution);`
`JobSynchronizationManager.release();`

至此就基本看完了里面大体流程。一些细节方面在下面类里面主要讲解。

## BatchAutoConfiguration

## BatchConfigurerConfiguration

### DefaultBatchConfigurer

首先`Autowired`注入`DataSource`。这里就要区分是手动创建还是注入 spring 中的了。手动创建需要手动执行`initialize()`方法，spring
创建的因为加了`@PostConstruct`注解。会自动执行。

#### DefaultBatchConfigurer#initialize()

```java
try {
    if (dataSource == null) {
        logger.warn("No datasource was provided...using a Map based JobRepository");

        if (getTransactionManager() == null) {
            logger.warn("No transaction manager was provided, using a ResourcelessTransactionManager");
            this.transactionManager = new ResourcelessTransactionManager();
        }

        MapJobRepositoryFactoryBean jobRepositoryFactory = new MapJobRepositoryFactoryBean(getTransactionManager());
        jobRepositoryFactory.afterPropertiesSet();
        this.jobRepository = jobRepositoryFactory.getObject();

        MapJobExplorerFactoryBean jobExplorerFactory = new MapJobExplorerFactoryBean(jobRepositoryFactory);
        jobExplorerFactory.afterPropertiesSet();
        this.jobExplorer = jobExplorerFactory.getObject();
    } else {
        this.jobRepository = createJobRepository();
        this.jobExplorer = createJobExplorer();
    }

    this.jobLauncher = createJobLauncher();
} catch (Exception e) {
    throw new BatchConfigurationException(e);
}
```

很简单的代码，`dataSource`不存在，`jobExplorer`和`jobRepository`就使用`MapJobRepositoryFactoryBean`
和`MapJobExplorerFactoryBean`
这里还有个`private PlatformTransactionManager transactionManager`，如果 spring 管理的`DefaultBatchConfigurer`
类，使用`DataSourceTransactionManager`，否则使用`ResourcelessTransactionManager`。这俩个类一个是 spring 事务相关的不做多讲解

## Listener

里面涉及到一大堆的监听器，处理器。每个类基本都有讲到。 类上的注释非常重要~！

首先校验，然后使用`stepExecution`保存数据。ecDao 保存 ExecutionContext。
