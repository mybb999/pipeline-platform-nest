# Pipeline Platform - NestJS

## 这是什么项目

实时数据管道平台的后端，从 Express.js 迁移到 NestJS，配合前端 `pipeline-platform-web` 使用。

## 项目背景

- 原有项目 `pipeline-platform-server` 是用 Express.js 写的，Phase 1-6 已完成（注册/登录/JWT/应用管理/SDK/ETL Worker/定时聚合/管理后台大屏）
- 本项目是对旧项目的 NestJS 重写，功能完全对等，API 接口不变
- 迁移目的：学习 NestJS 框架（模块化、依赖注入、装饰器驱动开发）
- 旧项目在 `../pipeline-platform-server/`，作为参考，不要修改

## 技术栈

- **框架**: NestJS 11.x（底层 Express）
- **数据库**: MySQL 8.0（mysql2 驱动，3 个库：pipeline_user / pipeline_log / pipeline_stats）
- **缓存/队列**: Redis 7（ioredis）
- **生态**: @nestjs/config, @nestjs/jwt, @nestjs/throttler, @nestjs/schedule, @nestjs/terminus, @nestjs/swagger
- **校验**: class-validator + class-transformer
- **构建**: NestJS CLI + tsc

## 项目结构

```
src/
├── main.ts                    # HTTP 入口
├── worker.ts                  # Worker 入口（独立进程）
├── app.module.ts              # 根模块
├── common/                    # 公共守卫/拦截器/过滤器/装饰器
├── config/                    # @nestjs/config 配置模块
├── database/                  # MySQL 连接池模块（3 个库）
├── redis/                     # Redis 模块
├── modules/
│   ├── auth/                  # 注册/登录/JWT
│   ├── apps/                  # 应用 CRUD
│   ├── collector/             # 事件采集（验签+限流）
│   ├── stats/                 # 统计查询
│   └── health/                # 健康检查
├── worker/
│   └── etl/                   # ETL 解析+加载
└── shared/                    # 共享类型+工具
```

## 参考文档

- `docs/superpowers/specs/2026-07-16-nestjs-migration-design.md` — 完整设计方案
- `docs/superpowers/plans/2026-07-16-nestjs-migration-plan.md` — 14 步实施计划
- 旧项目：`../pipeline-platform-server/` — 参考实现

## 开发

```bash
npm run dev        # 启动 HTTP 服务（热重载）
npm run worker     # 启动 Worker
npm run build      # 编译
npm run build:sdk  # 打包浏览器 SDK
```

## 与前端的关系

前端 `pipeline-platform-web` 完全不变，API 契约保持一致：
- URL 路径不变（如 `/api/auth/login`）
- 请求/响应格式不变（`{ code, message, data }`）
- 鉴权方式不变（Bearer Token）

## 迁移进度

✅ 迁移完成 (2026-07-16)

全部 14 个 Task 已执行完毕，NestJS 迁移已全部完成。
- Task 1-14: 项目初始化、基础模块、用户系统、SDK/采集、ETL Worker、定时聚合、管理后台 API、健康检查、Swagger 文档
- 旧项目 `pipeline-platform-server` 已冻结，后续开发在 NestJS 项目中进行。
- 迁移进度记录在 `.superpowers/sdd/progress.md`。
