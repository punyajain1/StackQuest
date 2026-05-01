import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getProfile, getMyProfile, getAchievements, searchUsers,
} from '../controllers/user.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User profiles, achievements, and search
 */

router.get('/me', requireAuth, getMyProfile);
router.get('/search', requireAuth, searchUsers);
router.get('/:id/profile', requireAuth, getProfile);
router.get('/:id/achievements', requireAuth, getAchievements);

export default router;
