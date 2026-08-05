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
# 后端
cd /opt/pipeline-platform-nest/pipeline-platform-server
npm install
npx prisma generate
npm run build
npm run build:sdk

# 前端
cd /opt/pipeline-platform-nest/pipeline-platform-web
npm install
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

- 安全组放开 80 端口（0.0.0.0/0）
- DNS：A 记录 `pipeline.ai-myhome.space` → 服务器公网 IP

---

## 后续更新部署（代码改动后）

在本地提交推送代码后，服务器上执行：

```bash
# 1. 拉新代码
cd /opt/pipeline-platform-nest
git pull origin master

# 2. 编译后端
cd pipeline-platform-server
npm install
npx prisma generate
npm run build
npm run build:sdk

# 3. 编译前端
cd ../pipeline-platform-web
npm install
npm run build

# 4. 重启服务
pm2 restart all
```

> 如果 `.env` 或 `docker-compose.yml` 有改动，需要额外手动更新。

## 常用管理命令

```bash
pm2 status          # 查看进程状态
pm2 logs            # 实时日志
pm2 restart all     # 重启全部进程
pm2 stop all        # 停止全部进程

docker compose up -d      # 启动数据库
docker compose down       # 停止数据库

nginx -t                  # 测试 Nginx 配置
systemctl restart nginx   # 重启 Nginx
```
