// WorkerModule — ETL Worker 的根模块，注册解析/加载/聚合/清理/定时任务等服务
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { ParserService } from './etl/parser.service';
import { LoaderService } from './etl/loader.service';
import { AggregatorService } from './aggregator.service';
import { CleanerService } from './cleaner.service';
import { CronService } from './cron.service';

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, ScheduleModule.forRoot()],
  providers: [ParserService, LoaderService, AggregatorService, CleanerService, CronService],
  exports: [ParserService, LoaderService, AggregatorService, CleanerService],
})
export class WorkerModule {}
