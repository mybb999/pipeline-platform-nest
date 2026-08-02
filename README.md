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

# 2. 启动数据库（管理员权限）
net start MySQL
net start Redis

# 3. 启动后端
cd pipeline-platform-server && npm run dev
# → http://localhost:3000 / Swagger: /api/docs

# 4. 启动前端（另开终端）
cd pipeline-platform-web && npm run dev
# → http://localhost:5173

# 5. 启动 Worker（另开终端，可选）
cd pipeline-platform-server && npm run worker
```

## NPM Scripts

| 命令 | 位置 | 说明 |
|------|------|------|
| `npm run dev` | server | 后端开发服务 |
| `npm run dev:watch` | server | 后端（热重载） |
| `npm run worker` | server | Worker 进程 |
| `npm run dev` | web | 前端开发服务 |
| `npm run build` | server | 编译后端 → dist/ |
| `npm run build` | web | 编译前端 → dist/ |
| `npm run build:sdk` | server | 打包浏览器 SDK |

## 生产部署

```bash
# 编译
cd pipeline-platform-server && npm run build && npm run build:sdk
cd ../pipeline-platform-web && npm run build

# 启动（PM2 管理进程）
cd ../pipeline-platform-server && pm2 start ecosystem.config.cjs

# 查看 / 停止 / 重启
pm2 status
pm2 stop all
pm2 restart all
```

## 本地环境

| 组件 | 路径 | 连接 | 命令 |
|------|------|------|------|
| Node.js v22 | — | — | — |
| MySQL 8.0 | `E:\MySQL\mysql-8.0.19-winx64` | root/root_dev_2024:3306 | `net start/stop MySQL` |
| Redis | `E:\Redis` | :6379 | `net start/stop Redis` |

## 技术栈

NestJS 11 · TypeScript · Vue 3 · Element Plus · MySQL 8.0 · Redis 7 · Prisma · JWT · Swagger · PM2

## 文档

- 开发步骤：`pipeline-platform-server/docs/development-guide.md`
