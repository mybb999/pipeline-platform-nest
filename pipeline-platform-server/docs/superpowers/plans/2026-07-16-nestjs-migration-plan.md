# NestJS 迁移实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 pipeline-platform-server 从 Express.js 完整迁移到 NestJS，HTTP + Worker 全换，SDK 不变。

**Architecture:** 标准 NestJS 单体项目，feature modules 按 auth/apps/collector/stats/health 划分，共享 database/redis/config 模块作为全局 provider。Worker 用 NestJS standalone app 启动，复用相同模块。

**Tech Stack:** NestJS 11.x, @nestjs/jwt, @nestjs/config, @nestjs/throttler, @nestjs/schedule, @nestjs/terminus, @nestjs/swagger, mysql2, ioredis, bcrypt, class-validator, class-transformer

## Global Constraints

- 所有 API 路径、参数、响应格式与旧项目完全一致
- 仅新建项目 `pipeline-platform-nest`，不修改旧项目
- 实现顺序：基础层 → 公共层 → 业务模块 → Worker → 配置
- 编码语言：TypeScript strict 模式
- 项目位于：`f:\AIproject\pipeline-platform-nest\`

---

### Task 1: 创建 NestJS 脚手架

**Files:**
- Create: `f:\AIproject\pipeline-platform-nest\` (entire project via nest new)

**Produced:** 可运行的空白 NestJS 项目

- [ ] **Step 1: 用 nest cli 创建项目**

```bash
cd f:\AIproject\pipeline-platform
npx @nestjs/cli@latest new pipeline-platform-nest --package-manager npm --skip-git --strict
```

交互选项选 npm，等待创建完成。

- [ ] **Step 2: 安装项目依赖**

```bash
cd f:\AIproject\pipeline-platform-nest
npm install mysql2 ioredis bcrypt class-validator class-transformer
npm install @nestjs/config @nestjs/jwt @nestjs/throttler @nestjs/schedule @nestjs/terminus @nestjs/swagger
npm install -D @types/bcrypt
```

- [ ] **Step 3: 清理示例代码**

```bash
rm -f src/app.controller.ts src/app.controller.spec.ts src/app.service.ts
```

- [ ] **Step 4: 精简 `src/app.module.ts`，移除对 app controller/service 的引用**

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 5: 精简 `src/main.ts`，添加全局前缀和 CORS**

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api');
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`[server] 启动成功，端口 ${port}`);
  console.log(`[server] 健康检查: http://localhost:${port}/api/health`);
}

bootstrap();
```

注意：NestJS `setGlobalPrefix('api')` 会改变路由注册行为——控制器里写 `@Get('health')` 实际映射为 `GET /api/health`。这比 Express 手写前缀更干净。

- [ ] **Step 6: 验证项目能启动**

```bash
npx tsx src/main.ts
```

Expected: `[server] 启动成功，端口 3000`，然后 Ctrl+C 停止。

---

### Task 2: Config 模块（环境变量管理）

**Files:**
- Create: `src/config/config.module.ts`
- Modify: `src/app.module.ts`（导入 ConfigModule）
- Create: `src/config/configuration.ts`

**Interface:** 导出 `ConfigModule`（全局），注入 `ConfigService` 供其他模块使用

- [ ] **Step 1: 创建 configuration 工厂函数 `src/config/configuration.ts`**

```typescript
export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    user: process.env.MYSQL_USER || 'pipeline',
    password: process.env.MYSQL_PASSWORD || 'pipeline_dev_2024',
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production',
    expiresIn: '7d',
  },
  bcrypt: {
    saltRounds: 10,
  },
});
```

- [ ] **Step 2: 创建 `src/config/config.module.ts`**

```typescript
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
```

- [ ] **Step 3: 更新 `src/app.module.ts` 导入 ConfigModule**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';

@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 4: 复制 `.env` 文件（从旧项目）**

复制旧项目的 `.env` 到新项目根目录，内容相同

- [ ] **Step 5: 验证配置能加载 — 临时在 main.ts 里打印测试**

```bash
npx tsx src/main.ts
```

（启动成功即可，后续正式验证）

---

### Task 3: Database 模块（MySQL 连接池）

**Files:**
- Create: `src/database/database.module.ts`
- Create: `src/database/database.constants.ts`
- Modify: `src/app.module.ts`（导入 DatabaseModule）
- Create: `src/database/migrations/`（复制 3 个 SQL 文件）

**Interface:**
- Exports: `DATABASE_USER`, `DATABASE_LOG`, `DATABASE_STATS` 三个 token
- Each token resolves to a `mysql2.Pool` instance
- Provides: `closeAllPools()` via `OnApplicationShutdown`

- [ ] **Step 1: 创建常量文件 `src/database/database.constants.ts`**

```typescript
export const DATABASE_USER = 'DATABASE_USER';
export const DATABASE_LOG = 'DATABASE_LOG';
export const DATABASE_STATS = 'DATABASE_STATS';

export const DB_NAMES = {
  [DATABASE_USER]: 'pipeline_user',
  [DATABASE_LOG]: 'pipeline_log',
  [DATABASE_STATS]: 'pipeline_stats',
} as const;
```

- [ ] **Step 2: 创建 `src/database/database.module.ts`**

```typescript
import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mysql, { Pool } from 'mysql2/promise';
import { DATABASE_USER, DATABASE_LOG, DATABASE_STATS, DB_NAMES } from './database.constants';

