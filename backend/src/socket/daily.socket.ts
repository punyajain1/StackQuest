import { Namespace, Socket } from 'socket.io';
import { DAILY } from './events';
import { authService } from '../services/auth.service';
import { questionService } from '../services/question.service';
import { gameService } from '../services/game.service';
import { achievementService } from '../services/achievement.service';
import { formatQuestion } from '../utils/questionFormatter';
import { logger } from '../utils/logger';
import type { UserPayload, SoQuestion, QuestionType, GameQuestion } from '../models/db.types';

// ─── Auth middleware ──────────────────────────────────────────────────────────

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

// ─── Per-user session state (in-memory) ──────────────────────────────────────

interface DailySocketSession {
  session_id: string;
  questions: SoQuestion[];
  formatted: GameQuestion[];
  question_number: number;
  score: number;
  correct_count: number;
  xp_earned: number;
  question_timer?: ReturnType<typeof setInterval>;
}

const sessions = new Map<string, DailySocketSession>(); // key: socket.id

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      // Auto-submit blank answer on timeout
      handleSubmit(socket, session, '', timeLimit * 1000).catch(
        (err) => logger.error({ err }, 'Daily auto-submit failed'),
      );
    }
  }, 1000);
}

async function sendQuestion(socket: Socket, session: DailySocketSession): Promise<void> {
  const n = session.question_number;
  const total = session.questions.length;

  if (n > total) {
    // Session complete — end it
    await endSession(socket, session);
    return;
  }

  const formatted = session.formatted[n - 1];

  socket.emit(DAILY.QUESTION, {
    question_number: n,
    total,
    question_type: formatted.question_type,
    question_text: formatted.question_text,
    options: formatted.options,
    blank_text: formatted.blank_text,
    hint: formatted.hint,
    time_limit: formatted.time_limit,
    // Question metadata (no correct_answer exposed)
    question_id: formatted.question.question_id,
    title: formatted.question.title,
    tags: formatted.question.tags,
    score: formatted.question.score,
  });

  startQuestionTimer(socket, session, formatted.time_limit);
}

async function handleSubmit(
  socket: Socket,
  session: DailySocketSession,
  answer: string,
  timeMs: number,
): Promise<void> {
  clearQuestionTimer(session);

  const n = session.question_number;
  if (n > session.questions.length) return;

  const formatted = session.formatted[n - 1];
  const soQ = session.questions[n - 1];

  try {
    // Evaluate using game service
    const result = await gameService.evaluateAnswer({
      sessionId: session.session_id,
      questionId: soQ.question_id,
      questionType: formatted.question_type,
      playerAnswer: formatted.question_type !== 'mcq' ? answer : undefined,
      playerChoice: formatted.question_type === 'mcq' ? answer : undefined,
      timeTakenMs: timeMs,
      question: soQ,
    });

    session.score = result.snapshot.score;
    session.correct_count = result.snapshot.correct_count;
    session.xp_earned = result.snapshot.xp_earned;

    // Build user-facing correct answer (clean text)
    let correctAnswerDisplay = formatted.correct_answer;
    if (formatted.question_type === 'string_answer') {
      // Truncate long reference answers for display
      correctAnswerDisplay = formatted.correct_answer.length > 500
        ? formatted.correct_answer.slice(0, 500) + '…'
        : formatted.correct_answer;
    }

    socket.emit(DAILY.RESULT, {
      question_number: n,
      correct: result.correct,
      score_earned: result.scoreEarned,
      xp_earned: result.xpEarned,
      feedback: result.feedback,
      correct_answer: correctAnswerDisplay,
      snapshot: result.snapshot,
    });

    // Move to next question after 1.5 s
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

    // Award achievements
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

// ─── Handler registration ─────────────────────────────────────────────────────

export function registerDailyHandlers(namespace: Namespace): void {
  namespace.use(authMiddleware);

  namespace.on('connection', (socket: Socket) => {
    const user = (socket as Socket & { user: UserPayload }).user;
    logger.info({ userId: user.id, socketId: socket.id }, '📅 Daily socket connected');

    // ── daily:join ────────────────────────────────────────────────────────────
    socket.on(DAILY.JOIN, async () => {
      try {
        // Prevent double-join on same socket
        if (sessions.has(socket.id)) {
          const existing = sessions.get(socket.id)!;
          await sendQuestion(socket, existing);
          return;
        }

        // Start a daily challenge session via game service
        const snapshot = await gameService.startDailyChallenge(user.id);
        const soQuestions = await questionService.getDailyChallenge();
        const pool = soQuestions; // use same pool for MCQ distractors

        // Pick question types: cycle through all 3 types
        const types: QuestionType[] = soQuestions.map((_, i) => {
          const cycle: QuestionType[] = ['mcq', 'fill_in_blank', 'string_answer'];
          return cycle[i % cycle.length];
        });

        // Pre-format all questions
        const formatted: GameQuestion[] = soQuestions.map((q, i) =>
          formatQuestion(q, types[i], pool)
        );

        const session: DailySocketSession = {
          session_id: snapshot.session_id,
          questions: soQuestions,
          formatted,
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

    // ── daily:submit ──────────────────────────────────────────────────────────
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

    // ── disconnect ────────────────────────────────────────────────────────────
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
