#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE_USER="${SUDO_USER:-$USER}"
SERVICE_GROUP="$(id -gn "$SERVICE_USER")"
cd "$PROJECT_DIR"

echo "==> QandA IP + HTTP deploy"
echo "项目目录：$PROJECT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "==> 安装 Node.js 22"
  sudo apt-get update
  sudo apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "==> 安装 Nginx"
  sudo apt-get update
  sudo apt-get install -y nginx
fi

if ! command -v curl >/dev/null 2>&1 || ! command -v rsync >/dev/null 2>&1; then
  echo "==> 安装部署工具"
  sudo apt-get update
  sudo apt-get install -y curl ca-certificates rsync
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "==> 安装 Docker"
  sudo apt-get update
  sudo apt-get install -y docker.io docker-compose-plugin
  sudo systemctl enable --now docker
fi

echo "==> 检查生产环境配置"
if [ ! -f .env ]; then
  echo "ERROR: 缺少 .env，请先复制 .env.production.example 为 .env 并填写 MySQL 强密码。"
  exit 1
fi

if [ ! -f server/.env ]; then
  echo "ERROR: 缺少 server/.env，请先复制 server/.env.production.example 为 server/.env 并填写数据库、JWT、管理员账号密码。"
  exit 1
fi

echo "==> 启动 MySQL"
if [ -f docker-compose.prod.yml ]; then
  sudo docker compose -f docker-compose.prod.yml up -d
else
  sudo docker compose up -d
fi

echo "==> 创建部署目录"
sudo mkdir -p /var/www/qanda/user-web
sudo mkdir -p /var/www/qanda/admin-web
sudo mkdir -p /var/www/qanda/uploads
sudo chown -R "$SERVICE_USER:$SERVICE_GROUP" /var/www/qanda/uploads

echo "==> 修正 npm 源配置"
export npm_config_registry=https://registry.npmmirror.com
export npm_config_audit=false
export npm_config_fund=false

echo "==> 安装依赖"
npm ci --no-audit --no-fund

echo "==> 生成 Prisma Client"
npm run db:generate

if [ -d server/src ] && [ -d user-web/src ] && [ -d admin-web/src ]; then
  echo "==> 运行测试并构建源码项目"
  npm run check
else
  echo "==> 校验精简生产包构建产物"
  test -f server/dist/server.js
  test -f user-web/dist/index.html
  test -f admin-web/dist/index.html
fi

echo "==> 应用数据库迁移"
if node -e "const s=require('./package.json').scripts||{}; process.exit(s['db:migrate:deploy'] ? 0 : 1)"; then
  npm run db:migrate:deploy
else
  npm run db:migrate
fi

if [ "${QANDA_BOOTSTRAP_DATA:-0}" = "1" ]; then
  echo "==> 初始化管理员与题库数据"
  npm run admin:sync
  npm run db:import
else
  echo "==> 跳过数据初始化（如为全新服务器，请设置 QANDA_BOOTSTRAP_DATA=1 后重新执行）"
fi

echo "==> 发布前端静态文件"
sudo rsync -a --delete user-web/dist/ /var/www/qanda/user-web/
sudo rsync -a --delete admin-web/dist/ /var/www/qanda/admin-web/

echo "==> 移除仅构建阶段需要的依赖"
npm run prod:prune

echo "==> 安装 Nginx 配置"
sudo cp deploy/nginx/qanda-ip-http.conf /etc/nginx/conf.d/qanda-ip-http.conf
sudo rm -f /etc/nginx/sites-enabled/default || true
sudo rm -f /etc/nginx/conf.d/default.conf || true
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

echo "==> 安装后端 systemd 服务"
sudo tee /etc/systemd/system/qanda-server.service >/dev/null <<SERVICE
[Unit]
Description=QandA API Server - IP HTTP Mode
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start --workspace server
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=15
User=$SERVICE_USER
Group=$SERVICE_GROUP

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=/var/www/qanda/uploads

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable qanda-server
sudo systemctl restart qanda-server
sleep 2

echo "==> 检查后端健康状态"
if ! curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
  echo "ERROR: 后端健康检查失败，请执行：sudo journalctl -u qanda-server -n 120 --no-pager"
  exit 1
fi

echo "==> 完成"
echo "答题端：http://你的公网IP"
echo "管理端：http://你的公网IP:8080"
echo "安全组请开放：22、80、8080；不要开放：3000、3306"
echo "后端状态：sudo systemctl status qanda-server --no-pager"
