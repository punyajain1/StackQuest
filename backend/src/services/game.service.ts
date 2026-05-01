import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/prisma';
import { questionService } from './question.service';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import { formatQuestion } from '../utils/questionFormatter';
import { evaluateAnswer, calculateQuestionScore, calculateAnswerXP, calculateXPProgression, getSessionStartXP, getStreakMultiplier } from '../utils/stackquest.algorithm';
import type { GameSession } from '../../generated/prisma';
import type {
  GameMode, Difficulty, QuestionType, SoQuestion,
  GameQuestion, SessionSnapshot,
} from '../models/db.types';

// ─── Question type cycle ─────────────────────────────────────

const QUESTION_TYPES: QuestionType[] = ['mcq', 'fill_in_blank', 'string_answer'];

function pickQuestionType(): QuestionType {
  return QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)];
}

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
  preloaded_questions: SoQuestion[];
}

const activeSessions = new Map<string, ActiveSession>();

// ─── Game Service ────────────────────────────────────────────

export class GameService {
  // ─── Daily Challenge ─────────────────────────────────────

  async startDailyChallenge(userId: string): Promise<SessionSnapshot> {
    // Check if user already played today
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const existing = await prisma.gameSession.findFirst({
      where: { userId, mode: 'daily_challenge', dailyDate: today },
    });
    if (existing) throw AppError.conflict('You already played today\'s daily challenge', 'DAILY_ALREADY_PLAYED');

    const questions = await questionService.getDailyChallenge();
    const sessionId = uuidv4();

    const state: ActiveSession = {
      session_id: sessionId, user_id: userId, mode: 'daily_challenge',
      tag: null, score: 0, streak: 0, streak_peak: 0,
      questions_answered: 0, correct_count: 0, xp_earned: getSessionStartXP(),
      played_ids: [], started_at: Date.now(), preloaded_questions: questions,
    };

    activeSessions.set(sessionId, state);
    await prisma.gameSession.create({
      data: { id: sessionId, userId, mode: 'daily_challenge', dailyDate: today },
    });

    logger.info({ sessionId, userId }, 'Daily challenge started');
    return this.buildSnapshot(state);
  }

  // ─── Puzzle ──────────────────────────────────────────────

  async startPuzzle(userId: string, tag: string | null, difficulty: Difficulty | null): Promise<SessionSnapshot> {
    const sessionId = uuidv4();
    const state: ActiveSession = {
      session_id: sessionId, user_id: userId, mode: 'puzzle',
      tag, score: 0, streak: 0, streak_peak: 0,
      questions_answered: 0, correct_count: 0, xp_earned: getSessionStartXP(),
      played_ids: [], started_at: Date.now(), preloaded_questions: [],
    };

    activeSessions.set(sessionId, state);
    await prisma.gameSession.create({
      data: { id: sessionId, userId, mode: 'puzzle', tag },
    });

    logger.info({ sessionId, userId, tag, difficulty }, 'Puzzle session started');
    return this.buildSnapshot(state);
  }

  // ─── Get Next Question ────────────────────────────────────

  async getNextQuestion(sessionId: string, difficulty?: Difficulty): Promise<GameQuestion> {
    const session = this.getActiveSession(sessionId);
    let question: SoQuestion;

    if (session.mode === 'daily_challenge' && session.preloaded_questions.length > 0) {
      const idx = session.questions_answered;
      if (idx >= session.preloaded_questions.length) {
        throw AppError.badRequest('No more questions in this daily challenge');
      }
      question = session.preloaded_questions[idx];
    } else {
      question = await questionService.getNextQuestion({
        tag: session.tag, difficulty, excludeIds: session.played_ids, requireAnswer: true,
      });
    }

    const qType = pickQuestionType();
    return this.buildGameQuestion(question, qType, session.preloaded_questions);
  }

  private buildGameQuestion(
    question: SoQuestion, qType: QuestionType, allQuestions: SoQuestion[]
  ): GameQuestion {
    return formatQuestion(question, qType, allQuestions);
  }

  // ─── Evaluate Answer ─────────────────────────────────────

