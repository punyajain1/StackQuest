import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { buildTagMCQ, buildCloze, buildTrueFalse, buildAnswerMCQ, findDistractorQuestions } from '../utils/questionFormatter';

function dbRowToSoQuestion(row: any): any {
  return {
    question_id: row.questionId,
    title: row.title,
    body: row.body,
    body_markdown: row.bodyMarkdown,
    tags: row.tags,
    score: row.score,
    answer_count: row.answerCount,
    accepted_answer_id: row.acceptedAnswerId,
    top_answer_body: row.topAnswerBody,
    top_answer_score: row.topAnswerScore,
    top_answer_author: row.topAnswerAuthor,
    view_count: row.viewCount,
    difficulty: row.difficulty,
    is_answered: row.isAnswered,
    creation_date: Math.floor(row.creationDate.getTime() / 1000),
    variants: (row as any).variants,
  };
}

async function populate() {
  logger.info('Starting variants population for existing questions...');
  
  const allRows = await prisma.soQuestionCache.findMany();
  const pool = allRows.map(dbRowToSoQuestion);
  
  const rowsToUpdate = allRows; // Force update all rows to update keys and distractors
  
  logger.info(`Updating all ${rowsToUpdate.length} questions in the database cache...`);
  
  let successCount = 0;
  for (const row of rowsToUpdate) {
    const question = dbRowToSoQuestion(row);
    const distractorPool = findDistractorQuestions(question, pool);
    
    const variants = {
      mcq: buildTagMCQ(question, distractorPool),
      cloze: buildCloze(question, distractorPool),
      true_false: buildTrueFalse(question, distractorPool),
      answer_mcq: buildAnswerMCQ(question, distractorPool),
    };
    
    await prisma.soQuestionCache.update({
      where: { questionId: row.questionId },
      data: { variants } as any,
    });
    
    successCount++;
    if (successCount % 10 === 0) {
      logger.info(`Progress: ${successCount}/${rowsToUpdate.length} questions updated.`);
    }
  }
  
  logger.info(`Successfully populated variants for ${successCount} questions!`);
}

populate()
  .catch(err => {
    logger.error({ err }, 'Failed to populate variants');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
