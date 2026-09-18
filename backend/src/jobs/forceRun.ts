import { knowledgeCardPipeline } from './knowledgeCardPipeline';
import { SUPPORTED_TAGS } from '../services/question.service';
import { logger } from '../utils/logger';

async function main() {
  logger.info('Starting manual force run of the knowledge card pipeline...');
  for (const tag of SUPPORTED_TAGS) {
    try {
      await knowledgeCardPipeline.runForTag(tag);
      // Delay between tags to avoid hitting rate limits too hard
      await new Promise(r => setTimeout(r, 5000));
    } catch (err) {
      logger.error({ err, tag }, 'Force run failed for tag');
    }
  }
  logger.info('Manual force run completed!');
  process.exit(0);
}

main();
