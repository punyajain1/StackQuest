import { create } from 'zustand';
import { GameMode, SessionSnapshot } from '../types/api.types';

interface GameStore {
  sessionId: string | null;
  activeMode: GameMode | null;
  activeTag: string | null;
  currentSnapshot: SessionSnapshot | null;
  
  startSession: (sessionId: string, mode: GameMode, tag: string | null, initialSnapshot: SessionSnapshot) => void;
  updateSnapshot: (snapshot: SessionSnapshot) => void;
  endSession: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  sessionId: null,
  activeMode: null,
  activeTag: null,
  currentSnapshot: null,
  
  startSession: (sessionId, activeMode, activeTag, currentSnapshot) => 
    set({ sessionId, activeMode, activeTag, currentSnapshot }),
    
  updateSnapshot: (currentSnapshot) => 
    set({ currentSnapshot }),
    
  endSession: () => 
    set({ sessionId: null, activeMode: null, activeTag: null, currentSnapshot: null })
}));