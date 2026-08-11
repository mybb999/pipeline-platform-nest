# NestJS 开发步骤指南

> 这是一份渐进式的开发指南，按模块逐步构建整个项目。每一阶段都是在前一阶段基础上叠加，适合边做边学。

---

## 概述：14 个开发步骤 → 5 个阶段

```
阶段一：地基（Task 1-6）    项目骨架 + 基础设施 + 公共服务
阶段二：业务（Task 7-11）   Auth → Apps → Collector → Stats → Health
阶段三：Worker（Task 12）   独立进程 + ETL + 定时任务
阶段四：收尾（Task 13-14）  SDK 迁移 + Swagger 文档
阶段五：部署                 PM2 + Docker Compose
```

---

## 阶段一：地基

### Task 1 — 创建 NestJS 脚手架

**目标：** 跑起一个空白的 NestJS 项目。

```bash
npx @nestjs/cli new pipeline-platform-nest --package-manager npm --skip-git --strict
```

**关键操作：**
- 删除 `app.controller.ts`、`app.service.ts` 及其测试文件（`nest new` 生成的示例代码）
- 精简 `app.module.ts`，只保留空壳
- 在 `main.ts` 中启用 CORS 和全局路由前缀 `api`

**NestJS 概念：**

| 概念 | 说明 |
|------|------|
| `NestFactory.create(AppModule)` | 创建应用实例，扫描 AppModule 及其 imports 中的所有组件 |
| `app.enableCors()` | 等价于 Express 的 `cors()` 中间件 |
| `app.setGlobalPrefix('api')` | 所有 Controller 的路由自动加 `/api` 前缀 |

**验证：** `npx tsx src/main.ts` 启动无报错。

---

### Task 2 — Config 模块（环境变量管理）

**目标：** 用 `@nestjs/config` 替代 `dotenv`，实现类型安全的配置管理。

**新建文件：**
```
src/config/
├── configuration.ts    # 配置工厂函数，把 .env 的结构化
└── config.module.ts    # @Global() 全局模块，加载 configuration
```

**NestJS 概念：**

| 概念 | 说明 |
|------|------|
| `@Global()` | 声明模块为全局，其他模块无需在 `imports` 中重复引入 |
| `ConfigModule.forRoot({ load: [...] })` | `forRoot` 是动态模块模式，调用后返回一个配置好的 Module |
| `ConfigService` | 注入后通过 `config.get('mysql.host')` 读取配置 |

**设计决策：** `configuration.ts` 里给所有配置项写了默认值（如 `host: '127.0.0.1'`），所以即使没有 `.env` 文件也能启动。

---

### Task 3 — Database 模块（MySQL 连接池）

**目标：** 管理 3 个 MySQL 数据库的连接池，替代旧项目 `db/pool.ts` 的全局单例。

**新建文件：**
```
src/database/
├── database.constants.ts    # 三个注入 Token（字符串常量）
├── database.module.ts       # @Global() + useFactory 创建 3 个 Pool
└── migrations/              # 从旧项目复制的建库 SQL
    ├── 001_create_user_db.sql
    ├── 002_create_stats_db.sql
    └── 003_create_log_db.sql
```

**NestJS 概念：**

| 概念 | 说明 |
|------|------|
| 自定义 Provider（`useFactory`） | 不是直接 `new` 一个类，而是调用工厂函数创建实例 |
| 注入 Token | 用字符串常量 `'DATABASE_USER'` 代替类名作为注入标识 |
| `OnApplicationShutdown` | NestJS 生命周期钩子，应用关闭时自动调用 `onApplicationShutdown()` 释放资源 |

**关键代码模式：**
```typescript
// 用 map 批量创建 3 个数据库的 Provider，避免重复代码
const poolProviders = [DATABASE_USER, DATABASE_LOG, DATABASE_STATS].map(token => ({
  provide: token,                           // 注入标识
  inject: [ConfigService],                  // 工厂函数的依赖
  useFactory: (config: ConfigService) => createPool(config, DB_NAMES[token]),
}));
```

**设计决策：** 保留 `mysql2` 不用 TypeORM。原因：手写 SQL 已稳定运行，引入 ORM 学习成本太高，留到后续学习。

---

### Task 4 — Redis 模块

**目标：** 用 ioredis 封装一个 Redis 全局模块。

**新建文件：**
```
src/redis/
└── redis.module.ts    # @Global() + useFactory 创建 ioredis 单例
```

