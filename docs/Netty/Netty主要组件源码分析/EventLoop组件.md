## Netty 的线程模型

Netty 线程模型 的设计，也是基于 Reactor 模型，尽管不同的 NIO 框架 对于 Reactor 模式 的实现存在差异，但本质上还是遵循了 Reactor 的基础线程模型。

#### Reactor 单线程模型

Reactor 单线程模型，是指所有的 I/O 操作 都在同一个 NIO 线程 上完成。NIO 线程 的职责如下。

1. 作为 NIO 服务端，接收客户端的 TCP 连接；
2. 作为 NIO 客户端，向服务端发起 TCP 连接；
3. 读取通信对端的请求或者应答消息；
4. 向通信对端发送消息请求或者应答消息。

理论上一个 NIO 线程 可以独立处理所有 I/O 操作。例如，通过 Acceptor 类 接收客户端的 TCP 连接，链路建立成功后，通过 Dispatch 轮询事件就绪的 Channel，将事件分发到指定的 Handler 上进行事件处理。小容量应用场景下，可以使用单线程模型。但对于高负载、大并发的应用场景并不合用。

#### Reactor 多线程模型

Rector 多线程模型 与 单线程模型 最大的区别就是有一组 NIO 线程 来处理 I/O 操作，Reactor 多线程模型 的特点如下。

1. 有专门一个 NIO 线程 (Acceptor 线程) 用于监听服务端，接收客户端的 TCP 连接请求。
2. 网络 IO 操作 由一个 NIO 线程池 负责，由这些 NIO 线程 负责消息的 读取、解码、编码、发送。
3. 一个 NIO 线程 可以同时处理 N 条链路，但是一个链路只对应一个 NIO 线程，防止发生并发操作问题。

Reactor 多线程模型 可以满足大部分场景的需求。但对于 百万级超高并发 或 服务端需要对客户端进行安全认证，但认证非常消耗资源。在这类场景下，单独一个 Acceptor 线程 可能会处理不过来，成为系统的性能瓶颈。

#### Reactor 主从多线程模型

主从 Reactor 多线程模型的特点是，服务端用于接收客户端连接的是一个独立的 NIO 线程池。**Acceptor 线程 与客户端建立 TCP 连接 后，将新的 SocketChannel 注册到 NIO 线程池 的某个 NIO 线程 上，由该 NIO 线程 负责轮询 SocketChannel 上的 IO 事件，并进行事件处理**。

利用 主从多线程模型，可以解决一个服务端监听线程无法有效处理所有客户端连接的性能不足问题。在 Netty 的官方 Demo 中，也是推荐使用该线程模型。

#### Netty 多线程编程最佳实践

1. **如果业务逻辑比较简单，并且没有 数据库操作、线程阻塞的磁盘操作、网路操作等，可以直接在 NIO 线程 上完成业务逻辑编排，不需要切换到用户线程；**
2. **如果业务逻辑比较复杂，不要在 NIO 线程 上完成，建议将解码后的 POJO 消息 封装成 Task，分发到 业务线程池 中由业务线程执行，以保证 NIO 线程 尽快被释放，处理其他的 I/O 操作。**
3. **由于用户场景不同，对于一些复杂系统，很难根据 理论公式 计算出最优线程配置，只能是 结合公式给出一个相对合理的范围，然后对范围内的数据进行性能测试，选择相对最优配置。**

## NioEventLoop 源码解析

```java
public final class NioEventLoop extends SingleThreadEventLoop {

    /**
     * 作为 NIO框架 的 Reactor线程，NioEventLoop 需要处理 网络I/O读写事件，因此它必
     * 须聚合一个多路复用器对象 Selector
     */
    private Selector selector;
    // 通过 provider.open() 从操作系统底层获取 Selector实例
    private final SelectorProvider provider;

	/**
	 * 轮询 事件就绪的channel，进行 IO事件处理
	 */
    private void processSelectedKeys() {
        if (selectedKeys != null) {
            processSelectedKeysOptimized();
        } else {
            processSelectedKeysPlain(selector.selectedKeys());
        }
    }

    private void processSelectedKeysPlain(Set<SelectionKey> selectedKeys) {
        // check if the set is empty and if so just return to not create garbage by
        // creating a new Iterator every time even if there is nothing to process.
        // See https://github.com/netty/netty/issues/597
        if (selectedKeys.isEmpty()) {
            return;
        }

		// 这些代码在 nio编程中应该很熟悉咯
        Iterator<SelectionKey> i = selectedKeys.iterator();
        for (;;) {
            final SelectionKey k = i.next();
            final Object a = k.attachment();
            i.remove();

            if (a instanceof AbstractNioChannel) {
                processSelectedKey(k, (AbstractNioChannel) a);
            } else {
                @SuppressWarnings("unchecked")
                NioTask<SelectableChannel> task = (NioTask<SelectableChannel>) a;
                processSelectedKey(k, task);
            }

            if (!i.hasNext()) {
                break;
            }

            if (needsToSelectAgain) {
                selectAgain();
                selectedKeys = selector.selectedKeys();

                // Create the iterator again to avoid ConcurrentModificationException
                if (selectedKeys.isEmpty()) {
                    break;
                } else {
                    i = selectedKeys.iterator();
                }
            }
        }
    }

	/**
	 * 轮询 事件就绪的channel，进行 IO事件处理
	 */
    private void processSelectedKey(SelectionKey k, AbstractNioChannel ch) {
    	// 获取 channel 的内部辅助类 Unsafe，通过 Unsafe 进行IO事件处理
        final AbstractNioChannel.NioUnsafe unsafe = ch.unsafe();
        if (!k.isValid()) {
            final EventLoop eventLoop;
            try {
            	// 获取要处理 channel 所绑定的 eventLoop线程，如果绑定的不是当前的 IO线程的事件，就不处理
                eventLoop = ch.eventLoop();
            } catch (Throwable ignored) {
                // If the channel implementation throws an exception because there is no event loop, we ignore this
                // because we are only trying to determine if ch is registered to this event loop and thus has authority
                // to close ch.
                return;
            }
            // Only close ch if ch is still registered to this EventLoop. ch could have deregistered from the event loop
            // and thus the SelectionKey could be cancelled as part of the deregistration process, but the channel is
            // still healthy and should not be closed.
            // See https://github.com/netty/netty/issues/5125
            if (eventLoop != this || eventLoop == null) {
                return;
            }
            // close the channel if the key is not valid anymore
            unsafe.close(unsafe.voidPromise());
            return;
        }

        try {
            int readyOps = k.readyOps();
            // We first need to call finishConnect() before try to trigger a read(...) or write(...) as otherwise
            // the NIO JDK channel implementation may throw a NotYetConnectedException.
            if ((readyOps & SelectionKey.OP_CONNECT) != 0) {
                // remove OP_CONNECT as otherwise Selector.select(..) will always return without blocking
                // See https://github.com/netty/netty/issues/924
                int ops = k.interestOps();
                ops &= ~SelectionKey.OP_CONNECT;
                k.interestOps(ops);

                unsafe.finishConnect();
            }

            // 处理写事件
            if ((readyOps & SelectionKey.OP_WRITE) != 0) {
                // Call forceFlush which will also take care of clear the OP_WRITE once there is nothing left to write
                ch.unsafe().forceFlush();
            }

            // 处理读事件
            if ((readyOps & (SelectionKey.OP_READ | SelectionKey.OP_ACCEPT)) != 0 || readyOps == 0) {
                unsafe.read();
            }
        } catch (CancelledKeyException ignored) {
            unsafe.close(unsafe.voidPromise());
        }
    }
}
```
