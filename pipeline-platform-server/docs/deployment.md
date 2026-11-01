# 部署文档

## 首次部署（全新服务器）

> 以下命令都在服务器上执行。

### 1. 安装工具

```bash
# Docker（阿里云镜像）
curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update && apt install -y docker-ce docker-compose-plugin

# Node.js 22 + Git + Nginx + PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git nginx
npm install -g pm2

# 2G 内存服务器必须加交换空间（防止编译时 OOM）
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab

# 验证：必须能看到 /swapfile；只有 fstab 条目而文件不存在 = 实际没有 swap
swapon --show

# 尽量少交换，但保留应急缓冲
echo 'vm.swappiness=10' > /etc/sysctl.d/99-pipeline-swap.conf
sysctl --system
```

### 2. 拉代码 + 启动数据库

```bash
git clone https://github.com/mybb999/pipeline-platform-nest.git /opt/pipeline-platform-nest
cd /opt/pipeline-platform-nest
docker compose up -d
```

### 3. 配置环境变量

```bash
cat > /opt/pipeline-platform-nest/pipeline-platform-server/.env << 'EOF'
PORT=3000
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=root_dev_2024
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
JWT_SECRET=prod_jwt_secret_change_this
DATABASE_URL="mysql://root:root_dev_2024@127.0.0.1:3306/pipeline_user"
EOF
```

### 4. 安装依赖 + 编译

```bash
# 后端（国内用镜像加速）
cd /opt/pipeline-platform-nest/pipeline-platform-server
npm install --registry=https://registry.npmmirror.com
npx prisma generate
npm run build
npm run build:sdk

# 前端
cd /opt/pipeline-platform-nest/pipeline-platform-web
npm install --registry=https://registry.npmmirror.com
npm run build
```

### 5. 启动后端

```bash
cd /opt/pipeline-platform-nest/pipeline-platform-server
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### 6. 配置 Nginx

```bash
cat > /etc/nginx/sites-available/pipeline << 'EOF'
server {
    listen 80;
    server_name pipeline.ai-myhome.space;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /sdk.js {
        alias /opt/pipeline-platform-nest/pipeline-platform-server/sdk-dist/sdk.js;
    }

    location / {
        root /opt/pipeline-platform-nest/pipeline-platform-web/dist;
        index index.html;
        try_files $uri /index.html;
    }
}
EOF
ln -sf /etc/nginx/sites-available/pipeline /etc/nginx/sites-enabled/pipeline
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
```

### 7. 阿里云控制台

- 防火墙/安全组放开 80 和 443 端口（0.0.0.0/0）
- DNS：A 记录 `pipeline.ai-myhome.space` → 服务器公网 IP（域名需先完成 ICP 备案）

### 8. HTTPS 证书（Let's Encrypt）

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d pipeline.ai-myhome.space
```

- 按提示输入邮箱并同意条款，成功后 Nginx 会自动加上 SSL 配置和 HTTP→HTTPS 跳转
- 证书有效期 90 天，certbot 的 systemd 定时器会自动续期
- 验证自动续期：`certbot renew --dry-run`
- 验证访问：`curl https://pipeline.ai-myhome.space/api/health`

> 如果 HTTPS 访问超时，先检查防火墙是否放行了 443 端口。

### 9. 自动化部署（Cron 定时检查）

服务器每 5 分钟检查 GitHub 是否有新提交，有则自动拉取编译重启。脚本带 flock 防重叠、失败重试冷却（30 分钟）、依赖变更检测和 Node 堆上限（1.6G 小机器防 OOM）：

