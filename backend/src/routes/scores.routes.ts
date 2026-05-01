import { Router } from 'express';
import { validate } from '../middleware/validate.middleware';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';
import {
  getLeaderboard, getMyStats, getMyHistory, saveGuestScore,
  leaderboardSchema, saveGuestSchema,
} from '../controllers/scores.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Scores
 *   description: Leaderboards and user stats
 */

router.get('/leaderboard', optionalAuth, validate(leaderboardSchema, 'query'), getLeaderboard);
router.get('/stats', requireAuth, getMyStats);
router.get('/history', requireAuth, getMyHistory);
router.post('/guest', validate(saveGuestSchema), saveGuestScore);

export default router;
