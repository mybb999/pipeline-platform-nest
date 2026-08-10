// HTTP 服务入口 — 启动 NestJS Express 应用，注册全局管道/过滤器/拦截器，挂载 Swagger 文档
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Pipeline Platform API')
    .setDescription('实时数据管道平台 - API 文档')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`[server] 启动成功，端口 ${port}`);
  console.log(`[server] 健康检查: http://localhost:${port}/api/health`);
  console.log(`[server] API 文档: http://localhost:${port}/api/docs`);
}

bootstrap();
