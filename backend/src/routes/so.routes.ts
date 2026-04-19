import { Router, Request, Response, NextFunction } from 'express';
import { soService } from '../services/so.service';
import { generalLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: SO Proxy
 *   description: Cached Stack Overflow API proxy
 */

/** Proxied + cached SO questions */
router.get('/questions', generalLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tag = req.query.tag as string | undefined;
    const page = parseInt(req.query.page as string ?? '1');
    const pageSize = Math.min(parseInt(req.query.pagesize as string ?? '30'), 50);
    const sort = (req.query.sort as string) ?? 'votes';

    const questions = await soService.fetchQuestions(tag ?? null, page, pageSize, sort);
    res.json({ success: true, data: questions });
  } catch (err) {
    next(err);
  }
});

/** Get answers for a question (cached) */
router.get('/answers/:questionId', generalLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const questionId = parseInt(req.params.questionId as string);
    if (isNaN(questionId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid questionId' } });
      return;
    }
    const answers = await soService.fetchAnswers(questionId);
    res.json({ success: true, data: answers });
  } catch (err) {
    next(err);
  }
});

/** SO API quota status */
router.get('/quota', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const quota = await soService.getQuotaStatus();
    res.json({ success: true, data: quota });
  } catch (err) {
    next(err);
  }
});

export default router;
