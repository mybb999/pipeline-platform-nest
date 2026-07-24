import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { IncomingEvent } from '../../shared/types';

const QUEUE_KEY = 'event:queue';

@Injectable()
export class CollectorService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async pushToQueue(appKey: string, events: IncomingEvent[]): Promise<number> {
    const items = events.map((e) =>
      JSON.stringify({ ...e, app_key: appKey, created_at: new Date().toISOString() }),
    );
    const length = await this.redis.rpush(QUEUE_KEY, ...items);
    return length;
  }
}
