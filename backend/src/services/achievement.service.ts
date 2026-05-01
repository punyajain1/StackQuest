import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import type { AchievementInfo } from '../models/db.types';

// ─── Achievement definitions ─────────────────────────────────
const ACHIEVEMENT_SEEDS = [
  { key: 'swift_coder', name: 'Swift Coder', description: 'Answer 10 questions in under 10 seconds each', icon: '⚡', color: '#FFD700', criteria: { type: 'fast_answers', threshold: 10 } },
  { key: 'bug_hunter', name: 'Bug Hunter', description: 'Get 50 correct answers', icon: '🛡️', color: '#00FF00', criteria: { type: 'correct_answers', threshold: 50 } },
  { key: 'streak_master', name: 'Streak Master', description: 'Achieve a 10-question streak', icon: '🔥', color: '#FF6600', criteria: { type: 'max_streak', threshold: 10 } },
  { key: 'legend', name: 'Legend', description: 'Reach Legend league', icon: '🏆', color: '#C0C0C0', criteria: { type: 'league', threshold: 'legend' } },
  { key: 'night_owl', name: 'Night Owl', description: 'Play a game between midnight and 5 AM', icon: '🕐', color: '#808080', criteria: { type: 'night_play', threshold: 1 } },
  { key: 'first_blood', name: 'First Blood', description: 'Win your first duel', icon: '🗡️', color: '#FF0000', criteria: { type: 'duels_won', threshold: 1 } },
  { key: 'duelist', name: 'Duelist', description: 'Win 10 duels', icon: '⚔️', color: '#FF4500', criteria: { type: 'duels_won', threshold: 10 } },
  { key: 'champion', name: 'Champion', description: 'Win 50 duels', icon: '👑', color: '#FFD700', criteria: { type: 'duels_won', threshold: 50 } },
  { key: 'daily_devotee', name: 'Daily Devotee', description: 'Complete 7 daily challenges', icon: '📅', color: '#4169E1', criteria: { type: 'daily_completed', threshold: 7 } },
  { key: 'elo_climber', name: 'ELO Climber', description: 'Reach 1500 ELO', icon: '📈', color: '#32CD32', criteria: { type: 'elo', threshold: 1500 } },
  { key: 'centurion', name: 'Centurion', description: 'Play 100 games', icon: '💯', color: '#9932CC', criteria: { type: 'total_games', threshold: 100 } },
  { key: 'perfectionist', name: 'Perfectionist', description: 'Get 100% accuracy in a session with 5+ questions', icon: '🎯', color: '#FF1493', criteria: { type: 'perfect_session', threshold: 5 } },
];

export class AchievementService {
  /** Seed achievements table on first run. */
  async seedAchievements(): Promise<void> {
    const existing = await prisma.achievement.count();
    if (existing > 0) return;

    await prisma.achievement.createMany({
      data: ACHIEVEMENT_SEEDS.map((a) => ({
        key: a.key, name: a.name, description: a.description,
        icon: a.icon, color: a.color, criteria: a.criteria,
      })),
    });
    logger.info({ count: ACHIEVEMENT_SEEDS.length }, 'Achievements seeded');
  }

  /** Check and award achievements after a game/duel. */
  async checkAndAward(userId: string): Promise<AchievementInfo[]> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return [];

    const allAchievements = await prisma.achievement.findMany();
    const unlocked = await prisma.userAchievement.findMany({
      where: { userId }, select: { achievementId: true },
    });
    const unlockedIds = new Set(unlocked.map((u) => u.achievementId));

    const newlyUnlocked: AchievementInfo[] = [];

    for (const achievement of allAchievements) {
      if (unlockedIds.has(achievement.id)) continue;

      const criteria = achievement.criteria as { type: string; threshold: number | string };
      let earned = false;

      switch (criteria.type) {
        case 'duels_won': earned = user.duelsWon >= (criteria.threshold as number); break;
        case 'max_streak': earned = user.maxStreak >= (criteria.threshold as number); break;
        case 'total_games': earned = user.totalGames >= (criteria.threshold as number); break;
        case 'elo': earned = user.elo >= (criteria.threshold as number); break;
        case 'league': earned = user.league === criteria.threshold; break;
        case 'correct_answers': {
          const count = await prisma.questionAnswer.count({ where: { session: { userId }, correct: true } });
          earned = count >= (criteria.threshold as number);
          break;
        }
        case 'daily_completed': {
          const count = await prisma.gameSession.count({ where: { userId, mode: 'daily_challenge' } });
          earned = count >= (criteria.threshold as number);
          break;
        }
      }

      if (earned) {
        await prisma.userAchievement.create({
          data: { userId, achievementId: achievement.id },
        });
        newlyUnlocked.push({
          id: achievement.id, key: achievement.key, name: achievement.name,
          description: achievement.description, icon: achievement.icon,
          color: achievement.color, unlocked: true,
          unlocked_at: new Date().toISOString(),
        });
      }
    }

    if (newlyUnlocked.length > 0) {
      logger.info({ userId, count: newlyUnlocked.length }, 'New achievements unlocked');
    }
    return newlyUnlocked;
  }

  /** Get all achievements with unlock status for a user. */
  async getAchievements(userId: string): Promise<AchievementInfo[]> {
    const allAchievements = await prisma.achievement.findMany({ orderBy: { createdAt: 'asc' } });
    const unlocked = await prisma.userAchievement.findMany({
      where: { userId }, select: { achievementId: true, unlockedAt: true },
    });

    const unlockedMap = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));

    return allAchievements.map((a) => ({
      id: a.id, key: a.key, name: a.name, description: a.description,
      icon: a.icon, color: a.color,
      unlocked: unlockedMap.has(a.id),
      unlocked_at: unlockedMap.get(a.id)?.toISOString() ?? null,
    }));
  }
}

export const achievementService = new AchievementService();
