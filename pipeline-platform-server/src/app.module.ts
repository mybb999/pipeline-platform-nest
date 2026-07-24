// AppModule — 应用根模块，导入全局配置/数据库/Redis/限流 及所有业务模块
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule, REDIS_CLIENT } from './redis/redis.module';
import { PrismaModule } from './prisma/prisma.module';
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
    AuthModule,
    AppsModule,
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