  async evaluateAnswer(opts: {
    sessionId: string; questionId: number; questionType: QuestionType;
    playerAnswer?: string; playerChoice?: string; timeTakenMs: number;
    question: SoQuestion;
  }): Promise<{
    correct: boolean; scoreEarned: number; xpEarned: number;
    feedback?: string; snapshot: SessionSnapshot;
  }> {
    const { sessionId, questionId, questionType, playerAnswer, playerChoice, timeTakenMs, question } = opts;
    const session = this.getActiveSession(sessionId);

    if (session.played_ids.includes(questionId)) {
      throw AppError.badRequest('Question already answered in this session');
    }

    let correct = false;
    let scoreEarned = 0;
    let xpEarned = 0;
    let feedback: string | undefined;

    let evalResult;
    const qTypeAlg = questionType === 'fill_in_blank' ? 'fill_in_the_blank' : questionType;

    switch (questionType) {
      case 'mcq': {
        if (!playerChoice) throw AppError.badRequest('playerChoice required for MCQ');
        const formatted = formatQuestion(question, 'mcq', []);
        evalResult = evaluateAnswer('mcq', playerChoice, formatted.correct_answer);
        break;
      }
      case 'fill_in_blank': {
        if (!playerAnswer) throw AppError.badRequest('playerAnswer required for fill_in_blank');
        const formatted = formatQuestion(question, 'fill_in_blank', []);
        evalResult = evaluateAnswer('fill_in_the_blank', playerAnswer, formatted.correct_answer);
        break;
      }
      case 'string_answer': {
        if (!playerAnswer) throw AppError.badRequest('playerAnswer required for string_answer');
        const formatted = formatQuestion(question, 'string_answer', []);
        evalResult = evaluateAnswer('string_answer', playerAnswer, formatted.correct_answer);
        break;
      }
    }

    if (!evalResult) throw AppError.internal('Failed to evaluate answer');

    correct = evalResult.isCorrect;
    feedback = evalResult.details;

    const scoreResult = calculateQuestionScore(
      qTypeAlg,
      correct,
      timeTakenMs,
      session.streak,
      evalResult.similarityRatio
    );
    scoreEarned = scoreResult.totalScore;
    
    xpEarned = calculateAnswerXP(
      qTypeAlg,
      correct,
      evalResult.similarityRatio
    );

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

    // Persist individual answer
    await prisma.questionAnswer.create({
      data: {
        sessionId, soQuestionId: questionId, questionType,
        playerAnswer: playerAnswer ?? null, playerChoice: playerChoice ?? null,
        correct, scoreEarned, xpEarned, timeTakenMs,
      },
    });

    return { correct, scoreEarned, xpEarned, feedback, snapshot: this.buildSnapshot(session) };
  }

  // ─── End Session ─────────────────────────────────────────

  async endSession(sessionId: string): Promise<GameSession> {
    const session = this.getActiveSession(sessionId);
    const durationSecs = Math.round((Date.now() - session.started_at) / 1000);
    const accuracy = session.questions_answered > 0
      ? session.correct_count / session.questions_answered : 0;

    const finalSession = await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        score: session.score, accuracy, streakPeak: session.streak_peak,
        questionsCount: session.questions_answered, correctCount: session.correct_count,
        durationSecs, xpEarned: session.xp_earned,
      },
    });

    // Update user XP + streak
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user_id },
      select: { xp: true, maxStreak: true },
    });

    const newXp = (currentUser?.xp ?? 0) + session.xp_earned;
    const progression = calculateXPProgression(newXp);
    const newLevel = progression.level;
    const newMaxStreak = Math.max(currentUser?.maxStreak ?? 0, session.streak_peak);

    await prisma.user.update({
      where: { id: session.user_id },
      data: {
        xp: newXp, level: newLevel, maxStreak: newMaxStreak,
        totalGames: { increment: 1 }, lastActive: new Date(),
      },
    });

    // Leaderboard entry
    const user = await prisma.user.findUnique({
      where: { id: session.user_id }, select: { username: true },
    });

    await prisma.leaderboardEntry.create({
      data: {
        sessionId, userId: session.user_id,
        username: user?.username ?? 'Guest', score: session.score,
        mode: session.mode, tag: session.tag,
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
      session_id: session.session_id, score: session.score,
      streak: session.streak, streak_multiplier: getStreakMultiplier(session.streak),
      questions_answered: session.questions_answered,
      correct_count: session.correct_count, xp_earned: session.xp_earned,
    };
  }

  private getISOWeek(date: Date): string {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  async getSession(sessionId: string): Promise<GameSession | null> {
    return prisma.gameSession.findUnique({ where: { id: sessionId } });
  }
}

export const gameService = new GameService();
