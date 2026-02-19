import { Router, type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getDevicesForUser, deleteDevice } from '../services/device.service.js';
import { getOnlineDeviceIds } from '../server/websocket.js';
import type { DevicesListResponse } from '../types/api.js';

export const devicesRouter = Router();

interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Authentication middleware
 */
function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      },
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      },
    });
  }
}

/**
 * List user's linked devices
 */
devicesRouter.get('/', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const onlineDeviceIds = getOnlineDeviceIds();

  const devices = getDevicesForUser(userId, onlineDeviceIds);

  const response: DevicesListResponse = { devices };

  res.json(response);
});

/**
 * Unlink a device
 */
devicesRouter.delete('/:deviceId', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const deviceId = req.params['deviceId'] ?? '';

  const success = deleteDevice(deviceId, userId);

  if (!success) {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Device not found or not linked to your account',
      },
    });
    return;
  }

  res.json({ success: true });
});
