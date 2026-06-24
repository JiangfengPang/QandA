# QandA 项目操作说明

本文档记录本项目在本地开发、测试、构建、清理依赖和迁移到新设备时的常用操作。

## 项目结构

- `server`：Node.js + Express + Prisma API 服务。
- `user-web`：用户答题端，默认开发端口 `5173`。
- `admin-web`：后台管理端，默认开发端口 `5174`。
- `question-banks`：本地题库 JSON 数据。
- `scripts`：项目清理、打包和辅助脚本。

## 首次安装

在项目根目录运行：

```bash
npm install
```

如果只想显式安装所有 workspace 依赖，也可以运行：

```bash
npm run install:all
```

## 本地环境配置

开发环境配置文件位于：

```text
server/.env.development
```

常用配置项：

- `PORT`：后端 API 端口，默认 `3000`。
- `DATABASE_URL`：MySQL 连接地址。
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`：本地管理员账号密码。
- `CORS_ORIGIN`：允许访问 API 的前端地址。

如果需要本地 MySQL，可以使用项目自带 Docker 配置：

```bash
npm run docker:dev
```

初始化开发数据库：

```bash
npm run setup:dev
```

注意：`npm run local:reset-db` 会删除并重建本地开发数据库数据，使用前请确认不需要保留当前数据。

## 启动项目

同时启动后端、用户端和管理端：

```bash
npm run dev
```

分别启动：

```bash
npm run dev:server
npm run dev:user
npm run dev:admin
```

默认访问地址：

- 用户答题端：http://127.0.0.1:5173
- 管理后台：http://127.0.0.1:5174
- API 服务：http://127.0.0.1:3000

## 测试与构建

运行自动化测试：

```bash
npm test
```

运行完整生产构建：

```bash
npm run build
```

测试加构建一键检查：

```bash
npm run check
```

发布或拷贝项目之前，建议至少运行：

```bash
npm run check
```

## 清理依赖后迁移到新设备

如果需要把项目干净拷贝到另一台设备，可以先删除所有 `node_modules`：

```bash
npm run clean:deps
```

这个命令只删除项目内的依赖目录，不会删除源码、题库、环境配置、数据库或上传文件。

拷贝到新设备后，在项目根目录重新安装依赖：

```bash
npm install
```

如果新设备需要重新初始化本地数据库，再运行：

```bash
npm run setup:dev
```

## 清理构建产物

清理构建缓存和发布输出：

```bash
npm run clean
```

该命令不会删除依赖。如果要删除依赖，请使用：

```bash
npm run clean:deps
```

## 生产准备

生产构建：

```bash
npm run prod:build
```

生产安装、生成 Prisma Client 并构建：

```bash
npm run prod:prepare
```

执行生产数据库迁移：

```bash
npm run prod:migrate
```

生产环境启动：

```bash
npm run start:prod
```

生产环境必须配置安全的环境变量，尤其是：

- `JWT_SECRET`
- `DATABASE_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `COOKIE_SECURE`
- `COOKIE_SAME_SITE`
- `CORS_ORIGIN`

## 常见检查清单

开发前：

```bash
npm install
npm run docker:dev
npm run setup:dev
npm run dev
```

提交或打包前：

```bash
npm test
npm run build
```

迁移到新设备前：

```bash
npm run clean:deps
```

迁移到新设备后：

```bash
npm install
npm run setup:dev
npm run dev
```
