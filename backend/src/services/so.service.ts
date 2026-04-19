import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { cache } from '../utils/cache';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import type { SoQuestion, SoAnswer, Difficulty } from '../models/db.types';

// SO API custom filter that includes body_markdown
// Created via https://api.stackexchange.com/docs/create-filter
// Includes: question.body_markdown, question.title, question.tags, question.score,
//           question.answer_count, question.accepted_answer_id, question.view_count,
//           question.creation_date, question.is_answered, answer.body_markdown,
//           answer.score, answer.is_accepted, answer.owner
const SO_FILTER = '!nNPvSNVZJS';  // pre-created filter with body_markdown

interface SoApiQuestion {
  question_id: number;
  title: string;
  body: string;
  body_markdown?: string;
  tags: string[];
  score: number;
  answer_count: number;
  accepted_answer_id?: number;
  view_count: number;
  creation_date: number;
  is_answered: boolean;
}

interface SoApiAnswer {
  answer_id: number;
  question_id: number;
  score: number;
  is_accepted: boolean;
  body: string;
  body_markdown?: string;
  owner: {
    display_name: string;
    reputation: number;
  };
}

interface SoApiWrapper<T> {
  items: T[];
  has_more: boolean;
  quota_max: number;
  quota_remaining: number;
  backoff?: number;
}

