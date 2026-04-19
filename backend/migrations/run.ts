/**
 * @deprecated
 * Manual SQL migrations have been replaced by Prisma Migrate.
 *
 * Use these commands instead:
 *   npm run db:push      — push schema changes without migration history (dev)
 *   npm run db:migrate   — create and apply a new migration (prod-ready)
 *   npm run db:studio    — open Prisma Studio GUI
 *   npm run db:reset     — drop and recreate the database
 *
 * The SQL files in this directory are kept for reference only.
 */

import { logger } from '../src/utils/logger';

logger.warn(
  'migrations/run.ts is deprecated. Use `npm run db:migrate` (Prisma Migrate) instead.'
);
process.exit(0);
