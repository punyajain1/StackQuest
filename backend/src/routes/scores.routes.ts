import { Router } from 'express';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getLeaderboard, getMyStats, getMyHistory, saveGuestScore,
  leaderboardSchema, saveGuestSchema,
} from '../controllers/scores.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Scores
 *   description: Leaderboard and score management
 */

/**
 * @swagger
 * /api/scores/leaderboard:
 *   get:
 *     summary: Get leaderboard (all-time or weekly, filterable by mode/tag)
 *     tags: [Scores]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [all_time, weekly] }
 *       - in: query
 *         name: mode
 *         schema: { type: string }
 *       - in: query
 *         name: tag
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 */
router.get('/leaderboard', validate(leaderboardSchema, 'query'), getLeaderboard);

/**
 * @swagger
 * /api/scores/me/stats:
 *   get:
 *     summary: Get authenticated user's stats
 *     tags: [Scores]
 *     security:
 *       - bearerAuth: []
 */
router.get('/me/stats', requireAuth, getMyStats);

/**
 * @swagger
 * /api/scores/me/history:
 *   get:
 *     summary: Get authenticated user's game history
 *     tags: [Scores]
 *     security:
 *       - bearerAuth: []
 */
router.get('/me/history', requireAuth, getMyHistory);

/**
 * @swagger
 * /api/scores/guest:
 *   post:
 *     summary: Save a guest score to the leaderboard
 *     tags: [Scores]
 */
router.post('/guest', validate(saveGuestSchema), saveGuestScore);

export default router;
