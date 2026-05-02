
import * as SecureStore from 'expo-secure-store';
import { io } from 'socket.io-client';

// Get base URL from environment or default to local backend
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
export const API_PREFIX = `${BASE_URL}/api`;

const getAuthToken = async () => {
  try {
    const authString = await SecureStore.getItemAsync("sq-auth-v1");
    if (authString) {
      const auth = JSON.parse(authString);
      return auth?.token || auth?.jwt || null;
    }
  } catch (error) {
    console.error("Error retrieving auth token", error);
  }
  return null;
};

/**
 * Generic fetch wrapper to handle authorization and JSON parsing
 */
const fetchAPI = async (endpoint, options = {}) => {
  const token = await getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_PREFIX}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'API request failed');
  }

  // Handle empty responses
  const text = await response.text();
  return text ? JSON.parse(text) : {};
};

// --- 1. Authentication Endpoints ---
export const AuthAPI = {
  register: (data) => fetchAPI('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => fetchAPI('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  guest: () => fetchAPI('/auth/guest', { method: 'POST' }),
  refresh: (refreshToken) => fetchAPI('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
  getProfile: () => fetchAPI('/auth/me', { method: 'GET' }),
  updateProfile: (data) => fetchAPI('/auth/profile', { method: 'PATCH', body: JSON.stringify(data) }),
};

// --- 2. Game Endpoints ---
export const GameAPI = {
  startDaily: () => fetchAPI('/game/daily/start', { method: 'POST' }),
  getDailyQuestions: () => fetchAPI('/game/daily/questions', { method: 'GET' }),
  startPuzzle: (data) => fetchAPI('/game/puzzle/start', { method: 'POST', body: JSON.stringify(data) }),
  getQuestion: (sessionId, difficulty) => {
    const query = new URLSearchParams({ session_id: sessionId });
    if (difficulty) query.append('difficulty', difficulty);
    return fetchAPI(`/game/question?${query.toString()}`, { method: 'GET' });
  },
  submitAnswer: (data) => fetchAPI('/game/answer', { method: 'POST', body: JSON.stringify(data) }),
  endSession: (sessionId) => fetchAPI('/game/end', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }),
  getSessionDetails: (id) => fetchAPI(`/game/session/${id}`, { method: 'GET' }),
  getCategories: () => fetchAPI('/game/categories', { method: 'GET' }),
};

// --- 3. Duel System Endpoints ---
export const DuelAPI = {
  createDuel: (data) => fetchAPI('/duel/create', { method: 'POST', body: JSON.stringify(data) }),
  joinDuel: (id) => fetchAPI(`/duel/${id}/join`, { method: 'POST' }),
  getDuelState: (id) => fetchAPI(`/duel/${id}/state`, { method: 'GET' }),
  getDuelResult: (id) => fetchAPI(`/duel/${id}/result`, { method: 'GET' }),
};

// --- 4. Friend System Endpoints ---
export const FriendsAPI = {
  getFriends: () => fetchAPI('/friends/', { method: 'GET' }),
  getPendingRequests: () => fetchAPI('/friends/pending', { method: 'GET' }),
  sendRequest: (username) => fetchAPI('/friends/request', { method: 'POST', body: JSON.stringify({ username }) }),
  acceptRequest: (id) => fetchAPI(`/friends/${id}/accept`, { method: 'POST' }),
  rejectRequest: (id) => fetchAPI(`/friends/${id}/reject`, { method: 'POST' }),
  removeFriend: (id) => fetchAPI(`/friends/${id}`, { method: 'DELETE' }),
  blockUser: (id) => fetchAPI(`/friends/${id}/block`, { method: 'POST' }),
};

// --- 5. User Profiles & Search Endpoints ---
export const UsersAPI = {
  getMyProfile: () => fetchAPI('/users/me', { method: 'GET' }),
  getPublicProfile: (id) => fetchAPI(`/users/${id}/profile`, { method: 'GET' }),
  getAchievements: (id) => fetchAPI(id ? `/users/${id}/achievements` : '/users/achievements', { method: 'GET' }),
  searchUsers: (query) => fetchAPI(`/users/search?q=${encodeURIComponent(query)}`, { method: 'GET' }),
};

// --- 6. Leaderboard & Stats Endpoints ---
export const ScoresAPI = {
  getLeaderboard: (params = {}) => {
    // Note: URLSearchParams in React Native might need a polyfill if used with complex objects, but standard usage is fine
    const queryParts = [];
    if (params.period) queryParts.push(`period=${params.period}`);
    if (params.mode) queryParts.push(`mode=${params.mode}`);
    if (params.tag) queryParts.push(`tag=${params.tag}`);
    if (params.limit) queryParts.push(`limit=${params.limit}`);
    const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    
    return fetchAPI(`/scores/leaderboard${queryString}`, { method: 'GET' });
  },
  getMyStats: () => fetchAPI('/scores/stats', { method: 'GET' }),
  getMyHistory: (limit = 10, offset = 0) => fetchAPI(`/scores/history?limit=${limit}&offset=${offset}`, { method: 'GET' }),
  saveGuestScore: (data) => fetchAPI('/scores/guest', { method: 'POST', body: JSON.stringify(data) }),
};

// --- 7. WebSockets: Real-Time Gameplay ---
export const createWebSocketConnection = async (namespace) => {
  const token = await getAuthToken();
  const socket = io(`${BASE_URL}${namespace}`, {
    auth: { token },
  });
  return socket;
};

export const connectDuelSocket = () => createWebSocketConnection('/duel');
export const connectDailySocket = () => createWebSocketConnection('/daily');

export default {
  Auth: AuthAPI,
  Game: GameAPI,
  Duel: DuelAPI,
  Friends: FriendsAPI,
  Users: UsersAPI,
  Scores: ScoresAPI,
  connectDuelSocket,
  connectDailySocket,
};
