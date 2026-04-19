import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserPayload } from '../types/api.types';

interface AuthStore {
  user: UserPayload | null;
  token: string | null;
  refreshToken: string | null;
  isGuest: boolean;
  setAuth: (user: UserPayload, token: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      isGuest: false,
      setAuth: (user, token, refreshToken) => set({ user, token, refreshToken, isGuest: user.is_guest }),
      logout: () => set({ user: null, token: null, refreshToken: null, isGuest: false }),
    }),
    {
      name: 'stackquest-auth',
    }
  )
);