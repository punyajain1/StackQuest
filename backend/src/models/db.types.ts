/**
 * Application-level types.
 *
 * DB row types (DbUser, DbGameSession, etc.) have been replaced by
 * Prisma-generated types. Import them from '../../generated/prisma' where needed.
 *
 * This file retains only types that are NOT in the Prisma schema:
 * API response shapes, game logic types, and custom view types.
 */

// Import Prisma enums so they're usable as local names AND re-exported
import type { GameMode, Difficulty } from '../../generated/prisma';
export type { GameMode, Difficulty };
export type {
  User,
  GameSession,
  QuestionAnswer,
  SoQuestionCache,
  LeaderboardEntry as PrismaLeaderboardEntry,
  DailyChallenge,
} from '../../generated/prisma';

// ─── Stack Overflow API shapes ───────────────────────────────

export interface SoQuestion {
  question_id: number;
  title: string;
  body: string;
  body_markdown: string;
  tags: string[];
  score: number;
  answer_count: number;
  accepted_answer_id: number | null;
  top_answer_text: string | null;
  top_answer_score: number | null;
  view_count: number;
  difficulty: Difficulty;
  is_answered: boolean;
  creation_date: number;
}

export interface SoAnswer {
  answer_id: number;
  question_id: number;
  score: number;
  is_accepted: boolean;
  body: string;
  body_markdown: string;
  owner: {
    display_name: string;
    reputation: number;
  };
}

// ─── Game logic types ────────────────────────────────────────

export interface EvaluationResult {
  similarity: number;      // 0.0 – 1.0
  points: number;
  label: 'off' | 'partial' | 'good' | 'great' | 'excellent';
  feedback: string;
}

export interface GameQuestion {
  question: SoQuestion;
  mode: GameMode;
  options?: string[];       // for multiple_choice / tag_guesser
  timeLimit: number;        // seconds
}

export interface SessionSnapshot {
  session_id: string;
  score: number;
  streak: number;
  streak_multiplier: number;
  questions_answered: number;
  correct_count: number;
  xp_earned: number;
}

export type ScoreRange = '0-10' | '10-100' | '100-500' | '500+';

// ─── Auth types ──────────────────────────────────────────────

export interface UserPayload {
  id: string;
  username: string;
  email: string;
  is_guest: boolean;
}

// ─── Leaderboard view type (includes computed rank) ──────────

export interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  mode: GameMode;
  tag: string | null;
  date: string;
}

export interface CategoryStats {
  tag: string;
  count: number;
  avg_score: number;
}
