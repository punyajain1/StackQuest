import { Router } from 'express';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import {
  sendFriendRequest, acceptRequest, rejectRequest,
  removeFriend, blockUser, getFriends, getPendingRequests,
  sendRequestSchema,
} from '../controllers/friend.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Friends
 *   description: Friend system
 */

router.get('/', requireAuth, getFriends);
router.get('/pending', requireAuth, getPendingRequests);
router.post('/request', requireAuth, validate(sendRequestSchema), sendFriendRequest);
router.post('/:id/accept', requireAuth, acceptRequest);
router.post('/:id/reject', requireAuth, rejectRequest);
router.delete('/:id', requireAuth, removeFriend);
router.post('/:id/block', requireAuth, blockUser);

export default router;
