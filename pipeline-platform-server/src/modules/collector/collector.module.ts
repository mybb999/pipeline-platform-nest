import { Module } from '@nestjs/common';
import { CollectorController } from './collector.controller';
import { CollectorService } from './collector.service';
import { GatewayGuard } from './gateway.guard';

@Module({
  controllers: [CollectorController],
  providers: [CollectorService, GatewayGuard],
})
export class CollectorModule {}
