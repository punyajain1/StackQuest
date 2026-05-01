import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { cache } from '../utils/cache';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import type { SoQuestion, SoAnswer, Difficulty } from '../models/db.types';

// ─── Constants ────────────────────────────────────────────────────────────────
const QUOTA_CACHE_KEY = 'so:quota_remaining';

/**
 * Custom SO filter that returns:
 *   question: question_id, title, body, body_markdown, tags, score,
 *             answer_count, accepted_answer_id, view_count, creation_date,
 *             is_answered, owner
 *   answer:   answer_id, question_id, body, body_markdown, score,
 *             is_accepted, owner
 *   owner:    display_name, reputation
 *
 * Created via GET /filters/create with these includes.
 * This is a safe (sanitized HTML) filter.
 *
 * The filter below was pre-created. If it ever becomes invalid we fall back
 * to 'withbody' and lose body_markdown on answers.
 */
const CUSTOM_FILTER = '!6WPIomnJQl0me'; // pre-created filter including body_markdown

/** Fallback filter if custom filter fails */
const FALLBACK_FILTER = 'withbody';

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
  owner?: { display_name?: string; reputation?: number };
}

interface SoApiAnswer {
  answer_id: number;
  question_id: number;
  score: number;
  is_accepted: boolean;
  body: string;
  body_markdown?: string;
  owner?: { display_name?: string; reputation?: number };
}

