import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { scoreService } from '../services/score.service';
import type { GameMode } from '../models/db.types';

export const leaderboardSchema = z.object({
  period: z.enum(['all_time', 'weekly']).optional().default('all_time'),
  mode: z.enum(['duel', 'daily_challenge', 'puzzle']).optional(),
  tag: z.string().optional(),
  limit: z.string().optional().default('20').transform(Number),
});

export const saveGuestSchema = z.object({
  username: z.string().min(1).max(50),
  score: z.number().int().min(0),
  mode: z.enum(['duel', 'daily_challenge', 'puzzle']),
  tag: z.string().nullable().optional(),
  session_id: z.string().uuid(),
});

export async function getLeaderboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { period, mode, tag, limit } = req.query as unknown as z.infer<typeof leaderboardSchema>;
    const entries = await scoreService.getLeaderboard({
      period: period as 'all_time' | 'weekly',
      mode: mode as GameMode | undefined,
      tag, limit,
    });
    res.json({ success: true, data: entries });
  } catch (err) { next(err); }
}

export async function getMyStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await scoreService.getUserStats(req.user!.id);
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
}

export async function getMyHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = Math.min(parseInt(req.query.limit as string ?? '10'), 50);
    const offset = parseInt(req.query.offset as string ?? '0');
    const sessions = await scoreService.getUserSessions(req.user!.id, limit, offset);
    res.json({ success: true, data: sessions });
  } catch (err) { next(err); }
}

export async function saveGuestScore(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as z.infer<typeof saveGuestSchema>;
    await scoreService.saveGuestScore({
      username: body.username, score: body.score,
      mode: body.mode as GameMode, tag: body.tag ?? null,
      sessionId: body.session_id,
    });
    res.json({ success: true, data: { message: 'Score saved to leaderboard' } });
  } catch (err) { next(err); }
}