function computeDifficulty(score: number): Difficulty {
  // High vote score = popular/established question, harder to guess score range
  if (score >= 100) return 'hard';
  if (score >= 10)  return 'medium';
  return 'easy';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

class StackOverflowService {
  private client: AxiosInstance;
  private lastBackoff = 0;
  private lastQuotaRemaining = Infinity;

  constructor() {
    this.client = axios.create({
      baseURL: env.SO_API_BASE,
      timeout: 15000,
      headers: {
        'User-Agent': 'StackQuest/1.0 (game app; contact via github)',
        'Accept-Encoding': 'gzip',
      },
    });

    this.client.interceptors.response.use(
      (res) => {
        const wrapper = res.data as SoApiWrapper<unknown>;
        if (wrapper.backoff) {
          this.lastBackoff = wrapper.backoff;
          logger.warn({ backoff: wrapper.backoff, quota_remaining: wrapper.quota_remaining },
            'SO API requested backoff');
        }
        if (wrapper.quota_remaining !== undefined) {
          this.lastQuotaRemaining = wrapper.quota_remaining;
        }
        if (wrapper.quota_remaining === 0) {
          throw new AppError('Stack Overflow API daily quota exhausted. Try again tomorrow.', 429, 'SO_QUOTA_EXHAUSTED');
        }
        if (wrapper.quota_remaining < 50) {
          logger.warn({ quota_remaining: wrapper.quota_remaining }, 'SO API quota running low');
        }
        return res;
      },
      (err) => Promise.reject(err)
    );
  }

  private get commonParams(): Record<string, string> {
    const params: Record<string, string> = {
      site: env.SO_SITE,
      filter: SO_FILTER,
    };
    if (env.SO_API_KEY) params.key = env.SO_API_KEY;
    return params;
  }

  private async waitIfBackoff(): Promise<void> {
    if (this.lastBackoff > 0) {
      const wait = this.lastBackoff * 1000;
      logger.info({ waitMs: wait }, 'Waiting for SO API backoff');
      await new Promise((r) => setTimeout(r, wait));
      this.lastBackoff = 0;
    }
  }

  /**
   * Fetch questions by tag from SO API, with caching.
   */
  async fetchQuestions(
    tag: string | null,
    page = 1,
    pageSize = 30,
    sort = 'votes',
    minScore = 5
  ): Promise<SoQuestion[]> {
    const cacheKey = `so:questions:${tag ?? 'all'}:${page}:${sort}`;
    const cached = cache.get<SoQuestion[]>(cacheKey);
    if (cached) return cached;

    await this.waitIfBackoff();

    // Guard: don't burn remaining quota if it's already at 0
    if (this.lastQuotaRemaining === 0) {
      throw new AppError('Stack Overflow API daily quota exhausted. Cannot fetch new questions.', 429, 'SO_QUOTA_EXHAUSTED');
    }

    const params: Record<string, string | number> = {
      ...this.commonParams,
      page,
      pagesize: pageSize,  // caller should pass 100 for cron bulk fetches
      sort,
      order: 'desc',
      min: minScore,
      // Note: 'answers: 1' is not a valid SO API param — filter out unanswered in DB layer
    };
    if (tag) params.tagged = tag;

    try {
      const { data } = await this.client.get<SoApiWrapper<SoApiQuestion>>(
        '/questions',
        { params }
      );

      const questions: SoQuestion[] = data.items.map((q) => ({
        question_id: q.question_id,
        title: q.title,
        body: q.body ?? '',
        body_markdown: q.body_markdown ?? stripHtml(q.body ?? ''),
        tags: q.tags,
        score: q.score,
        answer_count: q.answer_count,
        accepted_answer_id: q.accepted_answer_id ?? null,
        top_answer_text: null,
        top_answer_score: null,
        view_count: q.view_count,
        difficulty: computeDifficulty(q.score),
        is_answered: q.is_answered,
        creation_date: q.creation_date,
      }));

      cache.set(cacheKey, questions, env.CACHE_TTL_SECONDS);
      return questions;
    } catch (err) {
      logger.error({ err, tag, page }, 'SO API fetchQuestions failed');
      throw new AppError('Failed to fetch questions from Stack Overflow', 502, 'SO_API_ERROR');
    }
  }

  /**
   * Fetch answers for a specific question, with caching.
   */
  async fetchAnswers(questionId: number): Promise<SoAnswer[]> {
    const cacheKey = `so:answers:${questionId}`;
    const cached = cache.get<SoAnswer[]>(cacheKey);
    if (cached) return cached;

    await this.waitIfBackoff();

    try {
      const { data } = await this.client.get<SoApiWrapper<SoApiAnswer>>(
        `/questions/${questionId}/answers`,
        {
          params: {
            ...this.commonParams,
            sort: 'votes',
            order: 'desc',
            pagesize: 5,
          },
        }
      );

      const answers: SoAnswer[] = data.items.map((a) => ({
        answer_id: a.answer_id,
        question_id: a.question_id,
        score: a.score,
        is_accepted: a.is_accepted,
        body: a.body ?? '',
        body_markdown: a.body_markdown ?? stripHtml(a.body ?? ''),
        owner: {
          display_name: a.owner?.display_name ?? 'Anonymous',
          reputation: a.owner?.reputation ?? 0,
        },
      }));

      cache.set(cacheKey, answers, env.CACHE_TTL_SECONDS);
      return answers;
    } catch (err) {
      logger.error({ err, questionId }, 'SO API fetchAnswers failed');
      throw new AppError('Failed to fetch answers from Stack Overflow', 502, 'SO_API_ERROR');
    }
  }

  /**
   * Bulk-fetch top answers for multiple questions in a SINGLE API call.
   * Uses SO's semicolon-batching: /questions/1;2;3/answers (up to 100 IDs).
   * Returns a Map<questionId, SoAnswer> with the best answer per question.
   * This is the quota-efficient way to enrich a batch of questions.
   */
  async fetchAnswersBulk(questionIds: number[]): Promise<Map<number, SoAnswer>> {
    if (!questionIds.length) return new Map();

    // Chunk into batches of 100 (SO API limit per vectorized request)
    const result = new Map<number, SoAnswer>();
    const chunks: number[][] = [];
    for (let i = 0; i < questionIds.length; i += 100) {
      chunks.push(questionIds.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      await this.waitIfBackoff();
      const ids = chunk.join(';');
      const cacheKey = `so:answers_bulk:${ids}`;
      const cached = cache.get<SoAnswer[]>(cacheKey);

      let answers: SoAnswer[];
      if (cached) {
        answers = cached;
      } else {
        try {
          const { data } = await this.client.get<SoApiWrapper<SoApiAnswer>>(
            `/questions/${ids}/answers`,
            {
              params: {
                ...this.commonParams,
                sort: 'votes',
                order: 'desc',
                pagesize: 100,
              },
            }
          );
          answers = data.items.map((a) => ({
            answer_id: a.answer_id,
            question_id: a.question_id,
            score: a.score,
            is_accepted: a.is_accepted,
            body: a.body ?? '',
            body_markdown: a.body_markdown ?? stripHtml(a.body ?? ''),
            owner: {
              display_name: a.owner?.display_name ?? 'Anonymous',
              reputation: a.owner?.reputation ?? 0,
            },
          }));
          cache.set(cacheKey, answers, env.CACHE_TTL_SECONDS);
        } catch (err) {
          logger.error({ err, chunk }, 'SO API fetchAnswersBulk failed');
          continue; // Don't block the entire batch on one chunk failure
        }
      }

      // Keep only the best answer per question (accepted > highest score)
      for (const answer of answers) {
        const existing = result.get(answer.question_id);
        if (!existing ||
            (answer.is_accepted && !existing.is_accepted) ||
            (!existing.is_accepted && answer.score > existing.score)) {
          result.set(answer.question_id, answer);
        }
      }
    }

    return result;
  }

  /**
   * Fetch a single question with its top answer pre-loaded.
   */
  async fetchQuestionWithTopAnswer(questionId: number): Promise<SoQuestion> {
    const cacheKey = `so:question_full:${questionId}`;
    const cached = cache.get<SoQuestion>(cacheKey);
    if (cached) return cached;

    const answers = await this.fetchAnswers(questionId);
    const topAnswer = answers.sort(
      (a, b) => (b.is_accepted ? 1 : 0) - (a.is_accepted ? 1 : 0) || b.score - a.score
    )[0];

    // Get base question from cache or fetch directly
    const { data } = await this.client.get<SoApiWrapper<SoApiQuestion>>(
      `/questions/${questionId}`,
      { params: this.commonParams }
    );

    if (!data.items.length) throw AppError.notFound('Question not found on SO');
    const q = data.items[0];

    const question: SoQuestion = {
      question_id: q.question_id,
      title: q.title,
      body: q.body ?? '',
      body_markdown: q.body_markdown ?? stripHtml(q.body ?? ''),
      tags: q.tags,
      score: q.score,
      answer_count: q.answer_count,
      accepted_answer_id: q.accepted_answer_id ?? null,
      top_answer_text: topAnswer?.body_markdown ?? null,
      top_answer_score: topAnswer?.score ?? null,
      view_count: q.view_count,
      difficulty: computeDifficulty(q.score),
      is_answered: q.is_answered,
      creation_date: q.creation_date,
    };

    cache.set(cacheKey, question, env.CACHE_TTL_SECONDS);
    return question;
  }

  /**
   * Get quota status (for monitoring).
   */
  async getQuotaStatus(): Promise<{ quota_max: number; quota_remaining: number }> {
    const { data } = await this.client.get<SoApiWrapper<unknown>>('/info', {
      params: this.commonParams,
    });
    return {
      quota_max: data.quota_max,
      quota_remaining: data.quota_remaining,
    };
  }
}

export const soService = new StackOverflowService();
