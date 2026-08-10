// AppModule — 应用根模块，导入全局配置/数据库/Redis/RabbitMQ/限流 及所有业务模块
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConfigModule } from './config/config.module';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { RedisModule, REDIS_CLIENT } from './redis/redis.module';
import { PrismaModule } from './prisma/prisma.module';
import { WinstonModule } from './common/logger/winston.module';
import { AuthModule } from './modules/auth/auth.module';
import { AppsModule } from './modules/apps/apps.module';
import { CollectorModule } from './modules/collector/collector.module';
import { HealthModule } from './modules/health/health.module';
import { StatsModule } from './modules/stats/stats.module';
import { RedisThrottlerStorage } from './modules/collector/redis-throttler-storage';
import type Redis from 'ioredis';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    PrismaModule,
    WinstonModule,
    AuthModule,
    AppsModule,
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
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [{ ttl: 60000, limit: 1000 }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    CollectorModule,
    HealthModule,
    StatsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
