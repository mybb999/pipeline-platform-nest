# 面试问答手册 —— Nest 数据管道平台(pipeline-platform-nest)

> 配合 [面试亮点.md](面试亮点.md) 使用:那份按任务记技术点,这份按「面试官会怎么问」组织。
> 项目一句话:**实时数据管道平台后端** —— 浏览器 SDK 采集事件 → 验签限流 → 消息队列 → ETL 清洗 → 按天分表 → 定时聚合 → 管理后台大屏。Express 迁移到 NestJS 重写,API 契约不变。

---

## 一、技术栈清单(背熟这一张表)

| 层 | 技术 | 在项目里的角色 |
|---|---|---|
| 框架 | NestJS 11(底层 Express 5)+ TypeScript 5.7 | HTTP 服务 + Worker 双入口 |
| ORM / 驱动 | Prisma 6 + mysql2 | Prisma 管业务库(users/apps);mysql2 裸 SQL 管日志/统计库 |
| 数据库 | MySQL 8.0,三个库 | `pipeline_user`(用户/应用)、`pipeline_log`(events_* 按天分表)、`pipeline_stats`(聚合结果) |
| 缓存/锁 | Redis 7(ioredis)+ redlock | 限流计数、分布式锁、健康探测 |
| 消息队列 | RabbitMQ(@golevelup/nestjs-rabbitmq) | 采集与消费解耦(exchange `pipeline.events`) |
| 鉴权 | @nestjs/jwt + bcrypt | 登录签发 / 密码哈希(saltRounds 10) |
| 验签 | Node 内置 crypto(HMAC-SHA256) | SDK 上报事件的 AppKey/SecretKey 签名 |
| 校验 | class-validator + class-transformer + ValidationPipe | DTO 自动校验 |
| 限流 | @nestjs/throttler + 自定义 RedisThrottlerStorage | 多进程共享计数 |
| 定时 | @nestjs/schedule(@Cron) | 每小时聚合、每天 4 点清理 |
| 健康检查 | @nestjs/terminus | 自定义 MySQL 探针(SELECT 1) |
| 文档 | @nestjs/swagger | /api/docs |
| 日志 | winston | 结构化日志 + 按大小轮转 |
| IP 解析 | ip2region | 离线 IP 库,IP → 城市(城市→省→国家逐级回退) |
| 测试 | Jest + supertest + ts-jest | 单测 + 接口测试 |
| 部署 | PM2(HTTP + Worker 双进程)+ Docker Compose | 腾讯云 2G 单机 |

---

## 二、项目深挖题(面试官对着简历问的)

### 1. 整体架构:数据是怎么从用户浏览器流到大屏的?

```
浏览器 SDK(埋点 pv/error/performance)
  → POST /api/collect(带 X-AppKey/X-Timestamp/X-Sign)
  → GatewayGuard HMAC 验签 → ThrottlerGuard Redis 限流
  → CollectorService 发布到 RabbitMQ(exchange: pipeline.events)
  → Worker 进程 @RabbitSubscribe 消费
  → Parser 清洗(UA→设备、IP→城市、URL→路径)
  → Loader 按天分表 + 批量 INSERT(pipeline_log.events_YYYYMMDD)
  → @Cron 每小时聚合 → pipeline_stats.pv_summary / device_distribution
  → GET /api/stats/pv(JWT 保护)→ 大屏图表
```

**要点:采集路径和查询路径完全解耦。** 采集追求低延迟、不丢数据(先入队就返回);统计查询读的是聚合表,不碰原始日志。前端 SDK 在 `/api/collect` 上验签限流,管理接口走 JWT,两条鉴权体系互不干扰。

### 2. 为什么从 Express 迁到 NestJS?迁移怎么保证线上不出事?

动机:学习 NestJS 的模块化 / 依赖注入 / 装饰器模式。做法:

- **新建独立项目重写,旧项目冻结不动**,不搞渐进式双写(单机小项目,双写成本高于收益)
- **API 契约不变**:URL 路径、`{code, message, data}` 响应格式、Bearer Token 鉴权方式全部对齐,前端零改动
- 按模块一比一映射:routes → controller、middleware → guard、services → service
- 全部 14 个任务用 TDD 推进,迁移完跑同一套验收

