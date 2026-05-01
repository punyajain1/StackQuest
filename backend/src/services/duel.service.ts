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

const QUESTION_TYPES: QuestionType[] = ['mcq', 'fill_in_blank', 'string_answer'];

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
  async createDuel(userId: string, tag?: string): Promise<DuelState> {
    const rounds = env.DUEL_ROUNDS;
    const questions = await questionService.getQuestionsForDuel(rounds);

    const match = await prisma.duelMatch.create({
      data: { player1Id: userId, rounds, tag: tag ?? null, status: 'waiting' },
      include: { player1: { select: { id: true, username: true, avatarUrl: true, elo: true } } },
    });

    // Pre-generate duel questions
    for (let i = 0; i < questions.length; i++) {
      const qType = pickQuestionType();
      const correctAnswer = generateCorrectAnswer(questions[i], qType);
      const options = qType === 'mcq' ? generateOptions(questions[i], questions) : null;

      await prisma.duelQuestion.create({
        data: {
          matchId: match.id, roundNumber: i + 1,
          soQuestionId: questions[i].question_id, questionType: qType,
          questionData: JSON.parse(JSON.stringify(questions[i])),
          correctAnswer, options: options ? options : undefined,
        },
      });
    }

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

  async submitAnswer(matchId: string, userId: string, roundNumber: number, answer: string, timeMs: number): Promise<{
    correct: boolean; round_number: number; feedback?: string;
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

    switch (duelQ.questionType) {
      case 'mcq': {
        const result = evaluateAnswer('mcq', answer, duelQ.correctAnswer);
        correct = result.isCorrect;
        feedback = result.details;
        break;
      }
      case 'fill_in_blank': {
        const result = evaluateAnswer('fill_in_the_blank', answer, duelQ.correctAnswer);
        correct = result.isCorrect;
        feedback = result.details;
        break;
      }
      case 'string_answer': {
        const result = evaluateAnswer('string_answer', answer, duelQ.correctAnswer);
        correct = result.isCorrect;
        feedback = result.details;
        break;
      }
    }

    // Save answer
    const updateData = isPlayer1
      ? { player1Answer: answer, player1Correct: correct, player1TimeMs: timeMs }
      : { player2Answer: answer, player2Correct: correct, player2TimeMs: timeMs };

    await prisma.duelQuestion.update({ where: { id: duelQ.id }, data: updateData });

    // Update match score
    if (correct) {
      const scoreField = isPlayer1 ? 'player1Score' : 'player2Score';
      await prisma.duelMatch.update({
        where: { id: matchId },
        data: { [scoreField]: { increment: 1 } },
      });
    }

    // Check if duel is complete
    await this.checkDuelCompletion(matchId);

    return { correct, round_number: roundNumber, feedback };
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
    if (!match) return;

    const allAnswered = match.questions.every((q) =>
      q.player1Answer !== null && q.player2Answer !== null
    );
    if (!allAnswered) return;

    // Determine winner
    let winnerId: string | null = null;
    if (match.player1Score > match.player2Score) winnerId = match.player1Id;
    else if (match.player2Score > match.player1Score) winnerId = match.player2Id;

    // ELO calculation using standard algorithm
    const p1Elo = (await prisma.user.findUnique({ where: { id: match.player1Id }, select: { elo: true } }))?.elo ?? 1000;
    const p2Elo = match.player2Id
      ? (await prisma.user.findUnique({ where: { id: match.player2Id }, select: { elo: true } }))?.elo ?? 1000
      : 1000;

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

    await prisma.duelMatch.update({
      where: { id: matchId },
      data: {
        status: 'completed', winnerId, completedAt: new Date(),
        player1Elo: eloChange1, player2Elo: eloChange2,
      },
    });

    // Update user ELO and stats
    await prisma.user.update({
      where: { id: match.player1Id },
      data: {
        elo: { increment: eloChange1 }, totalDuels: { increment: 1 },
        ...(winnerId === match.player1Id ? { duelsWon: { increment: 1 } } : {}),
        totalGames: { increment: 1 }, lastActive: new Date(),
      },
    });

    if (match.player2Id) {
      await prisma.user.update({
        where: { id: match.player2Id },
        data: {
          elo: { increment: eloChange2 }, totalDuels: { increment: 1 },
          ...(winnerId === match.player2Id ? { duelsWon: { increment: 1 } } : {}),
          totalGames: { increment: 1 }, lastActive: new Date(),
        },
      });

      // Recalculate win rates
      for (const pid of [match.player1Id, match.player2Id]) {
        const u = await prisma.user.findUnique({ where: { id: pid }, select: { totalDuels: true, duelsWon: true } });
        if (u && u.totalDuels > 0) {
          await prisma.user.update({
            where: { id: pid },
            data: { winRate: u.duelsWon / u.totalDuels },
          });
        }
      }
    }

    logger.info({ matchId, winnerId, eloChange1, eloChange2 }, 'Duel completed');
  }
}

export const duelService = new DuelService();
