# 清理与打包报告

本包基于用户上传的 QandA2.zip 清理生成。

## 已清理

- `.local/`
- Windows 版 MariaDB 压缩包和解压目录
- `node_modules/`
- `dist/`
- 日志文件
- 本地缓存文件
- `.DS_Store` / `._*`
- 临时审查文档残留

## 已保留

- 根目录 `package.json` / `package-lock.json`
- `server` 源码
- `server/prisma/schema.prisma`
- `server/prisma/migrations`
- `user-web` 源码
- `admin-web` 源码
- `question-banks`
- `assets`
- `deploy`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- 本地开发环境示例 `.env.development`
- 服务器生产环境示例 `.env.production.example`
- 后端本地开发环境 `server/.env.development`
- 后端生产环境示例 `server/.env.production.example`

## 用途

- 本地开发：可以直接 `npm install && npm run docker:dev && npm run setup:dev && npm run dev`
- 服务器部署：上传服务器后按安全部署流程构建发布
