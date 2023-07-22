# 一个简单的 Servlet 容器代码设计

Servlet 算是 Java Web 开发请求链路调用栈中底层的一个技术，当客户端发起一个请求后，到达服务器内部，就会先进入 Servlet（这里不讨论更底层的链路），SpringMVC 的请求分发核心也是一个 Servlet，名叫`DispatcherServlet`，一个请求首先会进入到这个 Servlet，然后在通过 SpringMVC 的机制去分发到对应的 Controller 下。

但是再往上一层说，普通的开发人员可能不会关心 Servlet 是怎么被调用的，我们只要写一个`@WebServlet`注解在 Servlet 的类上，运行后，客户端的请求就会自动进入到相应的 Servlet 中，而做这些事的叫 Servlet 容器，Servlet 容器一定是一个 Web 服务器，但 Web 服务器反过来可不一定是 Servlet 容器哦。

而了解一个 Servlet 容器的实现有助于更好的理解 JavaWeb 开发。

## Github 地址

项目最后的实现在 Github 上可以查看到

https://github.com/houxinlin/jerrycat

## 容器的实现

在 JavaWeb 的开发世界，有很多都要遵守规范，JDBC 也是，Servlet 容器也是，Java 很多不去做实现，只做接口，具体的实现留给各大厂商去做，而 Servlet 容器其中一个实现就是 Tomcat。

Tomcat 的实现还是很复杂的，这里也不做研究，我们只搞清楚一个小型的 Servlet 容器实现的步骤即可。

我们起一个容器名，叫 JerryCat 吧，他的实现功能只有一个，将请求交给对应的 Servlet，并将其处理结果返回给客户端，因为这才是核心，而实现他的具体步骤如下。

1. 解压 war 文件
2. 收集 Servlet 信息
3. 启动 web 服务器
4. 请求映射 & 返回结果

## 解压 war 文件

当你在 Tomcat 的 webapps 目录下放入一个 war 文件，启动 tomcat 后，tomcat 会自动把这个 war 文件解压了，后续所有的操作将会针对这个解压后的目录，而解压一个 war 文件很简单，代码如下。

```java

public static void unzipWar(String warFilePath, String outputFolder) throws IOException {
    byte[] buffer = new byte[1024];
    try (ZipInputStream zis = new ZipInputStream(Files.newInputStream(Paths.get(warFilePath)))) {
        ZipEntry zipEntry;
        while ((zipEntry = zis.getNextEntry()) != null) {
            String entryName = zipEntry.getName();
            File newFile = new File(outputFolder + File.separator + entryName);
            if (zipEntry.isDirectory()) {
                newFile.mkdirs();
            } else {
                new File(newFile.getParent()).mkdirs();
                try (FileOutputStream fos = new FileOutputStream(newFile)) {
                    int len;
                    while ((len = zis.read(buffer)) > 0) {
                        fos.write(buffer, 0, len);
                    }
                }
            }
            zis.closeEntry();
        }
    }
}
```

## 收集 Servlet 信息

这一步是一个核心，因为 Servlet 容器一定要知道一个 war 项目中所有的 Servlet 信息，也就是要知道开发人员定义的请求路径和具体 Servlet 的映射关系，当请求进来的时候，才能根据这个映射关系调用到对应的 Servlet 下。

在 Servlet 3.0 规范以前，所有的映射关系需要在 web.xml 中去配置，比如下面这样，这个配置用来告诉容器将`/hello`的请求映射到`com.example.HelloServlet`下，容器只需要读取一个配置即可。

```xml
<servlet>
    <servlet-name>HelloServlet</servlet-name>
    <servlet-class>com.example.HelloServlet</servlet-class>
</servlet>

<servlet-mapping>
    <servlet-name>HelloServlet</servlet-name>
    <url-pattern>/hello</url-pattern>
</servlet-mapping>

```

但是自从规范 3.0 开始，增加了`@WebServlet`等注解，如下，这也是告诉容器，这个类的请求路径是`/hello`。

```java
@WebServlet("/hello")
public class HelloServlet extends HttpServlet {}
```

那么容器的实现就会增加负担，因为要遍历所有的 class，找出标有`@WebServlet`的类，并做收集，那问题是怎么找到这些符合的类呢？ 首先不能通过反射，因为有两个问题。