**NestJS 概念：**

| 概念 | 说明 |
|------|------|
| `exports` | 模块声明哪些 Provider 可以被其他模块注入。不写 exports 就是模块私有的 |
| 事件监听 | `redis.on('error', ...)` 在工厂函数里注册，Redis 断连时有日志 |

**设计决策：** 没有用第三方 NestJS Redis 包（如 `@nestjs/bull`），直接封装 ioredis，因为只用到最基础的 `rpush`/`lpop`/`set`/`incr`。

---

### Task 5 — 共享层（Types + Shard + @CurrentUser 装饰器）

**目标：** 提取全项目公用的类型定义、纯函数、自定义装饰器。

**新建文件：**
```
src/shared/
├── types.ts                                # 所有 TS 类型/接口
├── shard.ts                                # getTableName() 分表算法
└── index.ts                                # barrel export

src/common/decorators/
└── current-user.decorator.ts               # @CurrentUser() 自定义参数装饰器
```

**NestJS 概念：**

| 概念 | 说明 |
|------|------|
| `createParamDecorator()` | NestJS 提供的工厂函数，用于创建自定义参数装饰器 |
| `ExecutionContext.switchToHttp().getRequest()` | 从 NestJS 抽象上下文获取底层 Express 的 `req` 对象 |

**`@CurrentUser()` 工作原理：**
```
AuthGuard 验证 JWT → request.user = {id, email}
       ↓
@CurrentUser() 从 request.user 取值 → Controller 参数拿到类型安全的 user 对象
```

---

### Task 6 — 公共层（异常过滤器 + 响应拦截器）

**目标：** 统一全项目的响应格式和错误处理，替代 Express 里到处手写的 `try/catch` 和 `res.json()`。

**新建文件：**
```
src/common/
├── filters/
│   └── http-exception.filter.ts      # 捕获所有异常 → {code: -1, message}
└── interceptors/
    └── response.interceptor.ts       # 包装正常返回 → {code: 0, message: "ok", data}
```

**修改文件：**
```
src/main.ts    # 全局注册 filter + interceptor + ValidationPipe
```

**NestJS 概念：**

| 概念 | 说明 |
|------|------|
| `ExceptionFilter` | 实现 `catch()` 方法，捕获所有未被处理的异常 |
| `NestInterceptor` | 实现 `intercept()` 方法，在请求前后插入逻辑。RxJS `pipe(map(...))` 在响应阶段包装数据 |
| `ValidationPipe` | 全局管道，自动对 `@Body()` 参数执行 class-validator 校验 |

**执行顺序（每个请求）：**
```
Guard → Interceptor(请求阶段) → Pipe → Controller → Interceptor(响应阶段)
  ↑ 任何一步抛异常 → ExceptionFilter 兜底                        ↑
```

**设计决策：** `ResponseInterceptor` 留了一个后门——如果 Controller 返回的对象已经有 `code` 和 `message` 字段，就跳过包装。这样如果有特殊接口不需要统一格式，可以自己构造返回。

---

## 阶段二：业务模块

### Task 7 — Auth 模块（注册 + 登录 + JWT 守卫）

**目标：** 实现用户注册和登录，签发 JWT，创建可复用的 `AuthGuard`。

**新建文件：**
```
src/modules/auth/
├── auth.module.ts        # @Global() — AuthGuard 和 JwtModule 全局可用
├── auth.controller.ts    # POST /api/auth/register 和 POST /api/auth/login
├── auth.service.ts       # 业务逻辑：查重 → 哈希 → 写入 → 签发 Token
├── auth.guard.ts         # JWT 守卫，实现 CanActivate
└── dto/
    ├── register.dto.ts   # class-validator 校验规则
    └── login.dto.ts
```

**NestJS 概念：**

| 概念 | 说明 |
|------|------|
| `@Controller('auth')` | 路由前缀，结合全局前缀变成 `/api/auth` |
| `@Post('register')` + `@Body()` | 声明 POST 路由 + 从请求体提取参数（自动触发 ValidationPipe 校验） |
| `CanActivate` | 守卫接口，`canActivate()` 返回 `true` 放行，返回 `false` 或抛异常拒绝 |
| `JwtModule.registerAsync()` | 异步动态模块，用工厂函数从 ConfigService 读 JWT 配置 |

**AuthController 为什么不做逻辑？**

