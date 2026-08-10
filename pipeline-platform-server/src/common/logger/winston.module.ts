// WinstonModule — @Global() 全局日志模块，输出到文件 + 终端
import { Global, Module } from '@nestjs/common';
import winston from 'winston';
import path from 'path';

const LOG_DIR = path.resolve(process.cwd(), 'logs');

export const WINSTON_LOGGER = 'WINSTON_LOGGER';

const winstonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, context, message }) =>
      `[${timestamp}] [${level.toUpperCase()}] [${context || 'App'}]: ${message}`,
    ),
  ),
  transports: [
    new winston.transports.File({ filename: path.join(LOG_DIR, 'error.log'), level: 'error', maxsize: 10 * 1024 * 1024, maxFiles: 7 }),
    new winston.transports.File({ filename: path.join(LOG_DIR, 'combined.log'), maxsize: 10 * 1024 * 1024, maxFiles: 7 }),
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
});

@Global()
@Module({
  providers: [{ provide: WINSTON_LOGGER, useValue: winstonLogger }],
  exports: [WINSTON_LOGGER],
})
export class WinstonModule {}
