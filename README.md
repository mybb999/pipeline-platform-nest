# Pipeline Platform

实时数据管道平台，NestJS 后端 + Vue 3 前端。

## 项目结构

```
pipeline-platform-nest/
├── pipeline-platform-server/     # 后端（NestJS 11 + Prisma + MySQL + Redis）
├── pipeline-platform-web/        # 前端（Vue 3 + Element Plus + ECharts）
├── docker-compose.yml            # Docker 部署配置
├── ecosystem.config.cjs          # PM2 部署配置
└── .env                          # 环境变量
```

## 快速启动

```bash
# 1. 安装依赖
cd pipeline-platform-server && npm install
cd ../pipeline-platform-web && npm install

# 2. 启动数据库
net start MySQL                           # MySQL（管理员权限）
start E:\Redis\redis-server.exe           # Redis

# 3. 启动后端（终端 1）
cd pipeline-platform-server
npm run dev
# → http://localhost:3000
# → Swagger: http://localhost:3000/api/docs

# 4. 启动前端（终端 2）
cd pipeline-platform-web
npm run dev
# → http://localhost:5173

# 5. 启动 Worker（终端 3，可选）
cd pipeline-platform-server
npm run worker
```

## 本地环境

| 组件 | 路径 | 连接信息 |
|------|------|---------|
| Node.js v22 | — | — |
| MySQL 8.0 | `E:\MySQL\mysql-8.0.19-winx64` | root / root_dev_2024 :3306 |
| Redis | `E:\Redis` | :6379 |

## 技术栈

NestJS 11 · TypeScript · Vue 3 · Element Plus · MySQL 8.0 · Redis 7 · Prisma · JWT · Swagger · PM2

## 文档

- 开发步骤：`pipeline-platform-server/docs/development-guide.md`
- 迁移设计：`pipeline-platform-server/docs/superpowers/specs/`
