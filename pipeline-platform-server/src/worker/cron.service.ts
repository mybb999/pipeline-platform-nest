// CronService — 定时任务调度（每小时聚合统计 / 每天凌晨清理过期分表），Redis 分布式锁防重复执行
import { Injectable, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AggregatorService } from './aggregator.service';
import { CleanerService } from './cleaner.service';

@Injectable()
export class CronService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly aggregator: AggregatorService,
    private readonly cleaner: CleanerService,
  ) {}

  @Cron('5 * * * *')
  async handleAggregation() {
    const ok = await this.tryLock('lock:aggregator', 120);
    if (!ok) return;
    try {
      console.log('[cron] 开始聚合...');
      await this.aggregator.aggregateLastHour();
    } catch (err: any) {
      console.error('[cron] 聚合失败:', err.message);
    }
  }

  @Cron('0 4 * * *')
  async handleCleanup() {
    const ok = await this.tryLock('lock:cleaner', 300);
    if (!ok) return;
    try {
      console.log('[cron] 开始清理...');
      await this.cleaner.cleanExpiredTables();
    } catch (err: any) {
      console.error('[cron] 清理失败:', err.message);
    }
  }

  private async tryLock(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }
}
