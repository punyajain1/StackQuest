import { Namespace, Socket } from 'socket.io';
import { DUEL } from './events';
import { duelService } from '../services/duel.service';
import { authService } from '../services/auth.service';
import { questionService } from '../services/question.service';
import { evaluationService } from '../services/evaluation.service';
import { achievementService } from '../services/achievement.service';
import { formatQuestion } from '../utils/questionFormatter';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import type { UserPayload, SoQuestion, QuestionType } from '../models/db.types';
import { prisma } from '../config/prisma';

// ─── Per-round timer tracking ─────────────────────────────────────────────────

const roundTimers = new Map<string, ReturnType<typeof setInterval>>(); // key: `${matchId}:${round}`

function clearRoundTimer(matchId: string, round: number): void {
  const key = `${matchId}:${round}`;
  const timer = roundTimers.get(key);
  if (timer) { clearInterval(timer); roundTimers.delete(key); }
}

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

// ─── Duel round broadcaster ───────────────────────────────────────────────────

async function broadcastQuestion(
  namespace: Namespace,
  matchId: string,
  roundNumber: number,
  questions: SoQuestion[],
  questionTypes: QuestionType[],
  pool: SoQuestion[],
): Promise<void> {
  const idx = roundNumber - 1;
  if (idx >= questions.length) return;

  const raw = questions[idx];
  const qType = questionTypes[idx];
  const formatted = formatQuestion(raw, qType, pool);

  // Start per-round countdown timer
  const totalSecs = formatted.time_limit;
  let remaining = totalSecs;
  const timerKey = `${matchId}:${roundNumber}`;

  const interval = setInterval(() => {
    remaining--;
    namespace.to(`duel:${matchId}`).emit(DUEL.TIMER, { round_number: roundNumber, seconds_remaining: remaining });

    if (remaining <= 0) {
      clearInterval(interval);
      roundTimers.delete(timerKey);
      // Auto-submit empty answer for anyone who didn't answer
      autoCompleteRound(namespace, matchId, roundNumber, formatted.correct_answer, pool, questions, questionTypes).catch(
        (err) => logger.error({ err, matchId, roundNumber }, 'Auto-complete round failed'),
      );
    }
  }, 1000);

  roundTimers.set(timerKey, interval);

  namespace.to(`duel:${matchId}`).emit(DUEL.QUESTION, {
    round_number: roundNumber,
    total_rounds: env.DUEL_ROUNDS,
    question_type: qType,
    question_text: formatted.question_text,
    question: {
      question_id: raw.question_id,
      title: raw.title,
      tags: raw.tags,
      score: raw.score,
    },
    options: formatted.options,
    blank_text: formatted.blank_text,
    hint: formatted.hint,
    time_limit: totalSecs,
    correct_answer: undefined, // NEVER send correct answer to client during round
  });
}

async function autoCompleteRound(
  namespace: Namespace,
  matchId: string,
  roundNumber: number,
  correctAnswer: string,
  pool: SoQuestion[],
  questions: SoQuestion[],
  questionTypes: QuestionType[],
): Promise<void> {
  const match = await prisma.duelMatch.findUnique({
    where: { id: matchId },
    include: { questions: { where: { roundNumber } } },
  });
  if (!match || match.status !== 'active') return;
  const duelQ = match.questions[0];
  if (!duelQ) return;

  // Auto-submit '' for any player who hasn't answered yet
  if (duelQ.player1Answer === null) {
    await prisma.duelQuestion.update({ where: { id: duelQ.id }, data: { player1Answer: '', player1Correct: false, player1TimeMs: env.DUEL_TIME_LIMIT_SECS * 1000 } });
  }
  if (duelQ.player2Answer === null) {
    await prisma.duelQuestion.update({ where: { id: duelQ.id }, data: { player2Answer: '', player2Correct: false, player2TimeMs: env.DUEL_TIME_LIMIT_SECS * 1000 } });
  }

  await broadcastRoundResult(namespace, matchId, roundNumber, correctAnswer, pool, questions, questionTypes);
}

