import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController, MysqlHealthIndicator } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [MysqlHealthIndicator],
})
export class HealthModule {}
