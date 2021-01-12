# Spring Formatter

- 类全路径: `org.springframework.format.Formatter`

```java
public interface Formatter<T> extends Printer<T>, Parser<T> {

}
```

- 该接口继承了 printer 和 parser 两个接口.
- 比较常见的有: `DateFormatter` 就是继承这个接口.