interface SoApiWrapper<T> {
  items: T[];
  has_more: boolean;
  quota_max: number;
  quota_remaining: number;
  backoff?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeDifficulty(score: number): Difficulty {
  if (score >= 500) return 'hard';
  if (score >= 50) return 'medium';
  return 'easy';
}

function mapQuestion(q: SoApiQuestion): SoQuestion {
  return {
    question_id: q.question_id,
    title: q.title,
    body: q.body ?? '',
    body_markdown: q.body_markdown ?? '',
    tags: q.tags ?? [],
    score: q.score,
    answer_count: q.answer_count,
    accepted_answer_id: q.accepted_answer_id ?? null,
    top_answer_body: null,
    top_answer_score: null,
    top_answer_author: null,
    view_count: q.view_count,
    difficulty: computeDifficulty(q.score),
    is_answered: q.is_answered,
    creation_date: q.creation_date,
    owner_display_name: q.owner?.display_name,
  };
}

function mapAnswer(a: SoApiAnswer): SoAnswer {
  return {
    answer_id: a.answer_id,
    question_id: a.question_id,
    score: a.score,
    is_accepted: a.is_accepted,
    body: a.body ?? '',
    body_markdown: a.body_markdown ?? '',
    owner: {
      display_name: a.owner?.display_name ?? 'Anonymous',
      reputation: a.owner?.reputation ?? 0,
    },
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

class StackOverflowService {
  private client: AxiosInstance;
  private lastBackoffUntil = 0;
  private activeFilter = CUSTOM_FILTER;

  constructor() {
    this.client = axios.create({
      baseURL: env.SO_API_BASE,
      timeout: 15000,
      headers: {
        'Accept-Encoding': 'gzip',
        'User-Agent': 'StackQuest/2.0 (game; contact via github)',
      },
    });

    // Intercept responses: honour backoff + track quota
    this.client.interceptors.response.use((res) => {
      const w = res.data as SoApiWrapper<unknown>;

      if (typeof w.quota_remaining === 'number') {
        cache.set(QUOTA_CACHE_KEY, w.quota_remaining, 3600);
        if (w.quota_remaining < 20) {
          logger.warn({ quota_remaining: w.quota_remaining }, '⚠️  SO API quota critically low');
        }
      }

      if (w.backoff) {
        this.lastBackoffUntil = Date.now() + w.backoff * 1000;
        logger.warn({ backoff: w.backoff }, '⏳ SO API backoff requested');
      }

      if (w.quota_remaining === 0) {
        throw new AppError('Stack Overflow daily quota exhausted', 429, 'SO_QUOTA_EXHAUSTED');
      }

      return res;
    }, (err) => Promise.reject(err));
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private get baseParams(): Record<string, string> {
    const p: Record<string, string> = { site: env.SO_SITE, filter: this.activeFilter };
    if (env.SO_API_KEY) p.key = env.SO_API_KEY;
    return p;
  }

  private async waitBackoff(): Promise<void> {
    const wait = this.lastBackoffUntil - Date.now();
    if (wait > 0) {
      logger.info({ waitMs: wait }, 'Waiting for SO API backoff...');
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  private async get<T>(path: string, params: Record<string, unknown>): Promise<SoApiWrapper<T>> {
    await this.waitBackoff();
    try {
      const res = await this.client.get<SoApiWrapper<T>>(path, {
        params: { ...this.baseParams, ...params },
      });
      return res.data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        // Filter might be invalid — fall back to withbody
        if (this.activeFilter !== FALLBACK_FILTER) {
          logger.warn('Custom SO filter rejected, falling back to withbody');
          this.activeFilter = FALLBACK_FILTER;
          return this.get<T>(path, params);
        }
      }
      logger.error({ err, path }, 'SO API request failed');
      throw new AppError('Failed to reach Stack Overflow API', 502, 'SO_API_ERROR');
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Fetch questions from SO.
   *
   * SO API: GET /questions
   *   ?tagged=javascript   (semicolon-delimited for AND, max 5 tags)
   *   &sort=votes          (votes | activity | creation | hot | week | month)
   *   &order=desc
   *   &min=<score>         (minimum score filter)
   *   &pagesize=<n>        (max 100)
   *   &page=<n>
   */
  async fetchQuestions(
    tag: string | null,
    page = 1,
    pageSize = 100,
    sort: 'votes' | 'activity' | 'creation' | 'hot' = 'votes',
    minScore = 5,
  ): Promise<SoQuestion[]> {
    const cacheKey = `so:q:${tag ?? 'all'}:${page}:${sort}:${minScore}`;
    const hit = cache.get<SoQuestion[]>(cacheKey);
    if (hit) return hit;

    const params: Record<string, unknown> = {
      page, pagesize: pageSize, sort, order: 'desc', min: minScore,
    };
    if (tag) params.tagged = tag;

    const data = await this.get<SoApiQuestion>('/questions', params);
    const questions = data.items.map(mapQuestion);

    cache.set(cacheKey, questions, env.CACHE_TTL_SECONDS);
    logger.info({ tag, page, count: questions.length }, 'SO questions fetched');
    return questions;
  }

  /**
   * Fetch answers for a single question.
   *
   * SO API: GET /questions/{id}/answers
   *   ?sort=votes&order=desc&pagesize=5
   */
  async fetchAnswers(questionId: number): Promise<SoAnswer[]> {
    const cacheKey = `so:ans:${questionId}`;
    const hit = cache.get<SoAnswer[]>(cacheKey);
    if (hit) return hit;

    const data = await this.get<SoApiAnswer>(
      `/questions/${questionId}/answers`,
      { sort: 'votes', order: 'desc', pagesize: 5 },
    );

    const answers = data.items.map(mapAnswer);
    cache.set(cacheKey, answers, env.CACHE_TTL_SECONDS);
    return answers;
  }

  /**
   * Bulk-fetch top answers for up to 100 question IDs in a single API call.
   *
   * SO API: GET /questions/{ids}/answers
   *   where {ids} = "1;2;3;4" (semicolon-separated, max 100)
   *
   * Returns Map<questionId, best SoAnswer>
   * "Best" = accepted answer first, else highest score.
   */
  async fetchAnswersBulk(questionIds: number[]): Promise<Map<number, SoAnswer>> {
    if (!questionIds.length) return new Map();

    const result = new Map<number, SoAnswer>();

    // Split into batches of 100 (API hard limit)
    for (let i = 0; i < questionIds.length; i += 100) {
      const batch = questionIds.slice(i, i + 100);
      const ids = batch.join(';');
      const cacheKey = `so:ans_bulk:${ids}`;
      const hit = cache.get<SoAnswer[]>(cacheKey);

      let answers: SoAnswer[];
      if (hit) {
        answers = hit;
      } else {
        const data = await this.get<SoApiAnswer>(
          `/questions/${ids}/answers`,
          { sort: 'votes', order: 'desc', pagesize: 100 },
        );
        answers = data.items.map(mapAnswer);
        cache.set(cacheKey, answers, env.CACHE_TTL_SECONDS);
      }

      // Keep best answer per question (accepted > highest score)
      for (const ans of answers) {
        const prev = result.get(ans.question_id);
        if (!prev
          || (ans.is_accepted && !prev.is_accepted)
          || (!prev.is_accepted && ans.score > prev.score)) {
          result.set(ans.question_id, ans);
        }
      }
    }

    return result;
  }

  /**
   * Fetch questions AND enrich them with their top answer in 2 API calls.
   * Step 1: GET /questions (up to 100)
   * Step 2: GET /questions/{ids}/answers (single batch call for all IDs)
   */
  async fetchQuestionsWithAnswers(
    tag: string | null,
    page = 1,
    pageSize = 100,
    sort: 'votes' | 'activity' | 'creation' | 'hot' = 'votes',
    minScore = 5,
  ): Promise<SoQuestion[]> {
    const questions = await this.fetchQuestions(tag, page, pageSize, sort, minScore);

    // Only enrich questions that have answers
    const needsEnrich = questions.filter((q) => q.is_answered && !q.top_answer_body);
    if (!needsEnrich.length) return questions;

    const answerMap = await this.fetchAnswersBulk(needsEnrich.map((q) => q.question_id));

    return questions.map((q) => {
      const top = answerMap.get(q.question_id);
      if (!top) return q;
      return {
        ...q,
        top_answer_body: top.body,       // HTML body
        top_answer_score: top.score,
        top_answer_author: top.owner.display_name,
      };
    });
  }

  /**
   * Fetch a single question (by ID) with its top answer.
   * Uses /questions/{id} + /questions/{id}/answers
   */
  async fetchFullQuestion(questionId: number): Promise<SoQuestion> {
    const cacheKey = `so:full:${questionId}`;
    const hit = cache.get<SoQuestion>(cacheKey);
    if (hit) return hit;

    const [qData, answers] = await Promise.all([
      this.get<SoApiQuestion>(`/questions/${questionId}`, {}),
      this.fetchAnswers(questionId),
    ]);

    if (!qData.items.length) throw AppError.notFound('Question not found on Stack Overflow');

    const q = mapQuestion(qData.items[0]);
    const top = answers.sort(
      (a, b) => (b.is_accepted ? 1 : 0) - (a.is_accepted ? 1 : 0) || b.score - a.score
    )[0];

    const enriched: SoQuestion = {
      ...q,
      top_answer_body: top?.body ?? null,
      top_answer_score: top?.score ?? null,
      top_answer_author: top?.owner.display_name ?? null,
    };

    cache.set(cacheKey, enriched, env.CACHE_TTL_SECONDS);
    return enriched;
  }

  /** Get current quota status. */
  async getQuotaStatus(): Promise<{ quota_max: number; quota_remaining: number }> {
    const remaining = cache.get<number>(QUOTA_CACHE_KEY);
    const data = await this.get<Record<string, unknown>>('/info', {});
    return { quota_max: data.quota_max, quota_remaining: data.quota_remaining };
  }
}

export const soService = new StackOverflowService();
