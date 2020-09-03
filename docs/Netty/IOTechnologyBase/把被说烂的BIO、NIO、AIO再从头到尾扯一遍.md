网上关于各种IO的博文已经多到飞起，如果你是大神，可以跳过我这个菜鸟的拙文，本博文没有什么特别NB的东西，只是集百家之长，并且以自己感到简单舒适的方式输出自己的理解，及学习过程中的经验。
## IO及基本概念
#### 1、流的概念和作用
**流**：代表任何有能力产出数据的数据源对象或者是有能力接受数据的接收端对象。<Thinking in Java>
**流的本质**：数据传输，根据数据传输特性将流抽象为各种类，方便更直观的进行数据操作。 
**流的作用**：为数据源和目的地建立一个输送通道。
Java中将输入输出抽象称为流，就好像水管，将两个容器连接起来。流是一组有顺序的，有起点和终点的字节集合，是对数据传输的总称或抽象。即数据在两设备间的传输称为流。

每个流只能是输入流或输出流的一种，不能同时具备两个功能，输入流只能进行读操作，对输出流只能进行写操作。在一个数据传输通道中，如果既要写入数据，又要读取数据，则要分别提供两个流。 
#### 2、IO模型
五种IO模型包括：阻塞IO、非阻塞IO、信号驱动IO、IO多路复用、异步IO。其中，前四个被称为同步IO。在网络环境下，可以将IO分为两步：
1.等待数据到来；
2.数据搬迁。
在互联网应用中，IO线程大多被阻塞在等待数据的过程中，所以，如果要想提高IO效率，需要降低等待的时间。
##### 2.1 阻塞IO（Blocking I/O）
在内核将数据准备好之前，系统调用会一直等待所有的套接字（Socket），默认的是阻塞方式。

![avatar](../../../images/Netty/阻塞IO模型.png)

Java中的socket.read()会调用native read()，而Java中的native方法会调用操作系统底层的dll，而dll是C/C++编写的，图中的recvfrom其实是C语言socket编程中的一个方法。所以其实我们在Java中调用socket.read()最后也会调用到图中的recvfrom方法。

应用程序(也就是我们的代码)想要读取数据就会调用recvfrom，而recvfrom会通知OS来执行，OS就会判断数据报是否准备好(比如判断是否收到了一个完整的UDP报文，如果收到UDP报文不完整，那么就继续等待)。当数据包准备好了之后，OS就会将数据从内核空间拷贝到用户空间(因为我们的用户程序只能获取用户空间的内存，无法直接获取内核空间的内存)。拷贝完成之后socket.read()就会解除阻塞，并得到read的结果。

BIO中的阻塞，就是阻塞在2个地方：
1. OS等待数据报(通过网络发送过来)准备好。
2. 将数据从内核空间拷贝到用户空间。

在这2个时候，我们的BIO程序就是占着茅坑不拉屎，啥事情都不干。
##### 2.2 非阻塞IO（Noblocking I/O）

![avatar](../../../images/Netty/非阻塞IO模型.png)

每次应用进程询问内核是否有数据报准备好，当有数据报准备好时，就进行拷贝数据报的操作，从内核拷贝到用户空间，和拷贝完成返回的这段时间，应用进程是阻塞的。但在没有数据报准备好时，并不会阻塞程序，内核直接返回未准备就绪的信号，等待应用进程的下一个轮寻。但是，轮寻对于CPU来说是较大的浪费，一般只有在特定的场景下才使用。

Java的NIO就是采用这种方式，当我们new了一个socket后我们可以设置它是非阻塞的。比如：
```java
// 初始化一个 serverSocketChannel
serverSocketChannel = ServerSocketChannel.open();
serverSocketChannel.bind(new InetSocketAddress(8000));
// 设置serverSocketChannel为非阻塞模式
// 即 accept()会立即得到返回
serverSocketChannel.configureBlocking(false);
```
上面的代码是设置ServerSocketChannel为非阻塞，SocketChannel也可以设置。

