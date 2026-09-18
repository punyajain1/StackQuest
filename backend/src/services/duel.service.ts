import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/prisma';
import { questionService } from './question.service';
import { calculateElo } from '../utils/stackquest.algorithm';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import type {
  DuelState, DuelPlayerInfo,
  DuelQuestionPayload, DuelResult, DuelPlayerResult,
} from '../models/db.types';
import type { KnowledgeCard } from '../../generated/prisma';

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

export class DuelService {
  async createDuel(userId: string, tag?: string, opponentId?: string): Promise<DuelState> {
    const rounds = env.DUEL_ROUNDS;
    const cards = await questionService.getQuestionsForDuel(rounds);

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

    const duelQuestionData = cards.map((card, i) => {
      const q = pickRandomQuestion(card);
      if (!q) throw new Error('Knowledge card missing questions');

      // Map strict LLM question format to DB format
      let qType = 'mcq';
      if (q.type === 'true_false') qType = 'string_answer'; // We can adapt true/false as string "true" or "false"
      if (q.type === 'fill_blank') qType = 'fill_in_blank';

      return {
        matchId: match.id,
        roundNumber: i + 1,
        knowledgeCardId: card.id,
        questionType: qType as any,
        questionData: q,
        correctAnswer: q.correctAnswer?.toString() ?? q.answer?.toString() ?? '',
        options: q.options ? q.options : undefined,
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

    if (isPlayer1 && duelQ.player1Answer !== null) throw AppError.badRequest('Already answered this round');
    if (isPlayer2 && duelQ.player2Answer !== null) throw AppError.badRequest('Already answered this round');

    // Simple deterministic evaluation since correct answers are predefined
    // If it's an MCQ, the answer is the index string (e.g. "0"). If fill_blank, exact match lowercase.
    let correct = false;
    let feedback: string | undefined;

    const qData: any = duelQ.questionData;
    const type = qData.type;

    if (type === 'mcq' || type === 'scenario' || type === 'code_output') {
      const correctIndex = parseInt(duelQ.correctAnswer.toString(), 10);
      let expectedText = duelQ.correctAnswer.toString();
      
      if (!isNaN(correctIndex) && Array.isArray(qData.options) && qData.options[correctIndex] !== undefined) {
        expectedText = qData.options[correctIndex].toString();
      }
      
      correct = answer.trim() === expectedText.trim();
    } else if (type === 'true_false') {
      correct = answer.trim().toLowerCase() === duelQ.correctAnswer.toString().toLowerCase();
    } else if (type === 'fill_blank') {
      const accepted = qData.acceptedAnswers?.map((a: string) => a.toLowerCase().trim()) || [qData.answer?.toLowerCase().trim()];
      correct = accepted.includes(answer.toLowerCase().trim());
    }

    if (!correct) {
      feedback = qData.explanation;
    }

    const updateData = isPlayer1
      ? { player1Answer: answer, player1Correct: correct, player1TimeMs: timeMs }
      : { player2Answer: answer, player2Correct: correct, player2TimeMs: timeMs };

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
      question: q.questionData as any,
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
      const expected1 = 1 / (1 + Math.pow(10, (p2Elo - p1Elo) / 400));
      eloChange1 = Math.round(32 * (0.5 - expected1));
    } else {
      const eloResult = calculateElo(p1Elo, p2Elo, winnerId === match.player1Id);
      eloChange1 = eloResult.myDelta;
    }
    
    const eloChange2 = -eloChange1;

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

    await prisma.$transaction([
      prisma.duelMatch.update({
        where: { id: matchId },
        data: {
          status: 'completed', winnerId, completedAt: new Date(),
          player1Elo: eloChange1, player2Elo: eloChange2,
        },
      }),
      prisma.user.update({
        where: { id: match.player1Id },
        data: {
          elo: { increment: eloChange1 }, totalDuels: { increment: 1 },
          ...(winnerId === match.player1Id ? { duelsWon: { increment: 1 } } : {}),
          totalGames: { increment: 1 }, lastActive: new Date(),
          winRate: newWinRate1,
        },
      }),
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