Controller 只负责路由和参数提取，业务逻辑全在 Service 里。这是 NestJS 的核心原则——**关注点分离**：

```
请求 → Controller（路由） → Service（逻辑） → 数据库
       不写逻辑              不碰 HTTP
```

**AuthGuard 为什么是 @Global()？**

AuthModule 设为全局是因为 `AuthGuard` 会被 Apps、Stats 等多个模块使用。如果不设全局，每个模块都要在自己的 `imports` 里写 `AuthModule`，不如全局注册一次。

---

### Task 8 — Apps 模块（应用 CRUD）

**目标：** 实现应用创建/列表/删除，并首次使用 `AuthGuard` 保护接口。

**新建文件：**
```
src/modules/apps/
├── apps.module.ts
├── apps.controller.ts    # @UseGuards(AuthGuard) — 整个 Controller 受 JWT 保护
├── apps.service.ts       # 生成 AppKey/SecretKey + CRUD SQL
└── dto/
    └── create-app.dto.ts
```

**新登场的 NestJS 概念：**

| 概念 | 说明 |
|------|------|
| `@UseGuards(AuthGuard)` | 声明式鉴权——加一行注解，所有接口自动受保护 |
| `@CurrentUser()` | (Task 5 创建的) 从 request 提取当前用户，Controller 里直接用 `user.id` |
| `@Param('id')` | 提取路由参数，如 `DELETE /api/apps/123` 中的 `123` |

**安全设计：**
```sql
-- 删除时必须同时匹配 id 和 user_id，防止用户 A 删除用户 B 的应用
DELETE FROM apps WHERE id = ? AND user_id = ?
```

---

### Task 9 — Collector 模块（事件采集）

**目标：** 实现事件采集接口，这是项目中逻辑最复杂的模块——验签 + 限流 + 入队三道关卡。

**新建文件：**
```
src/modules/collector/
├── collector.module.ts
├── collector.controller.ts          # @UseGuards(GatewayGuard, ThrottlerGuard)
├── collector.service.ts             # 事件 JSON → RPUSH Redis 队列
├── gateway.guard.ts                 # HMAC-SHA256 验签守卫
├── redis-throttler-storage.ts       # 自定义 Redis 限流存储
└── dto/
    └── collect.dto.ts
```

**NestJS 概念：**

| 概念 | 说明 |
|------|------|
| 多个 Guard 叠加 | `@UseGuards(GatewayGuard, ThrottlerGuard)` — 先验签再限流，顺序执行 |
| `ThrottlerStorage` 接口 | `@nestjs/throttler` 提供可扩展的存储接口，实现 `increment()` 即可接入自定义存储 |
| `ThrottlerModule.forRootAsync()` | 异步动态模块——因为需要先注入 Redis 客户端才能创建存储实例 |

**三道关卡的执行流程：**
```
POST /api/collect
  │
  ▼
GatewayGuard（验签）
  ├─ ① 检查 X-AppKey / X-Timestamp / X-Sign 三个请求头
  ├─ ② 时间戳 ±5 分钟窗口检查
  ├─ ③ 用 AppKey 查数据库 → 拿到 secretKey + 检查应用状态
  ├─ ④ HMAC-SHA256(body + timestamp, secretKey) 比对签名
  └─ ⑤ 通过 → request.appId = app.id
  │
  ▼
ThrottlerGuard（限流）
  └─ Redis INCR rate:{appKey} → 超过 1000/分钟 → 429
  │
  ▼
CollectorService（入队）
  └─ JSON.stringify + RPUSH → 立刻返回（不等 Worker 处理）
```

**`redis-throttler-storage.ts` 这个文件是做什么的？**

`@nestjs/throttler` 默认用内存存储计数，但我们的项目有多个进程（PM2 cluster），内存不共享。实现一个 Redis 版本的存储，所有进程共享同一份计数。

---

### Task 10 — Stats 模块（统计查询）

**目标：** 提供 PV 趋势、设备分布、实时事件三个查询接口。

**新建文件：**
```
src/modules/stats/
├── stats.module.ts
├── stats.controller.ts    # @UseGuards(AuthGuard) — 需要登录
└── stats.service.ts       # 跨库查询（stats 库 + log 库）
```

**NestJS 概念：**

| 概念 | 说明 |
|------|------|
| 跨库注入 | `@Inject(DATABASE_STATS)` 和 `@Inject(DATABASE_LOG)` 同时注入两个不同数据库的连接池 |
| `@Query('appId')` | 提取 URL 查询参数，如 `?appId=1&range=7` |

