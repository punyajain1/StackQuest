import { Router } from 'express';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { gameLimiter } from '../middleware/rateLimit.middleware';
import {
  startDailyChallenge, getDailyQuestions, startPuzzle,
  getNextQuestion, evaluate, endSession, getSession,
  getCategories,
  startPuzzleSchema, evaluateSchema, endSessionSchema,
  getQuestionSchema,
} from '../controllers/game.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Game
 *   description: Daily Challenge & Puzzle game sessions
 */

// ─── Daily Challenge ─────────────────────────────────────────
router.post('/daily/start', requireAuth, startDailyChallenge);
router.get('/daily/questions', requireAuth, getDailyQuestions);

// ─── Puzzle ──────────────────────────────────────────────────
router.post('/puzzle/start', requireAuth, validate(startPuzzleSchema), startPuzzle);

// ─── Shared (both modes) ────────────────────────────────────
router.get('/question', requireAuth, validate(getQuestionSchema, 'query'), getNextQuestion);
router.post('/answer', requireAuth, gameLimiter, validate(evaluateSchema), evaluate);
router.post('/end', requireAuth, validate(endSessionSchema), endSession);
router.get('/session/:id', requireAuth, getSession);

// ─── Categories ──────────────────────────────────────────────
router.get('/categories', getCategories);

export default router;
