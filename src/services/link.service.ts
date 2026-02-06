import { db } from '../db/index.js';
import { generateToken, hashToken, verifyToken } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { linkDeviceToUser, getUserDevices } from './device.service.js';
import { getUserById, type User } from './auth.service.js';

// Token expiration: 5 minutes
const TOKEN_EXPIRY_MS = 5 * 60 * 1000;

export interface LinkToken {
  token: string;
  expiresAt: number;
  qrCodeData: string;
}

export interface LinkResult {
  user: User;
  linkedDevices: Array<{
    deviceId: string;
    deviceName: string;
    linkedAt: number;
  }>;
}

/**
 * Generate a new link token for a user
 */
export function generateLinkToken(userId: string, baseUrl: string): LinkToken {
  const token = generateToken(32);
  const tokenHash = hashToken(token);
  const now = Date.now();
  const expiresAt = now + TOKEN_EXPIRY_MS;

  db.prepare(
    `INSERT INTO link_tokens (id, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(tokenHash, userId, expiresAt, now);

  logger.info({ userId }, 'Generated link token');

  return {
    token,
    expiresAt,
    qrCodeData: `glassbridge://link?token=${token}`,
  };
}

/**
 * Validate and consume a link token
 * Returns the user ID if valid, null otherwise
 */
export function validateLinkToken(token: string): string | null {
  const tokenHash = hashToken(token);
  const now = Date.now();

  const row = db
    .prepare(
      `SELECT user_id, expires_at, used_at
       FROM link_tokens
       WHERE id = ?`
    )
    .get(tokenHash) as {
      user_id: string;
      expires_at: number;
      used_at: number | null;
    } | undefined;

  if (!row) {
    logger.warn('Link token not found');
    return null;
  }

  if (row.used_at !== null) {
    logger.warn('Link token already used');
    return null;
  }

  if (row.expires_at < now) {
    logger.warn('Link token expired');
    return null;
  }

  return row.user_id;
}

/**
 * Mark a link token as used
 */
export function markTokenUsed(token: string, deviceId: string): void {
  const tokenHash = hashToken(token);
  const now = Date.now();

  db.prepare(
    `UPDATE link_tokens
     SET used_at = ?, used_by_device_id = ?
     WHERE id = ?`
  ).run(now, deviceId, tokenHash);

  logger.info({ deviceId }, 'Link token marked as used');
}

/**
 * Link a device using a token
 */
export function linkDeviceWithToken(
  token: string,
  deviceId: string,
  deviceName?: string
): LinkResult | null {
  const userId = validateLinkToken(token);

  if (!userId) {
    return null;
  }

  // Link device to user
  linkDeviceToUser(deviceId, userId, deviceName);

  // Mark token as used
  markTokenUsed(token, deviceId);

  // Get user and devices
  const user = getUserById(userId);
  if (!user) {
    return null;
  }

  const linkedDevices = getUserDevices(userId);

  return {
    user,
    linkedDevices,
  };
}

/**
 * Clean up expired tokens (run periodically)
 */
export function cleanupExpiredTokens(): number {
  const now = Date.now();
  const result = db.prepare(
    'DELETE FROM link_tokens WHERE expires_at < ? AND used_at IS NULL'
  ).run(now);

  if (result.changes > 0) {
    logger.info({ count: result.changes }, 'Cleaned up expired link tokens');
  }

  return result.changes;
}