**设计要点：**

`getRealtimeEvents()` 查询最近 2 个分表（今天和昨天），用 `UNION ALL` 拼接：
```sql
SELECT * FROM events_20260724 WHERE app_id = ?
UNION ALL
SELECT * FROM events_20260723 WHERE app_id = ?
ORDER BY created_at DESC LIMIT 20
```

表不存在时会报错，所以用 `try/catch` 包裹，返回空数组。

---

### Task 11 — Health 模块（健康检查）

**目标：** 提供运维监控端点，ping 3 个 MySQL 库 + 上报 uptime。

**新建文件：**
```
src/modules/health/
├── health.module.ts
└── health.controller.ts   # 自定义 MysqlHealthIndicator + @HealthCheck()
```

**NestJS 概念：**

| 概念 | 说明 |
|------|------|
| `@nestjs/terminus` | NestJS 官方健康检查模块，提供 `HealthCheckService` 和 `HealthIndicator` 基类 |
| `@HealthCheck()` | 装饰器，自动收集所有健康指标的结果并格式化输出 |
| 自定义 `HealthIndicator` | 继承基类，实现 `pingCheck()`，给 3 个库各发 `SELECT 1` |

---

## 阶段三：Worker（独立进程）

### Task 12 — ETL Worker + 定时任务

**目标：** 创建独立的 Worker 进程，死循环消费 Redis 队列 + Cron 定时聚合和清理。

**新建文件：**
```
src/
├── worker.ts                        # Worker 独立入口
└── worker/
    ├── worker.module.ts              # Worker 专用模块
    ├── cron.service.ts               # @Cron 定时任务
    ├── aggregator.service.ts         # 每小时聚合 PV/UV + 设备分布
    ├── cleaner.service.ts            # 每天清理 30 天前的事件表
    └── etl/
        ├── parser.service.ts         # Transform — UA/ IP/ URL 解析
        └── loader.service.ts         # Load — 动态建表 + 批量 INSERT
```

**NestJS 概念：**

| 概念 | 说明 |
|------|------|
| `NestFactory.createApplicationContext()` | 不启动 HTTP 服务，只创建 DI 容器。Worker 不需要接收 HTTP 请求 |
| `app.get(ParserService)` | 从 DI 容器手动获取实例（等价于自动注入，但 Worker 没有 Controller 来自动注入） |
| `@nestjs/schedule` + `@Cron()` | 声明式定时任务，替代旧项目的 `node-cron` |
| Redis Lua 脚本 | 定义 `batchPop` 命令，原子批量 LPOP，4 个 Worker 并行消费无竞争 |
| Redis 分布式锁 | `SET lock:aggregator 1 EX 120 NX` — 抢到锁的 Worker 执行定时任务 |

**Worker 为什么不用 NestJS 的 HTTP 服务？**

HTTP 服务和 Worker 是**两个独立进程**，关注点完全不同：
- HTTP 服务：接收请求，快速响应
- Worker：死循环消费队列，永不退出

分开部署意味着可以各自独立扩缩容——HTTP 服务用 PM2 cluster 模式（多进程共享端口），Worker 用 fork 模式（各自独立）。

**数据流：**
```
while(true) {
  ① batchPop('event:queue', 200)  // Lua 原子批量 LPOP
  ② 队列为空？→ sleep(1s)
  ③ Parser.cleanEvent()           // UA→设备 / IP→城市 / URL→路径
  ④ resolveAppIds()               // 批量 app_key → app_id
  ⑤ Loader.batchLoad()            // 按日期分表 → INSERT
}

@Cron('5 * * * *')      → Aggregator.aggregateLastHour()
@Cron('0 4 * * *')      → Cleaner.cleanExpiredTables()
```

---

## 阶段四：收尾

### Task 13 — SDK + 配置文件迁移

**目标：** 把旧项目的浏览器 SDK 和部署配置文件复制过来。

```bash
cp -r ../pipeline-platform-server/src/sdk src/sdk
cp ../pipeline-platform-server/vite.config.sdk.ts .
cp ../pipeline-platform-server/docker-compose.yml .
cp ../pipeline-platform-server/.env .
```

