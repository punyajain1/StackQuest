import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  id: string;
  username: string;
  avatarUrl: string;
  avatarStyle: string;
  isGuest: boolean;
  elo: number;
  totalXp: number;
  totalDuels: number;
  wins: number;
  losses: number;
  maxStreak: number;
  stacks: string[];
  bio?: string;
  onboarded: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  setUser: (u: User | null) => void;
  patchUser: (p: Partial<User>) => void;
  logout: () => void;
  // Live REST API Integration methods
  fetchUserProfile: () => Promise<User | null>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username?: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  syncProfileWithBackend: (data: { username?: string; avatarUrl?: string; bio?: string }) => Promise<void>;
}

const API_BASE = "http://localhost:3000/api";

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => {
      // Helper function to fetch the full user profile from backend
      const fetchProfile = async (token: string, currentLocalUser: Partial<User> = {}): Promise<User | null> => {
        try {
          const res = await fetch(`${API_BASE}/users/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const json = await res.json();
          if (!json.success) {
            console.error("Failed to fetch user profile", json.error);
            return null;
          }
          const p = json.data;
          
          return {
            id: p.id,
            username: p.username,
            avatarUrl: p.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.username}`,
            avatarStyle: currentLocalUser.avatarStyle || "pixel-art",
            isGuest: p.is_guest ?? !p.email,
            elo: p.elo,
            totalXp: p.xp,
            totalDuels: p.total_duels,
            wins: p.duels_won,
            losses: p.total_duels - p.duels_won,
            maxStreak: p.max_streak,
            stacks: currentLocalUser.stacks || [],
            bio: p.bio || "",
            onboarded: currentLocalUser.onboarded ?? false,
          };
        } catch (err) {
          console.error("Error fetching profile:", err);
          return null;
        }
      };

      return {
        user: null,
        token: null,
        refreshToken: null,
        
        setUser: (user) => set({ user, token: user ? `mock.${user.id}` : null }),
        
        patchUser: (p) => {
          const u = get().user;
          if (!u) return;
          set({ user: { ...u, ...p } });
        },
        
        logout: () => set({ user: null, token: null, refreshToken: null }),

        fetchUserProfile: async () => {
          const s = get();
          if (!s.token || s.token.startsWith("mock.")) return null;
          const user = await fetchProfile(s.token, s.user || {});
          if (user) {
            set({ user });
          }
          return user;
        },

        login: async (email, password) => {
          const res = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          const json = await res.json();
          if (!json.success) {
            throw new Error(json.error?.message || "Invalid email or password");
          }
          const { token, refreshToken } = json.data;
          const fullUser = await fetchProfile(token, { onboarded: true });
          if (!fullUser) throw new Error("Failed to load user profile");
          set({ user: fullUser, token, refreshToken });
        },

        register: async (email, password, username) => {
          const res = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, username }),
          });
          const json = await res.json();
          if (!json.success) {
            throw new Error(json.error?.message || "Registration failed");
          }
          const { token, refreshToken } = json.data;
          const fullUser = await fetchProfile(token, { onboarded: false });
          if (!fullUser) throw new Error("Failed to load profile after registration");
          set({ user: fullUser, token, refreshToken });
        },

        loginAsGuest: async () => {
          const res = await fetch(`${API_BASE}/auth/guest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          const json = await res.json();
          if (!json.success) {
            throw new Error(json.error?.message || "Guest authentication failed");
          }
          const { token, refreshToken } = json.data;
          const fullUser = await fetchProfile(token, { onboarded: false });
          if (!fullUser) throw new Error("Failed to load profile for guest");
          set({ user: fullUser, token, refreshToken });
        },

        syncProfileWithBackend: async (data) => {
          const s = get();
          if (!s.token || s.token.startsWith("mock.")) {
            // fallback for mock environment
            s.patchUser({
              username: data.username || s.user?.username,
              avatarUrl: data.avatarUrl || s.user?.avatarUrl,
              bio: data.bio || s.user?.bio,
            });
            return;
          }

          const res = await fetch(`${API_BASE}/auth/profile`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${s.token}`,
            },
            body: JSON.stringify({
              username: data.username,
              avatar_url: data.avatarUrl,
              bio: data.bio,
            }),
          });
          const json = await res.json();
          if (!json.success) {
            throw new Error(json.error?.message || "Failed to update profile on backend");
          }
          const updated = json.data;
          set({
            user: s.user ? {
              ...s.user,
              username: updated.username,
              avatarUrl: updated.avatarUrl || s.user.avatarUrl,
              bio: updated.bio || s.user.bio,
            } : null
          });
        },
      };
    },
    { name: "stackquest.auth" },
  ),
);

export const computeLevel = (xp: number) => Math.floor(Math.sqrt(xp / 100)) + 1;
export const xpForLevel = (level: number) => Math.pow(level - 1, 2) * 100;
