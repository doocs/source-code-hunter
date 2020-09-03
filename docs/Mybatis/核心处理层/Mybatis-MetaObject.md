# Mybatis MetaObject

- Author: [HuiFer](https://github.com/huifer)
- 源码阅读工程: [SourceHot-Mybatis](https://github.com/SourceHot/mybatis-read.git)
- 源码位于:`org.apache.ibatis.reflection.MetaObject`

```java
/**
 * @author Clinton Begin
 */
public class MetaObject {

    /**
     * 原始的数据对象,初始化时的对象
     */
    private final Object originalObject;
    /**
     * 对象包装
     */
    private final ObjectWrapper objectWrapper;
    /**
     * object 工厂
     */
    private final ObjectFactory objectFactory;
    /**
     * object
     */
    private final ObjectWrapperFactory objectWrapperFactory;
    /**
     * 反射工程
     */
    private final ReflectorFactory reflectorFactory;

    private MetaObject(Object object, ObjectFactory objectFactory, ObjectWrapperFactory objectWrapperFactory, ReflectorFactory reflectorFactory) {
        this.originalObject = object;
        this.objectFactory = objectFactory;
        this.objectWrapperFactory = objectWrapperFactory;
        this.reflectorFactory = reflectorFactory;

        // 根据object不同实例进行不同的实例化方式
        if (object instanceof ObjectWrapper) {
            this.objectWrapper = (ObjectWrapper) object;
        } else if (objectWrapperFactory.hasWrapperFor(object)) {
            this.objectWrapper = objectWrapperFactory.getWrapperFor(this, object);
        } else if (object instanceof Map) {
            this.objectWrapper = new MapWrapper(this, (Map) object);
        } else if (object instanceof Collection) {
            this.objectWrapper = new CollectionWrapper(this, (Collection) object);
        } else {
            this.objectWrapper = new BeanWrapper(this, object);
        }
    }

    public static MetaObject forObject(Object object, ObjectFactory objectFactory, ObjectWrapperFactory objectWrapperFactory, ReflectorFactory reflectorFactory) {
        if (object == null) {
            return SystemMetaObject.NULL_META_OBJECT;
        } else {
            return new MetaObject(object, objectFactory, objectWrapperFactory, reflectorFactory);
        }
    }

    /**
     * 获取value
     * @param name 属性值名称
     * @return
     */
    public Object getValue(String name) {
        PropertyTokenizer prop = new PropertyTokenizer(name);
        if (prop.hasNext()) {
            MetaObject metaValue = metaObjectForProperty(prop.getIndexedName());
            if (metaValue == SystemMetaObject.NULL_META_OBJECT) {
                // 判断是否是空的metaObject
                return null;
            } else {
                return metaValue.getValue(prop.getChildren());
            }
        } else {
            return objectWrapper.get(prop);
        }
    }

    /**
     * metaObject 设置属性值方法
     * {name:value}
     *
     * @param name  属性值名称
     * @param value 属性值
     */
    public void setValue(String name, Object value) {
        PropertyTokenizer prop = new PropertyTokenizer(name);
        if (prop.hasNext()) {
            // 获取属性实例
            MetaObject metaValue = metaObjectForProperty(prop.getIndexedName());
            if (metaValue == SystemMetaObject.NULL_META_OBJECT) {
                if (value == null) {
                    // value 空则返回
                    // don't instantiate child path if value is null
                    return;
                } else {
                    // 创建属性值
                    metaValue = objectWrapper.instantiatePropertyValue(name, prop, objectFactory);
                }
            }

            metaValue.setValue(prop.getChildren(), value);
        } else {
            objectWrapper.set(prop, value);
        }
    }


}

```