**面试可讲的点**:重构和重写的区别 —— 重写保留「对外契约」,内部随便换实现;契约就是 URL + 数据格式 + 鉴权方式,守住这三样前端无感知。

### 3. Auth 模块:JWT 登录注册的完整流程

- 注册:查重(邮箱唯一,409)→ bcrypt.hash(saltRounds 10)→ 建用户 → 直接签 JWT 返回
- 登录:查用户 → bcrypt.compare → 签 JWT(payload 只放 `{id, email}`,不放敏感信息)
- **登录失败统一返回「邮箱或密码错误」**,不区分「邮箱不存在」—— 防止撞库探测
- AuthGuard:从 `Authorization: Bearer xxx` 取 token → `jwtService.verify` → 挂到 request → Controller 用 `@CurrentUser()` 装饰器拿当前用户
- 受保护接口:apps 的 CRUD、stats 查询;collect 和 health 不受 JWT 保护

### 4. Collector:为什么上报要 HMAC 验签?签名怎么算?

采集接口没有登录态(浏览器 SDK 不能带用户密码),但必须防止伪造上报刷数据。验签协议:

1. 开通应用时下发 `appKey`(12 字节随机 hex)+ `secretKey`(16 字节随机 hex)
2. 上报时带三个头:`X-AppKey`、`X-Timestamp`、`X-Sign`
3. `sign = HMAC-SHA256(secretKey, JSON.stringify(body) + timestamp)`
4. 服务端校验:三头齐全 → **时间戳在 ±5 分钟内(防重放)** → 查 app 存在且 status=1 → 重算签名比对

**追问:timestamp 5 分钟窗口能防重放吗?** 只能防「过期请求重放」,窗口内的重放要靠业务幂等(比如事件表唯一键去重)。诚实说现在规模没做,这是已知边界。

### 5. 限流:为什么不用 @nestjs/throttler 默认的内存存储?

默认 ThrottlerStorage 存在**进程内存**里,而生产是 PM2 多进程 —— 每个进程各记各的计数,限流形同虚设。所以实现了 `RedisThrottlerStorage`:

- `INCR rate:{key}` 原子计数,第一次计数时设置 TTL
- 所有进程共享同一个 Redis 计数,`count > limit` 即拦截

**追问:这是什么限流算法?** 固定窗口计数器(ttl 内计数)。优点是简单原子;缺点是窗口边界突刺(00:59 打满、01:00 又打满)。滑动窗口/令牌桶能平滑,但 Redis 计数器 + Throttler 接口最小改动,现阶段够用。

### 6. 为什么采集先进 RabbitMQ,不直接写库?

- **削峰**:大屏营销活动流量尖峰时,数据库扛不住瞬时写入;入队 O(1) 就返回,消费端按自己节奏批量写
- **解耦**:采集接口的响应时间不再被数据库拖累;消费端挂了也不丢数据(队列持久化)
- **批量写**:消费端攒批 → 批量 INSERT,比一条一条插快一个量级

**追问:消息丢了怎么办?** RabbitMQ 开持久化(exchange/queue/message 三层)+ 消费者手动 ACK;极端情况(进程被杀在 ACK 前)会有重复消费,靠 ETL 幂等(聚合用 ON DUPLICATE KEY)兜底。

### 7. ETL:Parser 和 Loader 各干什么?

Parser(清洗,纯函数):
- UA → 设备类型(正则匹配 tablet/mobile,默认 desktop)
- IP → 城市(ip2region 离线库;内网 IP 正则直接判「内网」;城市→省→国家逐级回退)
- URL → 路径(new URL(url).pathname,非法 URL 兜底)
- extra 对象 → JSON 字符串

Loader(加载):
- 按 `created_at` 分组到每天的 `events_YYYYMMDD` 表
- `CREATE TABLE IF NOT EXISTS ... LIKE events_template` 动态建表(模板表统一定义结构)
- 批量 INSERT(占位符拼接,防 SQL 注入)
- 踩坑:MySQL DATETIME 不接受 `Z` 结尾的 ISO 字符串,入库前要 `replace('T',' ').replace('Z','')`

### 8. 分表设计:为什么按天分表?怎么查?

