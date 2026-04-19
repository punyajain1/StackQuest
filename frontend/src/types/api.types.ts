export type GameMode = 'judge' | 'score_guesser' | 'answer_arena' | 'multiple_choice' | 'tag_guesser';

export interface UserPayload {
  id: string;
  username: string;
  email: string | null;
  is_guest: boolean;
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
  difficulty: 'easy' | 'medium' | 'hard';
  is_answered: boolean;
  creation_date: number;
}

export interface GameQuestion {
  question: SoQuestion;
  mode: GameMode;
  options: string[] | null;
  timeLimit: number;
}

export interface EvaluationResult {
  similarity: number;
  points: number;
  label: 'excellent' | 'great' | 'good' | 'partial' | 'off';
  feedback: string;
}

export interface EvaluateResponse {
  correct: boolean;
  scoreEarned: number;
  xpEarned: number;
  evaluationResult: EvaluationResult | null;
  snapshot: SessionSnapshot;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    message: string;
    code: string;
    statusCode: number;
  };
}