import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { Prisma } from '../../generated/prisma';
import type { GameSession } from '../../generated/prisma';
import type { GameMode, LeaderboardEntry } from '../models/db.types';

export class ScoreService {
  // ─── Global Leaderboard ────────────────────────────────────

  async getLeaderboard(opts: {
    period?: 'all_time' | 'weekly';
    mode?: GameMode;
    tag?: string;
    limit?: number;
  }): Promise<LeaderboardEntry[]> {
    const { period = 'all_time', mode, tag, limit = 20 } = opts;

    const where: Prisma.LeaderboardEntryWhereInput = {};
    if (period === 'weekly') where.periodWeek = this.getISOWeek(new Date());
    if (mode) where.mode = mode;
    if (tag) where.tag = tag;

    const rows = await prisma.leaderboardEntry.findMany({
      where,
      orderBy: { score: 'desc' },
      take: Math.min(limit, 100),
      select: {
        username: true,
        score: true,
        mode: true,
        tag: true,
        createdAt: true,
      },
    });

    return rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      score: r.score,
      mode: r.mode,
      tag: r.tag,
      date: r.createdAt.toISOString().split('T')[0],
    }));
  }

  // ─── User Stats ────────────────────────────────────────────

  async getUserStats(userId: string): Promise<{
    total_games: number;
    total_score: number;
    best_score: number;
    avg_score: number;
    accuracy: number;
    streak_record: number;
    xp: number;
    level: number;
    favorite_mode: GameMode | null;
    favorite_tag: string | null;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { xp: true, level: true, streakRecord: true, totalGames: true },
    });
    if (!user) throw AppError.notFound('User not found');

    // Aggregate session stats
    const agg = await prisma.gameSession.aggregate({
      where: { userId },
      _sum: { score: true },
      _max: { score: true },
      _avg: { score: true, accuracy: true },
    });

    // Favorite mode (most played)
    const modeGroups = await prisma.gameSession.groupBy({
      by: ['mode'],
      where: { userId },
      _count: { mode: true },
      orderBy: { _count: { mode: 'desc' } },
      take: 1,
    });

    // Favorite tag (most played, non-null)
    const tagGroups = await prisma.gameSession.groupBy({
      by: ['tag'],
      where: { userId, tag: { not: null } },
      _count: { tag: true },
      orderBy: { _count: { tag: 'desc' } },
      take: 1,
    });

    return {
      total_games: user.totalGames,
      total_score: agg._sum.score ?? 0,
      best_score: agg._max.score ?? 0,
      avg_score: Math.round((agg._avg.score ?? 0) * 10) / 10,
      accuracy: Math.round((agg._avg.accuracy ?? 0) * 1000) / 1000,
      streak_record: user.streakRecord,
      xp: user.xp,
      level: user.level,
      favorite_mode: (modeGroups[0]?.mode as GameMode) ?? null,
      favorite_tag: tagGroups[0]?.tag ?? null,
    };
  }

  // ─── Session History ───────────────────────────────────────

  async getUserSessions(
    userId: string,
    limit = 10,
    offset = 0
  ): Promise<GameSession[]> {
    return prisma.gameSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  // ─── Save Guest Score ──────────────────────────────────────

  async saveGuestScore(opts: {
    username: string;
    score: number;
    mode: GameMode;
    tag: string | null;
    sessionId: string;
  }): Promise<void> {
    await prisma.leaderboardEntry.create({
      data: {
        sessionId: opts.sessionId,
        username: opts.username,
        score: opts.score,
        mode: opts.mode,
        tag: opts.tag,
        periodWeek: this.getISOWeek(new Date()),
      },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────

  private getISOWeek(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
}

export const scoreService = new ScoreService();
