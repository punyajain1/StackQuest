import 'dotenv/config';
import { env } from './config/env';
import { connectDB, prisma } from './config/prisma';
import { logger } from './utils/logger';
import { httpServer, io } from './socket/socket.server';
import { registerDuelHandlers } from './socket/duel.socket';
import { registerDailyHandlers } from './socket/daily.socket';
import { startQuestionFetcher } from './jobs/questionFetcher';
import { achievementService } from './services/achievement.service';

async function bootstrap(): Promise<void> {
  // 1. Connect to PostgreSQL via Prisma
  await connectDB();

  // 2. Seed achievements table (no-op if already seeded)
  await achievementService.seedAchievements();

  // 3. Register Socket.io namespaces
  registerDuelHandlers(io.of('/duel'));
  registerDailyHandlers(io.of('/daily'));

  logger.info('✅ Socket.io namespaces registered: /duel  /daily');

  // 4. Start HTTP + WebSocket server
  const server = httpServer.listen(env.PORT, () => {
    logger.info(`
╔═══════════════════════════════════════════════════╗
║   StackQuest API Server — v2.0.0                  ║
║   HTTP  → http://localhost:${env.PORT}                   ║
║   Docs  → http://localhost:${env.PORT}/api/docs          ║
║   WS    → ws://localhost:${env.PORT}/duel                ║
║   WS    → ws://localhost:${env.PORT}/daily               ║
║   Env   : ${env.NODE_ENV.padEnd(39)}║
╚═══════════════════════════════════════════════════╝
    `);
  });

  // 5. Start background question pool refresher
  startQuestionFetcher();

  // ─── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received, closing gracefully...');
    io.close();
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
  process.on('SIGINT',  () => shutdown('SIGINT'));
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
