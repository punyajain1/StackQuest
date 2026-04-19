import axios from 'axios';
import { useAuthStore } from '../stores/auth.store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;

    // Auto-refresh logic could go here if needed.
    // We would use the /auth/refresh endpoint with useAuthStore.getState().refreshToken
    
    // For now we'll just log users out if authorization fails completely
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      // Handle actual auto refresh later. For now let auth store clear token.
      if (error.response.config.url !== '/auth/refresh') {
        const { refreshToken, logout, setAuth } = useAuthStore.getState();
        if (refreshToken) {
          try {
             // Mocking the auto-refresh to show how it fits
             const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
             if (data?.success) {
               const user = useAuthStore.getState().user;
               setAuth(user!, data.data.token, data.data.refreshToken);
               originalRequest.headers.Authorization = `Bearer ${data.data.token}`;
               return axios(originalRequest);
             }
          } catch(e) {
            logout();
          }
        } else {
             logout();
        }
      }
    }
    
    return Promise.reject(error.response?.data || error);
  }
);