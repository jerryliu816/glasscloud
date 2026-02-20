import { Router, type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { generateLinkToken, validateLinkToken, markTokenUsed } from '../services/link.service.js';
import { linkDeviceToUser } from '../services/device.service.js';
import { getUserById } from '../services/auth.service.js';
import type { LinkTokenResponse } from '../types/api.js';

export const linkRouter = Router();

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
 * Generate a QR code link token
 */
linkRouter.post('/generate', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  const linkToken = generateLinkToken(userId, baseUrl);

  const response: LinkTokenResponse = {
    linkToken: linkToken.token,
    expiresAt: linkToken.expiresAt,
    qrCodeData: linkToken.qrCodeData,
  };

  res.json(response);
});

/**
 * Simple page to display QR code (for development)
 */
linkRouter.get('/generate', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  const linkToken = generateLinkToken(userId, baseUrl);

  // In development, show a simple page with the QR code data
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Link Device</title>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
      </head>
      <body>
        <h1>Link Your Device</h1>
        <p>Scan this QR code with your GlassBridge app:</p>
        <canvas id="qrcode"></canvas>
        <p>Or use this link: <code>${linkToken.qrCodeData}</code></p>
        <p>Expires in 5 minutes.</p>
        <script>
          QRCode.toCanvas(document.getElementById('qrcode'), '${linkToken.qrCodeData}', { width: 256 });
        </script>
      </body>
    </html>
  `);
});

/**
 * Exchange a link token for a device JWT (used by CyanBridge app after QR scan)
 */
linkRouter.post('/exchange', (req: Request, res: Response) => {
  const { linkToken, deviceId, deviceName } = req.body;

  if (!linkToken || !deviceId) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'linkToken and deviceId are required' },
    });
    return;
  }

  const userId = validateLinkToken(linkToken);
  if (!userId) {
    res.status(401).json({
      error: { code: 'INVALID_TOKEN', message: 'Link token is invalid, expired, or already used' },
    });
    return;
  }

  linkDeviceToUser(deviceId, userId, deviceName);
  markTokenUsed(linkToken, deviceId);

  const user = getUserById(userId);
  if (!user) {
    res.status(500).json({
      error: { code: 'USER_NOT_FOUND', message: 'User associated with token not found' },
    });
    return;
  }

  const deviceJwt = jwt.sign({ userId, deviceId }, env.JWT_SECRET, { expiresIn: '365d' });

  res.json({
    jwt: deviceJwt,
    user: { email: user.email, displayName: user.displayName },
  });
});
