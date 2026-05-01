import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { Prisma } from '../../generated/prisma';
import type { GameSession } from '../../generated/prisma';
import type { GameMode, LeaderboardEntry, UserProfile, RecentMatch, League } from '../models/db.types';

import { calculateXPProgression } from '../utils/stackquest.algorithm';

export class ScoreService {
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
      where, orderBy: { score: 'desc' }, take: Math.min(limit, 100),
      select: { username: true, score: true, mode: true, tag: true, createdAt: true },
    });

    return rows.map((r, i) => ({
      rank: i + 1, username: r.username, score: r.score,
      mode: r.mode, tag: r.tag, date: r.createdAt.toISOString().split('T')[0],
    }));
  }

  async getUserProfile(userId: string): Promise<UserProfile> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User not found');

    const achievementCount = await prisma.userAchievement.count({ where: { userId } });
    const totalAchievements = await prisma.achievement.count();

    // Compute rank (by ELO, descending)
    const rank = await prisma.user.count({ where: { elo: { gt: user.elo } } }) + 1;

    const leagueInfo = calculateXPProgression(user.xp);

    return {
      id: user.id, username: user.username, avatar_url: user.avatarUrl,
      title: user.title, bio: user.bio, elo: user.elo, xp: user.xp,
      level: user.level, league: leagueInfo.league.toLowerCase() as League,
      total_duels: user.totalDuels, duels_won: user.duelsWon,
      win_rate: user.winRate, max_streak: user.maxStreak,
      current_streak: user.currentStreak, total_games: user.totalGames,
      achievements_unlocked: achievementCount, achievements_total: totalAchievements,
      rank, league_xp_current: user.xp, league_xp_next: (user.xp + (leagueInfo.xpToNextLeague ?? 0)),
      created_at: user.createdAt.toISOString(),
    };
  }

  async getRecentMatches(userId: string, limit = 10): Promise<RecentMatch[]> {
    const matches = await prisma.duelMatch.findMany({
      where: { OR: [{ player1Id: userId }, { player2Id: userId }], status: 'completed' },
      orderBy: { completedAt: 'desc' }, take: limit,
      include: { player1: { select: { id: true, username: true, avatarUrl: true } }, player2: { select: { id: true, username: true, avatarUrl: true } } },
    });

    return matches.map((m) => {
      const isPlayer1 = m.player1Id === userId;
      const opponent = isPlayer1 ? m.player2 : m.player1;
      const eloChange = isPlayer1 ? m.player1Elo : m.player2Elo;
      let result: 'win' | 'loss' | 'draw' = 'draw';
      if (m.winnerId === userId) result = 'win';
      else if (m.winnerId && m.winnerId !== userId) result = 'loss';
      return {
        match_id: m.id, opponent_username: opponent?.username ?? 'Unknown',
        opponent_avatar_url: opponent?.avatarUrl ?? null,
        result, elo_change: eloChange,
        played_at: (m.completedAt ?? m.createdAt).toISOString(),
      };
    });
  }

  async getUserStats(userId: string): Promise<{
    total_games: number; total_score: number; best_score: number; avg_score: number;
    accuracy: number; streak_record: number; xp: number; level: number;
    favorite_mode: GameMode | null; favorite_tag: string | null;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { xp: true, level: true, maxStreak: true, totalGames: true },
    });
    if (!user) throw AppError.notFound('User not found');

    const agg = await prisma.gameSession.aggregate({
      where: { userId },
      _sum: { score: true }, _max: { score: true }, _avg: { score: true, accuracy: true },
    });

    const modeGroups = await prisma.gameSession.groupBy({
      by: ['mode'], where: { userId }, _count: { mode: true },
      orderBy: { _count: { mode: 'desc' } }, take: 1,
    });

    const tagGroups = await prisma.gameSession.groupBy({
      by: ['tag'], where: { userId, tag: { not: null } }, _count: { tag: true },
      orderBy: { _count: { tag: 'desc' } }, take: 1,
    });

    return {
      total_games: user.totalGames, total_score: agg._sum.score ?? 0,
      best_score: agg._max.score ?? 0, avg_score: Math.round((agg._avg.score ?? 0) * 10) / 10,
      accuracy: Math.round((agg._avg.accuracy ?? 0) * 1000) / 1000,
      streak_record: user.maxStreak, xp: user.xp, level: user.level,
      favorite_mode: (modeGroups[0]?.mode as GameMode) ?? null,
      favorite_tag: tagGroups[0]?.tag ?? null,
    };
  }

  async getUserSessions(userId: string, limit = 10, offset = 0): Promise<GameSession[]> {
    return prisma.gameSession.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: limit, skip: offset,
    });
  }

  async saveGuestScore(opts: {
    username: string; score: number; mode: GameMode; tag: string | null; sessionId: string;
  }): Promise<void> {
    await prisma.leaderboardEntry.create({
      data: {
        sessionId: opts.sessionId, username: opts.username, score: opts.score,
        mode: opts.mode, tag: opts.tag, periodWeek: this.getISOWeek(new Date()),
      },
    });
  }

  private getISOWeek(date: Date): string {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
}

export const scoreService = new ScoreService();
