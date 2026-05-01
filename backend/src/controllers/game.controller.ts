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
  question_id: z.number().int().positive(),
  question_type: z.enum(['mcq', 'fill_in_blank', 'string_answer']),
  player_answer: z.string().optional(),
  player_choice: z.string().optional(),
  time_taken_ms: z.number().int().min(0).max(300000),
  question_snapshot: z.object({
    question_id: z.number(), title: z.string(), body: z.string().optional().default(''),
    body_markdown: z.string(), tags: z.array(z.string()), score: z.number(),
    answer_count: z.number().optional().default(0),
    accepted_answer_id: z.number().nullable().optional(),
    top_answer_body: z.string().nullable().optional(),
    top_answer_score: z.number().nullable().optional(),
    top_answer_author: z.string().nullable().optional(),
    view_count: z.number().optional().default(0),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    is_answered: z.boolean().optional().default(true),
    creation_date: z.number().optional().default(0),
  }),
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
    if (!body.player_answer && !body.player_choice) {
      throw AppError.badRequest('Either player_answer or player_choice must be provided');
    }

    const result = await gameService.evaluateAnswer({
      sessionId: body.session_id, questionId: body.question_id,
      questionType: body.question_type as QuestionType,
      playerAnswer: body.player_answer, playerChoice: body.player_choice,
      timeTakenMs: body.time_taken_ms,
      question: {
        ...body.question_snapshot,
        body: body.question_snapshot.body ?? '',
        answer_count: body.question_snapshot.answer_count ?? 0,
        accepted_answer_id: body.question_snapshot.accepted_answer_id ?? null,
        top_answer_body: body.question_snapshot.top_answer_body ?? null,
        top_answer_score: body.question_snapshot.top_answer_score ?? null,
        top_answer_author: body.question_snapshot.top_answer_author ?? null,
        view_count: body.question_snapshot.view_count ?? 0,
        difficulty: body.question_snapshot.difficulty ?? 'medium',
        is_answered: body.question_snapshot.is_answered ?? true,
        creation_date: body.question_snapshot.creation_date ?? 0,
      },
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
