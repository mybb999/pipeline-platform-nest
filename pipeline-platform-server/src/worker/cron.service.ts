// CronService — 定时任务调度（每小时聚合统计 / 每天凌晨清理过期分表），Redlock 分布式锁防重复执行
import { Injectable, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redlock, { ResourceLockedError, Lock } from 'redlock';
import type { Logger } from 'winston';
import { REDLOCK } from '../redis/redis.module';
import { WINSTON_LOGGER } from '../common/logger/winston.module';
import { AggregatorService } from './aggregator.service';
import { CleanerService } from './cleaner.service';

@Injectable()
export class CronService {
  constructor(
    @Inject(REDLOCK) private readonly redlock: Redlock,
    @Inject(WINSTON_LOGGER) private readonly logger: Logger,
    private readonly aggregator: AggregatorService,
    private readonly cleaner: CleanerService,
  ) {}

  @Cron('5 * * * *')
  async handleAggregation() {
    let lock: Lock | null = null;
    try {
      lock = await this.redlock.acquire(['lock:aggregator'], 120_000);
      this.logger.info('开始聚合...', { context: 'Cron' });
      await this.aggregator.aggregateLastHour();
    } catch (err: any) {
      if (err instanceof ResourceLockedError) {
        // 没抢到锁，其他 Worker 在执行
        return;
      }
      this.logger.error('聚合失败: ' + err.message, { context: 'Cron' });
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
      this.logger.info('开始清理...', { context: 'Cron' });
      await this.cleaner.cleanExpiredTables();
    } catch (err: any) {
      if (err instanceof ResourceLockedError) {
        // 没抢到锁，其他 Worker 在执行
        return;
      }
      this.logger.error('清理失败: ' + err.message, { context: 'Cron' });
    } finally {
      if (lock) {
        await lock.release().catch(() => {});
      }
    }
  }
}
