import { prisma } from '../config/prisma';
import { soService } from './so.service';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import type { SoQuestionCache, Difficulty } from '../../generated/prisma';
import type { SoQuestion, CategoryStats } from '../models/db.types';
import { Prisma } from '../../generated/prisma';

// Tags we actively maintain in our local question pool
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
    top_answer_text: row.topAnswerText,
    top_answer_score: row.topAnswerScore,
    view_count: row.viewCount,
    difficulty: row.difficulty,
    is_answered: row.isAnswered,
    creation_date: Math.floor(row.creationDate.getTime() / 1000),
  };
}

export class QuestionService {
  /**
   * Get a random question from the local DB pool using Prisma.
   * Takes a sample of candidates and shuffles in app code (no RANDOM() raw SQL).
   */
  async getNextQuestion(opts: {
    tag?: string | null;
    difficulty?: Difficulty;
    excludeIds?: number[];
    mode?: string;
  }): Promise<SoQuestion> {
    const { tag, difficulty, excludeIds = [], mode } = opts;

    // Build Prisma where clause
    const where: Prisma.SoQuestionCacheWhereInput = {
      isAnswered: true,
      ...(tag ? { tags: { has: tag } } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(mode === 'answer_arena' ? { topAnswerText: { not: null } } : {}),
      ...(excludeIds.length > 0 ? { questionId: { notIn: excludeIds } } : {}),
    };

    // Fetch a pool of candidates then pick randomly in JS
    const candidates = await prisma.soQuestionCache.findMany({
      where,
      take: 30,
      orderBy: { lastFetched: 'desc' },
    });

    if (!candidates.length) {
      // Fallback: fetch fresh from SO API
      logger.info({ tag, difficulty }, 'DB question pool empty for filter, fetching from SO API');
      const fresh = await soService.fetchQuestions(tag ?? null, 1, 30);
      const available = fresh.filter((q) => !excludeIds.includes(q.question_id));
      if (!available.length) throw AppError.notFound('No questions available');

      const picked = available[Math.floor(Math.random() * available.length)];
      if (mode === 'answer_arena' && !picked.top_answer_text) {
        return this.enrichWithTopAnswer(picked);
      }
      return picked;
    }

    const row = candidates[Math.floor(Math.random() * candidates.length)];
    return dbRowToSoQuestion(row);
  }

  /** Enrich a question with its top answer from SO API. */
  async enrichWithTopAnswer(question: SoQuestion): Promise<SoQuestion> {
    try {
      const answers = await soService.fetchAnswers(question.question_id);
      const top = answers.sort(
        (a, b) => (b.is_accepted ? 1 : 0) - (a.is_accepted ? 1 : 0) || b.score - a.score
      )[0];
      return { ...question, top_answer_text: top?.body_markdown ?? null, top_answer_score: top?.score ?? null };
    } catch {
      return question;
    }
  }

  /** Upsert questions into the local cache DB using Prisma. */
  async cacheQuestions(questions: SoQuestion[]): Promise<void> {
    await Promise.all(
      questions.map((q) =>
        prisma.soQuestionCache.upsert({
          where: { questionId: q.question_id },
          create: {
            questionId: q.question_id,
            title: q.title,
            body: q.body,
            bodyMarkdown: q.body_markdown,
            tags: q.tags,
            score: q.score,
            answerCount: q.answer_count,
            acceptedAnswerId: q.accepted_answer_id,
            topAnswerText: q.top_answer_text,
            topAnswerScore: q.top_answer_score,
            viewCount: q.view_count,
            difficulty: q.difficulty,
            isAnswered: q.is_answered,
            creationDate: new Date(q.creation_date * 1000),
          },
          update: {
            score: q.score,
            answerCount: q.answer_count,
            topAnswerText: q.top_answer_text ?? undefined,
            difficulty: q.difficulty,
            lastFetched: new Date(),
          },
        })
      )
    );
    logger.info({ count: questions.length }, 'Questions cached to DB via Prisma');
  }

  /** Get question count + avg score per tag for the categories endpoint. */
  async getCategoryStats(): Promise<CategoryStats[]> {
    // UNNEST on arrays requires raw SQL — Prisma groupBy doesn't support it
    const rows = await prisma.$queryRaw<Array<{ tag: string; count: bigint; avg_score: number }>>`
      SELECT
        UNNEST(tags) AS tag,
        COUNT(*)::bigint AS count,
        ROUND(AVG(score)::numeric, 1)::float AS avg_score
      FROM so_question_cache
      GROUP BY tag
      ORDER BY count DESC
      LIMIT 50
    `;
    return rows.map((r) => ({
      tag: r.tag,
      count: Number(r.count),
      avg_score: r.avg_score,
    }));
  }

  /** Get today's daily challenge (10 questions). Creates one if missing. */
  async getDailyChallenge(): Promise<SoQuestion[]> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const existing = await prisma.dailyChallenge.findUnique({
      where: { date: today },
    });

    let ids: number[];
    if (existing) {
      ids = existing.questionIds;
    } else {
      // Pick 10 random answered questions with top answer text
      const rows = await prisma.$queryRaw<Array<{ question_id: number }>>`
        SELECT question_id FROM so_question_cache
        WHERE is_answered = TRUE AND top_answer_text IS NOT NULL
        ORDER BY RANDOM() LIMIT 10
      `;
      ids = rows.map((r) => r.question_id);

      await prisma.dailyChallenge.upsert({
        where: { date: today },
        create: { date: today, questionIds: ids },
        update: {},
      });
    }

    const rows = await prisma.soQuestionCache.findMany({
      where: { questionId: { in: ids } },
    });

    return rows.map(dbRowToSoQuestion);
  }
}

export const questionService = new QuestionService();
