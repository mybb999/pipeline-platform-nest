# NestJS 迁移设计方案

> 日期：2026-07-16
> 状态：待实施
> 目标：将 pipeline-platform-server 从 Express.js 迁移到 NestJS

---

## 一、背景

- **项目阶段**：Phase 1-6 已完成（Express + MySQL + Redis + JWT + Worker + 前端管理后台），Phase 7（部署）尚未开始
- **迁移动机**：学习 NestJS 框架，掌握其模块化、依赖注入、装饰器驱动的开发模式
- **迁移方式**：新建独立项目 `pipeline-platform-nest`，不动旧项目，完成后对照学习
- **前端影响**：无。API 接口不变（URL、参数、响应格式均不变），前端无感知

## 二、新项目结构

```
f:\AIproject\pipeline-platform-nest\
├── src/
│   ├── main.ts                         # HTTP 服务入口（NestFactory.create）
│   ├── worker.ts                       # Worker 入口（独立进程，NestJS standalone app）
│   ├── app.module.ts                   # 根模块
│   ├── common/
│   │   ├── guards/                     # 公共守卫（可复用逻辑）
│   │   ├── interceptors/               # 响应拦截器（统一 {code, message, data}）
│   │   ├── filters/                    # 异常过滤器（统一错误处理）
│   │   └── decorators/                 # 自定义装饰器（取当前用户、appId 等）
│   ├── config/
│   │   └── config.module.ts            # @nestjs/config 全局配置模块
│   ├── database/
│   │   ├── database.module.ts          # MySQL 连接池模块（pipeline_user/pipeline_log/pipeline_stats 三库）
│   │   └── migrations/                 # SQL 迁移文件（从旧项目原样复制）
│   ├── redis/
│   │   └── redis.module.ts             # Redis 模块（封装 ioredis）
│   ├── modules/
│   │   ├── auth/                       # 注册 / 登录 / JWT 签发
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── dto/                    # 请求参数校验（class-validator）
│   │   │       ├── register.dto.ts
│   │   │       └── login.dto.ts
│   │   ├── apps/                       # 应用 CRUD（受 JWT 保护）
│   │   │   ├── apps.module.ts
│   │   │   ├── apps.controller.ts
│   │   │   ├── apps.service.ts
│   │   │   └── dto/
│   │   │       ├── create-app.dto.ts
│   │   │       └── delete-app.dto.ts
│   │   ├── collector/                  # 事件采集（验签 + 限流 + Redis 入队）
│   │   │   ├── collector.module.ts
│   │   │   ├── collector.controller.ts
│   │   │   ├── collector.service.ts
│   │   │   ├── gateway.guard.ts        # HMAC-SHA256 验签守卫
│   │   │   └── dto/
│   │   │       └── collect.dto.ts
│   │   ├── stats/                      # 统计查询（受 JWT 保护）
│   │   │   ├── stats.module.ts
│   │   │   ├── stats.controller.ts
│   │   │   └── stats.service.ts
│   │   └── health/                     # 健康检查
│   │       ├── health.module.ts
│   │       └── health.controller.ts
│   ├── worker/
│   │   ├── worker.module.ts            # Worker 专用模块（依赖 database + redis）
│   │   ├── etl/
│   │   │   ├── parser.service.ts       # 事件清洗（UA→设备类型、IP→城市、URL→路径）
│   │   │   └── loader.service.ts       # 批量写入（动态建表、batch INSERT）
│   │   ├── aggregator.service.ts       # 小时聚合（node-cron → @nestjs/schedule）
│   │   └── cleaner.service.ts          # 日清理（30天过期表 DROP）
│   └── shared/
│       ├── types.ts                    # 共享类型定义
│       └── shard.ts                    # 分表工具（纯函数，从旧项目复制）
├── sdk/                                # 浏览器 SDK（从旧项目原样复制）
│   ├── index.ts
│   ├── tracker.ts
│   ├── utils.ts
│   └── plugins/ (pv.ts, error.ts, performance.ts)
├── package.json
├── tsconfig.json
├── nest-cli.json
├── vite.config.sdk.ts                  # SDK 构建配置（从旧项目复制）
├── docker-compose.yml                  # MySQL + Redis 容器（从旧项目复制）
├── ecosystem.config.cjs                # PM2 配置（适配新入口文件）
└── .env                                # 环境变量（开发值）
```

## 三、模块映射（Express → NestJS）

| 旧文件 | 新文件 | 说明 |
|--------|--------|------|
| `routes/auth.ts` | `modules/auth/auth.controller.ts` | `@Post('register')` / `@Post('login')` |
| `services/authService.ts` | `modules/auth/auth.service.ts` | register / login / verifyToken |
| `middleware/auth.ts` | `modules/auth/auth.guard.ts` | JWT 守卫，返回 true/false |
| `routes/app.ts` | `modules/apps/apps.controller.ts` | `@Get` / `@Post` / `@Delete`，受 AuthGuard 保护 |
| `services/appService.ts` | `modules/apps/apps.service.ts` | createApp / listApps / deleteApp |
| `routes/collector.ts` | `modules/collector/collector.controller.ts` | `@Post('collect')` |
| `services/collectorService.ts` | `modules/collector/collector.service.ts` | pushToQueue (RPUSH Redis) |
| `middleware/gateway.ts` | `modules/collector/gateway.guard.ts` | HMAC 验签守卫 |
| `middleware/rateLimit.ts` | `@nestjs/throttler` + ThrottlerGuard | Redis 滑动窗口限流 |
| `routes/stats.ts` | `modules/stats/stats.controller.ts` | `@Get('pv')` / `@Get('device')` / `@Get('realtime')` |
| `services/statsService.ts` | `modules/stats/stats.service.ts` | getPvTrend / getDeviceDistribution / getRealtimeEvents |
| `routes/health.ts` | `modules/health/health.controller.ts` | `@Get('health')` |
| `services/healthService.ts` | `modules/health/` + `@nestjs/terminus` | DB/Redis 健康探测 |
| `worker/index.ts` | `worker.ts` + `worker/worker.module.ts` | 主循环 + 定时任务 |
| `worker/etl/parser.ts` | `worker/etl/parser.service.ts` | 事件清洗 |
| `worker/etl/loader.ts` | `worker/etl/loader.service.ts` | 批量写入 |
| `worker/aggregator.ts` | `worker/aggregator.service.ts` | 小时聚合 |
| `worker/cleaner.ts` | `worker/cleaner.service.ts` | 日清理 |
| `db/pool.ts` | `database/database.module.ts` | MySQL 三库连接池 |
| `db/redis.ts` | `redis/redis.module.ts` | Redis 单例 |
| `db/shard.ts` | `shared/shard.ts` | 纯函数，原样复制 |

