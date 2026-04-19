import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { gameService } from '../services/game.service';
import { questionService } from '../services/question.service';
import { AppError } from '../utils/AppError';
import type { GameMode, Difficulty } from '../models/db.types';

// ─── Schemas ────────────────────────────────────────────────

export const startSessionSchema = z.object({
  mode: z.enum(['judge', 'score_guesser', 'answer_arena', 'multiple_choice', 'tag_guesser']),
  tag: z.string().optional().nullable().default(null),
  is_daily: z.boolean().optional().default(false),
});

export const getQuestionSchema = z.object({
  session_id: z.string().uuid(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

export const evaluateSchema = z.object({
  session_id: z.string().uuid(),
  question_id: z.number().int().positive(),
  player_answer: z.string().optional(),
  player_choice: z.string().optional(),
  time_taken_ms: z.number().int().min(0).max(300000),
  // Full question snapshot sent back by client (avoids re-fetching from DB)
  question_snapshot: z.object({
    question_id: z.number(),
    score: z.number(),
    tags: z.array(z.string()),
    top_answer_text: z.string().nullable().optional(),
    body_markdown: z.string(),
    title: z.string(),
    body: z.string().optional().default(''),
    answer_count: z.number().optional().default(0),
    accepted_answer_id: z.number().nullable().optional(),
    top_answer_score: z.number().nullable().optional(),
    view_count: z.number().optional().default(0),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    is_answered: z.boolean().optional().default(true),
    creation_date: z.number().optional().default(0),
  }),
});

export const endSessionSchema = z.object({
  session_id: z.string().uuid(),
});

// ─── Controller functions ────────────────────────────────────

export async function startSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { mode, tag, is_daily } = req.body as z.infer<typeof startSessionSchema>;
    const userId = req.user!.id;
    const snapshot = await gameService.startSession(userId, mode as GameMode, tag, is_daily);
    res.status(201).json({ success: true, data: snapshot });
  } catch (err) {
    next(err);
  }
}

export async function getNextQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { session_id, difficulty } = req.query as z.infer<typeof getQuestionSchema>;
    const question = await gameService.getNextQuestion(session_id, difficulty as Difficulty | undefined);
    res.json({ success: true, data: question });
  } catch (err) {
    next(err);
  }
}

export async function evaluate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as z.infer<typeof evaluateSchema>;

    if (!body.player_answer && !body.player_choice) {
      throw AppError.badRequest('Either player_answer or player_choice must be provided');
    }

    const result = await gameService.evaluateAnswer({
      sessionId: body.session_id,
      questionId: body.question_id,
      playerAnswer: body.player_answer,
      playerChoice: body.player_choice,
      timeTakenMs: body.time_taken_ms,
      question: {
        ...body.question_snapshot,
        body: body.question_snapshot.body ?? '',
        answer_count: body.question_snapshot.answer_count ?? 0,
        accepted_answer_id: body.question_snapshot.accepted_answer_id ?? null,
        top_answer_text: body.question_snapshot.top_answer_text ?? null,
        top_answer_score: body.question_snapshot.top_answer_score ?? null,
        view_count: body.question_snapshot.view_count ?? 0,
        difficulty: body.question_snapshot.difficulty ?? 'medium',
        is_answered: body.question_snapshot.is_answered ?? true,
        creation_date: body.question_snapshot.creation_date ?? 0,
      },
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function endSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { session_id } = req.body as z.infer<typeof endSessionSchema>;
    const finalSession = await gameService.endSession(session_id);
    res.json({ success: true, data: finalSession });
  } catch (err) {
    next(err);
  }
}

export async function getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const session = await gameService.getSession(id as string);
    if (!session) throw AppError.notFound('Session not found');
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

export async function getDailyChallenge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const questions = await questionService.getDailyChallenge();
    res.json({ success: true, data: questions });
  } catch (err) {
    next(err);
  }
}