- **为什么分**:埋点事件量最大(每 PV 一条),单表无限增长 → 索引变深、备份/清理都难。按天分表后每表量级可控,写是「建表+插入」,清理是「整表 DROP」(比 DELETE 快几个数量级)
- **命名**:`events_YYYYMMDD`,由 `shared/shard.ts` 的纯函数 `getTableName(date)` 生成,写和查都用它路由,不会算错表
- **查询**:统计查询只走聚合表(pv_summary / device_distribution);要查原始明细才路由到指定日期的分表
- **TTL**:每天凌晨 4 点 CleanerService 扫 `SHOW TABLES LIKE 'events_%'`,超 30 天的直接 DROP

### 9. 定时聚合:@Cron 怎么写的?为什么要 Redlock?

- `@Cron('5 * * * *')` 每小时第 5 分钟聚合上一小时:从分表 `COUNT(*) AS pv, COUNT(DISTINCT ip) AS uv` → `INSERT ... ON DUPLICATE KEY UPDATE` 累加进 stats 库
- `@Cron('0 4 * * *')` 每天 4 点清理过期分表

**为什么单机也要 Redlock**:Worker 是独立进程,未来多实例部署时同一个 cron 会在多个实例同时触发 → 重复聚合(数值翻倍)。Redlock(Redis 分布式锁)保证同一时刻只有一个实例执行;抢不到锁直接跳过(ResourceLockedError 是正常情况,不算错误)。锁 TTL 120 秒 + 自动续期,防止任务执行一半锁过期。

### 10. 全局响应包装:{code, message, data} 怎么实现的?

- **ResponseInterceptor**:controller 返回什么,统一包成 `{code: 0, message: 'ok', data: ...}`;已经带 code/message 的原样透传(避免二次包装)
- **AllExceptionsFilter**:任何异常统一转成 `{code: 非0, message: 错误信息}` + 对应 HTTP 状态码
- 好处:前端拿到的结构永远一致,错误处理一处写完;controller 只关心业务数据

### 11. 双进程:HTTP 和 Worker 为什么分开?

- `main.ts`:NestFactory.create 起 HTTP(端口 3000)
- `worker.ts`:NestFactory.createApplicationContext 起**独立进程**(standalone app,不监听端口),只跑 RabbitMQ 消费 + 定时任务
- **为什么**:埋点量大时消费/聚合是 CPU 和 IO 密集的活,和 HTTP 同进程会互相拖累;分开后各自独立扩缩容(HTTP 多实例无状态,Worker 靠 Redlock 保唯一),PM2 分别托管
- Worker 复用了同一套 DatabaseModule / RedisModule(模块化复用的红利 —— Express 时代要手动引全局单例)

### 12. 健康检查:terminus 做了什么?

`GET /api/health`:自定义 `MysqlHealthIndicator` 对三个库各跑 `SELECT 1`,任一不通就返回 503。给 PM2/负载均衡/监控探活用 —— 进程活着但数据库挂了要能被探针发现。

### 13. Prisma 和 mysql2 为什么混用?

- **Prisma 管业务库**(pipeline_user):users/apps 表,字段少、CRUD 多,享受类型安全和迁移工具
- **mysql2 管日志/统计库**:events 分表动态建表、批量 INSERT、聚合 SQL —— Prisma 的模型必须编译期定死,动态表名做不到,裸 SQL 是正解
- 结论:**工具按场景选,不追求统一**。这是可以主动讲的架构决策:ORM 适合业务 CRUD,数据管道适合裸 SQL

---

## 三、NestJS 框架题(结合项目举例)

**Q:Guard、Interceptor、Pipe、Filter 的执行顺序?**
答:请求进来先过 Pipe(参数转换+校验)→ Guard(鉴权,没过就 401 拦下)→ Interceptor 前逻辑 → Controller 方法 → Interceptor 后逻辑(响应包装)→ 有异常走 Filter。项目里全用到了:ValidationPipe 校验 DTO → AuthGuard/GatewayGuard/ThrottlerGuard 三连 → ResponseInterceptor 包装 → AllExceptionsFilter 兜底。

**Q:NestJS 依赖注入怎么工作的?**
答:构造器声明依赖 + `@Injectable()` 标记,框架用 reflect-metadata 读类型元数据自动解析。项目里典型:AuthService 注入 PrismaService + JwtService + ConfigService;多实例同名依赖用自定义 token 区分(如三个数据库连接池用 `DATABASE_USER/DATABASE_LOG/DATABASE_STATS` 三个注入 token,这是 Nest 标准做法)。

