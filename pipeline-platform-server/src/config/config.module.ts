// ConfigModule — @Global() 全局配置模块，加载 configuration.ts 并通过 ConfigService 暴露配置
import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import configuration from './configuration';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
  ],
})
export class ConfigModule {}