function createPool(configService: ConfigService, database: string): Pool {
  return mysql.createPool({
    host: configService.get<string>('mysql.host'),
    port: configService.get<number>('mysql.port'),
    user: configService.get<string>('mysql.user'),
    password: configService.get<string>('mysql.password'),
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
}

const poolProviders = [DATABASE_USER, DATABASE_LOG, DATABASE_STATS].map(token => ({
  provide: token,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => createPool(config, DB_NAMES[token]),
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
```

注意：需要补充 import `@Inject` from `@nestjs/common`。

- [ ] **Step 3: 更新 `src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 4: 复制迁移文件**

```bash
cp -r f:/AIproject/pipeline-platform/pipeline-platform-server/src/server/db/migrations f:/AIproject/pipeline-platform-nest/src/database/migrations
```

- [ ] **Step 5: 验证 — 用 main.ts 注入并 ping 数据库**

在 main.ts 中修改，注入 DATABASE_USER 测试连接，然后恢复。确保无 import 报错。

---

### Task 4: Redis 模块

**Files:**
- Create: `src/redis/redis.module.ts`
- Modify: `src/app.module.ts`（导入 RedisModule）

**Interface:**
- Exports: `REDIS_CLIENT` token → `ioRedis.Redis` 实例
- Provides: `OnApplicationShutdown` 断开连接

- [ ] **Step 1: 创建 `src/redis/redis.module.ts`**

```typescript
import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = new Redis({
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        });
        redis.on('error', (err) => {
          console.error('[redis] 连接错误:', err.message);
        });
        return redis;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    await this.redis.quit();
    console.log('[redis] 连接已断开');
  }
}
```

注意：`@Inject` 需要从 `@nestjs/common` 导入。

- [ ] **Step 2: 更新 `src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

---

### Task 5: 共享层（Types + Shard + 公共装饰器）

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/shard.ts`
- Create: `src/shared/index.ts`
- Create: `src/common/decorators/current-user.decorator.ts`

**Interface:**
- `types.ts`: 所有实体/响应接口
- `shard.ts`: `getTableName(date?)` 纯函数
- `CurrentUser` 装饰器：从 request 提取 user

- [ ] **Step 1: 创建 `src/shared/shard.ts`（从旧项目直接复制）**

```typescript
export function getTableName(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `events_${y}${m}${d}`;
}
```

- [ ] **Step 2: 创建 `src/shared/types.ts`**

```typescript
export interface User {
  id: number;
  email: string;
  password: string;
  created_at: Date;
}

export interface App {
  id: number;
  user_id: number;
  name: string;
  app_key: string;
  secret_key: string;
  domain: string | null;
  status: number;
  created_at: Date;
}

export type EventType = 'page_view' | 'click' | 'error' | 'performance' | 'custom';

export interface TrackEvent {
  event_type: EventType;
  url: string;
  ua: string;
  ip: string;
  extra?: Record<string, unknown>;
}

export interface ParsedEvent extends TrackEvent {
  device_type: 'desktop' | 'mobile' | 'tablet';
  city: string;
  page_path: string;
}

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

export interface PvSummary {
  app_id: number;
  hour: string;
  pv: number;
  uv: number;
}

export interface DeviceDistribution {
  app_id: number;
  date: string;
  device: string;
  count: number;
}

export interface JwtPayload {
  id: number;
  email: string;
}

export interface AppInfo {
  id: number;
  name: string;
  app_key: string;
  secret_key: string;
  domain: string | null;
  status: number;
  created_at: string;
}

export interface IncomingEvent {
  event_type: string;
  url: string;
  ua: string;
  ip: string;
  extra?: Record<string, unknown>;
}

export interface RawEvent extends IncomingEvent {
  app_key: string;
  created_at: string;
}

export interface CleanedEvent {
  app_id: number;
  event_type: string;
  url: string;
  ua: string;
  ip: string;
  extra: string;
  device_type: 'desktop' | 'mobile' | 'tablet';
  city: string;
  page_path: string;
  created_at: string;
}
```

- [ ] **Step 3: 创建 `src/common/decorators/current-user.decorator.ts`**

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../../shared/types';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

- [ ] **Step 4: 验证 — 编译通过**

```bash
npx tsc --noEmit
```

---

### Task 6: 公共层（全局过滤器 + 拦截器）

**Files:**
- Create: `src/common/filters/http-exception.filter.ts`
- Create: `src/common/interceptors/response.interceptor.ts`
- Modify: `src/main.ts`（注册全局 filter + interceptor + ValidationPipe）

**Interface:**
- `HttpExceptionFilter`: catch all exceptions → `{ code: -1, message: "..." }`
- `ResponseInterceptor`: wrap successful responses → `{ code: 0, message: "ok", data: ... }`
- `ValidationPipe`: 全局 DTO 校验

- [ ] **Step 1: 创建 `src/common/filters/http-exception.filter.ts`**

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器错误';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      message = typeof exResponse === 'string'
        ? exResponse
        : (exResponse as any).message || exception.message;

      // class-validator 返回的是数组，取第一条
      if (Array.isArray(message)) {
        message = message[0];
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled: ${exception.message}`, exception.stack);
    }

    response.status(status).json({
      code: -1,
      message,
    });
  }
}
```

- [ ] **Step 2: 创建 `src/common/interceptors/response.interceptor.ts`**

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // 如果 controller 已经返回了 { code, message, data } 格式，直接通过
        if (data && typeof data === 'object' && 'code' in data && 'message' in data) {
          return data;
        }
        return {
          code: 0,
          message: 'ok',
          data,
        };
      }),
    );
  }
}
```

- [ ] **Step 3: 更新 `src/main.ts` 注册全局 filter/interceptor/pipe**

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
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
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`[server] 启动成功，端口 ${port}`);
  console.log(`[server] 健康检查: http://localhost:${port}/api/health`);
}

bootstrap();
```

- [ ] **Step 4: 验证编译通过**

```bash
npx tsc --noEmit
```

---

### Task 7: Auth 模块（注册 + 登录 + JWT 守卫）

**Files:**
- Create: `src/modules/auth/dto/register.dto.ts`
- Create: `src/modules/auth/dto/login.dto.ts`
- Create: `src/modules/auth/auth.service.ts`
- Create: `src/modules/auth/auth.controller.ts`
- Create: `src/modules/auth/auth.guard.ts`
- Create: `src/modules/auth/auth.module.ts`
- Modify: `src/app.module.ts`（导入 AuthModule）

**Interface:**
- `POST /api/auth/register` body: `{ email, password }` → `{ code, message, data: { id, email, token } }`
- `POST /api/auth/login` body: `{ email, password }` → `{ code, message, data: { id, email, token } }`
- `AuthGuard`: 实现 CanActivate，解析 Bearer token，挂载 user 到 request
- Exports: `AuthGuard`, `JwtModule`

- [ ] **Step 1: 创建 `src/modules/auth/dto/register.dto.ts`**

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  password: string;
}
```

- [ ] **Step 2: 创建 `src/modules/auth/dto/login.dto.ts`**

```typescript
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @IsString()
  password: string;
}
```

- [ ] **Step 3: 创建 `src/modules/auth/auth.service.ts`**

