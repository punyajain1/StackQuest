import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { friendService } from '../services/friend.service';

export const sendRequestSchema = z.object({
  username: z.string().min(1),
});

export async function sendFriendRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username } = req.body as z.infer<typeof sendRequestSchema>;
    const result = await friendService.sendRequest(req.user!.id, username);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function acceptRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await friendService.acceptRequest(req.params.id as string, req.user!.id);
    res.json({ success: true, data: { message: 'Friend request accepted' } });
  } catch (err) { next(err); }
}

export async function rejectRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await friendService.rejectRequest(req.params.id as string, req.user!.id);
    res.json({ success: true, data: { message: 'Friend request rejected' } });
  } catch (err) { next(err); }
}

export async function removeFriend(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await friendService.removeFriend(req.params.id as string, req.user!.id);
    res.json({ success: true, data: { message: 'Friend removed' } });
  } catch (err) { next(err); }
}

export async function blockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await friendService.blockUser(req.user!.id, req.params.id as string);
    res.json({ success: true, data: { message: 'User blocked' } });
  } catch (err) { next(err); }
}

export async function getFriends(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const friends = await friendService.getFriends(req.user!.id);
    res.json({ success: true, data: friends });
  } catch (err) { next(err); }
}

export async function getPendingRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const pending = await friendService.getPendingRequests(req.user!.id);
    res.json({ success: true, data: pending });
  } catch (err) { next(err); }
}
