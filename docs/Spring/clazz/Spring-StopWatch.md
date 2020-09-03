# Spring StopWatch

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)

- 全路径: `org.springframework.util.StopWatch`

## 属性

- taskList: 任务信息列表
- keepTaskList: 是否保留任务信息列表
- startTimeMillis: 任务开始的时间
- currentTaskName: 任务名称
- lastTaskInfo: 任务信息
- taskCount: 任务数量
- totalTimeMillis: 总共花费的时间

## 方法

- `org.springframework.util.StopWatch.start(java.lang.String)`

```java
    public void start(String taskName) throws IllegalStateException {
        if (this.currentTaskName != null) {
            throw new IllegalStateException("Can't start StopWatch: it's already running");
        }
        this.currentTaskName = taskName;
        this.startTimeMillis = System.currentTimeMillis();
    }
```

- `org.springframework.util.StopWatch.stop`

```java
    public void stop() throws IllegalStateException {
        if (this.currentTaskName == null) {
            throw new IllegalStateException("Can't stop StopWatch: it's not running");
        }
        // 消费的时间
        long lastTime = System.currentTimeMillis() - this.startTimeMillis;
        this.totalTimeMillis += lastTime;
        // 任务信息初始化
        this.lastTaskInfo = new TaskInfo(this.currentTaskName, lastTime);
        if (this.keepTaskList) {
            this.taskList.add(this.lastTaskInfo);
        }
        ++this.taskCount;
        this.currentTaskName = null;
    }

```
