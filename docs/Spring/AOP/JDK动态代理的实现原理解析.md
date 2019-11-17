最近在看springAOP部分的源码，所以对JDK动态代理具体是如何实现的这件事产生了很高的兴趣，而且能从源码上了解这个原理的话，也有助于对spring-aop模块的理解。话不多说，上代码。
```java
/**
 * 一般会使用实现了InvocationHandler的类 作为代理对象的生产工厂，
 * 并且通过持有被代理对象target，来在invoke()方法中对被代理对象的目标方法进行调用和增强，
 * 这些我们都能通过下面这段代码看懂，但代理对象是如何生成的？invoke()方法又是如何被调用的呢？
 */
public class ProxyFactory implements InvocationHandler{
	
	private Object target = null;
	
	public Object getInstanse(Object target){
		
		this.target = target;
		return Proxy.newProxyInstance(target.getClass().getClassLoader(), 
				target.getClass().getInterfaces(), this);
	}

	@Override
	public Object invoke(Object proxy, Method method, Object[] args)
			throws Throwable {
		
		Object ret = null;
		System.out.println("前置增强");
		ret = method.invoke(target, args);
		System.out.println("后置增强");
		return ret;
	}
}

/**
 * 实现了接口MyInterface和接口的play()方法，可以作为被代理类
 */
public class TargetObject implements MyInterface {

	@Override
	public void play() {
		System.out.println("妲己，陪你玩 ~");
		
	}
}

/**
 * 测试类
 */
public class ProxyTest {

	public static void main(String[] args) {
		TargetObject target = new TargetObject();
		//ProxyFactory实现了InvocationHandler接口，其中的getInstanse()方法利用Proxy类帮助生成了
		//target目标对象的代理对象，并返回；且ProxyFactory持有对target的引用，可以在invoke()中完成对target相应方法
		//的调用，以及目标方法前置后置的增强处理
		ProxyFactory proxyFactory = new ProxyFactory();
		//这个mi就是JDK的Proxy类生成的代理类$Proxy0的对象，这个对象中的方法都持有对invoke()方法的回调
		//所以当调用其方法时，就能够执行invoke()中的增强处理
		MyInterface mi = (MyInterface)proxyFactory.getInstanse(target);
		//这样可以看到mi的Class到底是什么
		System.out.println(mi.getClass());
		//这里实际上调用的就是$Proxy0中对play()方法的实现，可以看到play方法通过super.h.invoke()
		//完成了对InvocationHandler对象proxyFactory的invoke()方法的回调
		//所以我才能够通过invoke()方法实现对target对象方法的前置后置增强处理
		mi.play();
		//总的来说，就是在invoke()方法中完成target目标方法的调用，及前置后置增强
		//然后通过生成的代理类完成对对invoke()的回调
	}
	
	/**
	 * 将ProxyGenerator生成的动态代理类的输出到文件中，利用反编译工具luyten等就可
	 * 以看到生成的代理类的源码咯，下面给出了其反编译好的代码实现
	 */
	@Test
	public void generatorSrc(){
		byte[] bytesFile = ProxyGenerator.generateProxyClass("$Proxy0", TargetObject.class.getInterfaces());
		FileOutputStream fos = null;
		try{
			String path = System.getProperty("user.dir") + "\\$Proxy0.class";
			File file = new File(path);
			fos = new FileOutputStream(file);
			fos.write(bytesFile);
			fos.flush();
		} catch (Exception e){
			e.printStackTrace();
		} finally{
			try {
				fos.close();
			} catch (IOException e) {
				// TODO Auto-generated catch block
				e.printStackTrace();
			}
		}
	}
}

/**
 * Proxy生成的代理类，可以看到，其继承了Proxy，并且实现了被代理类的接口
 */
public final class $Proxy0 extends Proxy implements MyInterface
{
    private static Method m1;
    private static Method m0;
    private static Method m3;
    private static Method m2;
    
    static {
        try {
            $Proxy0.m1 = Class.forName("java.lang.Object").getMethod("equals", Class.forName("java.lang.Object"));
            $Proxy0.m0 = Class.forName("java.lang.Object").getMethod("hashCode", (Class<?>[])new Class[0]);
            //实例化MyInterface的play方法
            $Proxy0.m3 = Class.forName("com.shuitu.test.MyInterface").getMethod("play", (Class<?>[])new Class[0]);
            $Proxy0.m2 = Class.forName("java.lang.Object").getMethod("toString", (Class<?>[])new Class[0]);
        }
        catch (NoSuchMethodException ex) {
            throw new NoSuchMethodError(ex.getMessage());
        }
        catch (ClassNotFoundException ex2) {
            throw new NoClassDefFoundError(ex2.getMessage());
        }
    }
    
    public $Proxy0(final InvocationHandler invocationHandler) {
        super(invocationHandler);
    }
    
    public final void play() {
        try {
        	//这个h其实就是我们调用Proxy.newProxyInstance()方法时传进去的ProxyFactory对象，
        	//该对象的invoke()方法中实现了对目标对象的目标方法的增强。看到这里，利用动态代理实现方法增强的
        	//调用原理就全部理清咯
            super.h.invoke(this, $Proxy0.m3, null);
        }
        catch (Error | RuntimeException error) {
            throw new RuntimeException();
        }
        catch (Throwable t) {
            throw new UndeclaredThrowableException(t);
        }
    }
    
    public final boolean equals(final Object o) {
        try {
            return (boolean)super.h.invoke(this, $Proxy0.m1, new Object[] { o });
        }
        catch (Error | RuntimeException error) {
            throw new RuntimeException();
        }
        catch (Throwable t) {
            throw new UndeclaredThrowableException(t);
        }
    }
    
    public final int hashCode() {
        try {
            return (int)super.h.invoke(this, $Proxy0.m0, null);
        }
        catch (Error | RuntimeException error) {
            throw new RuntimeException();
        }
        catch (Throwable t) {
            throw new UndeclaredThrowableException(t);
        }
    }
    
    public final String toString() {
        try {
            return (String)super.h.invoke(this, $Proxy0.m2, null);
        }
        catch (Error | RuntimeException error) {
            throw new RuntimeException();
        }
        catch (Throwable t) {
            throw new UndeclaredThrowableException(t);
        }
    }
    
}

```
