import http from 'node:http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { createApp } from './app.js';
import { startBot, stopBot } from './bot/index.js';
import { startScheduler } from './jobs/scheduler.js';

async function main() {
  const app = createApp();
  await prisma.$connect();
  logger.info('Database connected');

  await startBot();
  startScheduler();

  const server = http.createServer(app);
  server.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`🚀 API listening on http://0.0.0.0:${env.PORT}  (docs: /api/docs)`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await stopBot();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  logger.error({ err: e }, 'fatal');
  process.exit(1);
});
