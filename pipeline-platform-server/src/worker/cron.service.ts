// CronService — 定时任务调度（每小时聚合统计 / 每天凌晨清理过期分表），Redlock 分布式锁防重复执行
import { Injectable, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redlock, { ResourceLockedError, Lock } from 'redlock';
import { REDLOCK } from '../redis/redis.module';
import { AggregatorService } from './aggregator.service';
import { CleanerService } from './cleaner.service';

@Injectable()
export class CronService {
  constructor(
    @Inject(REDLOCK) private readonly redlock: Redlock,
    private readonly aggregator: AggregatorService,
    private readonly cleaner: CleanerService,
  ) {}

  @Cron('5 * * * *')
  async handleAggregation() {
    let lock: Lock | null = null;
    try {
      lock = await this.redlock.acquire(['lock:aggregator'], 120_000);
      console.log('[cron] 开始聚合...');
      await this.aggregator.aggregateLastHour();
    } catch (err: any) {
      if (err instanceof ResourceLockedError) {
        // 没抢到锁，其他 Worker 在执行
        return;
      }
      console.error('[cron] 聚合失败:', err.message);
    } finally {
      if (lock) {
        await lock.release().catch(() => {});
      }
    }
  }

  @Cron('0 4 * * *')
  async handleCleanup() {
    let lock: Lock | null = null;
    try {
      lock = await this.redlock.acquire(['lock:cleaner'], 300_000);
      console.log('[cron] 开始清理...');
      await this.cleaner.cleanExpiredTables();
    } catch (err: any) {
      if (err instanceof ResourceLockedError) {
        // 没抢到锁，其他 Worker 在执行
        return;
      }
      console.error('[cron] 清理失败:', err.message);
    } finally {
      if (lock) {
        await lock.release().catch(() => {});
      }
    }
  }
}
