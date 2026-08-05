// EventConsumer — RabbitMQ 消费者，替代旧版 while(true) LPOP 循环
import { Injectable, Inject } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import type { Pool } from 'mysql2/promise';
import { DATABASE_USER } from '../database/database.constants';
import { ParserService } from './etl/parser.service';
import { LoaderService } from './etl/loader.service';
import { RawEvent } from '../shared/types';

@Injectable()
export class EventConsumer {
  constructor(
    @Inject(DATABASE_USER) private readonly userDb: Pool,
    private readonly parser: ParserService,
    private readonly loader: LoaderService,
  ) {}

  @RabbitSubscribe({
    exchange: 'pipeline.events',
    routingKey: 'event.collect',
    queue: 'pipeline.events.queue',
  })
  async handleEvent(msg: RawEvent) {
    try {
      const cleaned = this.parser.cleanEvent(msg);

      // 解析 app_key → app_id
      const [rows] = await this.userDb.query<any[]>(
        'SELECT id FROM apps WHERE app_key = ?',
        [msg.app_key],
      );
      cleaned.app_id = rows.length > 0 ? rows[0].id : 0;

      await this.loader.batchLoad([cleaned]);
    } catch (err: any) {
      console.error('[consumer] 处理事件失败:', err.message);
    }
  }
}
