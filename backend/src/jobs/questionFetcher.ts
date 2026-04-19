import cron from 'node-cron';
import { soService } from '../services/so.service';
import { questionService, SUPPORTED_TAGS } from '../services/question.service';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { env } from '../config/env';

async function refreshQuestionPool(): Promise<void> {
  logger.info('🔄 Question pool refresh starting...');

  let totalFetched = 0;
  let totalCached = 0;

  for (const tag of SUPPORTED_TAGS) {
    try {
      const currentCount = await prisma.soQuestionCache.count({
        where: { tags: { has: tag } },
      });

      if (currentCount >= env.QUESTION_POOL_MIN) {
        logger.debug({ tag, currentCount }, 'Tag pool sufficient, skipping');
        continue;
      }

      logger.info({ tag, currentCount, needed: env.QUESTION_POOL_MIN }, 'Fetching for tag');

      const pages = Math.ceil((env.QUESTION_POOL_MIN - currentCount) / 30);
      for (let page = 1; page <= Math.min(pages, 5); page++) {
        const questions = await soService.fetchQuestions(tag, page, 30, 'votes', 1);
        totalFetched += questions.length;

        const enriched = await Promise.all(
          questions.map(async (q) => {
            if (!q.top_answer_text && q.accepted_answer_id) {
              return questionService.enrichWithTopAnswer(q);
            }
            return q;
          })
        );

        await questionService.cacheQuestions(enriched);
        totalCached += enriched.length;

        // Respect SO API backoff
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      logger.error({ err, tag }, 'Failed to refresh pool for tag');
    }
  }

  // Prune stale entries older than 7 days using Prisma
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { count: pruned } = await prisma.soQuestionCache.deleteMany({
    where: { lastFetched: { lt: sevenDaysAgo } },
  });

  logger.info({ totalFetched, totalCached, pruned }, '✅ Question pool refresh complete');
}

export function startQuestionFetcher(): void {
  const intervalHours = env.QUESTION_POOL_REFRESH_HOURS;
  const cronExpression = `0 */${intervalHours} * * *`;

  logger.info({ intervalHours }, 'Starting question pool fetcher cron job');

  // Run once immediately on startup
  refreshQuestionPool().catch((err) =>
    logger.error({ err }, 'Initial question pool refresh failed')
  );

  cron.schedule(cronExpression, () => {
    refreshQuestionPool().catch((err) =>
      logger.error({ err }, 'Scheduled question pool refresh failed')
    );
  });
}
