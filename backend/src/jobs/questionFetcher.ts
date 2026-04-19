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
    // Pick the most starving tag (lowest count)
    lackingTags.sort((a, b) => a.count - b.count);
    targetTag = lackingTags[0].tag;
    fetchPage = Math.floor(lackingTags[0].count / 100) + 1;
    logger.info({ tag: targetTag, currentCount: lackingTags[0].count, needed: env.QUESTION_POOL_MIN }, 'Tag pool starving, fetching 100 questions');
  } else {
    // All tags are healthy! Pick a random tag to refresh its most popular 100 questions
    targetTag = SUPPORTED_TAGS[Math.floor(Math.random() * SUPPORTED_TAGS.length)];
    logger.info({ tag: targetTag }, 'All tag pools healthy. Refreshing random tag for staleness');
  }

  let totalFetched = 0;
  let totalCached = 0;

  try {
    // 2. Fetch exactly one page of 100 questions (minimizes API calls to exactly 1 request for questions)
    const questions = await soService.fetchQuestions(targetTag, fetchPage, 100, 'votes', 1);
    totalFetched += questions.length;

    // 3. Bulk-fetch top answers for ALL 100 questions in ONE API call using vectorized IDs.
    // This ensures these questions have `top_answer_text` populated so they seamlessly work
    // in all game modes (answer_arena, judge, score_guesser, etc.)
    const needsAnswer = questions.filter((q) => !q.top_answer_text && q.accepted_answer_id);
    const bulkAnswers = await soService.fetchAnswersBulk(
      needsAnswer.map((q) => q.question_id)
    );

    const enriched = questions.map((q) => {
      const topAnswer = bulkAnswers.get(q.question_id);
      if (topAnswer) {
        return { ...q, top_answer_text: topAnswer.body_markdown, top_answer_score: topAnswer.score };
      }
      return q;
    });

    // 4. Cache them into our DB pool
    await questionService.cacheQuestions(enriched);
    totalCached += enriched.length;

  } catch (err) {
    logger.error({ err, tag: targetTag }, 'Failed to refresh hourly pool for tag');
  }

  // 5. Prune stale entries older than 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { count: pruned } = await prisma.soQuestionCache.deleteMany({
    where: { lastFetched: { lt: sevenDaysAgo } },
  });

  logger.info({ totalFetched, totalCached, pruned }, '✅ Hourly question pool refresh complete');
}

export function startQuestionFetcher(): void {
  // Always run strictly hourly to prevent quota exhaustion (100 questions/hr)
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