```typescript
import { Injectable, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { DATABASE_USER } from '../../database/database.constants';
import { JwtPayload } from '../../shared/types';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_USER) private readonly db: Pool,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(email: string, password: string) {
    const [existing] = await this.db.query<any[]>(
      'SELECT id FROM users WHERE email = ?',
      [email],
    );
    if (existing.length > 0) {
      throw new HttpException('邮箱已被注册', HttpStatus.CONFLICT);
    }

    const saltRounds = this.config.get<number>('bcrypt.saltRounds');
    const hashed = await bcrypt.hash(password, saltRounds);

    const [result] = await this.db.query<any>(
      'INSERT INTO users (email, password) VALUES (?, ?)',
      [email, hashed],
    );

    const userId = result.insertId;
    const token = this.jwtService.sign({ id: userId, email });

    return { id: userId, email, token };
  }

  async login(email: string, password: string) {
    const [rows] = await this.db.query<any[]>(
      'SELECT id, email, password FROM users WHERE email = ?',
      [email],
    );
    if (rows.length === 0) {
      throw new HttpException('邮箱或密码错误', HttpStatus.UNAUTHORIZED);
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw new HttpException('邮箱或密码错误', HttpStatus.UNAUTHORIZED);
    }

    const token = this.jwtService.sign({ id: user.id, email: user.email });

    return { id: user.id, email: user.email, token };
  }

  verifyToken(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token);
  }
}
```

- [ ] **Step 4: 创建 `src/modules/auth/auth.controller.ts`**

```typescript
import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }
}
```

注意：NestJS controller 方法抛出 `HttpException` 会被全局 `AllExceptionsFilter` 捕获并格式化。Service 中抛出的 `HttpException` 同样被捕获。

- [ ] **Step 5: 创建 `src/modules/auth/auth.guard.ts`**

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../../shared/types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('未登录');
    }

    const token = header.slice(7);
    try {
      const user = this.jwtService.verify<JwtPayload>(token);
      (request as any).user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Token 无效或已过期');
    }
  }
}
```

- [ ] **Step 6: 创建 `src/modules/auth/auth.module.ts`**

```typescript
import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard, JwtModule, AuthService],
})
export class AuthModule {}
```

AuthModule 设为 `@Global()`，因为 `AuthGuard` 需要全局可用（在 Apps、Stats 模块中复用）。也可以不设全局，但需要在每个用到守卫的模块 imports 里加 AuthModule——这里选全局更方便。

- [ ] **Step 7: 更新 `src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, AuthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 8: 验证编译 + 启动**

```bash
npx tsc --noEmit && npx tsx src/main.ts
```

Expected: Server starts. Test with:
```bash
curl -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"123456"}'
```

Expected response: `{"code":0,"message":"ok","data":{"id":1,"email":"test@test.com","token":"eyJ..."}}`

（前提：MySQL Docker 已启动，且 migrations 已执行。如果数据库没初始化，先执行迁移 SQL。）

---

### Task 8: Apps 模块（应用 CRUD）

**Files:**
- Create: `src/modules/apps/dto/create-app.dto.ts`
- Create: `src/modules/apps/apps.service.ts`
- Create: `src/modules/apps/apps.controller.ts`
- Create: `src/modules/apps/apps.module.ts`
- Modify: `src/app.module.ts`（导入 AppsModule）

**Interface:**
- `POST /api/apps` body: `{ name, domain? }` → 返回 AppInfo（需登录）
- `GET /api/apps` → 返回 AppInfo[]（需登录）
- `DELETE /api/apps/:id` → 删除成功/失败（需登录）
- 所有接口受 `AuthGuard` 保护

- [ ] **Step 1: 创建 `src/modules/apps/dto/create-app.dto.ts`**

```typescript
import { IsString, IsOptional } from 'class-validator';

export class CreateAppDto {
  @IsString({ message: '应用名不能为空' })
  name: string;

  @IsOptional()
  @IsString()
  domain?: string;
}
```

- [ ] **Step 2: 创建 `src/modules/apps/apps.service.ts`**

```typescript
import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import crypto from 'crypto';
import { DATABASE_USER } from '../../database/database.constants';
import { AppInfo } from '../../shared/types';

@Injectable()
export class AppsService {
  constructor(@Inject(DATABASE_USER) private readonly db: Pool) {}

  private generateKeys() {
    return {
      appKey: crypto.randomBytes(12).toString('hex'),
      secretKey: crypto.randomBytes(16).toString('hex'),
    };
  }

  async createApp(userId: number, name: string, domain?: string): Promise<AppInfo> {
    const { appKey, secretKey } = this.generateKeys();

    await this.db.query(
      'INSERT INTO apps (user_id, name, app_key, secret_key, domain) VALUES (?, ?, ?, ?, ?)',
      [userId, name, appKey, secretKey, domain || null],
    );

    const [rows] = await this.db.query<any[]>(
      'SELECT id, name, app_key, secret_key, domain, status, created_at FROM apps WHERE app_key = ?',
      [appKey],
    );
    return rows[0] as AppInfo;
  }

  async listApps(userId: number): Promise<AppInfo[]> {
    const [rows] = await this.db.query<any[]>(
      'SELECT id, name, app_key, secret_key, domain, status, created_at FROM apps WHERE user_id = ? ORDER BY created_at DESC',
      [userId],
    );
    return rows as AppInfo[];
  }

  async deleteApp(userId: number, appId: number): Promise<boolean> {
    const [result] = await this.db.query<any>(
      'DELETE FROM apps WHERE id = ? AND user_id = ?',
      [appId, userId],
    );
    if (result.affectedRows === 0) {
      throw new HttpException('应用不存在', HttpStatus.NOT_FOUND);
    }
    return true;
  }
}
```

- [ ] **Step 3: 创建 `src/modules/apps/apps.controller.ts`**

```typescript
import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AppsService } from './apps.service';
import { CreateAppDto } from './dto/create-app.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../shared/types';

@Controller('apps')
@UseGuards(AuthGuard)
export class AppsController {
  constructor(private readonly appsService: AppsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAppDto) {
    return this.appsService.createApp(user.id, dto.name, dto.domain);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.appsService.listApps(user.id);
  }

  @Delete(':id')
  delete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.appsService.deleteApp(user.id, Number(id));
  }
}
```

- [ ] **Step 4: 创建 `src/modules/apps/apps.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';

@Module({
  controllers: [AppsController],
  providers: [AppsService],
})
export class AppsModule {}
```

- [ ] **Step 5: 更新 `src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { AppsModule } from './modules/apps/apps.module';

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, AuthModule, AppsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 6: 编译 + 启动 + curl 测试**

```bash
npx tsc --noEmit && npx tsx src/main.ts
```

```bash
# 先登录
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"123456"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data.token))")

# 创建应用
curl -X POST http://localhost:3000/api/apps -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"name":"测试应用"}'

