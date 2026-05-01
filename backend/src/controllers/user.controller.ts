import { Request, Response, NextFunction } from 'express';
import { scoreService } from '../services/score.service';
import { achievementService } from '../services/achievement.service';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.params.id as string;
    const profile = await scoreService.getUserProfile(userId);
    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
}

export async function getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await scoreService.getUserProfile(req.user!.id);
    const recentMatches = await scoreService.getRecentMatches(req.user!.id, 10);
    res.json({ success: true, data: { ...profile, recent_matches: recentMatches } });
  } catch (err) { next(err); }
}

export async function getAchievements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req.params.id as string) ?? req.user!.id;
    const achievements = await achievementService.getAchievements(userId);
    res.json({ success: true, data: achievements });
  } catch (err) { next(err); }
}

export async function searchUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = (req.query.q as string)?.trim();
    if (!query || query.length < 2) throw AppError.badRequest('Search query must be at least 2 characters');

    const users = await prisma.user.findMany({
      where: {
        username: { contains: query, mode: 'insensitive' },
        isGuest: false,
      },
      select: { id: true, username: true, avatarUrl: true, elo: true, league: true },
      take: 20,
    });

    res.json({ success: true, data: users });
  } catch (err) { next(err); }
}
