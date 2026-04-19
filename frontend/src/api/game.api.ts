import { apiClient } from './client';
import { ApiResponse, GameMode, SessionSnapshot, GameQuestion, EvaluateResponse, SoQuestion } from '../types/api.types';

export const GameApi = {
  startSession: (mode: GameMode, tag?: string | null, isDaily: boolean = false) => 
    apiClient.post<any, ApiResponse<SessionSnapshot>>('/game/session/start', { mode, tag, is_daily: isDaily }),
    
  getQuestion: (sessionId: string, difficulty?: 'easy' | 'medium' | 'hard') => 
    apiClient.get<any, ApiResponse<GameQuestion>>(`/game/question`, { params: { session_id: sessionId, difficulty } }),
    
  evaluate: (sessionId: string, questionId: number, params: {
    player_choice?: string;
    player_answer?: string;
    time_taken_ms: number;
    question_snapshot: SoQuestion;
  }) => 
    apiClient.post<any, ApiResponse<EvaluateResponse>>('/game/evaluate', {
      session_id: sessionId,
      question_id: questionId,
      ...params
    }),
    
  endSession: (sessionId: string) => 
    apiClient.post<any, ApiResponse<any>>('/game/session/end', { session_id: sessionId }),
};