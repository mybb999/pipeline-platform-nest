import { Controller, Get, Inject, Injectable } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import type { Pool } from 'mysql2/promise';
import { DATABASE_USER, DATABASE_LOG, DATABASE_STATS } from '../../database/database.constants';

@Injectable()
export class MysqlHealthIndicator extends HealthIndicator {
  constructor(
    @Inject(DATABASE_USER) private readonly userPool: Pool,
    @Inject(DATABASE_LOG) private readonly logPool: Pool,
    @Inject(DATABASE_STATS) private readonly statsPool: Pool,
  ) {
    super();
  }

  async pingCheck(): Promise<HealthIndicatorResult> {
    try {
      await this.userPool.query('SELECT 1');
      await this.logPool.query('SELECT 1');
      await this.statsPool.query('SELECT 1');
      return this.getStatus('mysql', true, { databases: ['pipeline_user', 'pipeline_stats', 'pipeline_log'] });
    } catch (err: any) {
      return this.getStatus('mysql', false, { message: err.message });
    }
  }
}

@ApiTags('健康检查')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mysqlIndicator: MysqlHealthIndicator,
  ) {}

  @ApiOperation({ summary: '系统健康检查' })
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.mysqlIndicator.pingCheck(),
      () => ({ server: { status: 'up' as const, uptime: process.uptime() } }),
    ]);
  }
}
