import cron from 'node-cron';
import { soService } from '../services/so.service';
import { questionService, SUPPORTED_TAGS } from '../services/question.service';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { env } from '../config/env';

async function refreshQuestionPool(): Promise<void> {
  logger.info('🔄 Hourly question pool refresh starting...');

  // 1. Find all tags and their current counts
  const tagCounts = await Promise.all(
    SUPPORTED_TAGS.map(async (tag) => {
      const count = await prisma.soQuestionCache.count({ where: { tags: { has: tag } } });
      return { tag, count };
    })
  );

  const lackingTags = tagCounts.filter(t => t.count < env.QUESTION_POOL_MIN);

  let targetTag: string;
  let fetchPage = 1;

  if (lackingTags.length > 0) {
    lackingTags.sort((a, b) => a.count - b.count);
    targetTag = lackingTags[0].tag;
    fetchPage = Math.floor(lackingTags[0].count / 100) + 1;
    logger.info({ tag: targetTag, currentCount: lackingTags[0].count, needed: env.QUESTION_POOL_MIN }, 'Tag pool starving, fetching 100 questions');
  } else {
    targetTag = SUPPORTED_TAGS[Math.floor(Math.random() * SUPPORTED_TAGS.length)];
    logger.info({ tag: targetTag }, 'All tag pools healthy. Refreshing random tag for staleness');
  }

  let totalFetched = 0;
  let totalCached = 0;

  try {
    // 2. Fetch questions WITH answers in 2 API calls (questions + bulk answers)
    const enriched = await soService.fetchQuestionsWithAnswers(targetTag, fetchPage, 100, 'votes', 1);
    totalFetched += enriched.length;

    // 3. Cache them into our DB pool
    await questionService.cacheQuestions(enriched);
    totalCached += enriched.length;

  } catch (err) {
    logger.error({ err, tag: targetTag }, 'Failed to refresh hourly pool for tag');
  }

  // 4. Prune stale entries older than 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { count: pruned } = await prisma.soQuestionCache.deleteMany({
    where: { lastFetched: { lt: sevenDaysAgo } },
  });

  logger.info({ totalFetched, totalCached, pruned }, '✅ Hourly question pool refresh complete');
}

export function startQuestionFetcher(): void {
  const cronExpression = `0 * * * *`;

  logger.info('Starting strict hourly question pool fetcher cron job (100/hr)');

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