第一个问题是类加载器的问题(这里假设你已经了解了类加载器的概念)，因为容器的类加载器是不能加载 war 项目中的 class 的，即使能加载，你要通过`Class.forName()`去加载类时，在这个收集信息阶段，容器是不可能知道有那些类名称的，虽然可以通过在 web.xml 直接告诉容器，但说回来，尝试`Class.forName()`时会抛出`ClassNotFoundException`，而真正的容器实现都会自定义一个 ClassLoader，专门去加载项目的 class 和资源。

那么就算有了自定义的 ClassLoader，可以加载到项目的 class，那么`Class.forName`会触发 static 代码块，如果项目中的 Servlet 正好写了 static 代码快，则会调用，虽然最终这个代码块都会被调用，但不应该在这个时候，会出一些问题。

而正确的做法是直接读取二进制 class 文件，从 class 文件规范中找到这个 class 是不是有`@WebServlet`注解，这是唯一的办法，Spring 扫描注解的时候也是这样做的，而 Tomcat 也是这样，[Tomcat 解析 class 文件的类可以点击我查看](https://github.com/apache/tomcat/blob/main/java/org/apache/tomcat/util/bcel/classfile/ClassParser.java)。

Tomcat 是纯自己手撸出一个解析器，如果熟悉 class 文件格式后，还是比较容易的，所以这里我们依靠一个框架，比如用`org.ow2.asm`这个库，额外的知识：Spring 也是靠第三方库来读取的。

具体例子如下

```java
private void collectorServlet() {
    try {
        final Set<String> classFileSet = new HashSet<>();
        Files.walkFileTree(Paths.get(this.webProjectPath, WEB_CLASSES_PATH), new SimpleFileVisitor<Path>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                if (file.toString().endsWith(".class")) classFileSet.add(file.toString());
                return super.visitFile(file, attrs);
            }
        });
        ClassNode classNode = new ClassNode();
        for (String classFile : classFileSet) {
            ClassReader classReader = new ClassReader(Files.newInputStream(Paths.get(classFile)));
            classReader.accept(classNode, ClassReader.EXPAND_FRAMES);
            List<AnnotationNode> visibleAnnotations = classNode.visibleAnnotations;
            for (AnnotationNode visibleAnnotation : visibleAnnotations) {
                if ("Ljavax/servlet/annotation/WebServlet;".equalsIgnoreCase(visibleAnnotation.desc)) {
                    Map<String, Object> annotationValues = ClassUtils.getAnnotationValues(visibleAnnotation.values);
                    Object o = loaderClass(classReader.getClassName());
                    servletMap.put(annotationValues.get("value").toString(), ((HttpServlet) o));
                }
            }
        }
    } catch (IOException e) {
        throw new RuntimeException(e);
    }
}


    private Object loaderClass(String name) {
        try {
            Class<?> aClass = appClassloader.loadClass(name);
            return aClass.newInstance();
        } catch (ClassNotFoundException | InstantiationException | IllegalAccessException e) {
            throw new RuntimeException(e);
        }
    }
```

主要就是遍历`/WEB-INF/classes/`目录，使用 ClassReader 类解析这个 class 文件，并判断是不是标有 WebServlet 注解，如果存在，则通过自定义的类加载器加载并实例化他，而这个类加载器主要作用就是根据给定的类名，从`/WEB-INF/classes/`加载类，如果给定的类不存在，则交给父类加载器。

但向 Tomcat 都有一些公共的类区域，可以把所有项目所用到的共同库提取出来，放到一个目录下，另外 war 规范中，`/WEB-INF/lib`目录用来存放第三方的 jar 文件库，类加载器也需要考虑这个目录。

那么这个类加载器加载路径依次如下：

1. /WEB-INF/classes/目录
2. /WEB-INF/lib 目录
3. 公共区域
4. 父类加载器

如果最后一个也加载不到，则抛出异常，拥有一个公共区域其实是很有必要的，通常来说我们都会依赖大量的第三方库，可能自己的代码和资源都不到 10M，但是大量的第三方库可能占到上百 M，部署传输起来可能不方便，正确的做法应该是把用到的第三方库一次性上传到公共区域，部署时只传自己的代码。

并且类加载器还需要重写 getResource、getResourceAsStream 等这些方法用来在项目的类路径下查找资源。

## 启动 web 服务器

上面说到，Servlet 容器也是一个 Web 服务器，只有启动一个 Web 服务器后，收到请求，才能传递给 Servlet，并且，他还能处理静态资源，实现一个 Web 服务器重要的是解析 HTTP 报文，并且根据响应结果生成 HTTP 报文。

这部分我们可以使用一个 Java 提供的现成库，如下。

```java
HttpServer httpServer = HttpServer.create(new InetSocketAddress(4040), 10);
```

1.  `HttpServer`：是 Java 中用于创建 HTTP 服务器的类。它是 Java SE 6 引入的，用于支持简单的 HTTP 服务端功能。
1.  `HttpServer.create`：用于创建一个新的 HTTP 服务器实例。
1.  `new InetSocketAddress(4040)`：`InetSocketAddress`表示 IP 地址和端口号的类。这里的`4040`是端口号，表示 HTTP 服务器将在本地计算机的 4040 端口上监听传入的 HTTP 请求。
1.  `10`：这是服务器的等待队列的最大长度。当 HTTP 服务器在处理传入的请求时，如果同时有更多请求到达，它们将被放入等待队列。这里的`10`表示等待队列的最大长度为 10，即最多允许同时有 10 个请求在等待处理。

## 请求映射 & 返回结果

这里有一点比较麻烦，我们知道 doGet 和 doPost 的参数是`HttpServletRequest`、`HttpServletResponse`，容器需要实现这两个接口，提供请求参数，这里我们偷个懒，使用`mockito`这个库来构造一个请求。

下面代码中，`createContext`用来监听某个请求路径，当有请求过来时，HttpServer 会把请求对象封装为`HttpExchange`，而我们做的事是把他转换为`HttpServletRequest`。

当调用 service 时，`javax.servlet.http.HttpServlet`会自动根据请求访问，调用 doGet 或者是 doPost 等。

```java
try {
    HttpServer httpServer = HttpServer.create(new InetSocketAddress(4040), 10);
    httpServer.createContext("/", httpExchange -> {
        Servlet servlet = servletMap.get(httpExchange.getRequestURI().toString());
        JerryCatHttpServletResponse httpServletResponse = new JerryCatHttpServletResponse(Mockito.mock(HttpServletResponse.class));
        HttpServletRequest httpServletRequest = createHttpServletRequest(httpExchange);
        if (servlet != null) {
            try {
                servlet.service(httpServletRequest, httpServletResponse);
                byte[] responseByte = httpServletResponse.getResponseByte();
                httpExchange.sendResponseHeaders(200, responseByte.length);
                httpExchange.getResponseBody().write(responseByte);
                httpExchange.getResponseBody().flush();
            } catch (ServletException e) {
                e.printStackTrace();
            }
        }
    });
    httpServer.start();
} catch (IOException e) {
    throw new RuntimeException(e);
}
```

到这里就结束容器的任务了，只需要等待 Servlet 处理完成，将结果返回给客户端即可。

但这里，请求映射显的有点简单，因为我们少了处理通配符的情况。

## 其余规范

其他特性我们不说，但属于 Servlet 规范的容器一定要实现，其余规范还有如 ServletContainerInitializer、Filter 等这里我们都没有实现，ServletContainerInitializer 是一个很有用的东西，SpringBoot 打包成 war 后，就依靠它去启动。

Filter 同样的做法，也是通过 ClassReader 读取，在调用 service 前一步，先调用 Filter。

## 结束

这里只实现了一个容器的雏形中的核心，一个完整的容器，至少要做到提供完整的`HttpServletRequest`的实现，还有`HttpServletResponse`，这里只做演示，没有做太多处理，比如最重要的 Cookie 管理、Session 管理，否则应用程序就无法实现用户登录状态维护。

`HttpServletRequest`是继承`ServletRequest`的，他们定义的方法加起来共有 70 多个，需要一一去实现，才能给用户提供一个完整的请求信息供给，否则用户想拿一个请求头都拿不到，也没办法继续开发。

有完整的信息提供后，就可以做额外的功能开发了，比如 WebSocket，当请求过来时候，发现是一个 WebSocket 握手请求，那么相应的要做一个协议升级，转换为 WebSocket 协议。

另外，一个容器进程是可以加载多个 war 项目的，就像 tomcat，久而久之，支持的东西多了，就成了真正的容器。
