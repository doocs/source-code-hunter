# Spring 元信息

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读仓库: [SourceHot-Spring](https://github.com/SourceHot/spring-framework-read)

## ClassMetadata

```java
public interface ClassMetadata {

    /**
     * 类名
     */
    String getClassName();

    /**
     * 是否是接口
     */
    boolean isInterface();

    /**
     * 是否是注解
     */
    boolean isAnnotation();

    /**
     * 是否是超类
     */
    boolean isAbstract();

    /**
     * 是否允许创建,实例化
     */
    default boolean isConcrete() {
        return !(isInterface() || isAbstract());
    }

    /**
     * 是否有final修饰
     */
    boolean isFinal();

    /**
     * 是否独立
     */
    boolean isIndependent();

    /**
     * 是否有内部类
     */
    default boolean hasEnclosingClass() {
        return (getEnclosingClassName() != null);
    }

    /**
     * 是否是基础类
     */
    @Nullable
    String getEnclosingClassName();

    /**
     * 是否有父类
     */
    default boolean hasSuperClass() {
        return (getSuperClassName() != null);
    }

    /**
     * 父类名称
     */
    @Nullable
    String getSuperClassName();

    /**
     * 实现类名称列表
     */
    String[] getInterfaceNames();

    /**
     * 成员列表
     * @since 3.1
     */
    String[] getMemberClassNames();

}
```

![image-20200824094154847](/images/spring/image-20200824094154847.png)

## AnnotatedTypeMetadata

```java
public interface AnnotatedTypeMetadata {

    /**
     * 获取所有注解
     */
    MergedAnnotations getAnnotations();

    /**
     * 是否有注解
     */
    default boolean isAnnotated(String annotationName) {
        return getAnnotations().isPresent(annotationName);
    }

    /**
     * 获取注解的属性
     */
    @Nullable
    default Map<String, Object> getAnnotationAttributes(String annotationName) {
        return getAnnotationAttributes(annotationName, false);
    }
    // 省略其他

}
```

## AnnotationMetadata

```java
public interface AnnotationMetadata extends ClassMetadata, AnnotatedTypeMetadata {

   /**
     * 获取注解名称,全类名
    */
   default Set<String> getAnnotationTypes() {
      return getAnnotations().stream()
            .filter(MergedAnnotation::isDirectlyPresent)
            .map(annotation -> annotation.getType().getName())
            .collect(Collectors.toCollection(LinkedHashSet::new));
   }

   /**
     * 注解全类名
    */
   default Set<String> getMetaAnnotationTypes(String annotationName) {
      MergedAnnotation<?> annotation = getAnnotations().get(annotationName, MergedAnnotation::isDirectlyPresent);
      if (!annotation.isPresent()) {
         return Collections.emptySet();
      }
      return MergedAnnotations.from(annotation.getType(), SearchStrategy.INHERITED_ANNOTATIONS).stream()
            .map(mergedAnnotation -> mergedAnnotation.getType().getName())
            .collect(Collectors.toCollection(LinkedHashSet::new));
   }

   /**
     * 是否包含某个注解
    */
   default boolean hasAnnotation(String annotationName) {
      return getAnnotations().isDirectlyPresent(annotationName);
   }

   /**
     * 是否被某个注解标记过
    */
   default boolean hasMetaAnnotation(String metaAnnotationName) {
      return getAnnotations().get(metaAnnotationName,
            MergedAnnotation::isMetaPresent).isPresent();
   }

   /**
     * 是否有注解,类里面有一个注解就返回true
    */
   default boolean hasAnnotatedMethods(String annotationName) {
      return !getAnnotatedMethods(annotationName).isEmpty();
   }

   /**
     * 获取包含注解的方法
    */
   Set<MethodMetadata> getAnnotatedMethods(String annotationName);


   /**
     * 通过反射创建一个注解的元信息
    */
   static AnnotationMetadata introspect(Class<?> type) {
      return StandardAnnotationMetadata.from(type);
   }

}
```

## MethodMetadata

```java
public interface MethodMetadata extends AnnotatedTypeMetadata {

    /**
     * 方法名称
     */
    String getMethodName();

    /**
     * 方法全路径
     */
    String getDeclaringClassName();

    /**
     * 返回值类型
     */
    String getReturnTypeName();

    /**
     * 是不是abstrac修饰
     */
    boolean isAbstract();

    /**
     * 是否 static 修饰
     */
    boolean isStatic();

    /**
     * 是否 final 修饰
     */
    boolean isFinal();

    /**
     * 是否重载
     */
    boolean isOverridable();

}
```

## MetadataReader

```java
public interface MetadataReader {

    /**
     * Return the resource reference for the class file.
     *
     * 获取资源
     */
    Resource getResource();

    /**
     * Read basic class metadata for the underlying class.
     * 获取类的元信息
     */
    ClassMetadata getClassMetadata();

    /**
     * Read full annotation metadata for the underlying class,
     * including metadata for annotated methods.
     *
     * 获取注解的元信息
     */
    AnnotationMetadata getAnnotationMetadata();

}
```

## MetadataReaderFactory

- 用来创建 MetadataReader

```java
public interface MetadataReaderFactory {

    /**
     * Obtain a MetadataReader for the given class name.
     * @param className the class name (to be resolved to a ".class" file)
     * @return a holder for the ClassReader instance (never {@code null})
     * @throws IOException in case of I/O failure
     */
    MetadataReader getMetadataReader(String className) throws IOException;

    /**
     * Obtain a MetadataReader for the given resource.
     * @param resource the resource (pointing to a ".class" file)
     * @return a holder for the ClassReader instance (never {@code null})
     * @throws IOException in case of I/O failure
     */
    MetadataReader getMetadataReader(Resource resource) throws IOException;

}
```

- 接口解释的差不多了.接下来看一些实现

## StandardClassMetadata

- 通过 JAVA 反射来获取类的元信息

- 这个类采用的方式是 Java class 的方法,通过构造方法来填写一个 Class 对象. 之后使用这个对象的方法

```java
public class StandardClassMetadata implements ClassMetadata {

   private final Class<?> introspectedClass;

   @Deprecated
   public StandardClassMetadata(Class<?> introspectedClass) {
      Assert.notNull(introspectedClass, "Class must not be null");
      this.introspectedClass = introspectedClass;
   }

   /**
    * Return the underlying Class.
    */
   public final Class<?> getIntrospectedClass() {
      return this.introspectedClass;
   }


   @Override
   public String getClassName() {
      return this.introspectedClass.getName();
   }

   @Override
   public boolean isInterface() {
      return this.introspectedClass.isInterface();
   }

   @Override
   public boolean isAnnotation() {
      return this.introspectedClass.isAnnotation();
   }

   @Override
   public boolean isAbstract() {
      return Modifier.isAbstract(this.introspectedClass.getModifiers());
   }

   @Override
   public boolean isFinal() {
      return Modifier.isFinal(this.introspectedClass.getModifiers());
   }

   @Override
   public boolean isIndependent() {
      return (!hasEnclosingClass() ||
            (this.introspectedClass.getDeclaringClass() != null &&
                  Modifier.isStatic(this.introspectedClass.getModifiers())));
   }

   @Override
   @Nullable
   public String getEnclosingClassName() {
      Class<?> enclosingClass = this.introspectedClass.getEnclosingClass();
      return (enclosingClass != null ? enclosingClass.getName() : null);
   }

   @Override
   @Nullable
   public String getSuperClassName() {
      Class<?> superClass = this.introspectedClass.getSuperclass();
      return (superClass != null ? superClass.getName() : null);
   }

   @Override
   public String[] getInterfaceNames() {
      Class<?>[] ifcs = this.introspectedClass.getInterfaces();
      String[] ifcNames = new String[ifcs.length];
      for (int i = 0; i < ifcs.length; i++) {
         ifcNames[i] = ifcs[i].getName();
      }
      return ifcNames;
   }

   @Override
   public String[] getMemberClassNames() {
      LinkedHashSet<String> memberClassNames = new LinkedHashSet<>(4);
      for (Class<?> nestedClass : this.introspectedClass.getDeclaredClasses()) {
         memberClassNames.add(nestedClass.getName());
      }
      return StringUtils.toStringArray(memberClassNames);
   }

}
```

## StandardMethodMetadata

- 通过 java 反射获取方法的元信息
- 构造方法传递一个 method
  - 如果这个方法有注解，会进行注解的解析

```java
public class StandardMethodMetadata implements MethodMetadata {

   private final Method introspectedMethod;

   private final boolean nestedAnnotationsAsMap;

   private final MergedAnnotations mergedAnnotations;

   @Deprecated
   public StandardMethodMetadata(Method introspectedMethod) {
      this(introspectedMethod, false);
   }


   @Deprecated
   public StandardMethodMetadata(Method introspectedMethod, boolean nestedAnnotationsAsMap) {
      Assert.notNull(introspectedMethod, "Method must not be null");
      this.introspectedMethod = introspectedMethod;
      this.nestedAnnotationsAsMap = nestedAnnotationsAsMap;
      this.mergedAnnotations = MergedAnnotations.from(
            introspectedMethod, SearchStrategy.DIRECT, RepeatableContainers.none());
   }


   @Override
   public MergedAnnotations getAnnotations() {
      return this.mergedAnnotations;
   }

   /**
    * Return the underlying Method.
    */
   public final Method getIntrospectedMethod() {
      return this.introspectedMethod;
   }

   @Override
   public String getMethodName() {
      return this.introspectedMethod.getName();
   }

   @Override
   public String getDeclaringClassName() {
      return this.introspectedMethod.getDeclaringClass().getName();
   }

   @Override
   public String getReturnTypeName() {
      return this.introspectedMethod.getReturnType().getName();
   }

   @Override
   public boolean isAbstract() {
      return Modifier.isAbstract(this.introspectedMethod.getModifiers());
   }

   @Override
   public boolean isStatic() {
      return Modifier.isStatic(this.introspectedMethod.getModifiers());
   }

   @Override
   public boolean isFinal() {
      return Modifier.isFinal(this.introspectedMethod.getModifiers());
   }

   @Override
   public boolean isOverridable() {
      return !isStatic() && !isFinal() && !isPrivate();
   }

   private boolean isPrivate() {
      return Modifier.isPrivate(this.introspectedMethod.getModifiers());
   }

   @Override
   @Nullable
   public Map<String, Object> getAnnotationAttributes(String annotationName, boolean classValuesAsString) {
      if (this.nestedAnnotationsAsMap) {
         return MethodMetadata.super.getAnnotationAttributes(annotationName, classValuesAsString);
      }
      return AnnotatedElementUtils.getMergedAnnotationAttributes(this.introspectedMethod,
            annotationName, classValuesAsString, false);
   }

    /**
     * 获取所有注解的信息
     */
   @Override
   @Nullable
   public MultiValueMap<String, Object> getAllAnnotationAttributes(String annotationName, boolean classValuesAsString) {
      if (this.nestedAnnotationsAsMap) {
         return MethodMetadata.super.getAllAnnotationAttributes(annotationName, classValuesAsString);
      }
      return AnnotatedElementUtils.getAllAnnotationAttributes(this.introspectedMethod,
            annotationName, classValuesAsString, false);
   }

}
```

## StandardAnnotationMetadata

- StandardAnnotationMetadata 是 StandardClassMetadata 的子类

- 还是一个基于 JAVA 反射做的一个类

- 获取注解属性 map

```java
@Override
@Nullable
public Map<String, Object> getAnnotationAttributes(String annotationName, boolean classValuesAsString) {
   if (this.nestedAnnotationsAsMap) {
      return AnnotationMetadata.super.getAnnotationAttributes(annotationName, classValuesAsString);
   }
   return AnnotatedElementUtils.getMergedAnnotationAttributes(
         getIntrospectedClass(), annotationName, classValuesAsString, false);
}
```

- `org.springframework.core.annotation.AnnotatedElementUtils#getMergedAnnotationAttributes(java.lang.reflect.AnnotatedElement, java.lang.String, boolean, boolean)`
  - `org.springframework.core.annotation.AnnotatedElementUtils#getAnnotationAttributes`
    - `org.springframework.core.annotation.MergedAnnotation#asAnnotationAttributes`

```java
@Nullable
public static AnnotationAttributes getMergedAnnotationAttributes(AnnotatedElement element,
        String annotationName, boolean classValuesAsString, boolean nestedAnnotationsAsMap) {

    MergedAnnotation<?> mergedAnnotation = getAnnotations(element)
            .get(annotationName, null, MergedAnnotationSelectors.firstDirectlyDeclared());
    return getAnnotationAttributes(mergedAnnotation, classValuesAsString, nestedAnnotationsAsMap);
}
```

- 查看这个方法的源码借助测试类`org.springframework.core.annotation.AnnotatedElementUtilsTests#getMergedAnnotationAttributesOnClassWithLocalAnnotation`
- getAnnotations() 方法

### getAnnotations

- `org.springframework.core.annotation.MergedAnnotations#from(java.lang.reflect.AnnotatedElement, org.springframework.core.annotation.MergedAnnotations.SearchStrategy, org.springframework.core.annotation.RepeatableContainers)`

  - `org.springframework.core.annotation.TypeMappedAnnotations#from(java.lang.reflect.AnnotatedElement, org.springframework.core.annotation.MergedAnnotations.SearchStrategy, org.springframework.core.annotation.RepeatableContainers, org.springframework.core.annotation.AnnotationFilter)`

- 最终我们找到的代码如下

```java
static MergedAnnotations from(AnnotatedElement element, SearchStrategy searchStrategy,
      RepeatableContainers repeatableContainers, AnnotationFilter annotationFilter) {

   if (AnnotationsScanner.isKnownEmpty(element, searchStrategy)) {
      return NONE;
   }
   return new TypeMappedAnnotations(element, searchStrategy, repeatableContainers, annotationFilter);
}
```

- 判断是否为空. 为空返回 None，不会为空构造出一个对象 org.springframework.core.annotation.TypeMappedAnnotations

### MergedAnnotations

```java
public interface MergedAnnotations extends Iterable<MergedAnnotation<Annotation>> {

    //确定注解是否存在
    <A extends Annotation> boolean isPresent(Class<A> annotationType);
	//注解是否直接存在
	<A extends Annotation> boolean isDirectlyPresent(Class<A> annotationType);
	// 获取匹配的注解
	<A extends Annotation> MergedAnnotation<A> get(Class<A> annotationType);
		// 省略其他

}
```

- 这个接口中还有两个方法

  1. `of`
     将多个`MergedAnnotations`合并

  2. `from`

     将多个注解合并

### SearchStrategy

```java
enum SearchStrategy {

   /**
    * Find only directly declared annotations, without considering
    * {@link Inherited @Inherited} annotations and without searching
    * superclasses or implemented interfaces.
        *
        * 直接查找
    */
   DIRECT,

   /**
    * Find all directly declared annotations as well as any
    * {@link Inherited @Inherited} superclass annotations. This strategy
    * is only really useful when used with {@link Class} types since the
    * {@link Inherited @Inherited} annotation is ignored for all other
    * {@linkplain AnnotatedElement annotated elements}. This strategy does
    * not search implemented interfaces.
        *
        * 继承查找
    */
   INHERITED_ANNOTATIONS,

   /**
    * Find all directly declared and superclass annotations. This strategy
    * is similar to {@link #INHERITED_ANNOTATIONS} except the annotations
    * do not need to be meta-annotated with {@link Inherited @Inherited}.
    * This strategy does not search implemented interfaces.
        * 查找当前类和父类的注解
    */
   SUPERCLASS,

   /**
    * Perform a full search of the entire type hierarchy, including
    * superclasses and implemented interfaces. Superclass annotations do
    * not need to be meta-annotated with {@link Inherited @Inherited}.
    */
   TYPE_HIERARCHY,

   /**
    * Perform a full search of the entire type hierarchy on the source
    * <em>and</em> any enclosing classes. This strategy is similar to
    * {@link #TYPE_HIERARCHY} except that {@linkplain Class#getEnclosingClass()
    * enclosing classes} are also searched. Superclass annotations do not
    * need to be meta-annotated with {@link Inherited @Inherited}. When
    * searching a {@link Method} source, this strategy is identical to
    * {@link #TYPE_HIERARCHY}.
    */
   TYPE_HIERARCHY_AND_ENCLOSING_CLASSES
}
```

- `org.springframework.core.annotation.TypeMappedAnnotations#get(java.lang.String, java.util.function.Predicate<? super org.springframework.core.annotation.MergedAnnotation<A>>, org.springframework.core.annotation.MergedAnnotationSelector<A>)`

```java
@Override
public <A extends Annotation> MergedAnnotation<A> get(String annotationType,
      @Nullable Predicate<? super MergedAnnotation<A>> predicate,
      @Nullable MergedAnnotationSelector<A> selector) {
       // 匹配校验
   if (this.annotationFilter.matches(annotationType)) {
      return MergedAnnotation.missing();
   }
   MergedAnnotation<A> result = scan(annotationType,
         new MergedAnnotationFinder<>(annotationType, predicate, selector));
   return (result != null ? result : MergedAnnotation.missing());
}
```

#### Scan

`org.springframework.core.annotation.AnnotationsScanner#scan(C, java.lang.reflect.AnnotatedElement, org.springframework.core.annotation.MergedAnnotations.SearchStrategy, org.springframework.core.annotation.AnnotationsProcessor<C,R>, java.util.function.BiPredicate<C,java.lang.Class<?>>)`

```java
@Nullable
static <C, R> R scan(C context, AnnotatedElement source, SearchStrategy searchStrategy,
      AnnotationsProcessor<C, R> processor, @Nullable BiPredicate<C, Class<?>> classFilter) {

   R result = process(context, source, searchStrategy, processor, classFilter);
   return processor.finish(result);
}
```

在这个里面重点关注`PROCESS`方法

```java
@Nullable
private static <C, R> R process(C context, AnnotatedElement source,
      SearchStrategy searchStrategy, AnnotationsProcessor<C, R> processor,
      @Nullable BiPredicate<C, Class<?>> classFilter) {

   if (source instanceof Class) {
      return processClass(context, (Class<?>) source, searchStrategy, processor, classFilter);
   }
   if (source instanceof Method) {
      return processMethod(context, (Method) source, searchStrategy, processor, classFilter);
   }
   return processElement(context, source, processor, classFilter);
}
```

测试类

```java
	@Transactional("TxConfig")
	static class TxConfig {
	}
```

显然这是一个类他会走`processClass`方法

- 根据扫描方式进行扫描

```java
@Nullable
private static <C, R> R processClass(C context, Class<?> source,
      SearchStrategy searchStrategy, AnnotationsProcessor<C, R> processor,
      @Nullable BiPredicate<C, Class<?>> classFilter) {

   switch (searchStrategy) {
      case DIRECT:
         return processElement(context, source, processor, classFilter);
      case INHERITED_ANNOTATIONS:
         return processClassInheritedAnnotations(context, source, searchStrategy, processor, classFilter);
      case SUPERCLASS:
         return processClassHierarchy(context, source, processor, classFilter, false, false);
      case TYPE_HIERARCHY:
         return processClassHierarchy(context, source, processor, classFilter, true, false);
      case TYPE_HIERARCHY_AND_ENCLOSING_CLASSES:
         return processClassHierarchy(context, source, processor, classFilter, true, true);
   }
   throw new IllegalStateException("Unsupported search strategy " + searchStrategy);
}
```

- 扫描的形式就不贴出完整代码了

`finish`就包装一下返回.

- 此时`org.springframework.core.annotation.AnnotatedElementUtils#getMergedAnnotationAttributes(java.lang.reflect.AnnotatedElement, java.lang.String, boolean, boolean)`这个方法走到了最后一步`org.springframework.core.annotation.AnnotatedElementUtils#getAnnotationAttributes`

- 最后的组装 map 方法

  `org.springframework.core.annotation.TypeMappedAnnotation#asMap(java.util.function.Function<org.springframework.core.annotation.MergedAnnotation<?>,T>, org.springframework.core.annotation.MergedAnnotation.Adapt...)`

```java
@Override
public AnnotationAttributes asAnnotationAttributes(Adapt... adaptations) {
   return asMap(mergedAnnotation -> new AnnotationAttributes(mergedAnnotation.getType()), adaptations);
}
```

```java
@Override
public <T extends Map<String, Object>> T asMap(Function<MergedAnnotation<?>, T> factory, Adapt... adaptations) {
   T map = factory.apply(this);
   Assert.state(map != null, "Factory used to create MergedAnnotation Map must not return null");
   AttributeMethods attributes = this.mapping.getAttributes();
   for (int i = 0; i < attributes.size(); i++) {
      Method attribute = attributes.get(i);
      Object value = (isFiltered(attribute.getName()) ? null :
            getValue(i, getTypeForMapOptions(attribute, adaptations)));
      if (value != null) {
         map.put(attribute.getName(),
               adaptValueForMapOptions(attribute, value, map.getClass(), factory, adaptations));
      }
   }
   return map;
}
```

- 获取属性列表,循环, 放入 map 返回.

  map

  ​ key: 注解的函数

  ​ value: 函数对应的值

```java
@Transactional("TxConfig")
```

```java
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
@Inherited
@interface Transactional {

   String value() default "";

   String qualifier() default "transactionManager";

   boolean readOnly() default false;
}
```

如果是上面这样的结构那么返回值为

```json
value:TxConfig
qulifiter:transactionManager
readOnlay:false
```

![image-20200824104529315](/images/spring/image-20200824104529315.png)

## SimpleMetadataReader

- 构造方法传递三个参数直接使用

  ```java
  final class SimpleMetadataReader implements MetadataReader {

     private static final int PARSING_OPTIONS = ClassReader.SKIP_DEBUG
           | ClassReader.SKIP_CODE | ClassReader.SKIP_FRAMES;

     private final Resource resource;

     private final AnnotationMetadata annotationMetadata;


     SimpleMetadataReader(Resource resource, @Nullable ClassLoader classLoader) throws IOException {
        SimpleAnnotationMetadataReadingVisitor visitor = new SimpleAnnotationMetadataReadingVisitor(classLoader);
        getClassReader(resource).accept(visitor, PARSING_OPTIONS);
        this.resource = resource;
        this.annotationMetadata = visitor.getMetadata();
     }

     private static ClassReader getClassReader(Resource resource) throws IOException {
        try (InputStream is = new BufferedInputStream(resource.getInputStream())) {
           try {
              return new ClassReader(is);
           }
           catch (IllegalArgumentException ex) {
              throw new NestedIOException("ASM ClassReader failed to parse class file - " +
                    "probably due to a new Java class file version that isn't supported yet: " + resource, ex);
           }
        }
     }


     @Override
     public Resource getResource() {
        return this.resource;
     }

     @Override
     public ClassMetadata getClassMetadata() {
        return this.annotationMetadata;
     }

     @Override
     public AnnotationMetadata getAnnotationMetadata() {
        return this.annotationMetadata;
     }

  }
  ```

## SimpleMetadataReaderFactory

- 关注点为如何获取`MetadataReader`
  1. 通过资源直接 new 出来
  2. 通过 className 转换成资源地址,
  3. 将资源地址转换成`Resource`对象
  4. new 出来

```java
@Override
public MetadataReader getMetadataReader(String className) throws IOException {
   try {
      String resourcePath = ResourceLoader.CLASSPATH_URL_PREFIX +
            ClassUtils.convertClassNameToResourcePath(className) + ClassUtils.CLASS_FILE_SUFFIX;
      Resource resource = this.resourceLoader.getResource(resourcePath);
      return getMetadataReader(resource);
   }
   catch (FileNotFoundException ex) {
      // Maybe an inner class name using the dot name syntax? Need to use the dollar syntax here...
      // ClassUtils.forName has an equivalent check for resolution into Class references later on.
      int lastDotIndex = className.lastIndexOf('.');
      if (lastDotIndex != -1) {
         String innerClassName =
               className.substring(0, lastDotIndex) + '$' + className.substring(lastDotIndex + 1);
         String innerClassResourcePath = ResourceLoader.CLASSPATH_URL_PREFIX +
               ClassUtils.convertClassNameToResourcePath(innerClassName) + ClassUtils.CLASS_FILE_SUFFIX;
         Resource innerClassResource = this.resourceLoader.getResource(innerClassResourcePath);
         if (innerClassResource.exists()) {
            return getMetadataReader(innerClassResource);
         }
      }
      throw ex;
   }
}

@Override
public MetadataReader getMetadataReader(Resource resource) throws IOException {
   return new SimpleMetadataReader(resource, this.resourceLoader.getClassLoader());
}
```
