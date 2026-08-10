import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { CollectorService } from './collector.service';
import { CollectDto } from './dto/collect.dto';
import { ThrottlerGuard } from '@nestjs/throttler';

@ApiTags('事件采集')
@Controller('collect')
@UseGuards(ThrottlerGuard)
export class CollectorController {
  constructor(private readonly collectorService: CollectorService) {}

  @ApiOperation({ summary: '上报事件' })
  @Post()
  async collect(@Body() dto: CollectDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const queueLength = await this.collectorService.pushToQueue(dto.appKey, dto.events, ip);
    return { received: dto.events.length, queue_length: queueLength };
  }
}
