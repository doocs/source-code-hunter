# MethodSignature

- Author: [HuiFer](https://github.com/huifer)
- Description: 该文介绍 mybatis MethodSignature 类
- 源码阅读工程: [SourceHot-Mybatis](https://github.com/SourceHot/mybatis-read.git)
- `org.apache.ibatis.binding.MapperMethod.MethodSignature`

```java
    /**
     * 方法签名
     */
    public static class MethodSignature {

        /**
         * 返回值是否多个
         */
        private final boolean returnsMany;
        /**
         * 返回值是不是map
         */
        private final boolean returnsMap;
        /**
         * 返回值是否 void
         */
        private final boolean returnsVoid;
        /**
         * 返回的是否是一个游标
         */
        private final boolean returnsCursor;
        /**
         * 返回值是否是 optional
         */
        private final boolean returnsOptional;
        /**
         * 返回类型
         */
        private final Class<?> returnType;
        /**
         * map key
         */
        private final String mapKey;
        private final Integer resultHandlerIndex;
        private final Integer rowBoundsIndex;
        /**
         * 参数解析
         */
        private final ParamNameResolver paramNameResolver;

        public MethodSignature(Configuration configuration, Class<?> mapperInterface, Method method) {
            Type resolvedReturnType = TypeParameterResolver.resolveReturnType(method, mapperInterface);
            if (resolvedReturnType instanceof Class<?>) {
                this.returnType = (Class<?>) resolvedReturnType;
            } else if (resolvedReturnType instanceof ParameterizedType) {
                this.returnType = (Class<?>) ((ParameterizedType) resolvedReturnType).getRawType();
            } else {
                this.returnType = method.getReturnType();
            }
            this.returnsVoid = void.class.equals(this.returnType);
            this.returnsMany = configuration.getObjectFactory().isCollection(this.returnType) || this.returnType.isArray();
            this.returnsCursor = Cursor.class.equals(this.returnType);
            this.returnsOptional = Optional.class.equals(this.returnType);
            this.mapKey = getMapKey(method);
            this.returnsMap = this.mapKey != null;
            this.rowBoundsIndex = getUniqueParamIndex(method, RowBounds.class);
            this.resultHandlerIndex = getUniqueParamIndex(method, ResultHandler.class);
            this.paramNameResolver = new ParamNameResolver(configuration, method);
        }

        /**
         * 方法主要是把方法参数转换为SQL命令参数。
         *
         * @param args
         * @return
         */
        public Object convertArgsToSqlCommandParam(Object[] args) {
            return paramNameResolver.getNamedParams(args);
        }

        /**
         * 是否有 {@link RowBounds}
         *
         * @return
         */
        public boolean hasRowBounds() {
            return rowBoundsIndex != null;
        }

        public RowBounds extractRowBounds(Object[] args) {
            return hasRowBounds() ? (RowBounds) args[rowBoundsIndex] : null;
        }

        /**
         * 是否uresultHandler
         *
         * @return
         */
        public boolean hasResultHandler() {
            return resultHandlerIndex != null;
        }

        public ResultHandler extractResultHandler(Object[] args) {
            return hasResultHandler() ? (ResultHandler) args[resultHandlerIndex] : null;
        }

        public String getMapKey() {
            return mapKey;
        }

        public Class<?> getReturnType() {
            return returnType;
        }

        public boolean returnsMany() {
            return returnsMany;
        }

        public boolean returnsMap() {
            return returnsMap;
        }

        public boolean returnsVoid() {
            return returnsVoid;
        }

        public boolean returnsCursor() {
            return returnsCursor;
        }

        /**
         * return whether return type is {@code java.util.Optional}.
         *
         * @return return {@code true}, if return type is {@code java.util.Optional}
         * @since 3.5.0
         */
        public boolean returnsOptional() {
            return returnsOptional;
        }

        /**
         * 获取参数名
         * {@link RowBounds}
         *
         * @param method    mapper 方法
         * @param paramType
         * @return
         */
        private Integer getUniqueParamIndex(Method method, Class<?> paramType) {
            Integer index = null;
            // 获取参数类型
            final Class<?>[] argTypes = method.getParameterTypes();
            for (int i = 0; i < argTypes.length; i++) {
                if (paramType.isAssignableFrom(argTypes[i])) {
                    if (index == null) {
                        index = i;
                    } else {
                        throw new BindingException(method.getName() + " cannot have multiple " + paramType.getSimpleName() + " parameters");
                    }
                }
            }
            return index;
        }

        /**
         * 获取 {@link MapKey} 注解数据
         *
         * @param method
         * @return
         */
        private String getMapKey(Method method) {
            String mapKey = null;
            if (Map.class.isAssignableFrom(method.getReturnType())) {
                final MapKey mapKeyAnnotation = method.getAnnotation(MapKey.class);
                if (mapKeyAnnotation != null) {
                    mapKey = mapKeyAnnotation.value();
                }
            }
            return mapKey;
        }
    }

```
