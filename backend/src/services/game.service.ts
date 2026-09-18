import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/prisma';
import { questionService } from './question.service';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { calculateQuestionScore, calculateAnswerXP, calculateXPProgression, getSessionStartXP, getStreakMultiplier } from '../utils/stackquest.algorithm';
import type { GameSession, KnowledgeCard } from '../../generated/prisma';
import type {
  GameMode, Difficulty, SessionSnapshot,
} from '../models/db.types';

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
  played_ids: string[];
  started_at: number;
  preloaded_questions: KnowledgeCard[];
}

const activeSessions = new Map<string, ActiveSession>();

function pickRandomQuestion(card: KnowledgeCard): any {
  const qObj: any = card.questions;
  const all = [
    ...(qObj.mcqs || []),
    ...(qObj.trueFalse || []),
    ...(qObj.fillBlanks || []),
    ...(qObj.scenarios || []),
    ...(qObj.codeQuestions || [])
  ];
  if (all.length === 0) return null;
  return all[Math.floor(Math.random() * all.length)];
}

export class GameService {
  async startDailyChallenge(userId: string): Promise<SessionSnapshot> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
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

  async getNextQuestion(sessionId: string, difficulty?: Difficulty): Promise<any> {
    const session = this.getActiveSession(sessionId);
    let card: KnowledgeCard;

    if (session.mode === 'daily_challenge' && session.preloaded_questions.length > 0) {
      const idx = session.questions_answered;
      if (idx >= session.preloaded_questions.length) {
        throw AppError.badRequest('No more questions in this daily challenge');
      }
      card = session.preloaded_questions[idx];
    } else {
      card = await questionService.getNextQuestion({
        tag: session.tag, difficulty, excludeIds: session.played_ids,
      });
    }

    const q = pickRandomQuestion(card);
    if (!q) throw AppError.internal('Knowledge card missing questions');

    // Remove the correct answer from the payload sent to the client
    const clientQ = { ...q, knowledgeCardId: card.id };
    delete clientQ.correctAnswer;
    delete clientQ.answer;

    return clientQ;
  }

  async evaluateAnswer(opts: {
    sessionId: string; knowledgeCardId: string;
    playerAnswer?: string; timeTakenMs: number;
    questionId: string; // The nested sub-question ID like "mcq_1"
  }): Promise<{
    correct: boolean; scoreEarned: number; xpEarned: number;
    feedback?: string; correctAnswer: string; snapshot: SessionSnapshot;
  }> {
    const { sessionId, knowledgeCardId, playerAnswer = '', timeTakenMs, questionId } = opts;
    const session = this.getActiveSession(sessionId);

    if (session.played_ids.includes(knowledgeCardId)) {
      throw AppError.badRequest('Question already answered in this session');
    }

    const card = await prisma.knowledgeCard.findUnique({ where: { id: knowledgeCardId } });
    if (!card) throw AppError.notFound('Knowledge card not found');

    const qObj: any = card.questions;
    const all = [
      ...(qObj.mcqs || []),
      ...(qObj.trueFalse || []),
      ...(qObj.fillBlanks || []),
      ...(qObj.scenarios || []),
      ...(qObj.codeQuestions || [])
    ];
    
    const subQ = all.find(q => q.id === questionId);
    if (!subQ) throw AppError.notFound('Specific sub-question not found in card');

    let correct = false;
    let feedback: string | undefined = subQ.explanation;
    let correctAnswer = subQ.correctAnswer?.toString() ?? subQ.answer?.toString() ?? '';
    const type = subQ.type;

    if (type === 'mcq' || type === 'scenario' || type === 'code_output') {
      const correctIndex = parseInt(subQ.correctAnswer?.toString() ?? '', 10);
      let expectedText = subQ.correctAnswer?.toString() ?? '';
      
      if (!isNaN(correctIndex) && Array.isArray(subQ.options) && subQ.options[correctIndex] !== undefined) {
        expectedText = subQ.options[correctIndex].toString();
      }
      
      correct = playerAnswer.trim() === expectedText.trim();
    } else if (type === 'true_false') {
      correct = playerAnswer.trim().toLowerCase() === subQ.correctAnswer.toString().toLowerCase();
    } else if (type === 'fill_blank') {
      const accepted = subQ.acceptedAnswers?.map((a: string) => a.toLowerCase().trim()) || [subQ.answer?.toLowerCase().trim()];
      correct = accepted.includes(playerAnswer.toLowerCase().trim());
      correctAnswer = accepted[0] || correctAnswer;
    }

    let qTypeAlg = 'mcq';
    if (type === 'fill_blank') qTypeAlg = 'fill_in_the_blank';

    const scoreResult = calculateQuestionScore(
      qTypeAlg as any,
      correct,
      timeTakenMs,
      session.streak,
      correct ? 1.0 : 0.0
    );
    const scoreEarned = scoreResult.totalScore;
    
    const xpEarned = calculateAnswerXP(
      qTypeAlg as any,
      correct,
      correct ? 1.0 : 0.0
    );

    // Update in-memory state
    session.played_ids.push(knowledgeCardId);
    session.questions_answered++;
    session.score += scoreEarned;
    session.xp_earned += xpEarned;

    if (correct) {
      session.correct_count++;
      session.streak++;
      if (session.streak > session.streak_peak) session.streak_peak = session.streak;
      feedback = undefined; // Hide explanation if correct, or keep it depending on UX design.
    } else {
      session.streak = 0;
    }

    // Adapt type for DB
    let dbType = 'mcq';
    if (type === 'true_false') dbType = 'string_answer';
    if (type === 'fill_blank') dbType = 'fill_in_blank';

    await prisma.questionAnswer.create({
      data: {
        sessionId, knowledgeCardId,
        questionType: dbType as any,
        playerAnswer,
        correct, scoreEarned, xpEarned, timeTakenMs,
      },
    });

    return { correct, scoreEarned, xpEarned, feedback, correctAnswer, snapshot: this.buildSnapshot(session) };
  }

  async endSession(sessionId: string): Promise<GameSession> {
    const session = this.getActiveSession(sessionId);
    const durationSecs = Math.round((Date.now() - session.started_at) / 1000);
    const accuracy = session.questions_answered > 0
      ? session.correct_count / session.questions_answered : 0;

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user_id },
      select: { xp: true, maxStreak: true, username: true },
    });

    const newXp = (currentUser?.xp ?? 0) + session.xp_earned;
    const progression = calculateXPProgression(newXp);
    const newLevel = progression.level;
    const newMaxStreak = Math.max(currentUser?.maxStreak ?? 0, session.streak_peak);
    const periodWeek = this.getISOWeek(new Date());

    const [finalSession] = await prisma.$transaction([
      prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          score: session.score, accuracy, streakPeak: session.streak_peak,
          questionsCount: session.questions_answered, correctCount: session.correct_count,
          durationSecs, xpEarned: session.xp_earned,
        },
      }),
      prisma.user.update({
        where: { id: session.user_id },
        data: {
          xp: newXp, level: newLevel, maxStreak: newMaxStreak,
          totalGames: { increment: 1 }, lastActive: new Date(),
        },
      }),
      prisma.leaderboardEntry.create({
        data: {
          sessionId, userId: session.user_id,
          username: currentUser?.username ?? 'Guest', score: session.score,
          mode: session.mode, tag: session.tag,
          periodWeek,
        },
      }),
    ]);

    activeSessions.delete(sessionId);
    logger.info({ sessionId, score: session.score }, 'Game session ended');
    return finalSession;
  }

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