# 列出应用
curl http://localhost:3000/api/apps -H "Authorization: Bearer $TOKEN"

# 删除应用
curl -X DELETE http://localhost:3000/api/apps/1 -H "Authorization: Bearer $TOKEN"
```

---

### Task 9: Collector 模块（事件采集：验签 + 限流 + 入队）

**Files:**
- Create: `src/modules/collector/dto/collect.dto.ts`
- Create: `src/modules/collector/collector.service.ts`
- Create: `src/modules/collector/gateway.guard.ts`
- Create: `src/modules/collector/redis-throttler-storage.ts`
- Create: `src/modules/collector/collector.controller.ts`
- Create: `src/modules/collector/collector.module.ts`
- Modify: `src/app.module.ts`（导入 CollectorModule）

**Interface:**
- `POST /api/collect` body: `{ appKey, events: [...] }` → 验签 → 限流 → 写入 Redis
- Headers: `X-AppKey`, `X-Timestamp`, `X-Sign`（HMAC-SHA256）
- GatewayGuard：HMAC 验签，检查时间窗口，查询 app 状态
- 限流：使用 @nestjs/throttler + 自定义 Redis 存储

- [ ] **Step 1: 创建 `src/modules/collector/dto/collect.dto.ts`**

```typescript
import { IsString, IsArray, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class IncomingEventDto {
  @IsString()
  event_type: string;

  @IsString()
  url: string;

  @IsString()
  ua: string;

  @IsString()
  ip: string;

  extra?: Record<string, unknown>;
}

export class CollectDto {
  @IsString()
  appKey: string;

  @IsArray()
  @ArrayMinSize(1, { message: '至少需要一条事件' })
  @Type(() => IncomingEventDto)
  events: IncomingEventDto[];
}
```

- [ ] **Step 2: 创建 `src/modules/collector/collector.service.ts`**

```typescript
import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { IncomingEvent } from '../../shared/types';

const QUEUE_KEY = 'event:queue';

@Injectable()
export class CollectorService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async pushToQueue(appKey: string, events: IncomingEvent[]): Promise<number> {
    const items = events.map((e) =>
      JSON.stringify({ ...e, app_key: appKey, created_at: new Date().toISOString() }),
    );
    const length = await this.redis.rpush(QUEUE_KEY, ...items);
    return length;
  }
}
```

- [ ] **Step 3: 创建 `src/modules/collector/gateway.guard.ts`**

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import { Pool } from 'mysql2/promise';
import crypto from 'crypto';
import { DATABASE_USER } from '../../database/database.constants';

@Injectable()
export class GatewayGuard implements CanActivate {
  constructor(@Inject(DATABASE_USER) private readonly db: Pool) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const appKey = request.headers['x-appkey'] as string | undefined;
    const timestamp = request.headers['x-timestamp'] as string | undefined;
    const sign = request.headers['x-sign'] as string | undefined;

    if (!appKey || !timestamp || !sign) {
      throw new UnauthorizedException('缺少鉴权参数');
    }

    const now = Date.now();
    const reqTime = Number(timestamp);
    if (Math.abs(now - reqTime) > 5 * 60 * 1000) {
      throw new UnauthorizedException('请求已过期');
    }

    const [rows] = await this.db.query<any[]>(
      'SELECT id, secret_key, status FROM apps WHERE app_key = ?',
      [appKey],
    );

    if (rows.length === 0) {
      throw new UnauthorizedException('无效的 AppKey');
    }

    const app = rows[0];
    if (app.status !== 1) {
      throw new ForbiddenException('应用已停用');
    }

    const body = JSON.stringify(request.body);
    const signData = body + timestamp;
    const expected = crypto
      .createHmac('sha256', app.secret_key)
      .update(signData)
      .digest('hex');

    if (sign !== expected) {
      throw new UnauthorizedException('签名验证失败');
    }

    (request as any).appId = app.id;
    return true;
  }
}
```

- [ ] **Step 4: 创建 Redis 限流存储 `src/modules/collector/redis-throttler-storage.ts`**

@nestjs/throttler 提供 `ThrottlerStorage` 接口，实现一个 Redis 版本：

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageRecord } from '@nestjs/throttler';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `rate:${key}`;
    const count = await this.redis.incr(redisKey);

    if (count === 1) {
      await this.redis.expire(redisKey, Math.ceil(ttl / 1000));
    }

    const ttlRemaining = await this.redis.ttl(redisKey);
    const timeToExpire = ttlRemaining > 0 ? ttlRemaining * 1000 : ttl;

    return {
      totalHits: count,
      timeToExpire,
      isBlocked: count > limit,
      timeToBlockExpire: count > limit ? timeToExpire : 0,
    };
  }
}
```

注意：@nestjs/throttler v5+ 使用 `ThrottlerStorageRecord` 接口。如果版本不同需要微调。

- [ ] **Step 5: 创建 `src/modules/collector/collector.controller.ts`**

```typescript
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { CollectorService } from './collector.service';
import { CollectDto } from './dto/collect.dto';
import { GatewayGuard } from './gateway.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('collect')
@UseGuards(GatewayGuard, ThrottlerGuard)
export class CollectorController {
  constructor(private readonly collectorService: CollectorService) {}

  @Post()
  async collect(@Body() dto: CollectDto) {
    const queueLength = await this.collectorService.pushToQueue(dto.appKey, dto.events);
    return { received: dto.events.length, queue_length: queueLength };
  }
}
```

- [ ] **Step 6: 创建 `src/modules/collector/collector.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { CollectorController } from './collector.controller';
import { CollectorService } from './collector.service';
import { GatewayGuard } from './gateway.guard';
import { RedisThrottlerStorage } from './redis-throttler-storage';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 1000 }],
      storage: RedisThrottlerStorage,
    }),
    RedisModule,
  ],
  controllers: [CollectorController],
  providers: [CollectorService, GatewayGuard, RedisThrottlerStorage],
})
export class CollectorModule {}
```

注意：`ThrottlerModule.forRoot` 是全局的，如果 ThrottlerModule 已在 AppModule 注册，这里用 `forRoot` 会冲突。需要确认只在 CollectorModule 或 AppModule 注册一次。

**修正方案**：ThrottlerModule 在 AppModule 中注册为全局，CollectorModule 只使用 ThrottlerGuard。

- [ ] **Step 6b: 调整——将 ThrottlerModule 移至 AppModule**

修改 `src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { AppsModule } from './modules/apps/apps.module';
import { CollectorModule } from './modules/collector/collector.module';
import { RedisThrottlerStorage } from './modules/collector/redis-throttler-storage';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    AuthModule,
    AppsModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 1000 }],
      storage: RedisThrottlerStorage,
    }),
    CollectorModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

