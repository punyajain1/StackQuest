import 'dotenv/config';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../../generated/prisma';
import { env } from './env';
import { logger } from '../utils/logger';
import ws from 'ws';

// Neon serverless requires a WebSocket constructor in Node.js environments
neonConfig.webSocketConstructor = ws;

// ─── Singleton pattern prevents multiple connections during hot-reload ───────
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  // PrismaNeon manages the pool internally — pass PoolConfig, not a Pool instance
  const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [{ emit: 'event', level: 'error' }],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Log queries in development
if (env.NODE_ENV === 'development') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (prisma as any).$on('query', (e: { query: string; duration: number }) => {
    logger.debug({ query: e.query, duration: `${e.duration}ms` }, 'Prisma query');
  });
}

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** Connect and verify the database is reachable. */
export async function connectDB(): Promise<void> {
  await prisma.$connect();
  logger.info('✅ PostgreSQL connected via Prisma + Neon');
}

export type { PrismaClient };
