# QandA 开发与生产运行说明

项目保留两套明确流程：

- 开发模式：TypeScript 热更新、Vite 开发服务器、本地 Docker MySQL。
- 生产模式：编译后的 Node.js API、Nginx 静态站点、Prisma 迁移。

## 本地开发

首次准备：

```bash
npm install
npm run docker:dev
npm run setup:dev
```

启动全部服务：

```bash
npm run dev
```

默认地址：

- 用户端：`http://127.0.0.1:5173`
- 管理端：`http://127.0.0.1:5174`
- API：`http://127.0.0.1:3000`

也可以单独启动：

```bash
npm run dev:user
npm run dev:admin
npm run dev:server
```

## 生产构建

安装、生成 Prisma Client、构建：

```bash
npm run prod:prepare
```

发布前检查：

```bash
npm run check
```

应用数据库迁移：

```bash
npm run prod:migrate
```

数据库迁移与普通构建已经分离。`npm run build` 不会创建管理员、导入题库或修改数据库。

启动编译后的 API：

```bash
NODE_ENV=production npm run start:prod
```

前端构建产物：

- `user-web/dist`
- `admin-web/dist`

由 Nginx 提供静态服务，API 只监听服务器回环地址。

## 精简生产包

生成经过测试和构建的生产压缩包：

```bash
npm run release
```

输出：

```text
release/qanda-production.tar.gz
```

生产包只包含：

- 两个前端的 `dist`
- 后端 `dist` 与 Prisma migration
- 部署脚本、Nginx、systemd 配置
- 生产环境变量示例
- 题库初始化数据
- npm workspace 清单与 lockfile

不会包含 `node_modules`、源码 QA 截图、开发数据库、真实 `.env` 或 TypeScript 构建缓存。

服务器安装流程：

```bash
tar -xzf qanda-production.tar.gz
cd qanda
cp .env.production.example .env
cp server/.env.production.example server/.env
# 编辑 .env 和 server/.env，填入真实强密码、服务器 IP 或域名
npm ci --no-audit --no-fund
npm run db:generate
npm run db:migrate
npm run prod:prune
NODE_ENV=production npm start
```

全新服务器需要初始化管理员时，在移除开发依赖前执行：

```bash
npm run admin:sync
```

题库只应在首次部署或明确需要重新导入时手动执行：

```bash
npm run db:import
```

## 自动部署脚本

公网 IP + HTTP 临时部署：

```bash
cp .env.production.example .env
cp server/.env.production.example server/.env
# 编辑两个 .env 后执行
sudo bash deploy/scripts/deploy-ip-http.sh
```

默认不会导入题库或重建管理员。仅全新服务器使用：

```bash
sudo QANDA_BOOTSTRAP_DATA=1 bash deploy/scripts/deploy-ip-http.sh
```

## 环境文件

开发：

- `.env.development`
- `server/.env.development`

生产：

- `/opt/qanda/.env`
- `/opt/qanda/server/.env`

示例文件：

- `.env.production.example`
- `server/.env.production.example`

不要上传或覆盖服务器真实 `.env`。

## 生产安全约束

线上不要执行：

```bash
npm run setup
npm run setup:dev
npm run db:push
npm run db:seed
npm run db:import
npx prisma migrate reset
docker compose down -v
```

除非你明确要初始化或重置对应数据。
