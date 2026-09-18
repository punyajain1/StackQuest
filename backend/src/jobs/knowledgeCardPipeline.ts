import cron from 'node-cron';
import { soService } from '../services/so.service';
import { groqService } from '../services/groq.service';
import { cleanHtml } from '../utils/htmlCleaner';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { SUPPORTED_TAGS } from '../services/question.service';

const BATCH_SIZE = 5; // Send 5 questions per bulk LLM request
const FETCH_SIZE = 100;

class KnowledgeCardPipeline {
  async runForTag(tag: string, page = 1) {
    logger.info({ tag, page }, 'Starting KnowledgeCard Pipeline');
    try {
      // 1. Fetch from SO
      const questions = await soService.fetchQuestions(tag, page, FETCH_SIZE, 'votes', 50);
      
      // 2. Filter out already processed questions
      const existingCards = await prisma.knowledgeCard.findMany({
        where: { sourceQuestionId: { in: questions.map(q => q.question_id) } },
        select: { sourceQuestionId: true }
      });
      const existingIds = new Set(existingCards.map(c => c.sourceQuestionId));
      
      const newQuestions = questions.filter(
        q => q.is_answered && q.accepted_answer_id && q.score >= 50 && !existingIds.has(q.question_id)
      );

      if (newQuestions.length === 0) {
        logger.info({ tag }, 'No new eligible questions found in this batch');
        return;
      }

      logger.info({ tag, count: newQuestions.length }, 'Found new questions to process');

      // 3. Batching
      for (let i = 0; i < newQuestions.length; i += BATCH_SIZE) {
        const batch = newQuestions.slice(i, i + BATCH_SIZE);
        logger.info({ tag, batchNumber: Math.floor(i / BATCH_SIZE) + 1 }, 'Processing batch');

        // Fetch accepted answers for the batch
        const answerMap = await soService.fetchAnswersBulk(batch.map(q => q.question_id));

        // Build bulk request items
        const bulkItems = [];
        for (const q of batch) {
          const acceptedAnswer = answerMap.get(q.question_id);
          if (!acceptedAnswer) continue;
          
          bulkItems.push({
            id: String(q.question_id),
            title: q.title,
            questionBody: cleanHtml(q.body),
            answerBody: cleanHtml(acceptedAnswer.body),
            answerId: acceptedAnswer.answer_id,
          });
        }

        if (bulkItems.length === 0) continue;

        try {
          // 5. Bulk LLM Generation
          const bulkResponse = await groqService.generateKnowledgeCardsBulk(tag, bulkItems);
          
          if (bulkResponse && bulkResponse.cards && Array.isArray(bulkResponse.cards)) {
            let successCount = 0;
            // 6. Store
            for (const generatedCard of bulkResponse.cards) {
              const originalItem = bulkItems.find(item => item.id === generatedCard.source_id);
              if (!originalItem) continue;

              await prisma.knowledgeCard.create({
                data: {
                  sourceQuestionId: parseInt(originalItem.id),
                  sourceAnswerId: originalItem.answerId,
                  topic: tag,
                  concept: generatedCard.concept,
                  difficulty: generatedCard.difficulty?.toLowerCase() || 'medium',
                  summary: generatedCard.summary,
                  questions: generatedCard.questions,
                }
              });
              successCount++;
            }
            logger.info({ tag, successCount }, 'Bulk batch complete');
          } else {
            logger.error({ tag }, 'Bulk response was missing the cards array');
          }
        } catch (error) {
          logger.error({ error, tag }, 'Failed to process bulk batch');
        }
        
        // Delay between batches (62 seconds) to respect the 1000 Output Tokens Per Minute rate limit
        await new Promise(r => setTimeout(r, 62000));
      }
    } catch (error) {
      logger.error({ error, tag }, 'Pipeline failed');
    }
  }
}

export const knowledgeCardPipeline = new KnowledgeCardPipeline();

export function startKnowledgeCardPipeline(): void {
  // Run once a day at midnight
  const cronExpression = `0 0 * * *`;

  logger.info('Starting strict knowledge card pipeline cron job (once a day)');

  cron.schedule(cronExpression, async () => {
    logger.info('Daily pipeline run started');
    for (const tag of SUPPORTED_TAGS) {
      try {
        await knowledgeCardPipeline.runForTag(tag);
        // Delay between tags to avoid hitting rate limits too hard
        await new Promise(r => setTimeout(r, 5000));
      } catch (err) {
        logger.error({ err, tag }, 'Scheduled pipeline run failed for tag');
      }
    }
    logger.info('Daily pipeline run completed for all tags');
  });
}
