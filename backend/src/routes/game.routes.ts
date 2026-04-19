import { Router } from 'express';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { gameLimiter } from '../middleware/rateLimit.middleware';
import {
  startSession, getNextQuestion, evaluate, endSession,
  getSession, getDailyChallenge,
  startSessionSchema, getQuestionSchema, evaluateSchema, endSessionSchema,
} from '../controllers/game.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Game
 *   description: Game session and question endpoints
 */

/**
 * @swagger
 * /api/game/session/start:
 *   post:
 *     summary: Start a new game session
 *     tags: [Game]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode]
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [judge, score_guesser, answer_arena, multiple_choice, tag_guesser]
 *               tag:
 *                 type: string
 *                 nullable: true
 *               is_daily:
 *                 type: boolean
 */
router.post('/session/start', requireAuth, validate(startSessionSchema), startSession);

/**
 * @swagger
 * /api/game/session/{id}:
 *   get:
 *     summary: Get session summary
 *     tags: [Game]
 *     security:
 *       - bearerAuth: []
 */
router.get('/session/:id', requireAuth, getSession);

/**
 * @swagger
 * /api/game/session/end:
 *   post:
 *     summary: End a game session and finalize score
 *     tags: [Game]
 */
router.post('/session/end', requireAuth, validate(endSessionSchema), endSession);

/**
 * @swagger
 * /api/game/question:
 *   get:
 *     summary: Get next question for session
 *     tags: [Game]
 *     parameters:
 *       - in: query
 *         name: session_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: difficulty
 *         schema: { type: string, enum: [easy, medium, hard] }
 */
router.get('/question', requireAuth, validate(getQuestionSchema, 'query'), getNextQuestion);

/**
 * @swagger
 * /api/game/evaluate:
 *   post:
 *     summary: Submit an answer and receive score + feedback
 *     tags: [Game]
 */
router.post('/evaluate', requireAuth, gameLimiter, validate(evaluateSchema), evaluate);

/**
 * @swagger
 * /api/game/daily:
 *   get:
 *     summary: Get today's daily challenge questions
 *     tags: [Game]
 */
router.get('/daily', getDailyChallenge);

export default router;
