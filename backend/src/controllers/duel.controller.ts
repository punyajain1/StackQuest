import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { duelService } from '../services/duel.service';
import { achievementService } from '../services/achievement.service';

export const createDuelSchema = z.object({
  tag: z.string().optional(),
});

export const submitAnswerSchema = z.object({
  round_number: z.number().int().positive(),
  answer: z.string().min(1),
  time_ms: z.number().int().min(0).max(300000),
});

export async function createDuel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tag } = req.body as z.infer<typeof createDuelSchema>;
    const state = await duelService.createDuel(req.user!.id, tag);
    res.status(201).json({ success: true, data: state });
  } catch (err) { next(err); }
}

export async function joinDuel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const state = await duelService.joinDuel(req.params.id as string, req.user!.id);
    res.json({ success: true, data: state });
  } catch (err) { next(err); }
}

export async function getDuelState(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const state = await duelService.getDuelState(req.params.id as string);
    res.json({ success: true, data: state });
  } catch (err) { next(err); }
}

export async function submitDuelAnswer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { round_number, answer, time_ms } = req.body as z.infer<typeof submitAnswerSchema>;
    const result = await duelService.submitAnswer(req.params.id as string, req.user!.id, round_number, answer, time_ms);
    await achievementService.checkAndAward(req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getDuelResult(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await duelService.getDuelResult(req.params.id as string);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
