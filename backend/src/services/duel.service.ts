import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/prisma';
import { questionService } from './question.service';
import { evaluateAnswer, calculateElo } from '../utils/stackquest.algorithm';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import type {
  QuestionType, SoQuestion, DuelState, DuelPlayerInfo,
  DuelQuestionPayload, DuelResult, DuelPlayerResult,
} from '../models/db.types';
import { formatQuestion } from '../utils/questionFormatter';

const QUESTION_TYPES: QuestionType[] = ['mcq'/*, 'fill_in_blank', 'string_answer'*/];

function pickQuestionType(): QuestionType {
  return QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)];
}

function generateCorrectAnswer(question: SoQuestion, qType: QuestionType): string {
  switch (qType) {
    case 'mcq': return question.tags[0] ?? 'unknown';
    case 'fill_in_blank': return question.tags[0] ?? question.title.split(' ').find((w) => w.length > 3) ?? 'code';
    case 'string_answer': return question.top_answer_body ?? question.body_markdown;
  }
}

function generateOptions(question: SoQuestion, allQuestions: SoQuestion[]): string[] {
  const correct = question.tags[0] ?? 'unknown';
  const distractors = new Set<string>();
  for (const q of allQuestions) {
    for (const t of q.tags) {
      if (t !== correct) distractors.add(t);
      if (distractors.size >= 3) break;
    }
    if (distractors.size >= 3) break;
  }
  return [correct, ...Array.from(distractors).slice(0, 3)].sort(() => Math.random() - 0.5);
}

export class DuelService {
  async createDuel(userId: string, tag?: string, opponentId?: string): Promise<DuelState> {
    const rounds = env.DUEL_ROUNDS;
    const questions = await questionService.getQuestionsForDuel(rounds);

    const match = await prisma.duelMatch.create({
      data: {
        player1Id: userId,
        player2Id: opponentId ?? null,
        rounds,
        tag: tag ?? null,
        status: opponentId ? 'invited' : 'waiting',
      },
      include: { player1: { select: { id: true, username: true, avatarUrl: true, elo: true } } },
    });

    // Pre-generate duel questions in a single batch insert
    const duelQuestionData = questions.map((question, i) => {
      const qType = pickQuestionType();
      const correctAnswer = generateCorrectAnswer(question, qType);
      const options = qType === 'mcq' ? generateOptions(question, questions) : null;
      return {
        matchId: match.id,
        roundNumber: i + 1,
        soQuestionId: question.question_id,
        questionType: qType,
        questionData: JSON.parse(JSON.stringify(question)),
        correctAnswer,
        options: options ? options : undefined,
      };
    });

    await prisma.duelQuestion.createMany({ data: duelQuestionData });

    logger.info({ matchId: match.id, userId }, 'Duel created');
    return this.getDuelState(match.id);
  }

  async joinDuel(matchId: string, userId: string): Promise<DuelState> {
    const match = await prisma.duelMatch.findUnique({ where: { id: matchId } });
    if (!match) throw AppError.notFound('Duel not found');
    if (match.status !== 'waiting') throw AppError.badRequest('Duel is not available to join');
    if (match.player1Id === userId) throw AppError.badRequest('Cannot join your own duel');

    await prisma.duelMatch.update({
      where: { id: matchId },
      data: { player2Id: userId, status: 'active' },
    });

    logger.info({ matchId, userId }, 'Player joined duel');
    return this.getDuelState(matchId);
  }

  async acceptInvite(matchId: string, userId: string): Promise<DuelState> {
    const match = await prisma.duelMatch.findUnique({ where: { id: matchId } });
    if (!match) throw AppError.notFound('Duel not found');
    if (match.status !== 'invited') throw AppError.badRequest('Duel is not an invitation');
    if (match.player2Id !== userId) throw AppError.forbidden('You are not invited to this duel');

    await prisma.duelMatch.update({
      where: { id: matchId },
      data: { status: 'active' },
    });

    logger.info({ matchId, userId }, 'Invite accepted');
    return this.getDuelState(matchId);
  }

  async rejectInvite(matchId: string, userId: string): Promise<void> {
    const match = await prisma.duelMatch.findUnique({ where: { id: matchId } });
    if (!match) throw AppError.notFound('Duel not found');
    if (match.status !== 'invited') throw AppError.badRequest('Duel is not an invitation');
    if (match.player1Id !== userId && match.player2Id !== userId) throw AppError.forbidden('You are not authorized to cancel/reject this duel');

    await prisma.duelMatch.update({
      where: { id: matchId },
      data: { status: 'cancelled' },
    });

    logger.info({ matchId, userId }, 'Invite rejected');
  }

