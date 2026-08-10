import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { IncomingEvent } from '../../shared/types';

const EXCHANGE = 'pipeline.events';
const ROUTING_KEY = 'event.collect';

@Injectable()
export class CollectorService {
  constructor(private readonly amqp: AmqpConnection) {}

  async pushToQueue(appKey: string, events: IncomingEvent[], ip?: string): Promise<number> {
    for (const event of events) {
      this.amqp.publish(EXCHANGE, ROUTING_KEY, {
        ...event,
        ip: ip || event.ip,
        app_key: appKey,
        created_at: new Date().toISOString(),
      });
    }
    return events.length;
  }
}