async function broadcastRoundResult(
  namespace: Namespace,
  matchId: string,
  roundNumber: number,
  correctAnswer: string,
  pool: SoQuestion[],
  questions: SoQuestion[],
  questionTypes: QuestionType[],
): Promise<void> {
  clearRoundTimer(matchId, roundNumber);

  const match = await prisma.duelMatch.findUnique({
    where: { id: matchId },
    include: { questions: { where: { roundNumber } } },
  });
  if (!match) return;
  const duelQ = match.questions[0];
  if (!duelQ) return;

  namespace.to(`duel:${matchId}`).emit(DUEL.ROUND_RESULT, {
    round_number: roundNumber,
    correct_answer: correctAnswer,
    player1_correct: duelQ.player1Correct ?? false,
    player2_correct: duelQ.player2Correct ?? false,
    player1_score: match.player1Score,
    player2_score: match.player2Score,
  });

  // Wait 2 s then broadcast next question or finish
  setTimeout(async () => {
    if (roundNumber < match.rounds) {
      await broadcastQuestion(namespace, matchId, roundNumber + 1, questions, questionTypes, pool);
    } else {
      // Match complete — duelService handles ELO/stats
      await duelService.completeDuel(matchId);
      const result = await duelService.getDuelResult(matchId);
      namespace.to(`duel:${matchId}`).emit(DUEL.COMPLETE, result);

      // Award achievements to both players
      if (match.player1Id) achievementService.checkAndAward(match.player1Id).catch(() => {});
      if (match.player2Id) achievementService.checkAndAward(match.player2Id).catch(() => {});
    }
  }, 2000);
}

// ─── Match state cache ────────────────────────────────────────────────────────

interface MatchState {
  questions: SoQuestion[];
  questionTypes: QuestionType[];
  pool: SoQuestion[];
}
const matchStateCache = new Map<string, MatchState>();

// ─── Matchmaking queue (league-based) ─────────────────────────────────────────

interface QueueEntry {
  userId: string;
  username: string;
  elo: number;
  league: string;
  avatarUrl: string | null;
  socketId: string;
}

// Key = league name (lowercase), Value = array of waiting players
const matchmakingQueue = new Map<string, QueueEntry[]>();

function removeFromQueue(userId: string): void {
  for (const [league, entries] of matchmakingQueue) {
    const idx = entries.findIndex(e => e.userId === userId);
    if (idx !== -1) {
      entries.splice(idx, 1);
      if (entries.length === 0) matchmakingQueue.delete(league);
      return;
    }
  }
}

function isInQueue(userId: string): boolean {
  for (const entries of matchmakingQueue.values()) {
    if (entries.some(e => e.userId === userId)) return true;
  }
  return false;
}

// ─── Handler registration ─────────────────────────────────────────────────────

