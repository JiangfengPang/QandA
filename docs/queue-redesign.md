# Practice Answer Queue Redesign: Redis + BullMQ

## 目标

当前版本使用 `PracticeAnswerSubmissionQueue` 作为 MySQL 会话级主队列，`PracticeAnswerQueueItem` 继续保留为旧客户端兼容队列。下一阶段可升级到 Redis + BullMQ + 独立 worker，把高峰 pending、retry、delayed、failed job 从 MySQL 主业务库移走。

## 目标架构

- `qanda-server` 只负责校验、幂等判定、快速入队和返回。
- `qanda-worker` 作为独立 Node.js 服务消费 BullMQ 队列。
- Redis 保存 pending、active、delayed、retry、failed job 以及 BullMQ 元数据。
- MySQL 只保存最终答题记录、错题、收藏、练习会话等业务数据。
- worker 消费必须幂等，正式写入仍以 `userId + clientAnswerId` 唯一键保护。

## 入队协议

`qanda-server` 接收 `/practice/answers/batch` 后，优先使用会话级提交协议：

```json
{
  "practiceSessionId": "ps:uuid",
  "clientSubmissionId": "ps:uuid:submit-uuid",
  "answers": [
    {
      "questionId": "cuid",
      "clientAnswerId": "question:uuid",
      "selected": ["A"],
      "durationSeconds": 3
    }
  ]
}
```

旧 `/practice/answers` 和不带 `practiceSessionId` 的 batch 请求继续兼容旧题目级队列。Redis + BullMQ 阶段：

1. 生成或接收幂等键：优先 `userId + clientAnswerId`。
2. 会话级 job 使用 `jobId = userId:practiceSessionId`，题目级兼容 job 使用 `jobId = userId:clientAnswerId`。
3. 可选读取轻量幂等收据表或 Redis SET，避免同一 job 重复 add。
4. 返回 `queued`、`duplicate:waiting`、`duplicate:active`、`duplicate:completed` 或 `duplicate:failed`。

job payload 建议只放必要字段：

```json
{
  "userId": "cuid",
  "practiceSessionId": "ps:uuid",
  "clientSubmissionId": "ps:uuid:submit-uuid",
  "answers": [
    {
      "questionId": "cuid",
      "clientAnswerId": "question:uuid",
      "selected": ["A"],
      "durationSeconds": 3
    }
  ],
  "createdAt": "2026-06-30T00:00:00.000Z"
}
```

## Worker 消费

`qanda-worker` 使用 BullMQ `Worker`：

- `concurrency` 由环境变量控制。
- retry 使用 BullMQ attempts + exponential backoff。
- 超过上限进入 failed，由后台监控展示。
- 写 MySQL 时逐题调用现有 `submitPracticeAnswer`，保留 `UserAnswer(userId, clientAnswerId)` 唯一键。
- 对 4xx 永久错误不继续重试，记录失败原因。
- 对数据库短暂错误、网络错误按退避重试。

## 灰度迁移

建议新增模式开关：

- `PRACTICE_ANSWER_QUEUE_BACKEND=mysql|bullmq|dual`
- `PRACTICE_ANSWER_QUEUE_READ_BACKEND=mysql|bullmq`

灰度步骤：

1. 保持 `mysql`，部署包含 BullMQ 代码但不启用。
2. 切到 `dual`：server 同时写 MySQL 队列和 BullMQ，worker 仍只消费 MySQL，用监控比对入队量。
3. 启动 `qanda-worker` 消费 BullMQ，但保留 MySQL worker 关闭或降并发备用。
4. 切到 `bullmq`：server 只写 Redis，MySQL `PracticeAnswerQueueItem` 不再新增。
5. 观察 24-72 小时后，使用安全脚本清理旧 MySQL processed 队列。

灰度期间不得删除 `PracticeAnswerQueueItem`，旧接口保持兼容。

## 新增环境变量

server:

```dotenv
PRACTICE_ANSWER_QUEUE_BACKEND=mysql
PRACTICE_ANSWER_QUEUE_READ_BACKEND=mysql
BULLMQ_REDIS_URL=redis://127.0.0.1:6379/0
BULLMQ_PRACTICE_ANSWER_QUEUE_NAME=practice-answer
BULLMQ_PREFIX=qanda
BULLMQ_ADD_TIMEOUT_MS=1000
```

worker:

```dotenv
NODE_ENV=production
DATABASE_URL=mysql://...
BULLMQ_REDIS_URL=redis://127.0.0.1:6379/0
BULLMQ_PRACTICE_ANSWER_QUEUE_NAME=practice-answer
BULLMQ_PREFIX=qanda
PRACTICE_ANSWER_WORKER_CONCURRENCY=8
PRACTICE_ANSWER_WORKER_MAX_ATTEMPTS=8
PRACTICE_ANSWER_WORKER_BACKOFF_MS=1000
PRACTICE_ANSWER_WORKER_METRICS_INTERVAL_MS=30000
```

不要在日志中打印 `DATABASE_URL`、Redis 密码或完整环境变量。

## systemd 示例

```ini
[Unit]
Description=QandA Practice Answer Worker
After=network.target mysql.service redis.service

[Service]
Type=simple
WorkingDirectory=/opt/qanda
Environment=NODE_ENV=production
EnvironmentFile=/opt/qanda/server/.env.production
ExecStart=/usr/bin/node server/dist/workers/practiceAnswerWorker.js
Restart=always
RestartSec=5
User=qanda
Group=qanda

[Install]
WantedBy=multi-user.target
```

`qanda-server.service` 继续只运行 API。`qanda-worker.service` 可独立扩容、重启和限流。

## 监控指标

- BullMQ waiting、active、delayed、failed、completed。
- 最近 5 分钟 added/completed/failed。
- job failure reason Top 10。
- worker concurrency、attempts、backoff。
- MySQL `UserAnswer` 写入速率和 P95/P99 延迟。
- Redis memory、connected clients、blocked clients、evicted keys。

## 回滚方案

1. 将 `PRACTICE_ANSWER_QUEUE_BACKEND` 改回 `mysql`。
2. 停止 `qanda-worker.service`。
3. 重启 `qanda-server.service`，恢复内置 MySQL worker。
4. 保留 Redis failed/waiting job，不立即清空，方便排查和必要时补偿。
5. 如果处于 `dual` 模式，MySQL 队列仍有完整副本，可直接继续消费。

## 风险与注意事项

- BullMQ 不是最终事实源，最终答题记录仍以 MySQL `UserAnswer` 为准。
- job payload 只放必要字段，题目判分仍从 MySQL 读取当前题目数据。
- `clientAnswerId` 必须稳定、唯一且由前端持久化，刷新/恢复后不能重新生成。
- Redis 需要持久化策略和容量告警，否则极端故障下可能丢 pending job。
- 上线前必须压测入队、消费、Redis 故障、MySQL 慢查询和 worker 重启恢复。
