import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { AuthGuard } from '../auth/auth.guard';

@ApiTags('数据统计')
@ApiBearerAuth()
@Controller('stats')
@UseGuards(AuthGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @ApiOperation({ summary: 'PV/UV 趋势' })
  @Get('pv')
  getPv(@Query('appId') appId: string, @Query('range') range?: string) {
    return this.statsService.getPvTrend(Number(appId), Number(range) || 7);
  }

  @ApiOperation({ summary: '设备分布' })
  @Get('device')
  getDevice(@Query('appId') appId: string) {
    return this.statsService.getDeviceDistribution(Number(appId));
  }

  @ApiOperation({ summary: '实时事件' })
  @Get('realtime')
  getRealtime(@Query('appId') appId: string) {
    return this.statsService.getRealtimeEvents(Number(appId));
  }
}
