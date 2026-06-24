# 部署安全提醒

本包适合两种用途：

1. 本地开发测试
2. 服务器安全部署

## 本地开发

```bash
npm install
npm run docker:dev
npm run setup:dev
npm run dev
```

## 服务器部署

服务器部署时只允许：

```bash
npm ci --no-audit --no-fund --prefer-offline
npm run db:generate
npm run db:migrate:deploy   # 仅当 migrate status 显示有待应用迁移时执行
npm run build
```

不要在线上执行：

```bash
npm run setup
npm run setup:dev
npm run db:seed
npm run db:import
npm run db:push
docker compose down -v
```

## 数据原则

- 不覆盖 `/opt/qanda/.env`
- 不覆盖 `/opt/qanda/server/.env`
- 不删除 `/var/www/qanda/uploads`
- 不删除 Docker MySQL volume
- 更新前必须备份数据库