  async getPendingInvites(userId: string): Promise<DuelState[]> {
    const matches = await prisma.duelMatch.findMany({
      where: {
        player2Id: userId,
        status: 'invited',
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(matches.map((m) => this.getDuelState(m.id)));
  }

  async submitAnswer(matchId: string, userId: string, roundNumber: number, answer: string, timeMs: number): Promise<{
    correct: boolean; round_number: number; feedback?: string; duelQuestion: any;
  }> {
    const match = await prisma.duelMatch.findUnique({ where: { id: matchId } });
    if (!match) throw AppError.notFound('Duel not found');
    if (match.status !== 'active') throw AppError.badRequest('Duel is not active');

    const isPlayer1 = match.player1Id === userId;
    const isPlayer2 = match.player2Id === userId;
    if (!isPlayer1 && !isPlayer2) throw AppError.forbidden('You are not part of this duel');

    const duelQ = await prisma.duelQuestion.findUnique({
      where: { matchId_roundNumber: { matchId, roundNumber } },
    });
    if (!duelQ) throw AppError.notFound('Round not found');

    // Check if already answered
    if (isPlayer1 && duelQ.player1Answer !== null) throw AppError.badRequest('Already answered this round');
    if (isPlayer2 && duelQ.player2Answer !== null) throw AppError.badRequest('Already answered this round');

    // Evaluate
    let correct = false;
    let feedback: string | undefined;

    let evalCorrectAnswer = duelQ.correctAnswer;
    let evalQuestionType: any = duelQ.questionType;

    if (duelQ.questionType === 'mcq') {
      const typesByRound = ['mcq', 'cloze', 'true_false', 'answer_mcq', 'mcq'];
      const rotatedType = typesByRound[roundNumber % typesByRound.length];
      if (rotatedType && rotatedType !== 'mcq') {
        const formatted = formatQuestion(duelQ.questionData as any, rotatedType as any);
        evalCorrectAnswer = formatted.correct_answer;
        evalQuestionType = rotatedType;
      }
    }

    switch (evalQuestionType) {
      case 'cloze':
      case 'answer_mcq':
      case 'true_false':
      case 'mcq': {
        const result = evaluateAnswer('mcq', answer, evalCorrectAnswer);
        correct = result.isCorrect;
        feedback = result.details;
        break;
      }
      case 'fill_in_blank': {
        const result = evaluateAnswer('fill_in_the_blank', answer, evalCorrectAnswer);
        correct = result.isCorrect;
        feedback = result.details;
        break;
      }
      case 'string_answer': {
        const result = evaluateAnswer('string_answer', answer, evalCorrectAnswer);
        correct = result.isCorrect;
        feedback = result.details;
        break;
      }
    }

    // Save answer
    const updateData = isPlayer1
      ? { player1Answer: answer, player1Correct: correct, player1TimeMs: timeMs }
      : { player2Answer: answer, player2Correct: correct, player2TimeMs: timeMs };

    // Save answer + update score atomically
    const scoreField = isPlayer1 ? 'player1Score' : 'player2Score';

    const [updatedDuelQ] = await prisma.$transaction([
      prisma.duelQuestion.update({ where: { id: duelQ.id }, data: updateData }),
      ...(correct
        ? [
            prisma.duelMatch.update({
              where: { id: matchId },
              data: { [scoreField]: { increment: 1 } },
            }),
          ]
        : []),
    ]);

    // Check if duel is complete (only on the final round)
    if (roundNumber === match.rounds) {
      await this.checkDuelCompletion(matchId);
    }

    return { correct, round_number: roundNumber, feedback, duelQuestion: updatedDuelQ };
  }

  async getDuelState(matchId: string): Promise<DuelState> {
    const match = await prisma.duelMatch.findUnique({
      where: { id: matchId },
      include: {
        player1: { select: { id: true, username: true, avatarUrl: true, elo: true } },
        player2: { select: { id: true, username: true, avatarUrl: true, elo: true } },
        questions: { orderBy: { roundNumber: 'asc' } },
      },
    });
    if (!match) throw AppError.notFound('Duel not found');

    const p1: DuelPlayerInfo = {
      user_id: match.player1.id, username: match.player1.username,
      avatar_url: match.player1.avatarUrl, elo: match.player1.elo, score: match.player1Score,
    };
    const p2: DuelPlayerInfo | null = match.player2 ? {
      user_id: match.player2.id, username: match.player2.username,
      avatar_url: match.player2.avatarUrl, elo: match.player2.elo, score: match.player2Score,
    } : null;

    const answeredRounds = match.questions.filter((q) => q.player1Answer !== null && q.player2Answer !== null).length;

    const questions: DuelQuestionPayload[] = match.questions.map((q) => ({
      round_number: q.roundNumber,
      question: q.questionData as unknown as SoQuestion,
      question_type: q.questionType,
      options: q.options as string[] | undefined,
      time_limit: env.DUEL_TIME_LIMIT_SECS,
      player1_answered: q.player1Answer !== null,
      player2_answered: q.player2Answer !== null,
    }));

    return {
      match_id: match.id,
      status: match.status as DuelState['status'],
      player1: p1, player2: p2,
      current_round: answeredRounds + 1,
      total_rounds: match.rounds,
      questions,
      tag: match.tag,
    };
  }

  async getDuelResult(matchId: string): Promise<DuelResult> {
    const match = await prisma.duelMatch.findUnique({
      where: { id: matchId },
      include: {
        player1: { select: { id: true, username: true, elo: true } },
        player2: { select: { id: true, username: true, elo: true } },
        questions: true,
      },
    });
    if (!match) throw AppError.notFound('Duel not found');
    if (match.status !== 'completed') throw AppError.badRequest('Duel is not completed yet');

    const p1Correct = match.questions.filter((q) => q.player1Correct === true).length;
    const p2Correct = match.questions.filter((q) => q.player2Correct === true).length;

    const p1: DuelPlayerResult = {
      user_id: match.player1.id, username: match.player1.username,
      score: match.player1Score, correct_count: p1Correct,
      elo_change: match.player1Elo, new_elo: match.player1.elo,
    };
    const p2: DuelPlayerResult = {
      user_id: match.player2?.id ?? '', username: match.player2?.username ?? 'Unknown',
      score: match.player2Score, correct_count: p2Correct,
      elo_change: match.player2Elo, new_elo: match.player2?.elo ?? 0,
    };

    return { match_id: match.id, winner_id: match.winnerId, player1: p1, player2: p2 };
  }


  /** Called by socket handler after all rounds are answered. */
  async completeDuel(matchId: string): Promise<void> {
    return this.checkDuelCompletion(matchId);
  }

  private async checkDuelCompletion(matchId: string): Promise<void> {
    const match = await prisma.duelMatch.findUnique({
      where: { id: matchId },
      include: { questions: true },
    });
    if (!match || match.status !== 'active') return;

    const allAnswered = match.questions.every((q) =>
      q.player1Answer !== null && q.player2Answer !== null
    );
    if (!allAnswered) return;

    // Determine winner
    let winnerId: string | null = null;
    if (match.player1Score > match.player2Score) winnerId = match.player1Id;
    else if (match.player2Score > match.player1Score) winnerId = match.player2Id;

    // ELO calculation using standard algorithm & parallel DB reads
    const [p1, p2] = await Promise.all([
      prisma.user.findUnique({ where: { id: match.player1Id }, select: { elo: true, totalDuels: true, duelsWon: true } }),
      match.player2Id
        ? prisma.user.findUnique({ where: { id: match.player2Id }, select: { elo: true, totalDuels: true, duelsWon: true } })
        : Promise.resolve(null),
    ]);

    const p1Elo = p1?.elo ?? 1000;
    const p2Elo = p2?.elo ?? 1000;

    let eloChange1 = 0;
    if (winnerId === null) {
      // Draw: manually compute with 0.5 actual score since the algorithm only supports win/loss
      const expected1 = 1 / (1 + Math.pow(10, (p2Elo - p1Elo) / 400));
      eloChange1 = Math.round(32 * (0.5 - expected1));
    } else {
      const eloResult = calculateElo(p1Elo, p2Elo, winnerId === match.player1Id);
      eloChange1 = eloResult.myDelta;
    }
    
    const eloChange2 = -eloChange1;

    // Pre-calculate new win rates in memory to avoid post-transaction updates
    const newTotal1 = (p1?.totalDuels ?? 0) + 1;
    const newWon1 = (p1?.duelsWon ?? 0) + (winnerId === match.player1Id ? 1 : 0);
    const newWinRate1 = newTotal1 > 0 ? newWon1 / newTotal1 : 0;

    let newTotal2 = 0;
    let newWon2 = 0;
    let newWinRate2 = 0;
    if (match.player2Id && p2) {
      newTotal2 = p2.totalDuels + 1;
      newWon2 = p2.duelsWon + (winnerId === match.player2Id ? 1 : 0);
      newWinRate2 = newTotal2 > 0 ? newWon2 / newTotal2 : 0;
    }

    // Single atomic transaction for match completion + ELO settlement
    await prisma.$transaction([
      // 1. Close the match
      prisma.duelMatch.update({
        where: { id: matchId },
        data: {
          status: 'completed', winnerId, completedAt: new Date(),
          player1Elo: eloChange1, player2Elo: eloChange2,
        },
      }),

      // 2. Update Player 1
      prisma.user.update({
        where: { id: match.player1Id },
        data: {
          elo: { increment: eloChange1 }, totalDuels: { increment: 1 },
          ...(winnerId === match.player1Id ? { duelsWon: { increment: 1 } } : {}),
          totalGames: { increment: 1 }, lastActive: new Date(),
          winRate: newWinRate1,
        },
      }),

      // 3. Update Player 2 (if exists)
      ...(match.player2Id
        ? [
            prisma.user.update({
              where: { id: match.player2Id },
              data: {
                elo: { increment: eloChange2 }, totalDuels: { increment: 1 },
                ...(winnerId === match.player2Id ? { duelsWon: { increment: 1 } } : {}),
                totalGames: { increment: 1 }, lastActive: new Date(),
                winRate: newWinRate2,
              },
            }),
          ]
        : []),
    ]);

    logger.info({ matchId, winnerId, eloChange1, eloChange2 }, 'Duel completed');
  }
}

export const duelService = new DuelService();