同时简化 `src/modules/collector/collector.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CollectorController } from './collector.controller';
import { CollectorService } from './collector.service';
import { GatewayGuard } from './gateway.guard';

@Module({
  controllers: [CollectorController],
  providers: [CollectorService, GatewayGuard],
})
export class CollectorModule {}
```

- [ ] **Step 7: 编译 + 启动 + 测试**

```bash
npx tsc --noEmit && npx tsx src/main.ts
```

---

### Task 10: Stats 模块（统计查询）

**Files:**
- Create: `src/modules/stats/stats.service.ts`
- Create: `src/modules/stats/stats.controller.ts`
- Create: `src/modules/stats/stats.module.ts`
- Modify: `src/app.module.ts`（导入 StatsModule）

**Interface:**
- `GET /api/stats/pv?appId=1&range=7` → PvSummary[]（需登录）
- `GET /api/stats/device?appId=1` → DeviceDistribution[]（需登录）
- `GET /api/stats/realtime?appId=1` → 最近 20 条事件（需登录）

- [ ] **Step 1: 创建 `src/modules/stats/stats.service.ts`**

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { DATABASE_STATS, DATABASE_LOG } from '../../database/database.constants';
import { PvSummary, DeviceDistribution } from '../../shared/types';

@Injectable()
export class StatsService {
  constructor(
    @Inject(DATABASE_STATS) private readonly statsDb: Pool,
    @Inject(DATABASE_LOG) private readonly logDb: Pool,
  ) {}

  async getPvTrend(appId: number, rangeDays: number): Promise<PvSummary[]> {
    const since = new Date();
    since.setDate(since.getDate() - rangeDays);

    const [rows] = await this.statsDb.query<any[]>(
      `SELECT app_id, hour, pv, uv
       FROM pv_summary
       WHERE app_id = ? AND hour >= ?
       ORDER BY hour ASC`,
      [appId, since],
    );
    return rows as PvSummary[];
  }

  async getDeviceDistribution(appId: number): Promise<DeviceDistribution[]> {
    const [rows] = await this.statsDb.query<any[]>(
      `SELECT app_id, date, device, count
       FROM device_distribution
       WHERE app_id = ?
       ORDER BY date DESC, count DESC`,
      [appId],
    );
    return rows as DeviceDistribution[];
  }

  async getRealtimeEvents(appId: number, limit = 20): Promise<any[]> {
    const tables: string[] = [];
    const now = new Date();
    for (let i = 0; i < 2; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      tables.push(`events_${y}${m}${day}`);
    }

    const unionQueries = tables.map(
      (t) =>
        `SELECT app_id, event_type, url, device_type, city, created_at
         FROM \`${t}\` WHERE app_id = ?`,
    );

    try {
      const [rows] = await this.logDb.query<any[]>(
        `${unionQueries.join(' UNION ALL ')}
         ORDER BY created_at DESC
         LIMIT ?`,
        [...tables.map(() => appId), limit],
      );
      return rows;
    } catch {
      return [];
    }
  }
}
```

- [ ] **Step 2: 创建 `src/modules/stats/stats.controller.ts`**

```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('stats')
@UseGuards(AuthGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('pv')
  getPv(@Query('appId') appId: string, @Query('range') range?: string) {
    return this.statsService.getPvTrend(Number(appId), Number(range) || 7);
  }

  @Get('device')
  getDevice(@Query('appId') appId: string) {
    return this.statsService.getDeviceDistribution(Number(appId));
  }

  @Get('realtime')
  getRealtime(@Query('appId') appId: string) {
    return this.statsService.getRealtimeEvents(Number(appId));
  }
}
```

- [ ] **Step 3: 创建 `src/modules/stats/stats.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
```

- [ ] **Step 4: 更新 `src/app.module.ts`**

在 imports 数组中添加 `StatsModule`。

- [ ] **Step 5: 编译验证**

```bash
npx tsc --noEmit
```

---

### Task 11: Health 模块

**Files:**
- Create: `src/modules/health/health.controller.ts`
- Create: `src/modules/health/health.module.ts`
- Modify: `src/app.module.ts`（导入 HealthModule）

**Interface:** `GET /api/health` → `{ status, uptime, databases }`

- [ ] **Step 1: 创建 `src/modules/health/health.controller.ts`**

使用 `@nestjs/terminus` 进行数据库健康探测：

```typescript
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(private health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check() {
    return {
      status: 'healthy',
      uptime: process.uptime(),
      databases: ['pipeline_user', 'pipeline_stats', 'pipeline_log'],
    };
  }
}
```

注意：由于我们使用的是 mysql2 而非 TypeORM，`@nestjs/terminus` 的 `TypeOrmHealthIndicator` 不可用。Terminus 提供了 `HealthIndicator` 基类，可自定义实现：

```typescript
import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { Pool } from 'mysql2/promise';
import { DATABASE_USER, DATABASE_LOG, DATABASE_STATS } from '../../database/database.constants';

class MysqlHealthIndicator extends HealthIndicator {
  constructor(
    @Inject(DATABASE_USER) private readonly userPool: Pool,
    @Inject(DATABASE_LOG) private readonly logPool: Pool,
    @Inject(DATABASE_STATS) private readonly statsPool: Pool,
  ) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.userPool.query('SELECT 1');
      await this.logPool.query('SELECT 1');
      await this.statsPool.query('SELECT 1');
      return this.getStatus('databases', true, {
        databases: ['pipeline_user', 'pipeline_stats', 'pipeline_log'],
      });
    } catch (err: any) {
      return this.getStatus('databases', false, { message: err.message });
    }
  }
}

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private mysqlIndicator: MysqlHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.mysqlIndicator.pingCheck('mysql'),
      () => ({ server: { status: 'up', uptime: process.uptime() } }),
    ]);
  }
}
```

- [ ] **Step 2: 创建 `src/modules/health/health.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [],
})
export class HealthModule {}
```

实际上 `MysqlHealthIndicator` 需要在 module 中作为 provider 注册：

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController, MysqlHealthIndicator } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [MysqlHealthIndicator],
})
export class HealthModule {}
```

- [ ] **Step 3: 更新 `src/app.module.ts`**，添加 HealthModule

- [ ] **Step 4: 验证编译**

```bash
npx tsc --noEmit
```

