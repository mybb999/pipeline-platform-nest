import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConfigModule } from '../../config/config.module';
import { ConfigService } from '@nestjs/config';
import { CollectorController } from './collector.controller';
import { CollectorService } from './collector.service';
import { GatewayGuard } from './gateway.guard';

@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: `amqp://${config.get('rabbitmq.user')}:${config.get('rabbitmq.password')}@${config.get('rabbitmq.host')}:${config.get('rabbitmq.port')}`,
        exchanges: [{ name: 'pipeline.events', type: 'topic' }],
      }),
    }),
  ],
  controllers: [CollectorController],
  providers: [CollectorService, GatewayGuard],
})
export class CollectorModule {}
