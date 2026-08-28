import { prisma } from '../config/prisma';
import { soService } from './so.service';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import type { SoQuestionCache, Difficulty } from '../../generated/prisma';
import type { SoQuestion, CategoryStats } from '../models/db.types';
import { Prisma } from '../../generated/prisma';

import { buildTagMCQ, buildCloze, buildTrueFalse, buildAnswerMCQ, findDistractorQuestions } from '../utils/questionFormatter';

export const SUPPORTED_TAGS = [
  'javascript', 'python', 'java', 'c#', 'c++', 'php',
  'typescript', 'react', 'node.js', 'css', 'html',
  'sql', 'mongodb', 'docker', 'git', 'linux', 'bash',
  'regex', 'algorithms', 'data-structures', 'swift',
  'kotlin', 'rust', 'go', 'ruby', 'angular', 'vue.js',
];

function dbRowToSoQuestion(row: SoQuestionCache): SoQuestion {
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

export class QuestionService {
  async getNextQuestion(opts: {
    tag?: string | null;
    difficulty?: Difficulty;
    excludeIds?: number[];
    requireAnswer?: boolean;
  }): Promise<SoQuestion> {
    const { tag, difficulty, excludeIds = [], requireAnswer = false } = opts;
    const where: Prisma.SoQuestionCacheWhereInput = {
      isAnswered: true,
      ...(tag ? { tags: { has: tag } } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(requireAnswer ? { topAnswerBody: { not: null } } : {}),
      ...(excludeIds.length > 0 ? { questionId: { notIn: excludeIds } } : {}),
    };
    const candidates = await prisma.soQuestionCache.findMany({ where, take: 30, orderBy: { lastFetched: 'desc' } });
    if (!candidates.length) {
      const fresh = await soService.fetchQuestionsWithAnswers(tag ?? null, 1, 30);
      const available = fresh.filter((q) => !excludeIds.includes(q.question_id));
      if (!available.length) throw AppError.notFound('No questions available');
      return available[Math.floor(Math.random() * available.length)];
    }
    return dbRowToSoQuestion(candidates[Math.floor(Math.random() * candidates.length)]);
  }

  async getQuestionsForDuel(count: number, excludeIds: number[] = []): Promise<SoQuestion[]> {
    const where: Prisma.SoQuestionCacheWhereInput = {
      isAnswered: true, topAnswerBody: { not: null },
      ...(excludeIds.length > 0 ? { questionId: { notIn: excludeIds } } : {}),
    };
    const candidates = await prisma.soQuestionCache.findMany({ where, take: count * 3, orderBy: { lastFetched: 'desc' } });
    if (candidates.length < count) {
      const fresh = await soService.fetchQuestionsWithAnswers(null, 1, 100);
      await this.cacheQuestions(fresh);
      const all = [...candidates.map(dbRowToSoQuestion), ...fresh.filter((q) => q.top_answer_body)];
      const unique = all.filter((q, i, arr) => arr.findIndex((x) => x.question_id === q.question_id) === i && !excludeIds.includes(q.question_id));
      return this.shuffle(unique).slice(0, count);
    }
    return this.shuffle(candidates.map(dbRowToSoQuestion)).slice(0, count);
  }

  async getQuestionsForPuzzle(tag: string | null, difficulty: Difficulty | null, count: number, excludeIds: number[] = []): Promise<SoQuestion[]> {
    const where: Prisma.SoQuestionCacheWhereInput = {
      isAnswered: true, topAnswerBody: { not: null },
      ...(tag ? { tags: { has: tag } } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(excludeIds.length > 0 ? { questionId: { notIn: excludeIds } } : {}),
    };
    const candidates = await prisma.soQuestionCache.findMany({ where, take: count * 3, orderBy: { lastFetched: 'desc' } });
    if (candidates.length < count) {
      const fresh = await soService.fetchQuestionsWithAnswers(tag, 1, 100);
      await this.cacheQuestions(fresh);
      const all = [...candidates.map(dbRowToSoQuestion), ...fresh.filter((q) => q.top_answer_body)];
      const unique = all.filter((q, i, arr) => arr.findIndex((x) => x.question_id === q.question_id) === i && !excludeIds.includes(q.question_id));
      return this.shuffle(unique).slice(0, count);
    }
    return this.shuffle(candidates.map(dbRowToSoQuestion)).slice(0, count);
  }

  async enrichWithTopAnswer(question: SoQuestion): Promise<SoQuestion> {
    try {
      const answers = await soService.fetchAnswers(question.question_id);
      const top = answers.sort((a, b) => (b.is_accepted ? 1 : 0) - (a.is_accepted ? 1 : 0) || b.score - a.score)[0];
      return { ...question, top_answer_body: top?.body_markdown ?? null, top_answer_score: top?.score ?? null, top_answer_author: top?.owner.display_name ?? null };
    } catch { return question; }
  }

  async cacheQuestions(questions: SoQuestion[]): Promise<void> {
    const data = questions.map((q) => ({
      questionId: q.question_id,
      title: q.title,
      body: q.body,
      bodyMarkdown: q.body_markdown,
      tags: q.tags,
      score: q.score,
      answerCount: q.answer_count,
      acceptedAnswerId: q.accepted_answer_id,
      topAnswerBody: q.top_answer_body,
      topAnswerScore: q.top_answer_score,
      topAnswerAuthor: q.top_answer_author,
      viewCount: q.view_count,
      difficulty: q.difficulty,
      isAnswered: q.is_answered,
      creationDate: new Date(q.creation_date * 1000),
    }));

    await prisma.soQuestionCache.createMany({
      data,
      skipDuplicates: true,
    });
    logger.info({ count: questions.length }, 'Questions cached to DB');

    // Pre-generate MCQ variants and update them in database
    const cachedRows = await prisma.soQuestionCache.findMany({
      where: { questionId: { in: questions.map((q) => q.question_id) } }
    });

    for (const row of cachedRows) {
      const question = dbRowToSoQuestion(row);
      // Construct distractor pool from all cached questions
      const pool = cachedRows.map(dbRowToSoQuestion);
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
    }
    logger.info({ count: questions.length }, 'Variants pre-generated and saved to DB');
  }

  async getCategoryStats(): Promise<CategoryStats[]> {
    const rows = await prisma.$queryRaw<Array<{ tag: string; count: bigint; avg_score: number }>>`
      SELECT UNNEST(tags) AS tag, COUNT(*)::bigint AS count, ROUND(AVG(score)::numeric, 1)::float AS avg_score
      FROM so_question_cache GROUP BY tag ORDER BY count DESC LIMIT 50`;
    return rows.map((r) => ({ tag: r.tag, count: Number(r.count), avg_score: r.avg_score }));
  }

  async getDailyChallenge(): Promise<SoQuestion[]> {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const existing = await prisma.dailyChallenge.findUnique({ where: { date: today } });
    let ids: number[];
    if (existing) { ids = existing.questionIds; }
    else {
      const todayStr = today.toISOString().slice(0, 10); // "2026-05-23"
      const rows = await prisma.$queryRaw<Array<{ question_id: number }>>`
        SELECT question_id FROM so_question_cache
        WHERE is_answered = TRUE AND top_answer_body IS NOT NULL
        ORDER BY md5(question_id::text || ${todayStr})
        LIMIT 10`;
      ids = rows.map((r) => r.question_id);
      await prisma.dailyChallenge.upsert({ where: { date: today }, create: { date: today, questionIds: ids }, update: {} });
    }
    const rows = await prisma.soQuestionCache.findMany({ where: { questionId: { in: ids } } });
    return rows.map(dbRowToSoQuestion);
  }

  private shuffle<T>(arr: T[]): T[] {
    return arr.map((v) => ({ v, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ v }) => v);
  }
}

export const questionService = new QuestionService();
