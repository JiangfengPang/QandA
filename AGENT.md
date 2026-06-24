# AGENT.md

## 发布与版本更新规则

- 答题端会在生产环境轮询 `/version.json`，并在发现 `buildId` 变化时提示用户刷新。这个文件由 `user-web/vite.config.ts` 在 `npm run build --workspace user-web` 时自动生成。
- 每次发布用户端前都必须重新构建 `user-web`，不要复用旧的 `user-web/dist`。默认 `buildId` 包含当前时间；如果发布流程需要可追踪版本，请设置唯一的 `QANDA_BUILD_ID`，例如提交号或 `20260621-001`。
- 部署时必须把新的 `user-web/dist/version.json` 和其他静态资源一起上传。Nginx 中 `/version.json` 必须保持 `no-store` / `no-cache`，`index.html` 也不要长期缓存，带哈希的 `assets/*` 可以长期缓存。
- 如果只更新题库或公告数据，不一定需要改前端版本号；如果改了答题端代码、样式、路由、接口契约或静态资源，就必须重新构建并发布新的 `version.json`。
- 发布前运行 `npm run check`。如果因为环境问题无法完整运行，至少分别跑受影响工作区的测试和构建，并在发布记录里说明缺口。

## 公告 Markdown 维护规则

- 公告正文按原始 Markdown 保存。不要按行 `trim()`，不要用 `split(/\n+/)` 去掉空行，否则嵌套列表、代码块和引用会被破坏。
- 管理端提交公告正文时应传完整字符串；服务端只做换行符标准化和整体首尾空白清理。
- 调整公告详情样式时保留 `.qx-announcement-markdown` 的列表、代码块、表格和引用样式。

## 前端布局注意事项

- 一级页面顶部栏高度由 `--qx-page-topbar-*` 变量统一控制。桌面端变量在 `user-web/src/styles/desktop-adaptive.css`，移动端变量在 `user-web/src/styles/mobile-system.css`。
- 不要在单个页面硬编码顶部栏高度，除非该页面有独立交互形态。首页、题库、统计、复盘、公告应保持统一视觉节奏。
- 移动端题库页面当前隐藏顶部栏，修改全局顶部栏时要确认 `user-web/src/styles/mobile-lists.css` 没被误伤。

## 常用命令

- 本地三端开发：`npm run dev`
- 完整检查：`npm run check`
- 生产构建：`npm run prod:build`
- 生成发布包：`npm run release`
