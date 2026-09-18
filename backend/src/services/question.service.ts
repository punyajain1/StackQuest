import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import type { Difficulty, KnowledgeCard } from '../../generated/prisma';
import { Prisma } from '../../generated/prisma';

export const SUPPORTED_TAGS = [
  'javascript', 'python', 'java', 'c#', 'c++', 'php',
  'typescript', 'react', 'node.js', 'css', 'html',
  'sql', 'mongodb', 'docker', 'git', 'linux', 'bash',
  'regex', 'algorithms', 'data-structures', 'swift',
  'kotlin', 'rust', 'go', 'ruby', 'angular', 'vue.js',
];

export interface CategoryStats {
  tag: string;
  count: number;
}

export class QuestionService {
  async getNextQuestion(opts: {
    tag?: string | null;
    difficulty?: Difficulty;
    excludeIds?: string[];
  }): Promise<KnowledgeCard> {
    const { tag, difficulty, excludeIds = [] } = opts;
    const where: Prisma.KnowledgeCardWhereInput = {
      ...(tag ? { topic: tag } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    };
    
    const candidates = await prisma.knowledgeCard.findMany({ 
      where, 
      take: 50, 
      orderBy: { generatedAt: 'desc' } 
    });
    
    if (!candidates.length) {
      throw AppError.notFound('No questions available for the specified criteria');
    }
    
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  async getQuestionsForDuel(count: number, excludeIds: string[] = []): Promise<KnowledgeCard[]> {
    const where: Prisma.KnowledgeCardWhereInput = {
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    };
    
    const candidates = await prisma.knowledgeCard.findMany({ 
      where, 
      take: count * 5, 
      orderBy: { generatedAt: 'desc' } 
    });
    
    if (candidates.length < count) {
      throw AppError.notFound('Not enough questions available for a duel');
    }
    
    return this.shuffle(candidates).slice(0, count);
  }

  async getQuestionsForPuzzle(tag: string | null, difficulty: Difficulty | null, count: number, excludeIds: string[] = []): Promise<KnowledgeCard[]> {
    const where: Prisma.KnowledgeCardWhereInput = {
      ...(tag ? { topic: tag } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    };
    
    const candidates = await prisma.knowledgeCard.findMany({ 
      where, 
      take: count * 5, 
      orderBy: { generatedAt: 'desc' } 
    });
    
    if (candidates.length < count) {
      throw AppError.notFound('Not enough questions available for puzzle');
    }
    
    return this.shuffle(candidates).slice(0, count);
  }

  async getCategoryStats(): Promise<CategoryStats[]> {
    const rows = await prisma.$queryRaw<Array<{ topic: string; count: bigint }>>`
      SELECT topic, COUNT(*)::bigint AS count
      FROM knowledge_cards GROUP BY topic ORDER BY count DESC LIMIT 50`;
    return rows.map((r) => ({ tag: r.topic, count: Number(r.count) }));
  }

  async getDailyChallenge(): Promise<KnowledgeCard[]> {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const existing = await prisma.dailyChallenge.findUnique({ where: { date: today } });
    let ids: string[];
    
    if (existing) { 
      ids = existing.knowledgeCardIds; 
    } else {
      const todayStr = today.toISOString().slice(0, 10);
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM knowledge_cards
        ORDER BY md5(id::text || ${todayStr})
        LIMIT 10`;
        
      ids = rows.map((r) => r.id);
      
      if (ids.length > 0) {
        await prisma.dailyChallenge.upsert({ 
          where: { date: today }, 
          create: { date: today, knowledgeCardIds: ids }, 
          update: {} 
        });
      }
    }
    
    const cards = await prisma.knowledgeCard.findMany({ 
      where: { id: { in: ids } } 
    });
    return cards;
  }

  private shuffle<T>(arr: T[]): T[] {
    return arr.map((v) => ({ v, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ v }) => v);
  }
}

export const questionService = new QuestionService();