**关键修改：**
- `docker-compose.yml` 的 migrations 路径从 `./src/server/db/migrations` 改为 `./src/database/migrations`（已修正）
- `ecosystem.config.cjs` 的入口文件从 `dist/server/index.js` 改为 `dist/main.js` 和 `dist/worker.js`（适配 NestJS 编译输出）
- `package.json` 添加 `worker`、`build:sdk` 等 npm scripts

---

### Task 14 — Swagger 文档

**目标：** 用 `@nestjs/swagger` 自动生成 API 文档。

**修改文件：**
```
src/main.ts    # 添加 SwaggerModule 配置：/api/docs
各 Controller  # 添加 @ApiTags、@ApiOperation、@ApiBearerAuth 装饰器
```

**NestJS 概念：**

| 概念 | 说明 |
|------|------|
| `DocumentBuilder` | 链式构建 Swagger 文档元信息（标题、版本、认证方式） |
| `SwaggerModule.createDocument()` | 扫描所有 Controller 的装饰器，自动生成 OpenAPI 规范 |
| `SwaggerModule.setup()` | 挂载 Swagger UI 到指定路径 |

**效果：** 浏览器打开 `http://localhost:3000/api/docs`，可以直接在页面上交互式测试所有 API。

### Task 15 — 引入 Prisma ORM（Auth + Apps 模块）

**目标：** 用 Prisma 替代 `mysql2` 手写 SQL，为 Auth 和 Apps 模块提供类型安全的数据库查询。Stats 和 Worker 模块保留 `mysql2`（动态分表 Prisma 无法处理）。

**安装：**
```bash
npm install prisma @prisma/client
npx prisma init --datasource-provider mysql
```

**新增文件：**
```
prisma/
└── schema.prisma              # users + apps 模型定义

src/prisma/
├── prisma.service.ts          # 继承 PrismaClient，实现 OnModuleInit
└── prisma.module.ts           # @Global() 全局模块
```

**修改文件：**
```
.env                           # 添加 DATABASE_URL
src/app.module.ts               # 导入 PrismaModule
src/modules/auth/auth.service.ts       # db.query() → prisma.user.*()
src/modules/apps/apps.service.ts       # db.query() → prisma.app.*()
src/modules/collector/gateway.guard.ts # db.query() → prisma.app.findUnique()
```

**Prisma 核心语法（本项目用到）：**

| 语法 | 用途 |
|------|------|
| `prisma.user.findUnique({ where: { email } })` | 按唯一字段查一条 |
| `prisma.user.create({ data: { email, password } })` | 插入并返回带 id 的对象 |
| `prisma.app.findMany({ where: { userId }, orderBy: {...} })` | 查列表，按条件筛选 |
| `prisma.app.delete({ where: { id } })` | 删除一条 |

**改造范围限定：**

Prisma 管理 `pipeline_user` 库（users + apps 表），涉及 AuthService、AppsService、GatewayGuard 三个文件。以下保持 `mysql2`：
- **Stats** — 查询 pipeline_stats 和 pipeline_log 两个库
- **Worker ETL** — 动态建表 `CREATE TABLE events_YYYYMMDD LIKE template`，Prisma 做不到
- **Worker resolveAppIds** — Worker 是独立进程，就一条简单查询，不需要为此引入 Prisma

**验证：**
```bash
npx prisma generate     # 生成类型安全的 PrismaClient
npx tsc --noEmit        # 编译通过
npm run dev             # 启动后调用注册/登录/创建应用 API，功能不变
```

---

## 阶段五：部署（Phase 7）

### Task 16 — 生产部署

**目标：** 将项目部署到阿里云轻量云服务器，Docker + PM2 + Nginx。

**服务器信息：**

| 项目 | 值 |
|------|-----|
| 公网 IP | 120.25.122.243 |
| 域名 | pipeline.ai-myhome.space |
| 系统 | Ubuntu 22.04 |
| 目录 | /opt/pipeline-platform-nest |

**部署内容：**
- Docker Compose 启动 MySQL 8.0 + Redis 7
- PM2 管理 NestJS（server × 2 cluster + worker × 4 fork）
- Nginx 反向代理 + 托管前端静态文件

**详细部署步骤：** `docs/deployment.md`

**后续更新流程：**

```bash
cd /opt/pipeline-platform-nest && git pull origin master
cd pipeline-platform-server && npm install && npx prisma generate && npm run build && npm run build:sdk
cd ../pipeline-platform-web && npm install && npm run build
pm2 restart all
```

---

## 每完成一个 Task 后的验证清单

