import { Server } from 'socket.io';
import { createServer, Server as HttpServer } from 'http';
import { env } from '../config/env';
import app from '../app';

// ─── Allowed origins ──────────────────────────────────────────────────────────

const corsOrigins =
  env.NODE_ENV === 'production'
    ? ['https://yourdomain.com']
    : [
        'http://localhost:5173',
        'http://localhost:3001',
        'http://localhost:8081',
        'http://localhost:19006',
      ];

// ─── HTTP Server ──────────────────────────────────────────────────────────────

export const httpServer: HttpServer = createServer(app);

// ─── Socket.io Server ─────────────────────────────────────────────────────────

export const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  connectionStateRecovery: {
    // Allows clients to reconnect within 2 min without losing state
    maxDisconnectionDuration: 2 * 60 * 1000,
  },
});
