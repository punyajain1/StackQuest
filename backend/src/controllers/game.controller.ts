import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { gameService } from '../services/game.service';
import { questionService } from '../services/question.service';
import { achievementService } from '../services/achievement.service';
import { AppError } from '../utils/AppError';
import type { Difficulty, QuestionType } from '../models/db.types';

// ─── Schemas ────────────────────────────────────────────────

export const startDailySchema = z.object({});

export const startPuzzleSchema = z.object({
  tag: z.string().optional().nullable().default(null),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().nullable().default(null),
});

export const getQuestionSchema = z.object({
  session_id: z.string().uuid(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

export const evaluateSchema = z.object({
  session_id: z.string().uuid(),
  knowledge_card_id: z.string().uuid(),
  question_id: z.string(), // The specific sub-question id, e.g., "mcq_1"
  player_answer: z.string(),
  time_taken_ms: z.number().int().min(0).max(300000),
});

export const endSessionSchema = z.object({
  session_id: z.string().uuid(),
});

// ─── Handlers ───────────────────────────────────────────────

export async function startDailyChallenge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const snapshot = await gameService.startDailyChallenge(req.user!.id);
    res.status(201).json({ success: true, data: snapshot });
  } catch (err) { next(err); }
}

export async function getDailyQuestions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const questions = await questionService.getDailyChallenge();
    res.json({ success: true, data: questions });
  } catch (err) { next(err); }
}

export async function startPuzzle(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tag, difficulty } = req.body as z.infer<typeof startPuzzleSchema>;
    const snapshot = await gameService.startPuzzle(req.user!.id, tag, difficulty as Difficulty | null);
    res.status(201).json({ success: true, data: snapshot });
  } catch (err) { next(err); }
}

export async function getNextQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { session_id, difficulty } = req.query as unknown as z.infer<typeof getQuestionSchema>;
    const question = await gameService.getNextQuestion(session_id, difficulty as Difficulty | undefined);
    res.json({ success: true, data: question });
  } catch (err) { next(err); }
}

export async function evaluate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as z.infer<typeof evaluateSchema>;

    const result = await gameService.evaluateAnswer({
      sessionId: body.session_id, 
      knowledgeCardId: body.knowledge_card_id,
      questionId: body.question_id,
      playerAnswer: body.player_answer, 
      timeTakenMs: body.time_taken_ms,
    });

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function endSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { session_id } = req.body as z.infer<typeof endSessionSchema>;
    const finalSession = await gameService.endSession(session_id);

    // Check achievements after game ends
    await achievementService.checkAndAward(req.user!.id);

    res.json({ success: true, data: finalSession });
  } catch (err) { next(err); }
}

export async function getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const session = await gameService.getSession(id as string);
    if (!session) throw AppError.notFound('Session not found');
    res.json({ success: true, data: session });
  } catch (err) { next(err); }
}

export async function getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await questionService.getCategoryStats();
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
}
