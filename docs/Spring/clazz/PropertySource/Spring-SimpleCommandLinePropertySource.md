# Spring SimpleCommandLinePropertySource

- 全路径: `org.springframework.core.env.SimpleCommandLinePropertySource`

```java
public class SimpleCommandLinePropertySource extends CommandLinePropertySource<CommandLineArgs> {}
```

- SimpleCommandLinePropertySource 的 source 类型是 CommandLineArgs 具体解释请看下面分析

## CommandLineArgs

两个内部属性

```java
class CommandLineArgs {
	/**
	 * 选项参数列表
	 */
	private final Map<String, List<String>> optionArgs = new HashMap<>();

	/**
	 * 非选项参数列表
	 */
	private final List<String> nonOptionArgs = new ArrayList<>();

}
```

### addOptionArg

添加 选项参数

```java
public void addOptionArg(String optionName, @Nullable String optionValue) {
   if (!this.optionArgs.containsKey(optionName)) {
      this.optionArgs.put(optionName, new ArrayList<>());
   }
   if (optionValue != null) {
      this.optionArgs.get(optionName).add(optionValue);
   }
}
```

### getOptionNames

- 获取选项参数列表

```java
public Set<String> getOptionNames() {
   return Collections.unmodifiableSet(this.optionArgs.keySet());
}
```

- 其他方法不具体描述了，各位可以查看下面的代码

```java
class CommandLineArgs {

   /**
    * 选项参数列表
    */
   private final Map<String, List<String>> optionArgs = new HashMap<>();

   /**
    * 非选项参数列表
    */
   private final List<String> nonOptionArgs = new ArrayList<>();

   /**
    * Add an option argument for the given option name and add the given value to the
    * list of values associated with this option (of which there may be zero or more).
    * The given value may be {@code null}, indicating that the option was specified
    * without an associated value (e.g. "--foo" vs. "--foo=bar").
    *
    * 添加 选项参数
    */
   public void addOptionArg(String optionName, @Nullable String optionValue) {
      if (!this.optionArgs.containsKey(optionName)) {
         this.optionArgs.put(optionName, new ArrayList<>());
      }
      if (optionValue != null) {
         this.optionArgs.get(optionName).add(optionValue);
      }
   }

   /**
    * Return the set of all option arguments present on the command line.
    * 获取选项参数列表
    */
   public Set<String> getOptionNames() {
      return Collections.unmodifiableSet(this.optionArgs.keySet());
   }

   /**
    * Return whether the option with the given name was present on the command line.
    */
   public boolean containsOption(String optionName) {
      return this.optionArgs.containsKey(optionName);
   }

   /**
    * Return the list of values associated with the given option. {@code null} signifies
    * that the option was not present; empty list signifies that no values were associated
    * with this option.
    */
   @Nullable
   public List<String> getOptionValues(String optionName) {
      return this.optionArgs.get(optionName);
   }

   /**
    * Add the given value to the list of non-option arguments.
    */
   public void addNonOptionArg(String value) {
      this.nonOptionArgs.add(value);
   }

   /**
    * Return the list of non-option arguments specified on the command line.
    */
   public List<String> getNonOptionArgs() {
      return Collections.unmodifiableList(this.nonOptionArgs);
   }

}
```

在了解 CommandLineArgs 类后再来看 SimpleCommandLinePropertySource 会相对容易. 内部的几个方法就是调用 CommandLineArgs 所提供的方法

```java
@Override
public String[] getPropertyNames() {
   return StringUtils.toStringArray(this.source.getOptionNames());
}

@Override
protected boolean containsOption(String name) {
   return this.source.containsOption(name);
}

@Override
@Nullable
protected List<String> getOptionValues(String name) {
   return this.source.getOptionValues(name);
}

@Override
protected List<String> getNonOptionArgs() {
   return this.source.getNonOptionArgs();
}
```
