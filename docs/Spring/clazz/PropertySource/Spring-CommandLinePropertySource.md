# Spring CommandLinePropertySource

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-spring](https://github.com/SourceHot/spring-framework-read)


- 类全路径: `org.springframework.core.env.CommandLinePropertySource`
- 作用: 用来存储命令行参数





```java
public abstract class CommandLinePropertySource<T> extends EnumerablePropertySource<T> {

   public static final String COMMAND_LINE_PROPERTY_SOURCE_NAME = "commandLineArgs";

   public static final String DEFAULT_NON_OPTION_ARGS_PROPERTY_NAME = "nonOptionArgs";


   private String nonOptionArgsPropertyName = DEFAULT_NON_OPTION_ARGS_PROPERTY_NAME;



   public CommandLinePropertySource(T source) {
      // 命令行参数, 属性值
      super(COMMAND_LINE_PROPERTY_SOURCE_NAME, source);
   }

   public CommandLinePropertySource(String name, T source) {
      // 参数名称, 参数值
      super(name, source);
   }


   public void setNonOptionArgsPropertyName(String nonOptionArgsPropertyName) {
      this.nonOptionArgsPropertyName = nonOptionArgsPropertyName;
   }

   @Override
   public final boolean containsProperty(String name) {
      // 输入值是否等于nonOptionArgs
      if (this.nonOptionArgsPropertyName.equals(name)) {
         // 等于后判断参数列表是否为空
         return !this.getNonOptionArgs().isEmpty();
      }
      // 是否存在 name 属性
      return this.containsOption(name);
   }

   @Override
   @Nullable
   public final String getProperty(String name) {
      if (this.nonOptionArgsPropertyName.equals(name)) {
         // 获取 非可选项参数列表
         Collection<String> nonOptionArguments = this.getNonOptionArgs();
         if (nonOptionArguments.isEmpty()) {
            return null;
         }
         else {
            // 可选参数命令行参数
            return StringUtils.collectionToCommaDelimitedString(nonOptionArguments);
         }
      }
      Collection<String> optionValues = this.getOptionValues(name);
      if (optionValues == null) {
         return null;
      }
      else {
         // 命令行参数
         return StringUtils.collectionToCommaDelimitedString(optionValues);
      }
   }


   /**
    * 是否存在 name 的命令行参数
    */
   protected abstract boolean containsOption(String name);

   /**
    * 获取参数列表集合
    */
   @Nullable
   protected abstract List<String> getOptionValues(String name);

   /**
    * 获取 non-option 参数列表
    */
   protected abstract List<String> getNonOptionArgs();

}
```





## getOptionValues

```java
/**
 * Return the collection of values associated with the command line option having the
 * given name.
 * <ul>
 * <li>if the option is present and has no argument (e.g.: "--foo"), return an empty
 * collection ({@code []})</li>
 * <li>if the option is present and has a single value (e.g. "--foo=bar"), return a
 * collection having one element ({@code ["bar"]})</li>
 * <li>if the option is present and the underlying command line parsing library
 * supports multiple arguments (e.g. "--foo=bar --foo=baz"), return a collection
 * having elements for each value ({@code ["bar", "baz"]})</li>
 * <li>if the option is not present, return {@code null}</li>
 * </ul>
 *
 * 获取参数列表集合
 */
@Nullable
protected abstract List<String> getOptionValues(String name);
```



阅读注释可以知道该方法可以获取命令行参数的列表. 

- 如 `--foo`作为开头当输入命令行为 `--foo=bar --foo=baz` 在输入参数名称 `foo` 会得到数据`bar,baz` 