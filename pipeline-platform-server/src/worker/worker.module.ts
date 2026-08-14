// WorkerModule — ETL Worker 的根模块，RabbitMQ 消费 + 定时聚合/清理
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConfigModule } from '../config/config.module';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { WinstonModule } from '../common/logger/winston.module';
import { ParserService } from './etl/parser.service';
import { LoaderService } from './etl/loader.service';
import { AggregatorService } from './aggregator.service';
import { CleanerService } from './cleaner.service';
import { CronService } from './cron.service';
import { EventConsumer } from './event.consumer';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    WinstonModule,
    ScheduleModule.forRoot(),
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: `amqp://${config.get('rabbitmq.user')}:${config.get('rabbitmq.password')}@${config.get('rabbitmq.host')}:${config.get('rabbitmq.port')}`,
        exchanges: [
          {
            name: 'pipeline.events',
            type: 'topic',
          },
        ],
      }),
    }),
  ],
  providers: [ParserService, LoaderService, AggregatorService, CleanerService, CronService, EventConsumer],
  exports: [ParserService, LoaderService, AggregatorService, CleanerService],
})
export class WorkerModule {}
