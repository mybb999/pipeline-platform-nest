import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { IncomingEvent } from '../../shared/types';

const EXCHANGE = 'pipeline.events';
const ROUTING_KEY = 'event.collect';

@Injectable()
export class CollectorService {
  constructor(private readonly amqp: AmqpConnection) {}

  async pushToQueue(appKey: string, events: IncomingEvent[]): Promise<number> {
    for (const event of events) {
      this.amqp.publish(EXCHANGE, ROUTING_KEY, {
        ...event,
        app_key: appKey,
        created_at: new Date().toISOString(),
      });
    }
    return events.length;
  }
}
