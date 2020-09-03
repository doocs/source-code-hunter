引言：庞大的代码量让人心生怠倦，有趣的故事让技术也疯狂。

大家好，我是 IoC 容器家族的第 17 代传人，我们家族世世代代在 spring 商业街上卖烤面筋，大家都叫我“面筋哥”，另外我爹还给我起了个高大上的英文名字，叫“FileSystemXmlApplicationContext”，但有群臭猴子嫌麻烦，就天天叫我的外号，害得我差点忘了自己的本名。不过无所谓咯，只要生意兴隆，这都是小事。

前几天出摊卖烤面筋时，灵感大作，即兴唱了一首“我的烤面筋”，被网友拍下来传到某站上 成了网红，现在我要趁势而上，把自己祖传的烤面筋工艺宣传出去，让我那个臭弟弟“ClassPathXmlApplicationContext”知道，谁才是 IoC 容器的正统传人！

## 第一阶段：BeanDefinition 资源定位（Reader，beanDefinitionReader，documentReader）

新的一天从 new 开始，但我却还躺在床上各种伸懒腰，毕竟我现在也是个小老板了，很多杂七杂八的活雇几个小弟干就行咯。我拿起我的 iBanana11 看了看商业街董事（某程序员）发的“精选优质面筋批发市场地址”，然后深吸一口气 refresh()，闭上眼 obtainFreshBeanFactory()，气沉丹田 refreshBeanFactory()，大喊一声：
“loadBeanDefinitions()!”
我虎背熊腰的小弟“beanDefinitionReader” 破门而入，尖声细语地问道：
“老板有何吩咐 ~ ？”
我起身叮嘱了他几件事后，把自己的联系方式（引用）、面筋批发市场的地址（spring 配置文件地址）交给他，就又躺回去盯着天花板上的钻石吊灯继续发呆。
Reader 家有一对兄妹，哥哥 beanDefinitionReader 虎背熊腰大老粗，却尖声细语；妹妹 documentReader 心灵手巧，可惜比较宅，我们几乎没怎么见过。兄妹俩相互配合把上午的准备工作做了大半。
不要看我天天躺着，彗星晒屁股了还眯着眼，ta 们兄妹俩在几点几分打个喷嚏我都能算到，毕竟我基因里都写满了“烤面筋工艺完整详细流程”。
哥哥现在肯定在开着小面包车拿着我给他的地址（locations）到处找面筋等原材料，然后把找到的面筋打包进 Document 对象，拉回来交给妹妹 documentReader 进行精心处理，连同 Document 给她的还有一个“神秘人”的联系方式。
妹妹会打开 Document 取出其中最大的几个箱子（&lt;beans>、&lt;import>、&lt;alias> 等一级标签），分别进行处理。其中 beans 箱最为重要，里面放满了夜市的主角，烤面筋的核心材料。

## 第二阶段：将 bean 解析封装成 BeanDefinitionHolder（BeanDefinitionParserDelegate）

之后妹妹会拿起我们 IoC 家族祖传的面筋处理神器 BeanDefinitionParserDelegate，从 beans 箱里面一个一个取出形态各异的面筋 bean 分别进行加工处理。刚拿出来的面筋 bean 是不会直接烤了卖的，我们会将 bean 用神器 ParserDelegate 进行九九八十一道细致处理，所以我们家烤出来的面筋才会如此劲道美味，世世代代延绵不断。
不过处理程序再怎么细致复杂，也不过就是分为两大部分：第一，处理 bean 的属性信息，如 id，class，scope 等；第二，处理 bean 的子元素，主要是 <property> 标签，而 <property> 标签又有属性和子元素，且子元素类型更加丰富复杂，可能是&lt;map>，&lt;set>，&lt;list>，&lt;array> 等。所以如果你们想学我家的祖传秘方，开个同样的摊子干倒我，也不是这么容易的哦。
经过上面的步骤，一个配置文件中的面筋 bean 就被处理包装成了半成品 BeanDefinitionHolder。

## 第三阶段：将 BeanDefinition 注册进 IoC 容器（BeanDefinitionReaderUtils）

妹妹在用神器 BeanDefinitionParserDelegate 经过一顿疯狂操作之后，将包装好的半成品 BeanDefinitionHolder 扔进传输机 BeanDefinitionReaderUtils，并且输入哥哥给她的神秘人地址，就继续处理下一个面筋 bean 咯。
之后，传输机将 BeanDefinitionHolder 的包装打开，分别取出 beanName（面筋的唯一标识）和 BeanDefinition（面筋本筋），传输的目的地是 BeanDefinitionRegistry 的工作室（这就是我前面给哥哥 beanDefinitionReader 的地址）。
这家工作室的 BeanDefinitionRegistry 其实就是我的影分身之一，因为我的祖先实现了这个接口。影分身 Registry 检查一下传输过来的 beanName（面筋的唯一标识）和 BeanDefinition（面筋本筋），如果没什么问题，就把它们用根绳子系在一起扔进我的“王之面筋宝库”，一个 ConcurrentHashMap<String, BeanDefinition>(64)，也有人把我的“面筋宝库”称作“IoC 容器本器”，我也无可辩驳，谁让他们吃面筋付钱了呢。
就这样，每一种取出来的面筋都会经过这些处理。等到所有的面筋处理完了，也差不多到了傍晚，每到这时我就会拿起梳子和发油，对着镶满钻石的镜子，梳理整齐与徐峥同款的明星发型，唱着魔性的“我的烤面筋 ~”，骑着小车车，出摊咯 ~

面筋等原材料基本上都已经处理完毕，但把这些原材料变成程序员手中的“烤面筋”也是一门复杂而精细的手艺，老铁们记得 watch、star、fork，素质三连一波，下一期我将带领你们走进 spring 商业街的夜市，一起烤出香喷喷的面筋，成为这条 gai 上最亮的仔！