| Task | 验证方法 |
|------|---------|
| 1 | `npx tsx src/main.ts` 启动无报错 |
| 2 | 启动后临时打印 ConfigService 的值确认加载成功 |
| 3 | 注入 DATABASE_USER，执行 `SELECT 1` 确认连通 |
| 4 | 注入 REDIS_CLIENT，执行 `PING` 确认连通 |
| 5 | `npx tsc --noEmit` 编译通过 |
| 6 | 访问一个不存在的路由，确认返回 `{code:-1, message}` 格式 |
| 7 | `curl POST /api/auth/register` 注册成功并返回 token |
| 8 | 带 token 调用 `GET /api/apps` 返回空数组 |
| 9 | 构造签名调用 `POST /api/collect`，验证 Redis 队列有数据 |
| 10 | 带 token 调用 `GET /api/stats/pv?appId=1` 返回空数组 |
| 11 | `curl GET /api/health` 返回健康状态 |
| 12 | `npx tsx src/worker.ts` 启动，看到消费日志 |
| 13 | `npm run build:sdk` 成功输出 `sdk-dist/sdk.js` |
| 14 | 浏览器打开 `/api/docs` 看到 Swagger 页面 |
| 15 | `npx prisma generate` 成功 + `npx tsc --noEmit` 编译通过 |
| 16 | `curl http://120.25.122.243/api/health` 返回健康状态 |

---

## NestJS 核心概念速查

| 概念 | 装饰器/接口 | 本项目用在哪里 |
|------|-----------|---------------|
| 模块 | `@Module()` | 每个 `*.module.ts` |
| 控制器 | `@Controller()` + `@Get/@Post/@Delete` | `*.controller.ts` |
| 服务 | `@Injectable()` | `*.service.ts` |
| 依赖注入 | `constructor(private xxx: Service)` | 所有 Service/Controller/Guard |
| 守卫 | `CanActivate` + `@UseGuards()` | `AuthGuard`, `GatewayGuard` |
| 拦截器 | `NestInterceptor` + `@UseInterceptors()` | `ResponseInterceptor` |
| 过滤器 | `ExceptionFilter` + `@UseFilters()` | `AllExceptionsFilter` |
| 管道 | `PipeTransform` + `@UsePipes()` | `ValidationPipe`（全局） |
| 装饰器 | `createParamDecorator()` | `@CurrentUser()` |
| 动态模块 | `forRoot()` / `forRootAsync()` | ConfigModule, JwtModule, ThrottlerModule |
| 全局模块 | `@Global()` | Config, Database, Redis, Auth |
| 定时任务 | `@Cron()` | `CronService`（Worker） |
| 自定义 Provider | `useFactory` + 字符串 Token | Database Module（3 个 Pool） |
| 生命周期 | `OnApplicationShutdown` | DatabaseModule, RedisModule, PrismaService |
| ORM | `PrismaClient` + `@Global()` Module | `PrismaService`（Auth + Apps 模块） |

---

## 阶段六：后续优化计划

| # | 优化项 | 当前方案 | 目标方案 | 优先级 |
|------|------|------|------|:--:|
| 1 | 消息队列 | Redis RPUSH/LPOP | RabbitMQ | ✅ 已完成 |
| 2 | 分布式锁 | 手写 SET NX | Redlock 库 | ✅ 已完成 |
| 3 | 日志系统 | `console.log` | Winston | ✅ 已完成 |
| 4 | 单元测试 | 无 | Jest 覆盖核心模块 | 中 |
| 5 | ORM 统一 | 部分 Prisma + 部分 mysql2 | 全量 Prisma | 低 |
| 6 | HTTPS | 无 | Let's Encrypt 免费证书 | 备案后 |
| 7 | AI Agent | 无 | LangChain + RAG + LLM | 新功能 |

### Task 17 — Redlock 分布式锁

**目标：** 将 `cron.service.ts` 中手写 `SET NX` 锁替换为 Redlock 库，实现自动续期、自动释放、多实例容错。

**修改文件：**
```
src/redis/redis.module.ts          # 新增 REDLOCK Provider
src/worker/cron.service.ts         # tryLock() → redlock.acquire()
```

**改前 vs 改后：**

| | 改前 | 改后 |
|------|------|------|
| 加锁 | `this.redis.set(key, '1', 'EX', ttl, 'NX')` | `this.redlock.acquire(['lock:xxx'], ttl)` |
| 释放 | 等 TTL 过期 | `lock.release()` |
| 抢锁失败 | `result !== 'OK'` | 捕获 `ResourceLockedError` |
| 续期 | 无，超时自动释放 | 自动续期（防止任务执行过半锁被释放） |