**Q:装饰器是什么原理?**
答:TypeScript 装饰器是函数,编译期把元数据写进 `Reflect.defineMetadata`;Nest 启动时扫描模块树,读元数据把 controller 路由、provider 依赖关系拼起来。`@Cron('5 * * * *')` 就是把定时表达式注册进调度器。

**Q:NestJS 模块化解决什么问题?**
答:依赖方向显式化(imports/exports/providers 三件套),模块即边界。对比 Express 时代:每个 service 自己 `getPool('pipeline_user')` 拿全局单例,依赖关系散在各处;Nest 里 Constructor 注入一目了然,测试时直接换 mock。

**Q:为什么 Worker 用 ApplicationContext 而不是完整应用?**
答:Worker 不需要 HTTP 监听,ApplicationContext 只初始化模块和依赖,不开端口,启动更快、攻击面更小。

---

## 四、通用全栈后端高频题(结合本项目技术栈)

### JWT / 鉴权

**Q:JWT 和 session 的区别?为什么用 JWT?**
答:session 是服务端存状态,客户端只拿个 sessionId;JWT 是无状态令牌,用户信息签在 token 里,服务端不存。本项目选 JWT:①前后端分离,API 天然无状态 ②未来横向扩展不用共享 session 存储。代价:token 无法主动吊销(除非加黑名单),所以 payload 只放 id/email、过期时间设短。

**Q:JWT 被盗怎么办?**
答:①HTTPS 全链路,防中间人 ②token 放内存/localStorage 而非 cookie 的取舍要讲清 ③过期时间短 + 刷新机制 ④敏感操作二次校验。诚实答:本项目是学习项目,做了 HTTPS + 过期时间,没做刷新令牌。

**Q:bcrypt 为什么能安全存密码?**
答:单向哈希 + 随机盐 + 可调成本(saltRounds)。同密码两次哈希结果不同(盐不同);彩虹表失效;暴力破解被 saltRounds 拉慢(10 轮 ≈ 100ms/次,在线攻击不可行)。**绝不能存明文/可逆加密,绝不自己造哈希算法**。

### Redis

**Q:Redis 在项目里干了哪几件事?**
答:①限流计数(INCR + TTL,多进程共享)②分布式锁(Redlock,防定时任务重复)③健康探测。都是「原子操作 + 过期时间」的经典组合。

**Q:Redlock 的争议?**
答:Redlock 在极端网络分区下有竞态争议(GC 停顿导致锁提前过期),工程上多数场景够用。项目里的用法:TLL 120s + 自动续期 + 抢不到就跳过(聚合幂等,重复执行也只会累计一次)。诚实答争议 + 为什么这里够用,比背结论加分。

**Q:缓存穿透/击穿/雪崩?**
答:穿透=查不存在的 key,打穿到 DB(布隆过滤器/空值缓存);击穿=热点 key 过期瞬间(互斥锁重建);雪崩=大量 key 同时过期(过期时间加随机)。本项目没有缓存层,采集直写队列,统计读聚合表 —— 诚实说「用不上,但原理清楚」。

### RabbitMQ

**Q:什么时候用消息队列?**
答:①削峰(流量尖峰别打爆下游)②解耦(上下游节奏不同)③异步(不阻塞主流程)。本项目三个理由全占:采集先入队即返回,消费端攒批写库。

**Q:消息不丢/不重复怎么保证?**
答:不丢=持久化 + 手动 ACK;不重复=消费者幂等(本项目的聚合 ON DUPLICATE KEY 天然幂等;分表写入重复消费会有重复行,靠聚合去重,原始表容忍重复)。「至少一次投递 + 幂等消费」是业界标准答案。

### MySQL

**Q:索引原理?为什么 LIKE '%关键词%' 不走索引?**
答:InnoDB 用 B+ 树,最左前缀匹配。`LIKE '%x%'` 前缀是通配符,无法确定比较起点,只能全表扫。要模糊搜索用全文索引/倒排(es)/pg_trgm(这正好接上 AImyhome 项目里 pg_trgm 混合检索的经历,两个项目能串起来讲)。

**Q:COUNT(*) 和 COUNT(列) 区别?**
答:COUNT(*) 数行数;COUNT(列) 忽略 NULL。聚合里 UV = `COUNT(DISTINCT ip)` 就是数不重复访客。

