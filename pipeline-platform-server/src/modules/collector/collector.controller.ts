import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
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
  async collect(@Body() dto: CollectDto) {
    const queueLength = await this.collectorService.pushToQueue(dto.appKey, dto.events);
    return { received: dto.events.length, queue_length: queueLength };
  }
}
