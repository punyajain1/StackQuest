import { Router } from 'express';
import { validate } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimit.middleware';
import {
  register, login, createGuest, refresh, getMe,
  authSchemas,
} from '../controllers/auth.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and user management
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               username: { type: string }
 *     responses:
 *       201:
 *         description: User created with JWT tokens
 */
router.post('/register', authLimiter, validate(authSchemas.registerSchema), register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 */
router.post('/login', authLimiter, validate(authSchemas.loginSchema), login);

/**
 * @swagger
 * /api/auth/guest:
 *   post:
 *     summary: Create a guest session (no email required)
 *     tags: [Auth]
 *     responses:
 *       201:
 *         description: Guest user created with JWT tokens
 */
router.post('/guest', authLimiter, createGuest);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 */
router.post('/refresh', validate(authSchemas.refreshSchema), refresh);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.get('/me', requireAuth, getMe);

export default router;
