// ETL Worker 独立进程入口 — 从 Redis 队列消费原始事件，解析后批量写入 MySQL 分表
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';
import { ParserService } from './worker/etl/parser.service';
import { LoaderService } from './worker/etl/loader.service';
import { REDIS_CLIENT } from './redis/redis.module';
import { DATABASE_USER } from './database/database.constants';
import type Redis from 'ioredis';
import type { Pool } from 'mysql2/promise';
import { RawEvent } from './shared/types';

const BATCH_SIZE = 200;
const IDLE_SLEEP = 1000;

const BATCH_POP_SCRIPT = `
local result = {}
for i = 1, tonumber(ARGV[1]) do
  local item = redis.call('LPOP', KEYS[1])
  if not item then break end
  table.insert(result, item)
end
return result
`;

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  const parser = app.get(ParserService);
  const loader = app.get(LoaderService);
  const redis: Redis = app.get(REDIS_CLIENT);
  const userDb: Pool = app.get(DATABASE_USER);

  redis.defineCommand('batchPop', { numberOfKeys: 1, lua: BATCH_POP_SCRIPT });

  console.log('[worker] ETL Worker 启动');

  // 定时任务由 @nestjs/schedule 的 @Cron 装饰器自动注册，见 CronService

  while (true) {
    try {
      const results: string[] = await (redis as any).batchPop('event:queue', BATCH_SIZE);

      if (!results || results.length === 0) {
        await sleep(IDLE_SLEEP);
        continue;
      }

      const rawEvents = results
        .map((r) => {
          try { return JSON.parse(r) as RawEvent; }
          catch { return null; }
        })
        .filter(Boolean) as RawEvent[];

      const cleaned = rawEvents.map((r) => parser.cleanEvent(r));

      const appKeys = [...new Set(rawEvents.map((r) => r.app_key))];
      const appIdMap = await resolveAppIds(userDb, appKeys);
      for (let i = 0; i < cleaned.length; i++) {
        cleaned[i].app_id = appIdMap.get(rawEvents[i].app_key) || 0;
      }

      const written = await loader.batchLoad(cleaned);
      console.log(`[worker] 消费 ${results.length} 条, 写入 ${written} 条`);
    } catch (err: any) {
      console.error('[worker] 处理失败:', err.message);
      await sleep(1000);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveAppIds(db: Pool, appKeys: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (appKeys.length === 0) return map;
  const placeholders = appKeys.map(() => '?').join(',');
  const [rows] = await db.query<any[]>(
    `SELECT id, app_key FROM apps WHERE app_key IN (${placeholders})`,
    appKeys,
  );
  for (const row of rows) {
    map.set(row.app_key, row.id);
  }
  return map;
}

bootstrap().catch((err) => {
  console.error('[worker] 启动失败:', err);
  process.exit(1);
});
