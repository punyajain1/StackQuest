import { Namespace, Socket } from 'socket.io';
import { DAILY } from './events';
import { authService } from '../services/auth.service';
import { questionService } from '../services/question.service';
import { gameService } from '../services/game.service';
import { achievementService } from '../services/achievement.service';
import { logger } from '../utils/logger';
import type { UserPayload } from '../models/db.types';
import type { KnowledgeCard } from '../../generated/prisma';

function authMiddleware(socket: Socket, next: (err?: Error) => void): void {
  try {
    const token: string =
      socket.handshake.auth?.token ??
      socket.handshake.headers?.authorization?.replace('Bearer ', '') ?? '';
    if (!token) return next(new Error('NO_TOKEN'));
    const user = authService.verifyToken(token);
    (socket as Socket & { user: UserPayload }).user = user;
    next();
  } catch {
    next(new Error('INVALID_TOKEN'));
  }
}

interface DailySocketSession {
  session_id: string;
  cards: KnowledgeCard[];
  flattened_questions: any[];
  question_number: number;
  score: number;
  correct_count: number;
  xp_earned: number;
  question_timer?: ReturnType<typeof setInterval>;
}

const sessions = new Map<string, DailySocketSession>();

function clearQuestionTimer(session: DailySocketSession): void {
  if (session.question_timer) {
    clearInterval(session.question_timer);
    delete session.question_timer;
  }
}

function startQuestionTimer(
  socket: Socket,
  session: DailySocketSession,
  timeLimit: number,
): void {
  clearQuestionTimer(session);
  let remaining = timeLimit;

  session.question_timer = setInterval(() => {
    remaining--;
    socket.emit(DAILY.TIMER, {
      question_number: session.question_number,
      seconds_remaining: remaining,
    });

    if (remaining <= 0) {
      clearQuestionTimer(session);
      handleSubmit(socket, session, '', timeLimit * 1000).catch(
        (err) => logger.error({ err }, 'Daily auto-submit failed'),
      );
    }
  }, 1000);
}

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

async function sendQuestion(socket: Socket, session: DailySocketSession): Promise<void> {
  const n = session.question_number;
  const total = session.flattened_questions.length;

  if (n > total) {
    await endSession(socket, session);
    return;
  }

  const q = session.flattened_questions[n - 1];
  const card = session.cards[n - 1];

  socket.emit(DAILY.QUESTION, {
    question_number: n,
    total,
    question_type: q.type,
    question_text: q.question,
    options: q.options,
    time_limit: 30, // Default 30s per question
    
    // KnowledgeCard metadata
    knowledge_card_id: card.id,
    topic: card.topic,
    concept: card.concept,
    difficulty: card.difficulty,
  });

  startQuestionTimer(socket, session, 30);
}

async function handleSubmit(
  socket: Socket,
  session: DailySocketSession,
  answer: string,
  timeMs: number,
): Promise<void> {
  clearQuestionTimer(session);

  const n = session.question_number;
  if (n > session.flattened_questions.length) return;

  const q = session.flattened_questions[n - 1];
  const card = session.cards[n - 1];

  try {
    const result = await gameService.evaluateAnswer({
      sessionId: session.session_id,
      knowledgeCardId: card.id,
      questionId: q.id,
      playerAnswer: answer,
      timeTakenMs: timeMs,
    });

    session.score = result.snapshot.score;
    session.correct_count = result.snapshot.correct_count;
    session.xp_earned = result.snapshot.xp_earned;

    socket.emit(DAILY.RESULT, {
      question_number: n,
      correct: result.correct,
      score_earned: result.scoreEarned,
      xp_earned: result.xpEarned,
      feedback: result.feedback,
      correct_answer: result.correctAnswer,
      snapshot: result.snapshot,
    });

    session.question_number++;
    setTimeout(() => {
      sendQuestion(socket, session).catch(
        (err) => logger.error({ err }, 'Failed to send next daily question'),
      );
    }, 1500);
  } catch (err) {
    logger.error({ err }, 'Daily submit evaluation failed');
    socket.emit(DAILY.ERROR, { message: 'Failed to evaluate answer' });
  }
}

async function endSession(socket: Socket, session: DailySocketSession): Promise<void> {
  clearQuestionTimer(session);

  try {
    const finalSession = await gameService.endSession(session.session_id);
    const userId = (socket as Socket & { user: UserPayload }).user?.id;

    if (userId) {
      await achievementService.checkAndAward(userId).catch(() => {});
    }

    socket.emit(DAILY.COMPLETE, {
      total_score: finalSession.score,
      correct_count: finalSession.correctCount,
      xp_earned: finalSession.xpEarned,
      accuracy: finalSession.accuracy,
      duration_secs: finalSession.durationSecs,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to end daily session');
    socket.emit(DAILY.ERROR, { message: 'Failed to finalize session' });
  } finally {
    sessions.delete(socket.id);
  }
}

export function registerDailyHandlers(namespace: Namespace): void {
  namespace.use(authMiddleware);

  namespace.on('connection', (socket: Socket) => {
    const user = (socket as Socket & { user: UserPayload }).user;
    logger.info({ userId: user.id, socketId: socket.id }, '📅 Daily socket connected');

    socket.on(DAILY.JOIN, async () => {
      try {
        if (sessions.has(socket.id)) {
          const existing = sessions.get(socket.id)!;
          await sendQuestion(socket, existing);
          return;
        }

        const snapshot = await gameService.startDailyChallenge(user.id);
        const cards = await questionService.getDailyChallenge();
        
        const flattened_questions = cards.map(c => {
          const q = pickRandomQuestion(c);
          if (!q) throw new Error(`KnowledgeCard ${c.id} missing questions`);
          return q;
        });

        const session: DailySocketSession = {
          session_id: snapshot.session_id,
          cards,
          flattened_questions,
          question_number: 1,
          score: 0,
          correct_count: 0,
          xp_earned: 0,
        };

        sessions.set(socket.id, session);
        await sendQuestion(socket, session);

        logger.info({ userId: user.id, sessionId: snapshot.session_id }, 'Daily session started via socket');
      } catch (err) {
        const message = (err as Error).message ?? 'Failed to start daily challenge';
        logger.error({ err }, 'daily:join failed');
        socket.emit(DAILY.ERROR, { message });
      }
    });

    socket.on(DAILY.SUBMIT, async ({ question_number, answer, time_ms }: {
      question_number: number; answer: string; time_ms: number;
    }) => {
      const session = sessions.get(socket.id);
      if (!session) return socket.emit(DAILY.ERROR, { message: 'No active daily session. Emit daily:join first.' });

      if (question_number !== session.question_number) {
        return socket.emit(DAILY.ERROR, {
          message: `Expected question ${session.question_number}, got ${question_number}`,
        });
      }

      await handleSubmit(socket, session, answer, time_ms);
    });

    socket.on('disconnect', (reason) => {
      const session = sessions.get(socket.id);
      if (session) {
        clearQuestionTimer(session);
        sessions.delete(socket.id);
      }
      logger.info({ userId: user.id, reason }, '🔌 Daily socket disconnected');
    });
  });
}
