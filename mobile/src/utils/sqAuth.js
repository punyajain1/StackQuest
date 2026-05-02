/**
 * StackQuest Auth Utility
 * Connects to your custom backend: process.env.EXPO_PUBLIC_API_URL
 * Stores JWT + user in SecureStore under "sq-auth"
 */
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const KEY = "sq-auth-v1";
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

// ─── Store ─────────────────────────────────────────────────────────────────
export const useSQAuth = create((set, get) => ({
  token: null,
  user: null,
  isReady: false,

  // Call once on app start — loads persisted session
  init: async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) {
        const { token, user } = JSON.parse(raw);
        set({ token, user, isReady: true });
      } else {
        set({ isReady: true });
      }
    } catch {
      set({ isReady: true });
    }
  },

  // Persist auth state
  _save: (token, user) => {
    SecureStore.setItemAsync(KEY, JSON.stringify({ token, user }));
    set({ token, user });
  },

  // Clear auth state
  signOut: () => {
    SecureStore.deleteItemAsync(KEY);
    set({ token: null, user: null });
  },

  // ── REST helpers ──────────────────────────────────────────────────────────

  /** POST /api/auth/register */
  register: async (email, password, username) => {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, username }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Registration failed");
    const payload = data.data || data;
    get()._save(payload.token, payload.user || payload);
    return payload;
  },

  /** POST /api/auth/login */
  login: async (email, password) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Login failed");
    const payload = data.data || data;
    get()._save(payload.token, payload.user || payload);
    return payload;
  },

  /** POST /api/auth/guest */
  guestLogin: async () => {
    const res = await fetch(`${API_URL}/api/auth/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Guest login failed");
    const payload = data.data || data;
    get()._save(payload.token, payload.user || payload);
    return payload;
  },

  /** PATCH /api/auth/profile — update username / avatar / bio */
  updateProfile: async (fields) => {
    const { token } = get();
    const res = await fetch(`${API_URL}/api/auth/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(fields),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Update failed");
    // Merge updated fields into persisted user
    const payload = data.data || data;
    const updated = { ...get().user, ...payload };
    get()._save(token, updated);
    return updated;
  },

  /** Attach auth header to any fetch call */
  authFetch: async (url, options = {}) => {
    const { token } = get();
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  },
}));