**验证：**
```bash
npx tsc --noEmit        # 编译通过
npm run dev             # Worker 启动无报错
npm run worker          # @Cron 定时任务正常执行
```

### Task 18 — RabbitMQ 消息队列

**目标：** 将事件采集的消息队列从 Redis 升级为 RabbitMQ，生产者推送、消费者订阅。

**修改文件：**
```
docker-compose.yml                        # 新增 RabbitMQ 容器
src/config/configuration.ts               # 新增 rabbitmq 配置
src/app.module.ts                         # 注册 RabbitMQModule（HTTP）
src/modules/collector/collector.service.ts # RPUSH → AmqpConnection.publish()
src/worker/worker.module.ts               # 注册 RabbitMQModule（Worker）
src/worker/event.consumer.ts              # 新建：@RabbitSubscribe 消费者
src/worker.ts                             # 移除 while(true) 循环
```

**架构变化：**

| | 改前（Redis） | 改后（RabbitMQ） |
|------|------|------|
| 生产者 | `RPUSH event:queue` | `amqp.publish('pipeline.events', 'event.collect', msg)` |
| 消费者 | `while(true) LPOP` | `@RabbitSubscribe` 装饰器自动订阅 |
| 可靠性 | 消息无持久化 | 持久化队列 + 消费者 ACK |
| 重启丢失 | 可能丢失队列中的消息 | 队列持久化，重启不丢 |

**验证：**
```bash
npx tsc --noEmit        # 编译通过
docker compose up -d    # RabbitMQ 容器启动
npm run dev             # HTTP 服务可发布消息
npm run worker          # Worker 消费者正常接收
```

> 优化顺序按优先级从上到下执行，每个优化项为一个独立 Task。

---

### Task 19 — 2核2G 资源优化

**目标：** 适配低配服务器，降低 CPU/内存占用。

**修改：**
```
ecosystem.config.cjs       # server/worker 各减为 1 个 fork 进程
docker-compose.yml         # MySQL 512M / Redis 192M / RabbitMQ 256M 内存限制
                           # MySQL 关闭 performance-schema
                           # Redis maxmemory 128M + allkeys-lru 策略
                           # RabbitMQ 去掉 management 面板（节省 ~50M 内存）
                           #   image: rabbitmq:3-alpine（非 -management）
                           #   仅保留 5672 端口，去掉 15672 Web UI
docs/deployment.md         # 新增 swap 交换空间设置步骤
```

**效果：**

| | 优化前 | 优化后 |
|------|------|------|
| Node 进程 | 4 个 | 2 个 |
| Docker 内存 | ~1.2G 无限制 | ~1G 硬限制 |
| 空闲 CPU | 100% | 降低 |

### Task 20 — Winston 日志系统

**目标：** 将 `console.log` 替换为 Winston 结构化日志，输出到文件并自动轮转。

**新建文件：**
```
src/common/logger/winston.module.ts   # @Global() 全局日志模块
```

**修改文件：**
```
src/app.module.ts                      # 注册 WinstonModule
src/worker/cron.service.ts             # console.log → this.logger.info/error
docs/deployment.md                     # pm2-logrotate 日志轮转配置
```

**Winston 配置：**
- 终端：彩色格式，级别 info
- 文件：`logs/error.log`（仅错误）+ `logs/combined.log`（全量）
- 自动轮转：单文件 10M，保留 7 天

**PM2 日志轮转：**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

> CronService 是第一个改造的模块，后续可逐步将其他 `console.log` 替换为 Winston。

---

## 已知问题

| # | 问题 | 原因 | 解决方案 | 状态 |
|------|------|------|------|:--:|
| 1 | 博客 HTTPS 无法加载 SDK HTTP 脚本 | Vercel 部署博客为 HTTPS，Pipeline 服务器仅 HTTP | 备案后再配 HTTPS | ⏳ 备案中 |
| 2 | 服务器 git pull 偶尔超时 | GitHub 国内访问不稳定 | 已临时设 `git config http.version HTTP/1.1`，后续可迁 Gitee | 🔧 临时修复 |
| 3 | 中文应用名显示乱码 | curl 创建时编码问题（非系统 bug） | 前端页面直接创建即可 | ✅ 已确认 |
