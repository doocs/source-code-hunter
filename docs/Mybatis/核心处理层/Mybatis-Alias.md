# Mybatis Alias

- Author: [HuiFer](https://github.com/huifer)
- Description: 该文介绍 mybatis Alias 源码
- 源码阅读工程: [SourceHot-Mybatis](https://github.com/SourceHot/mybatis-read.git)
- 源码位置 :`org.apache.ibatis.type.Alias`
- 与 Alias 相关的一个方法`org.apache.ibatis.type.TypeAliasRegistry.registerAlias(java.lang.String, java.lang.Class<?>)`(别名注册)

```java
    /**
     * 别名注册,
     * typeAliases 是一个map key=>别名,value=>字节码
     *
     * @param alias 别名名称
     * @param value 别名的字节码
     */
    public void registerAlias(String alias, Class<?> value) {
        if (alias == null) {
            throw new TypeException("The parameter alias cannot be null");
        }
        // issue #748
        String key = alias.toLowerCase(Locale.ENGLISH);
        if (typeAliases.containsKey(key) && typeAliases.get(key) != null && !typeAliases.get(key).equals(value)) {
            throw new TypeException("The alias '" + alias + "' is already mapped to the value '" + typeAliases.get(key).getName() + "'.");
        }
        typeAliases.put(key, value);
    }

```

- registerAlias 操作的对象是一个`map`对象

```java

    /**
     * 别名存放仓库
     * 是一个map key=>别名,value=>字节码
     */
    private final Map<String, Class<?>> typeAliases = new HashMap<>();
```

不难看出这个对象存放的内容是 别名 -> clazz.

- 相关注解`Alias`

```java
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
public @interface Alias {
    /**
     * Return the alias name.
     *
     * @return the alias name
     */
    String value();
}
```

- 看一下实现方式

```java
    /**
     * 加载{@link Alias} 注解的内容
     *
     * @param type
     */
    public void registerAlias(Class<?> type) {
        String alias = type.getSimpleName();
        Alias aliasAnnotation = type.getAnnotation(Alias.class);
        if (aliasAnnotation != null) {
            // 获取 别名注解
            alias = aliasAnnotation.value();
        }
        // 转换为 别名,clazz
        registerAlias(alias, type);
    }
```

最后回到了`org.apache.ibatis.type.TypeAliasRegistry.registerAlias(java.lang.String, java.lang.Class<?>)`方法
我们可以简单编写一个测试类

```java
@Alias(value = "hc")
public class Hc {
}

    /**
     * 对注解 {@link Alias} 的测试用例
     */
    @Test
    void testAnnotation() {
        TypeAliasRegistry typeAliasRegistry = new TypeAliasRegistry();
        typeAliasRegistry.registerAlias(Hc.class);
        assertEquals("org.apache.ibatis.type.Hc", typeAliasRegistry.resolveAlias("hc").getName());
    }

```

其他与`Alias`相关的测试类位于: `org.apache.ibatis.type.TypeAliasRegistryTest`