从图中可以看到，当设置为非阻塞后，我们的socket.read()方法就会立即得到一个返回结果(成功 or 失败)，我们可以根据返回结果执行不同的逻辑，比如在失败时，我们可以做一些其他的事情。但事实上这种方式也是低效的，因为我们不得不使用轮询方法区一直问OS：“我的数据好了没啊”。

**NIO 不会在recvfrom（询问数据是否准备好）时阻塞，但还是会在将数据从内核空间拷贝到用户空间时阻塞。一定要注意这个地方，Non-Blocking还是会阻塞的。**
##### 2.3 IO多路复用（I/O Multiplexing）

![avatar](../../../images/Netty/IO复用模型.png)

传统情况下client与server通信需要3个socket(客户端的socket，服务端的serversocket，服务端中用来和客户端通信的socket)，而在IO多路复用中，客户端与服务端通信需要的不是socket，而是3个channel，通过channel可以完成与socket同样的操作，channel的底层还是使用的socket进行通信，但是多个channel只对应一个socket(可能不只是一个，但是socket的数量一定少于channel数量)，这样仅仅通过少量的socket就可以完成更多的连接，提高了client容量。

其中，不同的操作系统，对此有不同的实现：
* Windows：selector
* Linux：epoll
* Mac：kqueue

其中epoll，kqueue比selector更为高效，这是因为他们监听方式的不同。selector的监听是通过轮询FD_SETSIZE来问每一个socket：“你改变了吗？”，假若监听到事件，那么selector就会调用相应的事件处理器进行处理。但是epoll与kqueue不同，他们把socket与事件绑定在一起，当监听到socket变化时，立即可以调用相应的处理。
**selector，epoll，kqueue都属于Reactor IO设计。**
##### 2.4 信号驱动（Signal driven IO）

![avatar](../../../images/Netty/信号驱动IO模型.png)

信号驱动IO模型，应用进程告诉内核：当数据报准备好的时候，给我发送一个信号，对SIGIO信号进行捕捉，并且调用我的信号处理函数来获取数据报。
##### 2.5 异步IO（Asynchronous I/O）

![avatar](../../../images/Netty/异步IO模型.png)

Asynchronous IO调用中是真正的无阻塞，其他IO model中多少会有点阻塞。程序发起read操作之后，立刻就可以开始去做其它的事。而在内核角度，当它受到一个asynchronous read之后，首先它会立刻返回，所以不会对用户进程产生任何block。然后，kernel会等待数据准备完成，然后将数据拷贝到用户内存，当这一切都完成之后，kernel会给用户进程发送一个signal，告诉它read操作完成了。

可以看出，阻塞程度：阻塞IO>非阻塞IO>多路转接IO>信号驱动IO>异步IO，效率是由低到高的。

##### 2.6 Blocking IO 与Non-Blocking IO 区别？
阻塞或非阻塞只涉及程序和OS，Blocking IO 会一直block程序直到OS返回，而Non-Block IO在OS内核准备数据包的情况下会立即得到返回。
##### 2.7 Asynchronous IO 与 Synchronous IO？
只要有block就是同步IO，完全没有block则是异步IO。所以我们之前所说的Blocking IO、Non-Blocking IO、IO Multiplex，均为Synchronous IO，只有Asynchronous IO为异步IO。
##### 2.8 Non-Blocking IO 不是会立即返回没有阻塞吗?
**Non-Blocking IO在数据包准备时是非阻塞的，但是在将数据从内核空间拷贝到用户空间还是会阻塞**。而Asynchronous IO则不一样，当进程发起IO 操作之后，就直接返回再也不理睬了，由内核完成读写，完成读写操作后kernel发送一个信号，告诉进程说IO完成。在这整个过程中，进程完全没有被block。
#### 3、IO模式（Reactor与Proactor）
##### 3.1 Reactor
Reactor(反应器)的设计是一种事件驱动思想，比如Java NIO中，socket过来时有四种事件：
connectable
acceptable
readable
writable
我们为每一种事件都编写一个处理器，然后设置每个socket要监听哪种情况，随后就可以调用对应的处理器。