---

### Task 12: Worker（独立进程：ETL + 定时任务）

**Files:**
- Create: `src/worker/etl/parser.service.ts`
- Create: `src/worker/etl/loader.service.ts`
- Create: `src/worker/aggregator.service.ts`
- Create: `src/worker/cleaner.service.ts`
- Create: `src/worker/worker.module.ts`
- Create: `src/worker.ts`（Worker 入口）
- Modify: `package.json`（添加 worker 脚本）

**Interface:**
- Worker 作为 NestJS standalone app 启动，与 HTTP 服务隔离
- ETL 主循环：从 Redis 批量 LPOP → 解析 → 查 app_id → 批量写入
- 定时任务：每小时第 5 分钟聚合 + 每天凌晨 4 点清理

- [ ] **Step 1: 创建 `src/worker/etl/parser.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { RawEvent, CleanedEvent } from '../../shared/types';

@Injectable()
export class ParserService {
  parseDevice(ua: string): 'desktop' | 'mobile' | 'tablet' {
    const u = ua.toLowerCase();
    if (/tablet|ipad|playbook|silk/.test(u)) return 'tablet';
    if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/.test(u)) return 'mobile';
    return 'desktop';
  }

  parseCity(ip: string): string {
    if (!ip || ip === 'unknown') return '未知';
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)/.test(ip)) {
      return '内网';
    }
    return '未知';
  }

  parsePath(url: string): string {
    try {
      return new URL(url).pathname || '/';
    } catch {
      return url.startsWith('/') ? url : '/';
    }
  }

  cleanEvent(raw: RawEvent): CleanedEvent {
    return {
      app_id: 0,
      event_type: raw.event_type,
      url: raw.url,
      ua: raw.ua,
      ip: raw.ip,
      extra: raw.extra ? JSON.stringify(raw.extra) : 'null',
      device_type: this.parseDevice(raw.ua),
      city: this.parseCity(raw.ip),
      page_path: this.parsePath(raw.url),
      created_at: raw.created_at,
    };
  }
}
```

- [ ] **Step 2: 创建 `src/worker/etl/loader.service.ts`**

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { DATABASE_LOG } from '../../database/database.constants';
import { getTableName } from '../../shared/shard';
import { CleanedEvent } from '../../shared/types';

@Injectable()
export class LoaderService {
  constructor(@Inject(DATABASE_LOG) private readonly db: Pool) {}

  async batchLoad(events: CleanedEvent[]): Promise<number> {
    if (events.length === 0) return 0;

    const groups: Record<string, CleanedEvent[]> = {};
    for (const e of events) {
      const date = new Date(e.created_at);
      const table = getTableName(date);
      if (!groups[table]) groups[table] = [];
      groups[table].push(e);
    }

    let total = 0;

    for (const [table, rows] of Object.entries(groups)) {
      await this.db.query(`CREATE TABLE IF NOT EXISTS \`${table}\` LIKE events_template`);

      const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values: any[] = [];
      for (const r of rows) {
        values.push(
          r.app_id, r.event_type, r.url, r.ua, r.ip,
          r.extra, r.device_type, r.city, r.page_path,
        );
      }

      await this.db.query(
        `INSERT INTO \`${table}\` (app_id, event_type, url, ua, ip, extra, device_type, city, page_path) VALUES ${placeholders}`,
        values,
      );
      total += rows.length;
    }

    return total;
  }
}
```

- [ ] **Step 3: 创建 `src/worker/aggregator.service.ts`**

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { DATABASE_LOG, DATABASE_STATS } from '../database/database.constants';
import { getTableName } from '../shared/shard';

@Injectable()
export class AggregatorService {
  constructor(
    @Inject(DATABASE_LOG) private readonly logDb: Pool,
    @Inject(DATABASE_STATS) private readonly statsDb: Pool,
  ) {}

  async aggregateLastHour(): Promise<void> {
    const now = new Date();
    const lastHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - 1);
    const hourStart = new Date(lastHour.getFullYear(), lastHour.getMonth(), lastHour.getDate(), lastHour.getHours(), 0, 0, 0);
    const hourEnd = new Date(lastHour.getFullYear(), lastHour.getMonth(), lastHour.getDate(), lastHour.getHours(), 59, 59, 999);

    const tableName = getTableName(hourStart);

    const [tables] = await this.logDb.query<any[]>(`SHOW TABLES LIKE ?`, [tableName]);
    if (tables.length === 0) {
      console.log('[aggregator] 表不存在，跳过:', tableName);
      return;
    }

    const [pvRows] = await this.logDb.query<any[]>(`
      SELECT app_id, DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') AS hour,
             COUNT(*) AS pv, COUNT(DISTINCT ip) AS uv
      FROM \`${tableName}\`
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY app_id, hour
    `, [hourStart, hourEnd]);

    for (const row of pvRows) {
      await this.statsDb.query(`
        INSERT INTO pv_summary (app_id, hour, pv, uv)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE pv = pv + VALUES(pv), uv = uv + VALUES(uv)
      `, [row.app_id, row.hour, row.pv, row.uv]);
    }

    console.log('[aggregator] PV/UV 聚合完成:', pvRows.length, '条');

    const [deviceRows] = await this.logDb.query<any[]>(`
      SELECT app_id, DATE(created_at) AS date, device_type AS device, COUNT(*) AS count
      FROM \`${tableName}\`
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY app_id, date, device_type
    `, [hourStart, hourEnd]);

    for (const row of deviceRows) {
      await this.statsDb.query(`
        INSERT INTO device_distribution (app_id, date, device, count)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE count = count + VALUES(count)
      `, [row.app_id, row.date, row.device, row.count]);
    }

    console.log('[aggregator] 设备分布聚合完成:', deviceRows.length, '条');
  }
}
```

- [ ] **Step 4: 创建 `src/worker/cleaner.service.ts`**

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { DATABASE_LOG } from '../database/database.constants';

const TTL_DAYS = 30;

@Injectable()
export class CleanerService {
  constructor(@Inject(DATABASE_LOG) private readonly db: Pool) {}

  async cleanExpiredTables(): Promise<void> {
    const [tables] = await this.db.query<any[]>(`SHOW TABLES LIKE 'events_%'`);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - TTL_DAYS);
    const cutoffStr = this.formatDate(cutoff);

    let dropped = 0;
    for (const row of tables) {
      const tableName = Object.values(row)[0] as string;
      if (tableName === 'events_template') continue;
      if (tableName < cutoffStr) {
        await this.db.query(`DROP TABLE \`${tableName}\``);
        console.log('[cleaner] 已删除:', tableName);
        dropped++;
      }
    }

    if (dropped === 0) {
      console.log('[cleaner] 没有过期表');
    } else {
      console.log('[cleaner] 清理完成，共删除', dropped, '张表');
    }
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `events_${y}${m}${d}`;
  }
}
```

- [ ] **Step 5: 创建 `src/worker/worker.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { ParserService } from './etl/parser.service';
import { LoaderService } from './etl/loader.service';
import { AggregatorService } from './aggregator.service';
import { CleanerService } from './cleaner.service';

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, ScheduleModule.forRoot()],
  providers: [ParserService, LoaderService, AggregatorService, CleanerService],
  exports: [ParserService, LoaderService, AggregatorService, CleanerService],
})
export class WorkerModule {}
```

- [ ] **Step 6: 创建 `src/worker.ts`（Worker 独立入口）**

```typescript
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';
import { ParserService } from './worker/etl/parser.service';
import { LoaderService } from './worker/etl/loader.service';
import { AggregatorService } from './worker/aggregator.service';
import { CleanerService } from './worker/cleaner.service';

