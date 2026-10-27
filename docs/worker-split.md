# QandA Worker Split Plan

## Target

`qanda-server` should serve HTTP API traffic only. `qanda-worker` should consume practice answer queues only. Both services use this repository and the same compiled server package, but they run with different commands and can be restarted or throttled independently.

## Service Layout

- `qanda-server.service`: runs `node server/dist/server.js`, exposes `/api/*`, and may keep the built-in worker disabled in a later release.
- `qanda-worker.service`: runs a future worker entry such as `node server/dist/workers/practiceAnswerWorker.js`.
- Both services read the same production env file, but worker-specific queue variables can be overridden in the worker unit.

## Operations

- During peak traffic, pause worker consumption from the admin panel or lower `PRACTICE_ANSWER_QUEUE_BATCH_SIZE` and `PRACTICE_ANSWER_QUEUE_CONCURRENCY`.
- During low traffic, resume the worker and use a moderate queue profile to reduce backlog.
- Restarting `qanda-worker` must not interrupt login, browsing, practice loading, favorites, review, or admin API.

## systemd Sketch

```ini
[Unit]
Description=QandA Practice Answer Worker
After=network.target mysql.service

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

## Rollback

1. Stop `qanda-worker.service`.
2. Re-enable the built-in worker in `qanda-server`.
3. Restart `qanda-server.service`.
4. Keep queue data intact; do not manually delete unprocessed jobs.

## Production Defaults

Use strict interval mode by default. Pending backlog is acceptable when the API is healthy; website availability is more important than draining every queued answer immediately.
