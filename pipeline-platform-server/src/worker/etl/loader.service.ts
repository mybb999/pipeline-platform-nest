// LoaderService — ETL 加载阶段：按日期分表分组，自动建表 + 批量 INSERT 写入日志库
import { Injectable, Inject } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { DATABASE_LOG } from '../../database/database.constants';
import { getTableName } from '../../shared/shard';
import { CleanedEvent } from '../../shared/types';

@Injectable()
export class LoaderService {
  constructor(@Inject(DATABASE_LOG) private readonly db: Pool) {}

  async batchLoad(events: CleanedEvent[]): Promise<number> {
    if (events.length === 0) return 0;

    const groups: Record<string, CleanedEvent[]> = {};
    for (const e of events) {
      const date = new Date(e.created_at);
      const table = getTableName(date);
      if (!groups[table]) groups[table] = [];
      groups[table].push(e);
    }

    let total = 0;

    for (const [table, rows] of Object.entries(groups)) {
      await this.db.query(`CREATE TABLE IF NOT EXISTS \`${table}\` LIKE events_template`);

      const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values: any[] = [];
      for (const r of rows) {
        // MySQL DATETIME 不接受 Z 结尾，去掉
        const createdAt = r.created_at.replace('T', ' ').replace('Z', '');
        values.push(
          r.app_id, r.event_type, r.url, r.ua, r.ip,
          r.extra, r.device_type, r.city, r.page_path, createdAt,
        );
      }

      await this.db.query(
        `INSERT INTO \`${table}\` (app_id, event_type, url, ua, ip, extra, device_type, city, page_path, created_at) VALUES ${placeholders}`,
        values,
      );
      total += rows.length;
    }

    return total;
  }
}