**Q:什么时候该分表/分库?**
答:数据量单表千万级、写入 QPS 高、清理成本大。本项目按天分表是**时间维度预分表**,因为埋点数据天然按天组织,查询/清理都按天 —— 不是盲目的。分库按业务(用户/日志/统计三库),隔离流量和爆炸半径。

### Node.js

**Q:Node 为什么适合 IO 密集?事件循环是什么?**
答:单线程 + 事件循环 + 非阻塞 IO。网络请求/文件/数据库操作都不阻塞主线程,回调(现在是 async/await)回来再处理。所以本项目消费端一条条处理消息也不会卡死其他任务。CPU 密集(大量计算)会阻塞 —— 项目的解析是轻量的(正则 + IP 库查询),真 CPU 重的活要拆出去(这正是 AImyhome 项目 MinerU 解析单独起 8001 服务的理由,两个项目呼应)。

**Q:批量 INSERT 怎么写的?为什么快?**
答:一条 SQL 多组占位符 `VALUES (?,...), (?,...)`,一次网络往返 + 一次解析,减少每条的 RTT 和事务开销。

### 安全

**Q:SQL 注入怎么防?**
答:参数化查询(占位符传值,值永远不被当 SQL 解析)。项目里所有裸 SQL 全部走 `?` 占位符,连表名都只来自白名单/纯函数(分表名由日期生成,不接收用户输入)。

**Q:越权怎么防?**
答:资源归属校验 —— 删应用时 `WHERE id = appId AND userId = 当前用户`,查不到统一 404(不暴露存在性)。JWT 里的 userId 来自签名,不可伪造,归属判断可靠。这在 AImyhome 项目的会话归属防线里是同一套路。

**Q:HMAC 和 HTTPS 分别防什么?**
答:HMAC 防**伪造**(证明请求来自持有密钥的人);HTTPS 防**窃听和篡改**(传输层加密)。两者互补:HTTPS 管传输,HMAC 管身份。

### 部署与测试

**Q:PM2 怎么跑这个项目?**
答:两个进程:HTTP(main.ts)+ Worker(worker.ts),各自一个 PM2 app,开机自启。Worker 挂了 PM2 自动拉起,消费中断的消息还在队列里不丢。

**Q:测试怎么做的?**
答:Jest + supertest + ts-jest。TDD 流程:先写失败测试 → 最小实现 → 重构。分层:纯函数单测(parser 的 UA/城市解析、分表名生成)→ 接口测试(supertest 打 controller,守卫/拦截器/过滤器全链路)。

**Q:上线前检查清单?**
答:构建通过 → 全量测试绿 → 健康检查接口通 → 三个库连接正常 → 采集链路打一条真实事件端到端验证(SDK → 分表 → 聚合表都能查到)。

---

## 五、高频追问清单(自测用)

1. 一句话介绍这个项目?(数据管道:采集→队列→ETL→分表→聚合→大屏)
2. 数据流走一遍?(见「项目深挖 1」的图)
3. 为什么迁 NestJS?迁移策略是什么?(契约不变 + 重写 + 一比一映射)
4. 验签流程?5 分钟窗口防什么?防不了什么?
5. 限流用的是什么算法?为什么存 Redis?
6. 消息队列三个作用?消息重复/丢失怎么办?
7. 分表为什么按天?TTL 怎么清?
8. Redlock 干什么的?锁过期怎么办?
9. 三个 MySQL 库怎么划分?Prisma 和 mysql2 怎么分工?
10. JWT 流程?被盗怎么办?bcrypt 为什么安全?
11. NestJS 的 Guard/Interceptor/Pipe/Filter 各是什么?执行顺序?
12. 越权怎么防?SQL 注入怎么防?
13. Node 事件循环?什么时候会阻塞?
14. 如果埋点量涨 100 倍,哪里先撑不住?(答:单机 MySQL 写入 → 分表已解单表膨胀,下一步是消费端并发 + 库拆分;MQ 可横向加消费者;聚合是瓶颈时改流式聚合。诚实说现在单机 2G 就够)
15. 这个项目和 AImyhome Agent 项目有什么联系?(答:同一套「采集/管道/聚合」思维 + 检索都用了向量;管道项目练 Nest/MySQL/Redis/MQ,Agent 项目练 Python/LangGraph/RAG —— 后端两条技术线都覆盖)
