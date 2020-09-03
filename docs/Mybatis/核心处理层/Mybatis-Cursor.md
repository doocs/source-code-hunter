# Mybatis Cursor

- Author: [HuiFer](https://github.com/huifer)
- Description: 该文介绍 mybatis Cursor 源码
- 源码阅读工程: [SourceHot-Mybatis](https://github.com/SourceHot/mybatis-read.git)

## Cursor

- 源码位置:`org.apache.ibatis.cursor.Cursor`
- 继承`Iterable`说明是一个迭代器,继承`Closeable`说明有一个东西需要关闭

```java
public interface Cursor<T> extends Closeable, Iterable<T> {

    /**
     * 游标开始从数据库获取数据,返回true,反之false
     *
     * @return true if the cursor has started to fetch items from database.
     */
    boolean isOpen();

    /**
     * 数据库元素都被获取,返回true,反之false
     *
     * @return true if the cursor is fully consumed and has returned all elements matching the query.
     */
    boolean isConsumed();

    /**
     * 获取数据索引,从0开始,没有返回-1
     * Get the current item index. The first item has the index 0.
     *
     * @return -1 if the first cursor item has not been retrieved. The index of the current item retrieved.
     */
    int getCurrentIndex();
}
```

## DefaultCursor

```java
public class DefaultCursor<T> implements Cursor<T> {

    /**
     * 对象包装结果处理类
     */
    protected final ObjectWrapperResultHandler<T> objectWrapperResultHandler = new ObjectWrapperResultHandler<>();
    // ResultSetHandler stuff
    /**
     * ResultSet 处理器
     */
    private final DefaultResultSetHandler resultSetHandler;
    /**
     * 结果映射
     */
    private final ResultMap resultMap;
    /**
     * ResultSet 包装对象
     */
    private final ResultSetWrapper rsw;
    /**
     * 分页的
     */
    private final RowBounds rowBounds;
    /**
     * 游标的迭代器
     */
    private final CursorIterator cursorIterator = new CursorIterator();

    /**
     * 游标开启判断
     */
    private boolean iteratorRetrieved;

    /**
     * 游标状态,默认是创建未使用
     */
    private CursorStatus status = CursorStatus.CREATED;
    /**
     * 分页索引,默认-1
     */
    private int indexWithRowBound = -1;

    /**
     * 构造方法
     *
     * @param resultSetHandler
     * @param resultMap
     * @param rsw
     * @param rowBounds
     */
    public DefaultCursor(DefaultResultSetHandler resultSetHandler, ResultMap resultMap, ResultSetWrapper rsw, RowBounds rowBounds) {
        this.resultSetHandler = resultSetHandler;
        this.resultMap = resultMap;
        this.rsw = rsw;
        this.rowBounds = rowBounds;
    }


    @Override
    public boolean isOpen() {
        return status == CursorStatus.OPEN;
    }

    @Override
    public boolean isConsumed() {
        return status == CursorStatus.CONSUMED;
    }

    /**
     * 当前索引
     * @return
     */
    @Override
    public int getCurrentIndex() {
        return rowBounds.getOffset() + cursorIterator.iteratorIndex;
    }

    /**
     * 迭代器获取
     * @return
     */
    @Override
    public Iterator<T> iterator() {
        // 是否获取过
        if (iteratorRetrieved) {
            throw new IllegalStateException("Cannot open more than one iterator on a Cursor");
        }
        // 是否关闭
        if (isClosed()) {
            throw new IllegalStateException("A Cursor is already closed.");
        }
        iteratorRetrieved = true;
        return cursorIterator;
    }

    /**
     * {@link Closeable} 关闭{@link ResultSet}
     */
    @Override
    public void close() {
        // 判断是否关闭
        if (isClosed()) {
            return;
        }

        ResultSet rs = rsw.getResultSet();
        try {
            if (rs != null) {
                rs.close();
            }
        } catch (SQLException e) {
            // ignore
        } finally {
            // 设置游标状态
            status = CursorStatus.CLOSED;
        }
    }

    /**
     * 去到真正的数据行
     * @return
     */
    protected T fetchNextUsingRowBound() {
        T result = fetchNextObjectFromDatabase();
        while (objectWrapperResultHandler.fetched && indexWithRowBound < rowBounds.getOffset()) {
            result = fetchNextObjectFromDatabase();
        }
        return result;
    }

    /**
     * 从数据库获取数据
     * @return
     */
    protected T fetchNextObjectFromDatabase() {
        if (isClosed()) {
            return null;
        }

        try {
            objectWrapperResultHandler.fetched = false;
            // 游标状态设置
            status = CursorStatus.OPEN;
            if (!rsw.getResultSet().isClosed()) {
                // 处理数据结果放入，objectWrapperResultHandler
                resultSetHandler.handleRowValues(rsw, resultMap, objectWrapperResultHandler, RowBounds.DEFAULT, null);
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }

        // 获取处理结果
        T next = objectWrapperResultHandler.result;
        // 结果不为空
        if (objectWrapperResultHandler.fetched) {
            // 索引+1
            indexWithRowBound++;
        }
        // No more object or limit reached
        // 如果没有数据, 或者 当前读取条数= 偏移量+限额量
        if (!objectWrapperResultHandler.fetched || getReadItemsCount() == rowBounds.getOffset() + rowBounds.getLimit()) {
            // 关闭游标
            close();
            status = CursorStatus.CONSUMED;
        }
        // 设置结果为null
        objectWrapperResultHandler.result = null;

        return next;
    }

    /**
     * 是否关闭状态判断
     *
     * @return
     */
    private boolean isClosed() {
        return status == CursorStatus.CLOSED || status == CursorStatus.CONSUMED;
    }

    /**
     * 下一个索引
     * @return
     */
    private int getReadItemsCount() {
        return indexWithRowBound + 1;
    }

    /**
     * 游标的状态
     */
    private enum CursorStatus {

        /**
         * 新创建的游标, ResultSet 还没有使用过
         * A freshly created cursor, database ResultSet consuming has not started.
         */
        CREATED,
        /**
         * 游标使用过, ResultSet 被使用
         * A cursor currently in use, database ResultSet consuming has started.
         */
        OPEN,
        /**
         * 游标关闭, 可能没有被消费完全
         * A closed cursor, not fully consumed.
         */
        CLOSED,
        /**
         * 游标彻底消费完毕, 关闭了
         * A fully consumed cursor, a consumed cursor is always closed.
         */
        CONSUMED
    }

    /**
     * 对象处理结果的包装类
     * @param <T>
     */
    protected static class ObjectWrapperResultHandler<T> implements ResultHandler<T> {

        /**
         * 数据结果
         */
        protected T result;
        /**
         * 是否null
         */
        protected boolean fetched;

        /**
         * 从{@link ResultContext} 获取结果对象
         * @param context
         */
        @Override
        public void handleResult(ResultContext<? extends T> context) {
            this.result = context.getResultObject();
            context.stop();
            fetched = true;
        }
    }

    /**
     * 游标迭代器
     */
    protected class CursorIterator implements Iterator<T> {

        /**
         * 下一个数据
         * Holder for the next object to be returned.
         */
        T object;

        /**
         * 下一个的索引
         * Index of objects returned using next(), and as such, visible to users.
         */
        int iteratorIndex = -1;

        /**
         * 是否有下一个值
         * @return
         */
        @Override
        public boolean hasNext() {
            if (!objectWrapperResultHandler.fetched) {
                object = fetchNextUsingRowBound();
            }
            return objectWrapperResultHandler.fetched;
        }

        /**
         * 下一个值
         * @return
         */
        @Override
        public T next() {
            // Fill next with object fetched from hasNext()
            T next = object;

            if (!objectWrapperResultHandler.fetched) {
                next = fetchNextUsingRowBound();
            }

            if (objectWrapperResultHandler.fetched) {
                objectWrapperResultHandler.fetched = false;
                object = null;
                iteratorIndex++;
                return next;
            }
            throw new NoSuchElementException();
        }

        /**
         * 不可执行抛出异常
         */
        @Override
        public void remove() {
            throw new UnsupportedOperationException("Cannot remove element from Cursor");
        }
    }
}
```
