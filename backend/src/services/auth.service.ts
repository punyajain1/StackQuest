import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import type { User } from '../../generated/prisma';
import type { UserPayload } from '../models/db.types';

const SALT_ROUNDS = 12;

function generateGuestUsername(): string {
  const adj = ['Curious', 'Brave', 'Swift', 'Clever', 'Sharp'];
  const noun = ['Coder', 'Hacker', 'Dev', 'Ninja', 'Wizard'];
  const num = Math.floor(Math.random() * 9999);
  return `${adj[Math.floor(Math.random() * adj.length)]}${noun[Math.floor(Math.random() * noun.length)]}${num}`;
}

export class AuthService {
  // ─── Registration ──────────────────────────────────────────

  async register(email: string, password: string, username?: string): Promise<{
    user: UserPayload; token: string; refreshToken: string;
  }> {
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) throw AppError.conflict('Email already registered', 'EMAIL_TAKEN');

    if (username) {
      const existingUsername = await prisma.user.findUnique({ where: { username } });
      if (existingUsername) throw AppError.conflict('Username already taken', 'USERNAME_TAKEN');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const finalUsername = username ?? `Dev${Math.floor(Math.random() * 99999)}`;

    const user = await prisma.user.create({
      data: {
        username: finalUsername,
        email: email.toLowerCase(),
        passwordHash,
        isGuest: false,
      },
    });

    logger.info({ userId: user.id }, 'New user registered');
    return this.buildTokenResponse(user);
  }

  // ─── Login ─────────────────────────────────────────────────

  async login(email: string, password: string): Promise<{
    user: UserPayload; token: string; refreshToken: string;
  }> {
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), isGuest: false },
    });
    if (!user) throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

    const valid = await bcrypt.compare(password, user.passwordHash ?? '');
    if (!valid) throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() },
    });

    logger.info({ userId: user.id }, 'User logged in');
    return this.buildTokenResponse(user);
  }

  // ─── Guest Session ─────────────────────────────────────────

  async createGuest(): Promise<{
    user: UserPayload; token: string; refreshToken: string;
  }> {
    let username = generateGuestUsername();
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.user.findUnique({ where: { username } });
      if (!exists) break;
      username = generateGuestUsername();
    }

    const user = await prisma.user.create({
      data: { username, isGuest: true },
    });

    logger.info({ userId: user.id, username }, 'Guest user created');
    return this.buildTokenResponse(user);
  }

  // ─── Token Refresh ─────────────────────────────────────────

  async refresh(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    let payload: UserPayload;
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as UserPayload;
    } catch {
      throw AppError.unauthorized('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) throw AppError.unauthorized('User not found', 'USER_NOT_FOUND');

    return {
      token: this.signToken(user),
      refreshToken: this.signRefreshToken(user),
    };
  }

  // ─── Get Profile ───────────────────────────────────────────

  async getProfile(userId: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User not found');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  // ─── Helpers ───────────────────────────────────────────────

  private signToken(user: User): string {
    const payload: UserPayload = {
      id: user.id,
      username: user.username,
      email: user.email ?? '',
      is_guest: user.isGuest,
    };
    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
  }

  private signRefreshToken(user: User): string {
    const payload: UserPayload = {
      id: user.id, username: user.username, email: user.email ?? '', is_guest: user.isGuest,
    };
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
  }

  private buildTokenResponse(user: User): {
    user: UserPayload; token: string; refreshToken: string;
  } {
    return {
      user: { id: user.id, username: user.username, email: user.email ?? '', is_guest: user.isGuest },
      token: this.signToken(user),
      refreshToken: this.signRefreshToken(user),
    };
  }

  verifyToken(token: string): UserPayload {
    try {
      return jwt.verify(token, env.JWT_SECRET) as UserPayload;
    } catch {
      throw AppError.unauthorized('Invalid or expired token', 'INVALID_TOKEN');
    }
  }
}

export const authService = new AuthService();