// 注意：worker 作为 standalone app 启动，不从 HTTP 入口走
// 这里用 standalone app 主要是为了 DI 容器，但主循环仍用纯 while(true)
// 这是为了保持和旧项目一致的代码结构

async function bootstrap() {
  // 使用独立上下文获取 DI 容器
  const app = await NestFactory.createApplicationContext(WorkerModule);

  const parserService = app.get(ParserService);
  const loaderService = app.get(LoaderService);
  const aggregatorService = app.get(AggregatorService);
  const cleanerService = app.get(CleanerService);

  // 导入 Redis 用于主循环
  const { getRedis, getPool } = await import('./server/db/redis');
  // 等等，这里不能直接用旧项目的方式...

  await app.close();
}
```

**问题**：NestJS standalone app 的 main 循环不太适合直接写在 `bootstrap()` 里。更好的方案是用 `@nestjs/schedule` 的 `@Cron` 装饰器处理定时任务，主循环用 `@nestjs/bull` 的 `@Processor` 处理队列消费。

但实际上我们不想引入 Bull/BullMQ（这在 MEMORY.md 里是个独立的优化项）。所以保持 Worker 为 **简单脚本** 更合理——就像旧项目一样用 `while(true)` 循环。

**最终方案**：Worker 使用 `NestFactory.createApplicationContext` 获取 DI 容器，然后主循环代码和定时任务照旧。定时任务使用 `@Cron` 装饰器（体现 NestJS 学习），主循环保持 `while(true)`。

```typescript
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';
import { ParserService } from './worker/etl/parser.service';
import { LoaderService } from './worker/etl/loader.service';
import { AggregatorService } from './worker/aggregator.service';
import { CleanerService } from './worker/cleaner.service';
import { REDIS_CLIENT } from './redis/redis.module';
import { DATABASE_USER } from './database/database.constants';
import Redis from 'ioredis';
import { Pool } from 'mysql2/promise';
import { RawEvent } from './shared/types';

const BATCH_SIZE = 200;
const IDLE_SLEEP = 1000;

