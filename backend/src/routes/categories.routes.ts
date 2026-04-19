import { Router, Request, Response, NextFunction } from 'express';
import { questionService, SUPPORTED_TAGS } from '../services/question.service';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Tag/category discovery
 */

/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: List all available categories (tags) with question counts
 *     tags: [Categories]
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await questionService.getCategoryStats();
    res.json({
      success: true,
      data: {
        supported_tags: SUPPORTED_TAGS,
        stats,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
