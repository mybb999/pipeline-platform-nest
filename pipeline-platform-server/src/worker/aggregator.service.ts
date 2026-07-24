// AggregatorService — 从日志分表读取原始事件，聚合 PV/UV 和设备分布到统计库
import { Injectable, Inject } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { DATABASE_LOG, DATABASE_STATS } from '../database/database.constants';
import { getTableName } from '../shared/shard';

@Injectable()
export class AggregatorService {
  constructor(
    @Inject(DATABASE_LOG) private readonly logDb: Pool,
    @Inject(DATABASE_STATS) private readonly statsDb: Pool,
  ) {}

  async aggregateLastHour(): Promise<void> {
    const now = new Date();
    const lastHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - 1);
    const hourStart = new Date(lastHour.getFullYear(), lastHour.getMonth(), lastHour.getDate(), lastHour.getHours(), 0, 0, 0);
    const hourEnd = new Date(lastHour.getFullYear(), lastHour.getMonth(), lastHour.getDate(), lastHour.getHours(), 59, 59, 999);

    const tableName = getTableName(hourStart);

    const [tables] = await this.logDb.query<any[]>(`SHOW TABLES LIKE ?`, [tableName]);
    if (tables.length === 0) {
      console.log('[aggregator] 表不存在，跳过:', tableName);
      return;
    }

    const [pvRows] = await this.logDb.query<any[]>(`
      SELECT app_id, DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') AS hour,
             COUNT(*) AS pv, COUNT(DISTINCT ip) AS uv
      FROM \`${tableName}\`
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY app_id, hour
    `, [hourStart, hourEnd]);

    for (const row of pvRows) {
      await this.statsDb.query(`
        INSERT INTO pv_summary (app_id, hour, pv, uv)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE pv = pv + VALUES(pv), uv = uv + VALUES(uv)
      `, [row.app_id, row.hour, row.pv, row.uv]);
    }

    console.log('[aggregator] PV/UV 聚合完成:', pvRows.length, '条');

    const [deviceRows] = await this.logDb.query<any[]>(`
      SELECT app_id, DATE(created_at) AS date, device_type AS device, COUNT(*) AS count
      FROM \`${tableName}\`
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY app_id, date, device_type
    `, [hourStart, hourEnd]);

    for (const row of deviceRows) {
      await this.statsDb.query(`
        INSERT INTO device_distribution (app_id, date, device, count)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE count = count + VALUES(count)
      `, [row.app_id, row.date, row.device, row.count]);
    }

    console.log('[aggregator] 设备分布聚合完成:', deviceRows.length, '条');
  }
}