const BATCH_POP_SCRIPT = `
local result = {}
for i = 1, tonumber(ARGV[1]) do
  local item = redis.call('LPOP', KEYS[1])
  if not item then break end
  table.insert(result, item)
end
return result
`;

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  const parser = app.get(ParserService);
  const loader = app.get(LoaderService);
  const redis: Redis = app.get(REDIS_CLIENT);
  const userDb: Pool = app.get(DATABASE_USER);

  redis.defineCommand('batchPop', { numberOfKeys: 1, lua: BATCH_POP_SCRIPT });

  console.log('[worker] ETL Worker 启动');

  // 定时任务由 @nestjs/schedule 的 @Cron 装饰器自动注册，见下方 CronService

  while (true) {
    try {
      const results: string[] = await (redis as any).batchPop('event:queue', BATCH_SIZE);

      if (!results || results.length === 0) {
        await sleep(IDLE_SLEEP);
        continue;
      }

      const rawEvents = results
        .map((r) => {
          try { return JSON.parse(r) as RawEvent; }
          catch { return null; }
        })
        .filter(Boolean) as RawEvent[];

      const cleaned = rawEvents.map((r) => parser.cleanEvent(r));

      const appKeys = [...new Set(rawEvents.map((r) => r.app_key))];
      const appIdMap = await resolveAppIds(userDb, appKeys);
      for (let i = 0; i < cleaned.length; i++) {
        cleaned[i].app_id = appIdMap.get(rawEvents[i].app_key) || 0;
      }

      const written = await loader.batchLoad(cleaned);
      console.log(`[worker] 消费 ${results.length} 条, 写入 ${written} 条`);
    } catch (err: any) {
      console.error('[worker] 处理失败:', err.message);
      await sleep(1000);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveAppIds(db: Pool, appKeys: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (appKeys.length === 0) return map;
  const placeholders = appKeys.map(() => '?').join(',');
  const [rows] = await db.query<any[]>(
    `SELECT id, app_key FROM apps WHERE app_key IN (${placeholders})`,
    appKeys,
  );
  for (const row of rows) {
    map.set(row.app_key, row.id);
  }
  return map;
}

bootstrap().catch((err) => {
  console.error('[worker] 启动失败:', err);
  process.exit(1);
});
```

- [ ] **Step 7: 创建定时任务 Service（用 @Cron 装饰器）**

为了展示 NestJS 定时任务的使用，在 Worker 里创建一个 `CronService`：

```typescript
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AggregatorService } from './aggregator.service';
import { CleanerService } from './cleaner.service';

@Injectable()
export class CronService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly aggregator: AggregatorService,
    private readonly cleaner: CleanerService,
  ) {}

  @Cron('5 * * * *')
  async handleAggregation() {
    const ok = await this.tryLock('lock:aggregator', 120);
    if (!ok) return;
    try {
      console.log('[cron] 开始聚合...');
      await this.aggregator.aggregateLastHour();
    } catch (err: any) {
      console.error('[cron] 聚合失败:', err.message);
    }
  }

  @Cron('0 4 * * *')
  async handleCleanup() {
    const ok = await this.tryLock('lock:cleaner', 300);
    if (!ok) return;
    try {
      console.log('[cron] 开始清理...');
      await this.cleaner.cleanExpiredTables();
    } catch (err: any) {
      console.error('[cron] 清理失败:', err.message);
    }
  }

  private async tryLock(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }
}
```

并更新 `WorkerModule` 的 providers 添加 `CronService`。

- [ ] **Step 8: 更新 `src/worker/worker.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { ParserService } from './etl/parser.service';
import { LoaderService } from './etl/loader.service';
import { AggregatorService } from './aggregator.service';
import { CleanerService } from './cleaner.service';
import { CronService } from './cron.service';

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, ScheduleModule.forRoot()],
  providers: [ParserService, LoaderService, AggregatorService, CleanerService, CronService],
  exports: [ParserService, LoaderService, AggregatorService, CleanerService],
})
export class WorkerModule {}
```

- [ ] **Step 9: 添加 worker npm script 到 `package.json`**

```json
"worker": "tsx src/worker.ts",
"worker:dev": "tsx watch src/worker.ts"
```

- [ ] **Step 10: 验证编译**

```bash
npx tsc --noEmit
```

---

### Task 13: SDK + 配置文件迁移

**Files:**
- Copy: sdk/ 整个目录（从旧项目）
- Copy: vite.config.sdk.ts, docker-compose.yml, .env
- Create: ecosystem.config.cjs (适配新入口)
- Copy: nginx.conf（如果旧项目有）

- [ ] **Step 1: 复制 SDK 目录**

```bash
cp -r f:/AIproject/pipeline-platform/pipeline-platform-server/src/sdk f:/AIproject/pipeline-platform-nest/src/sdk
cp f:/AIproject/pipeline-platform/pipeline-platform-server/vite.config.sdk.ts f:/AIproject/pipeline-platform-nest/
```

- [ ] **Step 2: 更新 `package.json` 添加 SDK build 脚本**

```json
"build:sdk": "vite build --config vite.config.sdk.ts"
```

- [ ] **Step 3: 复制 docker-compose.yml**

```bash
cp f:/AIproject/pipeline-platform/pipeline-platform-server/docker-compose.yml f:/AIproject/pipeline-platform-nest/
```

- [ ] **Step 4: 创建 `ecosystem.config.cjs`（适配新入口）**

```javascript
module.exports = {
  apps: [
    {
      name: 'server',
      script: './dist/main.js',
      instances: 2,
      exec_mode: 'cluster',
      watch: false,
      env: { NODE_ENV: 'production', PORT: '3000' },
    },
    {
      name: 'worker',
      script: './dist/worker.js',
      instances: 4,
      exec_mode: 'fork',
      watch: false,
      env: { NODE_ENV: 'production' },
    },
  ],
};
```

注意：NestJS build 后输出到 `dist/` 目录，入口变为 `dist/main.js` 和 `dist/worker.js`。

- [ ] **Step 5: 更新 `package.json` scripts**

```json
{
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "nest build",
    "build:sdk": "vite build --config vite.config.sdk.ts",
    "start": "node dist/main.js",
    "start:prod": "node dist/main.js",
    "worker": "tsx src/worker.ts",
    "worker:prod": "node dist/worker.js"
  }
}
```

- [ ] **Step 6: 确认编译通过**

```bash
npx tsc --noEmit
```

---

### Task 14: Swagger + 最终集成验证

**Files:**
- Modify: `src/main.ts`（添加 Swagger 配置）
- Modify: 各 controller 添加 `@ApiTags` 和 `@ApiOperation` 装饰器

- [ ] **Step 1: 在 `src/main.ts` 中配置 Swagger**

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }),
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
```

- [ ] **Step 2: 为 AuthController 添加 Swagger 装饰器**

```typescript
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
// ...
@ApiTags('认证')
@Controller('auth')
export class AuthController {
  @ApiOperation({ summary: '用户注册' })
  @Post('register')
  // ...

  @ApiOperation({ summary: '用户登录' })
  @Post('login')
  // ...
}
```

- [ ] **Step 3: 为 AppsController 添加 Swagger 装饰器**

```typescript
@ApiTags('应用管理')
@ApiBearerAuth()
// ...
```

- [ ] **Step 4: 为 CollectorController 添加 Swagger 装饰器**

```typescript
@ApiTags('事件采集')
// ...
```

- [ ] **Step 5: 为 StatsController 添加 Swagger 装饰器**

```typescript
@ApiTags('数据统计')
@ApiBearerAuth()
// ...
```

- [ ] **Step 6: 为 HealthController 添加 Swagger 装饰器**

```typescript
@ApiTags('健康检查')
// ...
```

- [ ] **Step 7: 最终验证 — 启动服务，访问 Swagger**

```bash
npx tsx src/main.ts
```

浏览器打开 `http://localhost:3000/api/docs`，确认所有接口列出并可交互测试。

- [ ] **Step 8: 全量 API 回归测试**

```bash
# 1. 健康检查
curl http://localhost:3000/api/health

# 2. 注册
curl -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d '{"email":"test2@test.com","password":"123456"}'

# 3. 登录
curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"test2@test.com","password":"123456"}'

# 4. 创建应用（用上一步的 token）
TOKEN="..."
curl -X POST http://localhost:3000/api/apps -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"name":"测试"}'

# 5. 获取应用列表
curl http://localhost:3000/api/apps -H "Authorization: Bearer $TOKEN"

# 6. 统计查询
curl "http://localhost:3000/api/stats/pv?appId=1" -H "Authorization: Bearer $TOKEN"
```

---

## 验证清单

整个迁移完成后，对照这个清单确认：

- [ ] `npx tsc --noEmit` 通过，无类型错误
- [ ] `npx tsx src/main.ts` 启动成功
- [ ] `GET /api/health` 返回健康状态
- [ ] `POST /api/auth/register` 注册成功，返回 token
- [ ] `POST /api/auth/login` 登录成功，返回 token
- [ ] `POST /api/apps` 创建应用（需 token）成功
- [ ] `GET /api/apps` 列出应用（需 token）成功
- [ ] `DELETE /api/apps/:id` 删除应用（需 token）成功
- [ ] `POST /api/collect` 事件上报（需验签+限流）成功
- [ ] `GET /api/stats/pv` 统计查询（需 token）成功
- [ ] `GET /api/stats/device` 设备分布（需 token）成功
- [ ] `GET /api/stats/realtime` 实时事件（需 token）成功
- [ ] `GET /api/docs` Swagger 文档页面可访问
- [ ] `npx tsx src/worker.ts` Worker 启动成功，无报错
- [ ] Swagger 页面可交互测试所有接口
