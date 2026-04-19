import rateLimit from 'express-rate-limit';
import { AppError } from '../utils/AppError';

/** General API rate limiter: 100 req/min per IP */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Too many requests. Please slow down.', 'RATE_LIMIT'));
  },
});

/** Auth endpoints: 10 attempts per 15 minutes per IP */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Too many auth attempts. Try again in 15 minutes.', 'AUTH_RATE_LIMIT'));
  },
});

/** Game evaluate: 60 req/min per IP (one per question ~every second) */
export const gameLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(AppError.tooManyRequests('Slow down! You are playing too fast.', 'GAME_RATE_LIMIT'));
  },
});
