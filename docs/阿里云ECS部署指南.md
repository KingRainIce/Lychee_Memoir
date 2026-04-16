# 阿里云 ECS 部署指南（Ubuntu 22.04）

适用于本仓库：后端 + PostgreSQL 用 Docker Compose，前端静态文件由 Nginx 托管，并反向代理 `/api` 与 `/api/ws`。

## 0. 前置准备

- 一台新开的阿里云 ECS（Ubuntu 22.04）
- 已绑定域名（用于 HTTPS）
- 安全组放行：`22`、`80`、`443`
- 不对公网放行：`5432`、`8000`

## 1. 服务器安装依赖

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release git nginx

# Docker 官方源
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Node.js 20（用于构建前端）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 当前用户免 sudo 使用 docker（重新登录生效）
sudo usermod -aG docker $USER
```

## 2. 拉取项目与生产环境变量

```bash
cd /opt
sudo git clone https://github.com/KingRainIce/Lychee_Memoir.git
sudo chown -R $USER:$USER /opt/Lychee_Memoir
cd /opt/Lychee_Memoir
```

复制并编辑生产环境变量：

```bash
cp /opt/Lychee_Memoir/.env.production.example /opt/Lychee_Memoir/.env
```

⚠️ **不要直接启动服务**。先打开 `/opt/Lychee_Memoir/.env`，把所有占位值改成你自己的安全值后再执行 `docker compose up`。

必须修改：

- `JWT_SECRET`：改成强随机字符串
- `INIT_ADMIN_EMAIL`、`INIT_ADMIN_PASSWORD`：改默认管理员
- `SILICONFLOW_API_KEY`：如需 RAG 功能

## 3. 启动后端与数据库（Docker）

```bash
cd /opt/Lychee_Memoir
docker compose up -d --build db api
docker compose ps
```

说明：首次启动会自动创建 `vector` 扩展、执行 Alembic 迁移并写入种子数据。

可选检查：

```bash
curl http://127.0.0.1:8000/docs
```

## 4. 构建并发布前端静态文件

```bash
cd /opt/Lychee_Memoir/frontend
npm ci
npm run build
```

发布到 Nginx 目录：

```bash
sudo mkdir -p /var/www/szu-memoir
sudo rsync -av --delete /opt/Lychee_Memoir/frontend/dist/ /var/www/szu-memoir/
```

## 5. 配置 Nginx（含 `/api` 与 `/api/ws` 反代）

复制模板并替换你的域名（把下面命令里的 `example.com` 改成你的真实域名）：

```bash
sudo cp /opt/Lychee_Memoir/deploy/nginx/szu-memoir.conf /etc/nginx/sites-available/szu-memoir.conf
sudo sed -i 's/__SERVER_NAME__/example.com/g' /etc/nginx/sites-available/szu-memoir.conf
sudo ln -sf /etc/nginx/sites-available/szu-memoir.conf /etc/nginx/sites-enabled/szu-memoir.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 6. 配置 HTTPS（Certbot）

同样把 `example.com` 改成你的真实域名：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com
```

按提示完成后，Certbot 会自动写入证书与 80->443 跳转规则。

## 7. 开机自启与健康检查

```bash
sudo systemctl enable docker
sudo systemctl enable nginx
```

检查点：

- 首页可打开
- 登录/发帖/审核可用
- `https://你的域名/api/docs` 可访问
- WebSocket 正常（新帖推送）

## 8. 升级与回滚建议

升级：

```bash
cd /opt/Lychee_Memoir
git pull
docker compose up -d --build db api
cd frontend && npm ci && npm run build
sudo rsync -av --delete /opt/Lychee_Memoir/frontend/dist/ /var/www/szu-memoir/
sudo systemctl reload nginx
```

备份（示例）：

- 定期备份 Docker 卷 `szu_pg`
- 备份 `/opt/Lychee_Memoir/.env`
