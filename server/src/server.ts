import { env } from './config/env.js';
import { createApp } from './app.js';
import { prisma } from './db/prisma.js';
import { startPracticeAnswerQueueWorker, stopPracticeAnswerQueueWorker } from './services/practiceAnswerQueueService.js';

const app = createApp();

const server = app.listen(env.port, env.host, () => {
  console.log(`QandA API running at http://${env.host}:${env.port}`);
});
startPracticeAnswerQueueWorker();

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down QandA API`);

  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  server.close(async (error) => {
    try {
      await stopPracticeAnswerQueueWorker();
      await prisma.$disconnect();
    } finally {
      clearTimeout(forceExitTimer);
      process.exit(error ? 1 : 0);
    }
  });
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
