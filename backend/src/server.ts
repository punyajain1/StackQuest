import 'dotenv/config';
import { env } from './config/env';
import { connectDB, prisma } from './config/prisma';
import { logger } from './utils/logger';
import app from './app';
import { startQuestionFetcher } from './jobs/questionFetcher';

async function bootstrap(): Promise<void> {
  // 1. Connect to PostgreSQL via Prisma
  await connectDB();

  // 2. Start HTTP server
  const server = app.listen(env.PORT, () => {
    logger.info(`
╔═══════════════════════════════════════════╗
║   StackQuest API Server — v1.0.0          ║
║   http://localhost:${env.PORT}                   ║
║   Swagger: http://localhost:${env.PORT}/api/docs ║
║   Env: ${env.NODE_ENV.padEnd(33)}║
╚═══════════════════════════════════════════╝
    `);
  });

  // 3. Start background question pool refresher
  startQuestionFetcher();

  // ─── Graceful shutdown ─────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received, closing gracefully...');
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Server and Prisma client closed. Goodbye! 👋');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — shutting down');
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection — shutting down');
    shutdown('unhandledRejection');
  });
}

bootstrap().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
