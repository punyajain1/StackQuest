import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { generalLimiter } from './middleware/rateLimit.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { env } from './config/env';

// Routes
import authRoutes from './routes/auth.routes';
import gameRoutes from './routes/game.routes';
import duelRoutes from './routes/duel.routes';
import friendRoutes from './routes/friend.routes';
import userRoutes from './routes/user.routes';
import scoresRoutes from './routes/scores.routes';
import soRoutes from './routes/so.routes';

// Swagger
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

const app = express();

// ─── Security Middleware ─────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: env.NODE_ENV === 'production'
    ? ['https://yourdomain.com']          // update for production
    : true, // Allow any origin in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body Parsing ────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Global Rate Limiting ────────────────────────────────────
app.use('/api/', generalLimiter);

// ─── Request Logging ─────────────────────────────────────────
app.use((req, _res, next) => {
  logger.debug({ method: req.method, url: req.url, ip: req.ip }, 'Incoming request');
  next();
});

// ─── Health Check ────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    env: env.NODE_ENV,
  });
});

// ─── Swagger API Docs ────────────────────────────────────────
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'StackQuest API',
      version: '2.0.0',
      description: 'StackQuest — Duel, Daily Challenge, Puzzle game backend API',
    },
    servers: [{ url: `http://localhost:${env.PORT}` }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

// ─── API Routes ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/duel', duelRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/users', userRoutes);
app.use('/api/scores', scoresRoutes);
app.use('/api/so', soRoutes);

// ─── Error Handling ───────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