## 四、技术选型（依赖替换）

| 旧依赖 | 新依赖 | 说明 |
|--------|--------|------|
| `express` + `cors` | `@nestjs/core` + `@nestjs/platform-express` + 内置 `app.enableCors()` | NestJS 底层仍用 Express |
| `dotenv` | `@nestjs/config` | 类型安全的配置管理 |
| `jsonwebtoken` | `@nestjs/jwt` | JWT 签发/验证 |
| `node-cron` | `@nestjs/schedule` | 装饰器声明定时任务 |
| 手写 Redis 限流 | `@nestjs/throttler` | 官方限流模块 |
| 手写 try/catch | NestJS 内置 `ExceptionFilter` | 统一错误处理 |
| 手写 `res.json()` | NestJS 内置 `Interceptor` | 统一响应包装 |
| 手写 if 校验 | `class-validator` + `class-transformer` + `ValidationPipe` | DTO 装饰器自动校验 |
| `console.log` | NestJS 内置 `Logger` | 带模块上下文的日志 |
| 无 | `@nestjs/terminus` | 健康检查官方模块 |
| 无 | `@nestjs/swagger` | API 文档自动生成 |

**保留不变**：

| 保留的依赖 | 原因 |
|-----------|------|
| `mysql2` | 已有手写 SQL 稳定运行，换 TypeORM 学习成本高，留到后续 |
| `ioredis` | 无官方 NestJS Redis 模块，封装为自定义 @Module |
| `bcrypt` | 仅 hash/compare 两次调用，包装成模块属于过度工程 |
| `crypto` | Node.js 内置，生成 AppKey/SecretKey |
| `vite` | SDK 构建用，完全独立 |

## 五、关键架构差异

### 1. 中间件 → 守卫 + 拦截器 + 过滤器

```
Express:                     NestJS:
req → cors → json → auth → gateway → rateLimit → handler → res.json()
                          ↓                      ↓           ↓
                     中间件改 req             try/catch   res.json()
                          ↓                      ↓           ↓
req → AuthGuard → GatewayGuard → ThrottlerGuard → Controller → Interceptor
       ↓                                    ↓         ↓            ↓
   返回 401        ←←←   任何一步抛异常   →→→  ExceptionFilter → 统一 {code, message, data}
```

### 2. 依赖注入

Express 中每个 service 函数自己调用 `getPool('pipeline_user')`。
NestJS 中通过构造函数注入：

```typescript
@Injectable()
export class AuthService {
  constructor(
    @InjectDatabase('pipeline_user') private readonly db: Pool,  // 注入连接池
    private readonly jwt: JwtService,                            // 注入 JWT
  ) {}
}
```

### 3. Worker 作为独立应用

Worker 不再共享 `getPool()` / `getRedis()` 全局单例，而是通过 NestJS 的 `standalone application` 启动，复用同一个 `DatabaseModule` 和 `RedisModule`，但独立进程运行。

## 六、实施步骤

| 序号 | 步骤 | 内容 |
|------|------|------|
| 1 | 脚手架 | `nest new pipeline-platform-nest`，清理示例代码 |
| 2 | 基础层 | database 模块 + redis 模块 + config 模块 |
| 3 | 公共层 | 全局异常过滤器 + 响应拦截器 + 公共装饰器 |
| 4 | Auth 模块 | 注册/登录 + JWT 守卫，第一个完整 NestJS 模块 |
| 5 | Apps 模块 | CRUD + AuthGuard 保护 |
| 6 | Collector 模块 | 验签守卫 + @nestjs/throttler + Redis 入队 |
| 7 | Stats 模块 | 统计查询 + AuthGuard 保护 |
| 8 | Health 模块 | @nestjs/terminus 健康检查 |
| 9 | Worker | 独立进程（ETL 消费 + 定时聚合 + 日清理） |
| 10 | SDK | 从旧项目原样复制 |
| 11 | 配置 | PM2 + Docker Compose 适配新入口 |
| 12 | Swagger | 添加 @nestjs/swagger 装饰器，生成 API 文档 |

## 七、不涉及的部分

- **前端项目** `pipeline-platform-web`：完全不变，API 契约不变
- **旧项目** `pipeline-platform-server`：保留不动，作为参考
- **部署**（Phase 7）：迁移完成后再做
- **TypeORM**：本次不引入，留到后续学习
- **MEMORY.md 中的 6 个优化项**：本次不涉及

## 八、预期产出

- 一个完整可运行的 NestJS 项目 `pipeline-platform-nest`
- 功能与 `pipeline-platform-server` 完全对等
- Swagger 文档页面可通过浏览器访问
- PM2 可同时管理 HTTP 服务和 Worker
