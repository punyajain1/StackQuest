import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  username: z.string().min(3).max(30).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const updateProfileSchema = z.object({
  username: z.string().min(3).max(30).optional(),
  avatar_url: z.string().url().optional(),
  bio: z.string().max(200).optional(),
});

export const authSchemas = { registerSchema, loginSchema, refreshSchema, updateProfileSchema };

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, username } = req.body as z.infer<typeof registerSchema>;
    const result = await authService.register(email, password, username);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const result = await authService.login(email, password);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function createGuest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.createGuest();
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
    const result = await authService.refresh(refreshToken);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const safeUser = await authService.getProfile(req.user!.id);
    res.json({ success: true, data: safeUser });
  } catch (err) { next(err); }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = req.body as z.infer<typeof updateProfileSchema>;
    const updated = await authService.updateProfile(req.user!.id, {
      username: data.username,
      avatarUrl: data.avatar_url,
      bio: data.bio,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}
