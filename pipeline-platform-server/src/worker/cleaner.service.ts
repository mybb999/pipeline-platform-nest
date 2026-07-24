// CleanerService — 按天清理过期事件分表（默认保留 30 天），自动 DROP 超过阈值的 events_* 表
import { Injectable, Inject } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { DATABASE_LOG } from '../database/database.constants';

const TTL_DAYS = 30;

@Injectable()
export class CleanerService {
  constructor(@Inject(DATABASE_LOG) private readonly db: Pool) {}

  async cleanExpiredTables(): Promise<void> {
    const [tables] = await this.db.query<any[]>(`SHOW TABLES LIKE 'events_%'`);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - TTL_DAYS);
    const cutoffStr = this.formatDate(cutoff);

    let dropped = 0;
    for (const row of tables) {
      const tableName = Object.values(row)[0] as string;
      if (tableName === 'events_template') continue;
      if (tableName < cutoffStr) {
        await this.db.query(`DROP TABLE \`${tableName}\``);
        console.log('[cleaner] 已删除:', tableName);
        dropped++;
      }
    }

    if (dropped === 0) {
      console.log('[cleaner] 没有过期表');
    } else {
      console.log('[cleaner] 清理完成，共删除', dropped, '张表');
    }
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `events_${y}${m}${d}`;
  }
}