![在这里插入图片描述](https://img-blog.csdnimg.cn/20191121200143647.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L3FxXzM4MDM4Mzk2,size_16,color_FFFFFF,t_70)

图中的input就可以当作socket，中间的Service Hanlder&event dispatch的作用就是监听每一个socket(需要实现把socket注册进来，并指定要监听哪种情况)，然后给socket派发不同的事件。
##### 3.2 Proactor

![在这里插入图片描述](https://img-blog.csdnimg.cn/2019112120035031.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L3FxXzM4MDM4Mzk2,size_16,color_FFFFFF,t_70)

Proactor与Reactor较为类似，以读取数据为例：
**Reactor模式**

 1. 应用程序注册读就绪事件和相关联的事件处理器
 2. 事件分离器等待事件的发生
 3. 当发生 读就绪事件 的时候，事件分离器调用第一步注册的事件处理器
 4. 事件处理器首先执行实际的读取操作，然后根据读取到的内容进行进一步的处理

**Proactor模式**

 1. 应用程序调用一个异步读取操作，然后注册相应的事件处理器，此时事件处理器不关注读取就绪事件，而是关注读取完成事件，这是区别于Reactor的关键。
 2. 事件分离器等待读取操作完成事件
 3. 在事件分离器等待读取操作完成的时候，操作系统调用内核线程完成读取操作（异步IO都是操作系统负责将数据读写到应用传递进来的缓冲区供应用程序操作，操作系统扮演了重要角色），并将读取的内容放入用户传递过来的缓存区中。这也是区别于Reactor的一点，Proactor中，应用程序需要传递缓存区。
 4. 事件分离器捕获到读取完成事件后，激活应用程序注册的事件处理器，事件处理器直接从缓存区读取数据，而不需要进行实际的读取操作。

**区别**
Reactor中，监听是否有可读或可写事件，然后读/写操作是由程序进行的。而Proactor中，直接监听读/写操作是否完成，也就是说读/写操作是否OS来完成，并将读写数据放入一个缓冲区提供给程序。

#### 4、同步与异步，阻塞与非阻塞
同步/异步（描述网络通信模式，适用于请求-响应模型）

同步：发送方发送请求后，需要等待接收响应，否则将一直等待
异步：发送方发送请求后，不需要等待响应，可以继续发送下一个请求，或者主动挂起线程并释放CPU
阻塞/非阻塞（描述进程的函数调用方式）

阻塞：IO 调用会一直阻塞，直至结果返回才能继续执行
非阻塞：IO 调用会立即返回，不需要等待结果，并可以执行下一个 IO 调用
总结，同步异步和阻塞非阻塞是两个不同的概念，用简单的数据库查询来举一个例子：

如果发送一个请求，需要等待数据库响应，否则将一直等待，这就是同步
如果发送一个请求，不需要数据库响应，就可以继续发送下一个请求(NIO模式、回调通知模式)，或者主动将任务插入队列中，主动挂起线程并释放CPU(异步队列模式)，这就是异步

一般来说，同步是最简单的编程方式，而异步编程虽然需要一定技术，但是却能提升系统性能。对于阻塞与非阻塞，阻塞的实时响应性更好，但在高并发情况下阻塞线程数会急剧增加，导致大量的上下文切换会引起挂起/唤醒线程的性能损耗，而非阻塞的性能吞吐量更高，但由于其是顺序执行每一个事件，一旦处理某一个事件过久，会影响后续事件的处理，因此实时响应性较差。

## Java中的BIO
#### 传统Socket阻塞案例代码
```java
public class TraditionalSocketDemo {
	
	public static void main(String[] args) throws IOException {
		ServerSocket serverSocket = new ServerSocket(7777);
		System.out.println("服务端启动...");
		while (true) {
			// 获取socket套接字
			// accept()阻塞点
			Socket socket = serverSocket.accept();
			System.out.println("有新客户端连接上来了...");
			// 获取客户端输入流
			java.io.InputStream is = socket.getInputStream();
			byte[] b = new byte[1024];
			while (true) {
				// 循环读取数据
				// read() 阻塞点
				int data = is.read(b);
				if (data != -1) {
					String info = new String(b, 0, data, "GBK");
					System.out.println(info);
				} else {
					break;
				}
			}
		}
	}
}
```
在debugger代码的过程中会发现，服务端启动，只有当客户端就绪后才进行下一步操作（如果客户端没有就绪，线程阻塞），客户端发送请求，程序才继续往下执行，如果客户端没有发出请求，线程阻塞；**上面的代码有两个阻塞点**：

 1. **等待客户端就绪**；
 2. **等待OS将数据从内核拷贝到用户空间（应用程序可以操作的内存空间）**；
#### 传统bio多线程版本
```java
public class TraditionalSocketDemo2 {

	public static void main(String[] args) throws IOException {
		ServerSocket serverSocket = new ServerSocket(7777);
		System.out.println("服务端启动...");
		while (true) {
			// 获取socket套接字
			// accept()阻塞点
			final Socket socket = serverSocket.accept();
			System.out.println("有新客户端连接上来了...");
			new Thread(new Runnable() {
				@Override
				public void run() {
					try {
						// 获取客户端输入流
						InputStream is = socket.getInputStream();
						byte[] b = new byte[1024];
						while (true) {
							// 循环读取数据
							// read() 阻塞点
							int data = is.read(b);
							if (data != -1) {
								String info = new String(b, 0, data, "GBK");
								System.out.println(info);
							} else {
								break;
							}
						}
					} catch (Exception e) {
						e.printStackTrace();
					}
				}
			}).start();
		}
	}
}
```
能够解决传统的BIO问题，但是会出现：多少个客户端多少个线程，请求和线程的个数1:1关系；操作系统资源耗尽，服务端挂了。使用线程池虽然能控制服务线程的数量，但应对高并发量的访问时，依然会导致大量线程处于阻塞状态，严重影响服务效率。
## Java中的NIO
NIO是一种基于通道和缓冲区的I/O方式，它可以使用Native函数库直接分配堆外内存（区别于JVM的运行时数据区），然后通过一个存储在java堆里面的DirectByteBuffer对象作为这块内存的直接引用进行操作。这样能在一些场景显著提高性能，因为避免了在Java堆和Native堆中来回复制数据。

#### 1、Java NIO组件
NIO主要有三大核心部分：Channel(通道)，Buffer(缓冲区), Selector（选择器）。传统IO是基于字节流和字符流进行操作（基于流），而NIO基于Channel和Buffer(缓冲区)进行操作，数据总是从通道读取到缓冲区中，或者从缓冲区写入到通道中。Selector(选择区)用于监听多个通道的事件（比如：连接打开，数据到达）。因此，单个线程可以监听多个数据通道。

##### 1.1 Buffer
Buffer（缓冲区）是一个用于存储特定基本类型数据的容器。除了boolean外，其余每种基本类型都有一个对应的buffer类。Buffer类的子类有ByteBuffer, CharBuffer, DoubleBuffer, FloatBuffer, IntBuffer, LongBuffer, ShortBuffer 。

##### 1.2 Channel
Channel（通道）表示到实体，如硬件设备、文件、**网络套接字**或可以执行一个或多个不同 I/O 操作（如读取或写入）的程序组件的开放的连接。Channel接口的常用实现类有FileChannel（对应文件IO）、DatagramChannel（对应UDP）、SocketChannel和ServerSocketChannel（对应TCP的客户端和服务器端）。**Channel和IO中的Stream(流)是差不多一个等级的。只不过Stream是单向的，譬如：InputStream, OutputStream.而Channel是双向的，既可以用来进行读操作，又可以用来进行写操作**。

##### 1.3 Selector
Selector（选择器）用于监听多个通道的事件（比如：连接打开，数据到达）。因此，单个的线程可以监听多个数据通道。即用选择器，借助单一线程，就可对数量庞大的活动I/O通道实施监控和维护。

写就绪相对有一点特殊，一般来说，你不应该注册写事件。写操作的就绪条件为底层缓冲区有空闲空间，而写缓冲区绝大部分时间都是有空闲空间的，所以当你注册写事件后，写操作一直是就绪的，选择处理线程全占用整个CPU资源。所以，只有当你确实有数据要写时再注册写操作，并在写完以后马上取消注册。

基于阻塞式I/O的多线程模型中，Server为每个Client连接创建一个处理线程，每个处理线程阻塞式等待可能达到的数据，一旦数据到达，则立即处理请求、返回处理结果并再次进入等待状态。由于每个Client连接有一个单独的处理线程为其服务，因此可保证良好的响应时间。但当系统负载增大（并发请求增多）时，Server端需要的线程数会增加，对于操作系统来说，线程之间上下文切换的开销很大，而且每个线程都要占用系统的一些资源（如内存）。因此，使用的线程越少越好。

但是，现代的操作系统和CPU在多任务方面表现的越来越好，所以多线程的开销随着时间的推移，变得越来越小了。实际上，如果一个CPU有多个内核，不使用多任务可能是在浪费CPU能力。

传统的IO处理方式，一个线程处理一个网络连接

![在这里插入图片描述](https://img-blog.csdnimg.cn/2019112120352588.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L3FxXzM4MDM4Mzk2,size_16,color_FFFFFF,t_70)

NIO处理方式，一个线程可以管理过个网络连接

![在这里插入图片描述](https://img-blog.csdnimg.cn/20191121203602279.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L3FxXzM4MDM4Mzk2,size_16,color_FFFFFF,t_70)

#### 2、NIO服务器端如何实现非阻塞？
服务器上所有Channel需要向Selector注册，而Selector则负责监视这些Socket的IO状态(观察者)，当其中任意一个或者多个Channel具有可用的IO操作时，该Selector的select()方法将会返回大于0的整数，该整数值就表示该Selector上有多少个Channel具有可用的IO操作，并提供了selectedKeys（）方法来返回这些Channel对应的SelectionKey集合(一个SelectionKey对应一个就绪的通道)。正是通过Selector，使得服务器端只需要不断地调用Selector实例的select()方法即可知道当前所有Channel是否有需要处理的IO操作。注：java NIO就是多路复用IO，jdk7之后底层是epoll模型。
#### 3、Java NIO的简单实现
##### 3.1 服务端
```java
public class NioServer {

    private int port;
    private Selector selector;
    private ExecutorService service = Executors.newFixedThreadPool(5);

    public static void main(String[] args){
        new NioServer(8080).start();
    }

    public NioServer(int port) {
        this.port = port;
    }

    public void init() {
        ServerSocketChannel ssc = null;
        try {
            ssc = ServerSocketChannel.open();
            ssc.configureBlocking(false);
            ssc.bind(new InetSocketAddress(port));
            selector = Selector.open();
            ssc.register(selector, SelectionKey.OP_ACCEPT);
            System.out.println("NioServer started ......");
        } catch (IOException e) {
            e.printStackTrace();
        }finally {
        }
    }

    public void accept(SelectionKey key) {
        try {
            ServerSocketChannel ssc = (ServerSocketChannel) key.channel();
            SocketChannel sc = ssc.accept();
            sc.configureBlocking(false);
            sc.register(selector, SelectionKey.OP_READ);
            System.out.println("accept a client : " + sc.socket().getInetAddress().getHostName());
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public void start() {
        this.init();
        while (true) {
            try {
                int events = selector.select();
                if (events > 0) {
                    Iterator<SelectionKey> selectionKeys = selector.selectedKeys().iterator();
                    while (selectionKeys.hasNext()) {
                        SelectionKey key = selectionKeys.next();
                        selectionKeys.remove();
                        if (key.isAcceptable()) {
                            accept(key);
                        } else {
                            service.submit(new NioServerHandler(key));
                        }
                    }
                }
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }

    public static class NioServerHandler implements Runnable{

        private SelectionKey selectionKey;

        public NioServerHandler(SelectionKey selectionKey) {
            this.selectionKey = selectionKey;
        }

        @Override
        public void run() {
            try {
                if (selectionKey.isReadable()) {
                    SocketChannel socketChannel = (SocketChannel) selectionKey.channel();
                    ByteBuffer buffer = ByteBuffer.allocate(1024);
                    socketChannel.read(buffer);
                    buffer.flip();
                    System.out.println("收到客户端"+socketChannel.socket().getInetAddress().getHostName()+"的数据："+new String(buffer.array()));
                    //将数据添加到key中
                    ByteBuffer outBuffer = ByteBuffer.wrap(buffer.array());
                    socketChannel.write(outBuffer);// 将消息回送给客户端
                    selectionKey.cancel();
                }
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }
}
```
##### 3.2 客户端
```java
public class NioClient {
    private static final String host = "127.0.0.1";
    private static final int port = 8080;
    private Selector selector;

    public static void main(String[] args){
        for (int i=0;i<3;i++) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    NioClient client = new NioClient();
                    client.connect(host, port);
                    client.listen();
                }
            }).start();
        }
    }

    public void connect(String host, int port) {
        try {
            SocketChannel sc = SocketChannel.open();
            sc.configureBlocking(false);
            this.selector = Selector.open();
            sc.register(selector, SelectionKey.OP_CONNECT);
            sc.connect(new InetSocketAddress(host, port));
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public void listen() {
        while (true) {
            try {
                int events = selector.select();
                if (events > 0) {
                    Iterator<SelectionKey> selectionKeys = selector.selectedKeys().iterator();
                    while (selectionKeys.hasNext()) {
                        SelectionKey selectionKey = selectionKeys.next();
                        selectionKeys.remove();
                        //连接事件
                        if (selectionKey.isConnectable()) {
                            SocketChannel socketChannel = (SocketChannel) selectionKey.channel();
                            if (socketChannel.isConnectionPending()) {
                                socketChannel.finishConnect();
                            }

                            socketChannel.configureBlocking(false);
                            socketChannel.register(selector, SelectionKey.OP_READ);
                            socketChannel.write(ByteBuffer.wrap(("Hello this is " + Thread.currentThread().getName()).getBytes()));
                        } else if (selectionKey.isReadable()) {
                            SocketChannel sc = (SocketChannel) selectionKey.channel();
                            ByteBuffer buffer = ByteBuffer.allocate(1024);
                            sc.read(buffer);
                            buffer.flip();
                            System.out.println("收到服务端的数据："+new String(buffer.array()));
                        }
                    }
                }
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }
}

```
## Java中的AIO
JDK1.7升级了NIO类库，升级后的NIO类库被称为NIO 2.0。Java正式提供了异步文件I/O操作，同时提供了与UNIX网络编程事件驱动I/O对应的AIO。NIO 2.0引入了新的异步通道的概念，并提供了异步文件通道和异步套接字通道的实现。

异步通道获取获取操作结果方式：
1. 使用java.util.concurrent.Future类表示异步操作的结果；
2. 在执行异步操作的时候传入一个java.nio.channels，操作完成后胡回调CompletionHandler接口的实现类。

NIO 2.0的异步套接字通道是真正的异步非阻塞I/O，对应于UNIX网络编程中的事件驱动I/O（AIO）。





