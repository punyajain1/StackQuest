import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import type { FriendInfo } from '../models/db.types';

export class FriendService {
  async sendRequest(senderId: string, receiverUsername: string): Promise<{ id: string }> {
    const receiver = await prisma.user.findUnique({ where: { username: receiverUsername } });
    if (!receiver) throw AppError.notFound('User not found');
    if (receiver.id === senderId) throw AppError.badRequest('Cannot send friend request to yourself');

    // Check if already friends or pending
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId, receiverId: receiver.id },
          { senderId: receiver.id, receiverId: senderId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'accepted') throw AppError.conflict('Already friends');
      if (existing.status === 'pending') throw AppError.conflict('Friend request already pending');
      if (existing.status === 'blocked') throw AppError.forbidden('Cannot send request to this user');
    }

    const friendship = await prisma.friendship.create({
      data: { senderId, receiverId: receiver.id, status: 'pending' },
    });

    logger.info({ senderId, receiverId: receiver.id }, 'Friend request sent');
    return { id: friendship.id };
  }

  async acceptRequest(friendshipId: string, userId: string): Promise<void> {
    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw AppError.notFound('Friend request not found');
    if (friendship.receiverId !== userId) throw AppError.forbidden('Cannot accept this request');
    if (friendship.status !== 'pending') throw AppError.badRequest('Request is not pending');

    await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'accepted' },
    });

    logger.info({ friendshipId }, 'Friend request accepted');
  }

  async rejectRequest(friendshipId: string, userId: string): Promise<void> {
    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw AppError.notFound('Friend request not found');
    if (friendship.receiverId !== userId) throw AppError.forbidden('Cannot reject this request');

    await prisma.friendship.delete({ where: { id: friendshipId } });
    logger.info({ friendshipId }, 'Friend request rejected');
  }

  async removeFriend(friendshipId: string, userId: string): Promise<void> {
    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw AppError.notFound('Friendship not found');
    if (friendship.senderId !== userId && friendship.receiverId !== userId) {
      throw AppError.forbidden('Cannot remove this friendship');
    }

    await prisma.friendship.delete({ where: { id: friendshipId } });
    logger.info({ friendshipId, userId }, 'Friend removed');
  }

  async blockUser(userId: string, targetId: string): Promise<void> {
    // Remove existing friendship if any
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { senderId: userId, receiverId: targetId },
          { senderId: targetId, receiverId: userId },
        ],
      },
    });

    // Create blocked entry
    await prisma.friendship.create({
      data: { senderId: userId, receiverId: targetId, status: 'blocked' },
    });

    logger.info({ userId, targetId }, 'User blocked');
  }

  async getFriends(userId: string): Promise<FriendInfo[]> {
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true, elo: true, league: true, lastActive: true } },
        receiver: { select: { id: true, username: true, avatarUrl: true, elo: true, league: true, lastActive: true } },
      },
    });

    return friendships.map((f) => {
      const friend = f.senderId === userId ? f.receiver : f.sender;
      return {
        friendship_id: f.id,
        user_id: friend.id,
        username: friend.username,
        avatar_url: friend.avatarUrl,
        elo: friend.elo,
        league: friend.league,
        last_active: friend.lastActive.toISOString(),
      };
    });
  }

  async getPendingRequests(userId: string): Promise<FriendInfo[]> {
    const friendships = await prisma.friendship.findMany({
      where: { receiverId: userId, status: 'pending' },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true, elo: true, league: true, lastActive: true } },
      },
    });

    return friendships.map((f) => ({
      friendship_id: f.id,
      user_id: f.sender.id,
      username: f.sender.username,
      avatar_url: f.sender.avatarUrl,
      elo: f.sender.elo,
      league: f.sender.league,
      last_active: f.sender.lastActive.toISOString(),
    }));
  }
}

export const friendService = new FriendService();
