# Spring-SimpleAliasRegistry

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [huifer-spring](https://github.com/huifer/spring-framework)

## AliasRegistry

- `SimpleAliasRegistry`继承`org.springframework.core.AliasRegistry`

```java
public interface AliasRegistry {

    /**
     * Given a name, register an alias for it.
     * 别名注册
     *
     * @param name  the canonical name
     * @param alias the alias to be registered
     * @throws IllegalStateException if the alias is already in use
     *                               and may not be overridden
     * @see SimpleAliasRegistry
     * @see org.springframework.context.support.GenericApplicationContext
     */
    void registerAlias(String name, String alias);

    /**
     * Remove the specified alias from this registry.
     * 别名移除
     *
     * @param alias the alias to remove
     * @throws IllegalStateException if no such alias was found
     */
    void removeAlias(String alias);

    /**
     * Determine whether this given name is defines as an alias
     * (as opposed to the name of an actually registered component).
     * 是不是别名
     *
     * @param name the name to check
     * @return whether the given name is an alias
     */
    boolean isAlias(String name);

    /**
     * Return the aliases for the given name, if defined.
     * 从别名注册map中获取别名信息
     *
     * @param name the name to check for aliases
     * @return the aliases, or an empty array if none
     */
    String[] getAliases(String name);

}
```

## SimpleAliasRegistry

```java
/**
 * Simple implementation of the {@link AliasRegistry} interface.
 * Serves as base class for
 * {@link org.springframework.beans.factory.support.BeanDefinitionRegistry}
 * implementations.
 *
 * @author Juergen Hoeller
 * @since 2.5.2
 */
public class SimpleAliasRegistry implements AliasRegistry {

    /**
     * Logger available to subclasses.
     */
    protected final Log logger = LogFactory.getLog(getClass());

    /**
     * Map from alias to canonical name.
     * 存放别名的map(线程安全的),
     * 结构: alias-> name
     */
    private final Map<String, String> aliasMap = new ConcurrentHashMap<>(16);


    /**
     * {@code <alias name="appleBean" alias="hhh"/>}
     *
     * @param name  the canonical name
     *              alias 标签的name属性
     * @param alias the alias to be registered
     *              alias 标签的alias属性
     */
    @Override
    public void registerAlias(String name, String alias) {
        Assert.hasText(name, "'name' must not be empty");
        Assert.hasText(alias, "'alias' must not be empty");
        synchronized (this.aliasMap) {
            // 判断: 别名和名字是否相同
            if (alias.equals(name)) {
                //相同在别名map中移除
                this.aliasMap.remove(alias);
                if (logger.isDebugEnabled()) {
                    logger.debug("Alias definition '" + alias + "' ignored since it points to same name");
                }
            }
            else {
                // 不相同
                // 从map对象中获取别名为alias的value
                String registeredName = this.aliasMap.get(alias);
                if (registeredName != null) {
                    // 判断map中是否有有一个别名和传入的name相同的内容
                    if (registeredName.equals(name)) {
                        // An existing alias - no need to re-register
                        return;
                    }
                    if (!allowAliasOverriding()) {
                        throw new IllegalStateException("Cannot define alias '" + alias + "' for name '" +
                                name + "': It is already registered for name '" + registeredName + "'.");
                    }
                    if (logger.isDebugEnabled()) {
                        logger.debug("Overriding alias '" + alias + "' definition for registered name '" +
                                registeredName + "' with new target name '" + name + "'");
                    }
                }
                // 别名环检查
                checkForAliasCircle(name, alias);
                // 放入 map 对象中 alias-> name
                this.aliasMap.put(alias, name);
                if (logger.isTraceEnabled()) {
                    logger.trace("Alias definition '" + alias + "' registered for name '" + name + "'");
                }
            }
        }
    }

    /**
     * Return whether alias overriding is allowed.
     * Default is {@code true}.
     * 是否允许重写别名
     */
    protected boolean allowAliasOverriding() {
        return true;
    }

    /**
     * Determine whether the given name has the given alias registered.
     * <p>
     * 递归判断是否已经存在别名
     *
     * @param name  the name to check
     * @param alias the alias to look for
     * @since 4.2.1
     */
    public boolean hasAlias(String name, String alias) {
        for (Map.Entry<String, String> entry : this.aliasMap.entrySet()) {
            // 获取key值
            String registeredName = entry.getValue();
            if (registeredName.equals(name)) {
                String registeredAlias = entry.getKey();
                // 循环引用判断
                if (registeredAlias.equals(alias) || hasAlias(registeredAlias, alias)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * 别名移除
     *
     * @param alias the alias to remove
     */
    @Override
    public void removeAlias(String alias) {
        synchronized (this.aliasMap) {
            // 判断是否移除成功
            String name = this.aliasMap.remove(alias);
            if (name == null) {
                throw new IllegalStateException("No alias '" + alias + "' registered");
            }
        }
    }

    /**
     * 判断是否是一个别名,校验方式{@link org.springframework.core.SimpleAliasRegistry#aliasMap} 的key是否包含
     *
     * @param name the name to check
     * @return
     */
    @Override
    public boolean isAlias(String name) {
        return this.aliasMap.containsKey(name);
    }

    /**
     * 获取别名列表
     *
     * @param name the name to check for aliases
     * @return
     */
    @Override
    public String[] getAliases(String name) {
        List<String> result = new ArrayList<>();
        synchronized (this.aliasMap) {
            retrieveAliases(name, result);
        }
        return StringUtils.toStringArray(result);
    }

    /**
     * Transitively retrieve all aliases for the given name.
     * 根据 name 获取别名
     *
     * @param name   the target name to find aliases for
     * @param result the resulting aliases list
     */
    private void retrieveAliases(String name, List<String> result) {
        // 循环获取
        this.aliasMap.forEach((alias, registeredName) -> {
            if (registeredName.equals(name)) {
                result.add(alias);
                // 递归查询循环引用的别名
                retrieveAliases(alias, result);
            }
        });
    }

    /**
     * Resolve all alias target names and aliases registered in this
     * factory, applying the given StringValueResolver to them.
     * <p>The value resolver may for example resolve placeholders
     * in target bean names and even in alias names.
     *
     * @param valueResolver the StringValueResolver to apply
     */
    public void resolveAliases(StringValueResolver valueResolver) {
        Assert.notNull(valueResolver, "StringValueResolver must not be null");
        synchronized (this.aliasMap) {
            Map<String, String> aliasCopy = new HashMap<>(this.aliasMap);
            aliasCopy.forEach((alias, registeredName) -> {
                String resolvedAlias = valueResolver.resolveStringValue(alias);
                String resolvedName = valueResolver.resolveStringValue(registeredName);
                if (resolvedAlias == null || resolvedName == null || resolvedAlias.equals(resolvedName)) {
                    this.aliasMap.remove(alias);
                }
                else if (!resolvedAlias.equals(alias)) {
                    String existingName = this.aliasMap.get(resolvedAlias);
                    if (existingName != null) {
                        if (existingName.equals(resolvedName)) {
                            // Pointing to existing alias - just remove placeholder
                            this.aliasMap.remove(alias);
                            return;
                        }
                        throw new IllegalStateException(
                                "Cannot register resolved alias '" + resolvedAlias + "' (original: '" + alias +
                                        "') for name '" + resolvedName + "': It is already registered for name '" +
                                        registeredName + "'.");
                    }
                    checkForAliasCircle(resolvedName, resolvedAlias);
                    this.aliasMap.remove(alias);
                    this.aliasMap.put(resolvedAlias, resolvedName);
                }
                else if (!registeredName.equals(resolvedName)) {
                    this.aliasMap.put(alias, resolvedName);
                }
            });
        }
    }

    /**
     * Check whether the given name points back to the given alias as an alias
     * in the other direction already, catching a circular reference upfront
     * and throwing a corresponding IllegalStateException.
     * <p>
     * 判断是否循环别名
     *
     * @param name  the candidate name
     * @param alias the candidate alias
     * @see #registerAlias
     * @see #hasAlias
     */
    protected void checkForAliasCircle(String name, String alias) {
        if (hasAlias(alias, name)) {
            throw new IllegalStateException("Cannot register alias '" + alias +
                    "' for name '" + name + "': Circular reference - '" +
                    name + "' is a direct or indirect alias for '" + alias + "' already");
        }
    }

    /**
     * Determine the raw name, resolving aliases to canonical names.
     *
     * @param name the user-specified name
     * @return the transformed name
     */
    public String canonicalName(String name) {
        String canonicalName = name;
        // Handle aliasing...
        String resolvedName;
        do {
            resolvedName = this.aliasMap.get(canonicalName);
            if (resolvedName != null) {
                canonicalName = resolvedName;
            }
        }
        while (resolvedName != null);
        return canonicalName;
    }

}

```
