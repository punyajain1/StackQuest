import { Router } from 'express';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import {
  createDuel, joinDuel, getDuelState, submitDuelAnswer, getDuelResult,
  createDuelSchema, submitAnswerSchema,
} from '../controllers/duel.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Duel
 *   description: 1v1 Duel matches
 */

router.post('/create', requireAuth, validate(createDuelSchema), createDuel);
router.post('/:id/join', requireAuth, joinDuel);
router.get('/:id/state', requireAuth, getDuelState);
router.post('/:id/answer', requireAuth, validate(submitAnswerSchema), submitDuelAnswer);
router.get('/:id/result', requireAuth, getDuelResult);

export default router;
