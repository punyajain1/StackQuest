import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { AppError } from '../utils/AppError';
import type { UserPayload } from '../models/db.types';

// Extend Express Request to carry authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

/**
 * Strict auth middleware — rejects requests without a valid JWT.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Authorization header missing or malformed'));
  }

  try {
    const token = authHeader.slice(7);
    req.user = authService.verifyToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional auth middleware — attaches user if token valid, but allows anonymous.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  try {
    const token = authHeader.slice(7);
    req.user = authService.verifyToken(token);
  } catch {
    // Invalid token → treat as anonymous
  }
  next();
}
