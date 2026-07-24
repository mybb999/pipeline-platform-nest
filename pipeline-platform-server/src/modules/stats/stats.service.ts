import { Injectable, Inject } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { DATABASE_STATS, DATABASE_LOG } from '../../database/database.constants';
import { PvSummary, DeviceDistribution } from '../../shared/types';

@Injectable()
export class StatsService {
  constructor(
    @Inject(DATABASE_STATS) private readonly statsDb: Pool,
    @Inject(DATABASE_LOG) private readonly logDb: Pool,
  ) {}

  async getPvTrend(appId: number, rangeDays: number): Promise<PvSummary[]> {
    const since = new Date();
    since.setDate(since.getDate() - rangeDays);

    const [rows] = await this.statsDb.query<any[]>(
      `SELECT app_id, hour, pv, uv
       FROM pv_summary
       WHERE app_id = ? AND hour >= ?
       ORDER BY hour ASC`,
      [appId, since],
    );
    return rows as PvSummary[];
  }

  async getDeviceDistribution(appId: number): Promise<DeviceDistribution[]> {
    const [rows] = await this.statsDb.query<any[]>(
      `SELECT app_id, date, device, count
       FROM device_distribution
       WHERE app_id = ?
       ORDER BY date DESC, count DESC`,
      [appId],
    );
    return rows as DeviceDistribution[];
  }

  async getRealtimeEvents(appId: number, limit = 20): Promise<any[]> {
    const tables: string[] = [];
    const now = new Date();
    for (let i = 0; i < 2; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      tables.push(`events_${y}${m}${day}`);
    }

    const unionQueries = tables.map(
      (t) =>
        `SELECT app_id, event_type, url, device_type, city, created_at
         FROM \`${t}\` WHERE app_id = ?`,
    );

    try {
      const [rows] = await this.logDb.query<any[]>(
        `${unionQueries.join(' UNION ALL ')}
         ORDER BY created_at DESC
         LIMIT ?`,
        [...tables.map(() => appId), limit],
      );
      return rows;
    } catch {
      return [];
    }
  }
}
