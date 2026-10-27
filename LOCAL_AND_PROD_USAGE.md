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
npm run start:prod
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
npm start
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
# 编辑两个 .env，显式设置 IP_HTTP_MODE=true、COOKIE_SECURE=false 和 HTTP CORS_ORIGIN 后执行
sudo ALLOW_INSECURE_HTTP=1 bash deploy/scripts/deploy-ip-http.sh
```

默认不会导入题库或重建管理员。仅全新服务器使用：

```bash
sudo ALLOW_INSECURE_HTTP=1 QANDA_BOOTSTRAP_DATA=1 bash deploy/scripts/deploy-ip-http.sh
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

## 本次修复的部署要求

生产启动、迁移、初始化、清理命令均显式选择 production，优先读取 `server/.env.production`，其次读取 `server/.env`；开发命令只读取开发配置。环境文件不能覆盖命令选择的模式。统计默认按 Asia/Shanghai 的自然日处理，服务和所有运行进程应保持相同 TZ。

正式环境使用 `deploy/nginx/qanda.conf.template`，填写域名并配置有效证书，保持 `COOKIE_SECURE=true`、`IP_HTTP_MODE=false`。HTTP 脚本仅供显式选择的临时环境，不应传输真实账户的敏感信息。

新增迁移 `20261007090000_activity_processing_marker` 会保留全部原始答案，重建每日活跃度汇总。部署时先停止旧后端进程，再备份数据库、应用迁移、启动新后端。重建期间后台活跃统计可能暂时不完整；后台任务会逐批恢复。不要同时运行使用旧聚合逻辑的进程。

清空个人练习记录会同时清除待处理任务、历史答案和每日活跃汇总；后台任务不能重新写回已经清除的任务。刷新统计接口最多等待答题处理 250 毫秒，大量答案入队时最终统计在后台处理后更新。

## 备份与恢复验证

发布前通过数据库客户端对生产数据库执行完整备份（包含表结构、数据、触发器，InnoDB 使用一致性快照），凭据使用客户端配置文件，不放入命令行或仓库。上传目录也需单独备份。确认备份文件非空，并记录当前部署版本。

恢复验证应在独立数据库中进行：导入备份，核对用户数、题目数和答题记录数，运行迁移状态检查，再执行登录、答题、统计和清空记录检查。验证成功后保留旧版本构建产物和备份；涉及数据库结构的回退先停止服务，按验证过的恢复流程处理，不能只替换代码。
