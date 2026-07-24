// RedisModule — @Global() 全局 Redis 模块，创建 ioredis 客户端并导出 REDIS_CLIENT 令牌
import { Global, Module, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

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
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisType) {}

  async onApplicationShutdown() {
    await this.redis.quit();
    console.log('[redis] 连接已断开');
  }
}
