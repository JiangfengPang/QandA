# QandA Architecture Review

## Applied Improvements

- User application routes remain lazy-loaded.
- Practice Markdown, syntax highlighting, and KaTeX are loaded only for Python questions.
- Page-specific CSS is emitted with its route instead of the global stylesheet.
- Vant and Element Plus components are registered explicitly.
- Subject bank progress uses two batch queries instead of two queries per bank.
- API shutdown waits for HTTP requests and disconnects Prisma.
- Development, build, migration, production start, prune, and release tasks have separate commands.
- Nginx caches hashed assets for one year, disables caching for `index.html`, and enables gzip.
- Release packaging excludes local caches, QA artifacts, real environment files, and source-only clutter.

## Remaining Intentional Tradeoffs

- ECharts remains a separate large chunk because chart rendering is feature-specific and already route-loaded.
- Markdown/KaTeX remains a large asynchronous chunk because full formula and code highlighting support is required.
- Element Plus theme CSS is component-scoped but still substantial; replacing the admin design system would have a high regression cost.
- In-memory rate limiting is suitable for one API instance. Multi-instance deployment should move rate-limit state to Redis or the gateway.

## Operational Rules

- Build commands must not mutate production data.
- Database migrations are explicit.
- Seed and question-bank import are opt-in.
- Frontend files are served by Nginx; Node serves API and uploads only.
- Production should keep ports `3000` and `3306` private.
