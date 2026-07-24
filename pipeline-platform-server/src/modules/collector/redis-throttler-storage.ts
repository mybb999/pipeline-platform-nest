import { Injectable, Inject } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';

// ThrottlerStorageRecord 在 @nestjs/throttler v6 中未从包入口导出，这里手动定义
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `rate:${key}`;
    const count = await this.redis.incr(redisKey);

    if (count === 1) {
      await this.redis.expire(redisKey, Math.ceil(ttl / 1000));
    }

    const ttlRemaining = await this.redis.ttl(redisKey);
    const timeToExpire = ttlRemaining > 0 ? ttlRemaining * 1000 : ttl;

    return {
      totalHits: count,
      timeToExpire,
      isBlocked: count > limit,
      timeToBlockExpire: count > limit ? timeToExpire : 0,
    };
  }
}
