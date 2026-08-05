// RedisModule — @Global() 全局 Redis 模块，创建 ioredis 客户端并导出 REDIS_CLIENT 令牌 + Redlock 分布式锁
import { Global, Module, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import Redlock from 'redlock';
import type { Redis as RedisType } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const REDLOCK = 'REDLOCK';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = new Redis({
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        });
        redis.on('error', (err) => {
          console.error('[redis] 连接错误:', err.message);
        });
        return redis;
      },
    },
    {
      provide: REDLOCK,
      inject: [REDIS_CLIENT],
      useFactory: (redis: RedisType) => {
        return new Redlock([redis], {
          driftFactor: 0.01,
          retryCount: 3,
          retryDelay: 200,
          retryJitter: 100,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT, REDLOCK],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisType) {}

  async onApplicationShutdown() {
    await this.redis.quit();
    console.log('[redis] 连接已断开');
  }
}