```bash
# 创建部署检查脚本
cat > /opt/deploy-check.sh << 'SCRIPT'
#!/bin/bash
# 自动部署:每 5 分钟检查 GitHub,有更新则拉取、构建、重启。
# 2026-11-02 加固:flock 防重叠;失败即停并保留待办(30 分钟后重试);
# 依赖未变跳过 npm install;Node 堆上限 768M,避免 OOM 拖死 1.6G 小机器。
set -uo pipefail

REPO=/opt/pipeline-platform-nest
PENDING=/var/lib/pipeline-deploy-pending
FAILED=/var/lib/pipeline-deploy-last-fail
LOCK=/var/lock/deploy-check.lock

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[deploy] $(date) 上次部署未结束,跳过"
  exit 0
fi

cd "$REPO" || exit 1

# 失败冷却:同一批变更 30 分钟内不重复重试,避免反复构建拖垮机器
if [ -f "$PENDING" ] && [ -f "$FAILED" ]; then
  if [ $(( $(date +%s) - $(stat -c %Y "$FAILED") )) -lt 1800 ]; then
    exit 0
  fi
fi

if [ ! -f "$PENDING" ]; then
  if ! timeout 120 git fetch origin master 2>&1; then
    echo "[deploy] $(date) git fetch 失败"
    exit 1
  fi
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/master)
  if [ "$LOCAL" = "$REMOTE" ]; then
    exit 0
  fi
  echo "[deploy] $(date) 检测到新提交 $LOCAL -> $REMOTE"
  if ! git pull --ff-only origin master; then
    echo "[deploy] $(date) git pull 失败"
    exit 1
  fi
  git diff --name-only HEAD@{1} HEAD > "$PENDING"
else
  echo "[deploy] $(date) 继续上次未完成的部署"
fi

fail() {
  echo "[deploy] $(date) $1"
  touch "$FAILED"
  exit 1
}

# 小内存机器:限制 Node 堆;宁可构建失败也不要 OOM 拖死整机
export NODE_OPTIONS="--max-old-space-size=768"

SERVER_DEPS=0
WEB_DEPS=0
grep -qx 'pipeline-platform-server/package-lock.json' "$PENDING" && SERVER_DEPS=1
grep -qx 'pipeline-platform-web/package-lock.json' "$PENDING" && WEB_DEPS=1

cd pipeline-platform-server || fail "进入 server 目录失败"
if [ "$SERVER_DEPS" = "1" ]; then
  echo "[deploy] $(date) server 依赖有变化,安装中"
  npm install || fail "server npm install 失败"
else
  echo "[deploy] $(date) server 依赖无变化,跳过 npm install"
fi
npx prisma generate || fail "prisma generate 失败"
npm run build || fail "server build 失败"
npm run build:sdk || fail "sdk build 失败"

cd ../pipeline-platform-web || fail "进入 web 目录失败"
if [ "$WEB_DEPS" = "1" ]; then
  echo "[deploy] $(date) web 依赖有变化,安装中"
  npm install || fail "web npm install 失败"
else
  echo "[deploy] $(date) web 依赖无变化,跳过 npm install"
fi
npm run build || fail "web build 失败"

pm2 restart all || fail "pm2 restart 失败"
rm -f "$PENDING" "$FAILED"
echo "[deploy] $(date) 完成"
SCRIPT
chmod +x /opt/deploy-check.sh
```

```bash
# 设置定时任务，每 5 分钟执行一次
crontab -l 2>/dev/null | grep -v deploy-check | { cat; echo "*/5 * * * * /opt/deploy-check.sh >> /var/log/deploy.log 2>&1"; } | crontab -
```

> 此命令会自动跳过已存在的 deploy-check 任务再新增，重复执行不会创建多条。
>
> 日志轮转配置在 `/etc/logrotate.d/pipeline-deploy`（weekly、保留 4 份、copytruncate）。
> 注意：`/var/log` 属组是 syslog，配置里需要 `su root syslog`，否则 logrotate 会拒绝执行。

### 10. 数据库备份

每天 3:30 全量导出 `pipeline_user` / `pipeline_log` / `pipeline_stats`，gzip 后存到 `/opt/backups/mysql`，保留约 7 天。脚本用 `--single-transaction --quick` 流式导出，不锁表、几乎不占内存；根分区余量不足 2G 时自动跳过。

```bash
install -m 755 /opt/pipeline-platform-nest/scripts/mysql-backup.sh /opt/mysql-backup.sh

# 每天 3:30 执行（重复执行不会产生多条）
crontab -l 2>/dev/null | grep -v mysql-backup | { cat; echo "30 3 * * * /opt/mysql-backup.sh >> /var/log/mysql-backup.log 2>&1"; } | crontab -

# 手动跑一次验证
/opt/mysql-backup.sh
ls -lh /opt/backups/mysql/
```

日志轮转 `/etc/logrotate.d/pipeline-backup`（`/var/log` 属组是 syslog，需要 `su root syslog`）：

```bash
cat > /etc/logrotate.d/pipeline-backup << 'EOF'
/var/log/mysql-backup.log {
    su root syslog
    weekly
    rotate 4
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
```

恢复方式（会覆盖同名库的现有数据）：

```bash
zcat /opt/backups/mysql/pipeline-YYYYMMDD-HHMMSS.sql.gz | \
  docker exec -i pipeline-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot'
```

