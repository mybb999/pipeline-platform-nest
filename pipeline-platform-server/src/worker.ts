// ETL Worker 独立进程入口 — RabbitMQ 消费事件 + @Cron 定时聚合/清理
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  console.log('[worker] ETL Worker 启动（RabbitMQ 模式）');
  console.log('[worker] 事件消费：EventConsumer（@RabbitSubscribe）');
  console.log('[worker] 定时任务：@Cron 聚合 + 清理');

  // 保持进程存活，等待 RabbitMQ 消息
  process.on('SIGTERM', async () => {
    await app.close();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error('[worker] 启动失败:', err);
  process.exit(1);
});