export function registerDuelHandlers(namespace: Namespace): void {
  namespace.use(authMiddleware);

  namespace.on('connection', (socket: Socket) => {
    const user = (socket as Socket & { user: UserPayload }).user;
    logger.info({ userId: user.id, socketId: socket.id }, '🎮 Duel socket connected');

    // ── duel:join ─────────────────────────────────────────────────────────────
    socket.on(DUEL.JOIN, async ({ match_id }: { match_id: string }) => {
      try {
        const match = await prisma.duelMatch.findUnique({
          where: { id: match_id },
          include: {
            player1: { select: { id: true, username: true, avatarUrl: true } },
            player2: { select: { id: true, username: true, avatarUrl: true } },
          },
        });

        if (!match) return socket.emit(DUEL.ERROR, { message: 'Duel not found' });
        if (match.player1Id !== user.id && match.player2Id !== user.id)
          return socket.emit(DUEL.ERROR, { message: 'You are not in this duel' });

        await socket.join(`duel:${match_id}`);
        logger.info({ matchId: match_id, userId: user.id }, 'Player joined duel room');

        // Emit current state to the joining player
        const state = await duelService.getDuelState(match_id);
        socket.emit(DUEL.STATE, state);

        // Notify opponent
        socket.to(`duel:${match_id}`).emit(DUEL.OPPONENT_READY, {
          username: user.username,
          avatar_url: null,
        });

        // If match is active (both players joined) and no questions emitted yet — start round 1
        if (match.status === 'active') {
          const roomSockets = await namespace.in(`duel:${match_id}`).fetchSockets();
          if (roomSockets.length >= 2) {
            // Load or reuse pre-generated questions
            if (!matchStateCache.has(match_id)) {
              const dbQuestions = await prisma.duelQuestion.findMany({
                where: { matchId: match_id },
                orderBy: { roundNumber: 'asc' },
              });

              const soQuestions: SoQuestion[] = dbQuestions.map(
                (q) => q.questionData as unknown as SoQuestion
              );
              const types: QuestionType[] = dbQuestions.map((q) => q.questionType);
              const pool = await questionService.getQuestionsForDuel(10);

              matchStateCache.set(match_id, { questions: soQuestions, questionTypes: types, pool });
            }

            const { questions, questionTypes, pool } = matchStateCache.get(match_id)!;
            await broadcastQuestion(namespace, match_id, 1, questions, questionTypes, pool);
          }
        }
      } catch (err) {
        logger.error({ err, matchId: match_id }, 'duel:join error');
        socket.emit(DUEL.ERROR, { message: 'Failed to join duel' });
      }
    });

    // ── duel:answer ───────────────────────────────────────────────────────────
    socket.on(DUEL.ANSWER, async ({ round_number, answer, time_ms }: {
      round_number: number; answer: string; time_ms: number;
    }) => {
      try {
        // Find which match this socket is in
        const rooms = Array.from(socket.rooms).filter((r) => r.startsWith('duel:'));
        if (!rooms.length) return socket.emit(DUEL.ERROR, { message: 'Not in a duel room' });
        const matchId = rooms[0].replace('duel:', '');

        // Submit answer via duelService
        const result = await duelService.submitAnswer(matchId, user.id, round_number, answer, time_ms);
        socket.emit('duel:answer_ack', { round_number, correct: result.correct, feedback: result.feedback });

        // Check if BOTH players have answered this round
        const duelQ = await prisma.duelQuestion.findUnique({
          where: { matchId_roundNumber: { matchId, roundNumber: round_number } },
        });

        if (duelQ && duelQ.player1Answer !== null && duelQ.player2Answer !== null) {
          // Both answered — broadcast result immediately
          const state = matchStateCache.get(matchId);
          if (state) {
            clearRoundTimer(matchId, round_number);
            await broadcastRoundResult(
              namespace, matchId, round_number,
              duelQ.correctAnswer,
              state.pool, state.questions, state.questionTypes,
            );
          }
        }
      } catch (err) {
        logger.error({ err }, 'duel:answer error');
        socket.emit(DUEL.ERROR, { message: (err as Error).message ?? 'Failed to submit answer' });
      }
    });

    // ── duel:find_match ───────────────────────────────────────────────────────
    socket.on(DUEL.FIND_MATCH, async ({ league: requestedLeague }: { league?: string }) => {
      try {
        if (isInQueue(user.id)) {
          return socket.emit(DUEL.ERROR, { message: 'Already in matchmaking queue' });
        }

        // Fetch user's current profile for league & elo
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { username: true, elo: true, league: true, avatarUrl: true },
        });
        if (!dbUser) return socket.emit(DUEL.ERROR, { message: 'User not found' });

        const league = (requestedLeague || dbUser.league || 'bronze').toLowerCase();

        const entry: QueueEntry = {
          userId: user.id,
          username: dbUser.username,
          elo: dbUser.elo,
          league,
          avatarUrl: dbUser.avatarUrl,
          socketId: socket.id,
        };

        // Check if there's already someone waiting in this league
        const queue = matchmakingQueue.get(league) || [];
        const opponent = queue.find(e => e.userId !== user.id);

        if (opponent) {
          // Match found! Remove opponent from queue
          removeFromQueue(opponent.userId);

          logger.info(
            { player1: opponent.userId, player2: user.id, league },
            '🎯 Matchmaking: pair found',
          );

          // Create the duel via duelService
          const duelState = await duelService.createDuel(opponent.userId);
          await duelService.joinDuel(duelState.match_id, user.id);

          // Notify both players
          const opponentSocket = namespace.sockets.get(opponent.socketId);
          if (opponentSocket) {
            opponentSocket.emit(DUEL.MATCH_FOUND, {
              match_id: duelState.match_id,
              opponent: {
                username: dbUser.username,
                elo: dbUser.elo,
                league,
                avatar_url: dbUser.avatarUrl,
              },
            });
          }

          socket.emit(DUEL.MATCH_FOUND, {
            match_id: duelState.match_id,
            opponent: {
              username: opponent.username,
              elo: opponent.elo,
              league,
              avatar_url: opponent.avatarUrl,
            },
          });
        } else {
          // No opponent yet — add to queue
          queue.push(entry);
          matchmakingQueue.set(league, queue);

          socket.emit(DUEL.QUEUE_STATUS, {
            position: queue.length,
            league,
            searching: true,
          });

          logger.info(
            { userId: user.id, league, queueSize: queue.length },
            '⏳ Player added to matchmaking queue',
          );
        }
      } catch (err) {
        logger.error({ err }, 'duel:find_match error');
        socket.emit(DUEL.ERROR, { message: 'Matchmaking failed' });
      }
    });

    // ── duel:cancel_find ──────────────────────────────────────────────────────
    socket.on(DUEL.CANCEL_FIND, () => {
      removeFromQueue(user.id);
      socket.emit(DUEL.QUEUE_STATUS, { position: 0, league: '', searching: false });
      logger.info({ userId: user.id }, '❌ Player cancelled matchmaking');
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      removeFromQueue(user.id);
      logger.info({ userId: user.id, reason }, '🔌 Duel socket disconnected');
    });
  });
}