> 同盘备份只能防误删/改错库，防不了磁盘或整机故障。建议定期拉一份到本地：
> `scp -i ~/.ssh/id_ed25519_pipeline root@120.25.122.243:/opt/backups/mysql/<文件名>.sql.gz .`

---

## 后续更新部署（代码改动后）

**自动：** 本地 `git push` → cron 每 5 分钟检测 → 服务器自动拉取编译重启。

**手动：** 如果需要手动部署：

```bash
# 1. 拉新代码
cd /opt/pipeline-platform-nest
git pull origin master

# 2. 编译后端
cd pipeline-platform-server
npm install --registry=https://registry.npmmirror.com
npx prisma generate
npm run build
npm run build:sdk

# 3. 编译前端
cd ../pipeline-platform-web
npm install --registry=https://registry.npmmirror.com
npm run build

# 4. 重启服务
pm2 restart all
```

> 如果 `.env` 或 `docker-compose.yml` 有改动，需要额外手动更新。

## 服务器重启恢复

服务器重启后 Docker 容器停止、PM2 进程清空、dist 目录可能丢失，按以下顺序恢复：

```bash
# 1. 启动数据库
cd /opt/pipeline-platform-nest && docker compose up -d

# 2. 重新编译（dist 可能在重启时丢失）
cd /opt/pipeline-platform-nest/pipeline-platform-server
npm run build

# 3. 启动 PM2
pm2 kill                  # 彻底停止（推荐，清残留进程）
# 或 pm2 delete all       # 从列表删除
pm2 start ecosystem.config.cjs
pm2 save

# 4. 重启 Nginx
systemctl restart nginx

# 5. 验证
curl http://localhost:3000/api/health
```

## 常用管理命令

```bash
# PM2
pm2 status               # 查看进程状态
pm2 logs                 # 实时日志
pm2 restart all          # 重启全部进程
pm2 stop all             # 停止全部进程
pm2 install pm2-logrotate    # 安装日志轮转
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# Docker
docker compose up -d rabbitmq  # 启动 RabbitMQ
docker compose up -d           # 启动所有服务
docker compose down            # 停止
docker ps                      # 查看运行中的容器

# Nginx
nginx -t                 # 测试配置
systemctl restart nginx  # 重启

# 自动化部署日志
tail /var/log/deploy.log       # 查看部署日志
crontab -l                     # 查看定时任务

# 数据库备份
/opt/mysql-backup.sh           # 手动备份一次
ls -lh /opt/backups/mysql/     # 查看备份文件
tail /var/log/mysql-backup.log # 查看备份日志
```

## 2026-11-02 运维加固记录（OOM 卡死排查）

**现象**：`pipeline.ai-myhome.space` 80/443 拒绝连接、SSH 端口能连但不返回 banner，整机无响应；重启后恢复。

**根因**：

- 1.6G 内存，`/etc/fstab` 有 `/swapfile` 条目但文件不存在，`swapon --show` 为空 —— 实际 0 swap。
- 每分钟执行的自动部署脚本没有锁：内存紧张时 `git fetch` 被 OOM 杀掉，下一分钟又启动一个；一旦检测到提交，会并发跑多个 `npm install` + 前后端构建。OOM 快照里同时出现 4 个 `npm install`（每个虚拟内存约 1.4G）。
- 常驻服务约 700M（MySQL 162M、RabbitMQ 119M、Node server 114M、worker 94M + pm2/docker/snapd），留给构建的不足 700M。
- 11-01 11:34 最后一次 OOM，20:51 内核日志中断，整机卡死。deploy.log 中 269 次 `git-remote-https died of signal 9`。

**已做**：

- 重建 2G swapfile 并设置 `vm.swappiness=10`（`swapon --show` 已确认）。
- 部署脚本：`flock` 防重叠、失败即停 + 30 分钟冷却重试、仅 lockfile 变化时 `npm install`、`NODE_OPTIONS=--max-old-space-size=768`、`git fetch` 120s 超时。
- cron 从每分钟改为每 5 分钟。
- 关闭 fwupd 服务（`fwupd-refresh.timer` 曾被 OOM 杀掉）。
- `/var/log/deploy.log` 加 logrotate 并已轮转（原 14M）。

**验证**：`sdk.js` 200、`POST /api/collect` 201、事件经 RabbitMQ → worker → MySQL 落库；部署脚本空跑 exit 0。
