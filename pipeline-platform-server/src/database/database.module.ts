// DatabaseModule — @Global() 全局数据库模块，创建 3 个 MySQL 连接池（user / log / stats）
import { Global, Module, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mysql from 'mysql2/promise';
import type { Pool } from 'mysql2/promise';
import { DATABASE_USER, DATABASE_LOG, DATABASE_STATS, DB_NAMES } from './database.constants';

function createPool(configService: ConfigService, database: string): Pool {
  return mysql.createPool({
    host: configService.get<string>('mysql.host'),
    port: configService.get<number>('mysql.port'),
    user: configService.get<string>('mysql.user'),
    password: configService.get<string>('mysql.password'),
    database,
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
}

const poolProviders = [DATABASE_USER, DATABASE_LOG, DATABASE_STATS].map((token) => ({
  provide: token,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => createPool(config, DB_NAMES[token as keyof typeof DB_NAMES]),
}));

@Global()
@Module({
  providers: [
    ...poolProviders,
    {
      provide: 'POOLS',
      inject: [DATABASE_USER, DATABASE_LOG, DATABASE_STATS],
      useFactory: (user: Pool, log: Pool, stats: Pool) => ({ user, log, stats }),
    },
  ],
  exports: [DATABASE_USER, DATABASE_LOG, DATABASE_STATS],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE_USER) private readonly userPool: Pool,
    @Inject(DATABASE_LOG) private readonly logPool: Pool,
    @Inject(DATABASE_STATS) private readonly statsPool: Pool,
  ) {}

  async onApplicationShutdown() {
    await Promise.all([
      this.userPool.end(),
      this.logPool.end(),
      this.statsPool.end(),
    ]);
    console.log('[database] 所有连接池已关闭');
  }
}
