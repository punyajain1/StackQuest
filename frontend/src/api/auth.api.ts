import { apiClient } from './client';
import { ApiResponse, UserPayload } from '../types/api.types';

interface AuthResponse {
  user: UserPayload;
  token: string;
  refreshToken: string;
}

export const AuthApi = {
  createGuest: () => 
    apiClient.post<any, ApiResponse<AuthResponse>>('/auth/guest'),
    
  getMe: () => 
    apiClient.get<any, ApiResponse<UserPayload>>('/auth/me'),
};