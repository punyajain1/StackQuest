import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/prisma';
import { questionService } from './question.service';
import { evaluationService } from './evaluation.service';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import type { GameSession } from '../../generated/prisma';
import type {
  GameMode,
  Difficulty,
  SoQuestion,
  GameQuestion,
  SessionSnapshot,
  EvaluationResult,
  ScoreRange,
} from '../models/db.types';

// ─── Scoring Config ──────────────────────────────────────────

function getMultiplier(streak: number): number {
  if (streak >= 13) return 5;
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

const BASE_POINTS: Record<GameMode, number> = {
  judge: 10,
  score_guesser: 15,
  answer_arena: 0,
  multiple_choice: 20,
  tag_guesser: 12,
};

const XP_PER_CORRECT = 10;
const XP_PER_GAME = 5;
const TIME_BONUS_MAX = 10;

// ─── In-memory active session state ─────────────────────────

interface ActiveSession {
  session_id: string;
  user_id: string;
  mode: GameMode;
  tag: string | null;
  score: number;
  streak: number;
  streak_peak: number;
  questions_answered: number;
  correct_count: number;
  xp_earned: number;
  played_ids: number[];
  started_at: number;
  is_daily: boolean;
}

const activeSessions = new Map<string, ActiveSession>();

// ─── Game Service ────────────────────────────────────────────

export class GameService {
  // ─── Start Session ────────────────────────────────────────

  async startSession(
    userId: string,
    mode: GameMode,
    tag: string | null,
    isDaily = false
  ): Promise<SessionSnapshot> {
    const sessionId = uuidv4();

    const state: ActiveSession = {
      session_id: sessionId,
      user_id: userId,
      mode,
      tag,
      score: 0,
      streak: 0,
      streak_peak: 0,
      questions_answered: 0,
      correct_count: 0,
      xp_earned: XP_PER_GAME,
      played_ids: [],
      started_at: Date.now(),
      is_daily: isDaily,
    };

    activeSessions.set(sessionId, state);

    // Persist an initial session record so questionAnswers can FK to it
    await prisma.gameSession.create({
      data: {
        id: sessionId,
        userId,
        mode,
        tag,
        isDaily,
      },
    });

    logger.info({ sessionId, userId, mode, tag }, 'Game session started');
    return this.buildSnapshot(state);
  }

  // ─── Get Next Question ────────────────────────────────────

  async getNextQuestion(
    sessionId: string,
    difficulty?: Difficulty
  ): Promise<GameQuestion> {
    const session = this.getActiveSession(sessionId);
    const question = await questionService.getNextQuestion({
      tag: session.tag,
      difficulty,
      excludeIds: session.played_ids,
      mode: session.mode,
    });
    return this.buildGameQuestion(question, session.mode);
  }

  private async buildGameQuestion(
    question: SoQuestion,
    mode: GameMode
  ): Promise<GameQuestion> {
    const base: GameQuestion = {
      question,
      mode,
      timeLimit: mode === 'answer_arena' ? 120 : 30,
    };

    if (mode === 'multiple_choice') {
      const sibling = await questionService.getNextQuestion({
        excludeIds: [question.question_id],
      });
      const correctTag = question.tags[0] ?? 'unknown';
      const distractors = sibling.tags.filter((t) => t !== correctTag).slice(0, 3);
      base.options = this.shuffle([correctTag, ...distractors]).slice(0, 4);
    }
    return base;
  }

  // ─── Evaluate Answer ─────────────────────────────────────

  async evaluateAnswer(opts: {
    sessionId: string;
    questionId: number;
    playerAnswer?: string;
    playerChoice?: string;
    timeTakenMs: number;
    question: SoQuestion;
  }): Promise<{
    correct: boolean;
    scoreEarned: number;
    xpEarned: number;
    evaluationResult?: EvaluationResult;
    snapshot: SessionSnapshot;
  }> {
    const { sessionId, questionId, playerAnswer, playerChoice, timeTakenMs, question } = opts;
    const session = this.getActiveSession(sessionId);

    if (session.played_ids.includes(questionId)) {
      throw AppError.badRequest('Question already answered in this session');
    }

    let correct = false;
    let scoreEarned = 0;
    let xpEarned = 0;
    let evaluationResult: EvaluationResult | undefined;

    const multiplier = getMultiplier(session.streak);
    const timeBonusFactor = Math.max(0, 1 - timeTakenMs / 30000);
    const timeBonus = Math.round(TIME_BONUS_MAX * timeBonusFactor);

    switch (session.mode) {
      case 'judge': {
        const isPositive = question.score > 0;
        correct = playerChoice === (isPositive ? 'upvote' : 'downvote');
        if (correct) scoreEarned = (BASE_POINTS.judge + timeBonus) * multiplier;
        break;
      }
      case 'score_guesser': {
        const range = this.scoreToRange(question.score);
        correct = playerChoice === range;
        if (correct) scoreEarned = (BASE_POINTS.score_guesser + timeBonus) * multiplier;
        break;
      }
      case 'answer_arena': {
        if (!playerAnswer) throw AppError.badRequest('playerAnswer required for answer_arena');
        const ref = question.top_answer_text ?? question.body_markdown;
        try {
          evaluationResult = await evaluationService.evaluateAnswer(playerAnswer, ref);
        } catch {
          evaluationResult = evaluationService.evaluateAnswerFallback(playerAnswer, ref);
        }
        correct = evaluationResult.similarity >= 0.5;
        scoreEarned = evaluationResult.points * multiplier;
        xpEarned = Math.round(evaluationResult.similarity * 20);
        break;
      }
      case 'multiple_choice': {
        correct = playerChoice === question.tags[0];
        if (correct) scoreEarned = (BASE_POINTS.multiple_choice + timeBonus) * multiplier;
        break;
      }
      case 'tag_guesser': {
        correct = playerChoice !== undefined && question.tags.includes(playerChoice);
        if (correct) scoreEarned = (BASE_POINTS.tag_guesser + timeBonus) * multiplier;
        break;
      }
    }

    if (xpEarned === 0) xpEarned = correct ? XP_PER_CORRECT : 0;

    // Update in-memory state
    session.played_ids.push(questionId);
    session.questions_answered++;
    session.score += scoreEarned;
    session.xp_earned += xpEarned;

    if (correct) {
      session.correct_count++;
      session.streak++;
      if (session.streak > session.streak_peak) session.streak_peak = session.streak;
    } else {
      session.streak = 0;
    }

    // Persist individual move
    await prisma.questionAnswer.create({
      data: {
        sessionId,
        soQuestionId: questionId,
        mode: session.mode,
        playerAnswer: playerAnswer ?? null,
        playerChoice: playerChoice ?? null,
        correct,
        scoreEarned,
        xpEarned,
        similarityScore: evaluationResult?.similarity ?? null,
        timeTakenMs,
      },
    });

    return { correct, scoreEarned, xpEarned, evaluationResult, snapshot: this.buildSnapshot(session) };
  }

  // ─── End Session ─────────────────────────────────────────

  async endSession(sessionId: string): Promise<GameSession> {
    const session = this.getActiveSession(sessionId);
    const durationSecs = Math.round((Date.now() - session.started_at) / 1000);
    const accuracy =
      session.questions_answered > 0
        ? session.correct_count / session.questions_answered
        : 0;

    // Finalize DB session record
    const finalSession = await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        score: session.score,
        accuracy,
        streakPeak: session.streak_peak,
        questionsCount: session.questions_answered,
        correctCount: session.correct_count,
        durationSecs,
        xpEarned: session.xp_earned,
      },
    });

    // Update user XP + streak record (compute level in app code)
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user_id },
      select: { xp: true, streakRecord: true },
    });

    const newXp = (currentUser?.xp ?? 0) + session.xp_earned;
    const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;
    const newStreakRecord = Math.max(currentUser?.streakRecord ?? 0, session.streak_peak);

    await prisma.user.update({
      where: { id: session.user_id },
      data: {
        xp: newXp,
        level: newLevel,
        streakRecord: newStreakRecord,
        totalGames: { increment: 1 },
        lastActive: new Date(),
      },
    });

    // Leaderboard entry
    const user = await prisma.user.findUnique({
      where: { id: session.user_id },
      select: { username: true },
    });

    await prisma.leaderboardEntry.create({
      data: {
        sessionId,
        userId: session.user_id,
        username: user?.username ?? 'Guest',
        score: session.score,
        mode: session.mode,
        tag: session.tag,
        periodWeek: this.getISOWeek(new Date()),
      },
    });

    activeSessions.delete(sessionId);
    logger.info({ sessionId, score: session.score }, 'Game session ended');
    return finalSession;
  }

  // ─── Helpers ─────────────────────────────────────────────

  private getActiveSession(sessionId: string): ActiveSession {
    const session = activeSessions.get(sessionId);
    if (!session) throw AppError.notFound('Game session not found or already ended', 'SESSION_NOT_FOUND');
    return session;
  }

  private buildSnapshot(session: ActiveSession): SessionSnapshot {
    return {
      session_id: session.session_id,
      score: session.score,
      streak: session.streak,
      streak_multiplier: getMultiplier(session.streak),
      questions_answered: session.questions_answered,
      correct_count: session.correct_count,
      xp_earned: session.xp_earned,
    };
  }

  private scoreToRange(score: number): ScoreRange {
    if (score >= 500) return '500+';
    if (score >= 100) return '100-500';
    if (score >= 10) return '10-100';
    return '0-10';
  }

  private shuffle<T>(arr: T[]): T[] {
    return arr.map((v) => ({ v, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ v }) => v);
  }

  private getISOWeek(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  async getSession(sessionId: string): Promise<GameSession | null> {
    return prisma.gameSession.findUnique({ where: { id: sessionId } });
  }
}

export const gameService = new GameService();
