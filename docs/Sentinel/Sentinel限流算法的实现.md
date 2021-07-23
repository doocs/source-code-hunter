## Sentinel 中漏桶算法的实现

Sentinel 中漏桶算法通过 RateLimiterController 来实现，在漏桶算法中，会记录上一个请求的到达时间，如果新到达的请求与上一次到达的请求之间的时间差小于限流配置所规定的最小时间，新到达的请求将会排队等待规定的最小间隔到达，或是直接失败。

```java
@Override
public boolean canPass(Node node, int acquireCount, boolean prioritized) {
    if (acquireCount <= 0) {
        return true;
    }

    if (count <= 0) {
        return false;
    }

    long currentTime = TimeUtil.currentTimeMillis();
    // 根据配置计算两次请求之间的最小时间
    long costTime = Math.round(1.0 * (acquireCount) / count * 1000);

    // 计算上一次请求之后，下一次允许通过的最小时间
    long expectedTime = costTime + latestPassedTime.get();

    if (expectedTime <= currentTime) {
        // 如果当前时间大于计算的时间，那么可以直接放行
        latestPassedTime.set(currentTime);
        return true;
    } else {
        // 如果没有，则计算相应需要等待的时间
        long waitTime = costTime + latestPassedTime.get() - TimeUtil.currentTimeMillis();
        if (waitTime > maxQueueingTimeMs) {
            return false;
        } else {
            long oldTime = latestPassedTime.addAndGet(costTime);
            try {
                waitTime = oldTime - TimeUtil.currentTimeMillis();
            // 如果最大等待时间小于需要等待的时间，那么返回失败，当前请求被拒绝
                if (waitTime > maxQueueingTimeMs) {
                    latestPassedTime.addAndGet(-costTime);
                    return false;
                }
                // 在并发条件下等待时间可能会小于等于0
                if (waitTime > 0) {
                    Thread.sleep(waitTime);
                }
                return true;
            } catch (InterruptedException e) {
            }
        }
    }
    return false;
}
```

## Sentinel 中令牌桶算法的实现

在 Sentinel 中，令牌桶算法通过 WarmUpController 类实现。在这个情况下，当配置每秒能通过多少请求后，那么在这里 sentinel 也会每秒往桶内添加多少的令牌。当一个请求进入的时候，将会从中移除一个令牌。由此可以得出，桶内的令牌越多，也说明当前的系统利用率越低。因此，当桶内的令牌数量超过某个阈值后，那么当前的系统可以称之为处于`饱和`状态。  
当系统处于 `饱和`状态的时候，当前允许的最大 qps 将会随着剩余的令牌数量减少而缓慢增加，达到为系统预热热身的目的。

```java
this.count = count;

this.coldFactor = coldFactor;

warningToken = (int)(warmUpPeriodInSec * count) / (coldFactor - 1);

maxToken = warningToken + (int)(2 * warmUpPeriodInSec * count / (1.0 + coldFactor));

slope = (coldFactor - 1.0) / count / (maxToken - warningToken);
```

其中 count 是当前 qps 的阈值。coldFactor 则为冷却因子，warningToken 则为警戒的令牌数量，warningToken 的值为`(热身时间长度 * 每秒令牌的数量) / (冷却因子 - 1)`。maxToken 则是最大令牌数量，具体的值为 `warningToken + (2 * 热身时间长度 * 每秒令牌数量) / (冷却因子 + 1)`。当当前系统处于热身时间内，其允许通过的最大 qps 为 `1 / (超过警戒数的令牌数 * 斜率 slope + 1 / count)`，而斜率的值为`(冷却因子 - 1) / count / (最大令牌数 - 警戒令牌数)`。

举个例子: count = 3， coldFactor = 3，热身时间为 4 的时候，警戒令牌数为 6，最大令牌数为 12，当剩余令牌处于 6 和 12 之间的时候，其 slope 斜率为 1 / 9。 那么当剩余令牌数为 9 的时候的允许 qps 为 1.5。其 qps 将会随着剩余令牌数的不断减少而直到增加到 count 的值。

```java
@Override
public boolean canPass(Node node, int acquireCount, boolean prioritized) {
    long passQps = (long) node.passQps();

    long previousQps = (long) node.previousPassQps();
    // 首先重新计算其桶内剩余的数量
    syncToken(previousQps);

    // 开始计算它的斜率
    // 如果进入了警戒线，开始调整他的qps
    long restToken = storedTokens.get();
    if (restToken >= warningToken) {
        long aboveToken = restToken - warningToken;
        // 如果当前剩余的令牌数大于警戒数，那么需要根据准备的计算公式重新计算qps，这个qps小于设定的阈值
        double warningQps = Math.nextUp(1.0 / (aboveToken * slope + 1.0 / count));
        if (passQps + acquireCount <= warningQps) {
            return true;
        }
    } else {
        if (passQps + acquireCount <= count) {
            return true;
        }
    }

    return false;
}

protected void syncToken(long passQps) {
    long currentTime = TimeUtil.currentTimeMillis();
    currentTime = currentTime - currentTime % 1000;
    long oldLastFillTime = lastFilledTime.get();
    if (currentTime <= oldLastFillTime) {
        return;
    }

    long oldValue = storedTokens.get();
    long newValue = coolDownTokens(currentTime, passQps);

    if (storedTokens.compareAndSet(oldValue, newValue)) {
        // 从桶内移除相应数量的令牌，并更新最后更新时间
        long currentValue = storedTokens.addAndGet(0 - passQps);
        if (currentValue < 0) {
            storedTokens.set(0L);
        }
        lastFilledTime.set(currentTime);
    }

}

private long coolDownTokens(long currentTime, long passQps) {
    long oldValue = storedTokens.get();
    long newValue = oldValue;

    // 当令牌的消耗程度远远低于警戒线的时候，将会补充令牌数
    if (oldValue < warningToken) {
        newValue = (long)(oldValue + (currentTime - lastFilledTime.get()) * count / 1000);
    } else if (oldValue > warningToken) {
        if (passQps < (int)count / coldFactor) {
            // qps小于阈值 / 冷却因子的时候，说明此时还不需要根据剩余令牌数调整qps的阈值，所以也会补充
            newValue = (long)(oldValue + (currentTime - lastFilledTime.get()) * count / 1000);
        }
    }
    return Math.min(newValue, maxToken);
}
```
