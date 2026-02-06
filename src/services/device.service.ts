import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';

export interface Device {
  id: string;
  userId: string | null;
  deviceName: string;
  deviceModel?: string;
  lastSeenAt: number;
  lastHeartbeatAt?: number;
  linkedAt?: number;
  createdAt: number;
}

export interface LinkedDevice {
  deviceId: string;
  deviceName: string;
  linkedAt: number;
}

/**
 * Get or create a device record
 */
export function getOrCreateDevice(
  deviceId: string,
  deviceName?: string
): Device {
  const now = Date.now();

  let device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId) as {
    id: string;
    user_id: string | null;
    device_name: string;
    device_model: string | null;
    last_seen_at: number;
    last_heartbeat_at: number | null;
    linked_at: number | null;
    created_at: number;
  } | undefined;

  if (!device) {
    db.prepare(
      `INSERT INTO devices (id, device_name, last_seen_at, created_at)
       VALUES (?, ?, ?, ?)`
    ).run(deviceId, deviceName ?? 'Unknown Device', now, now);

    device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId) as typeof device;
    logger.info({ deviceId }, 'Created new device record');
  } else {
    // Update last seen
    db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(
      now,
      deviceId
    );
  }

  return {
    id: device!.id,
    userId: device!.user_id,
    deviceName: device!.device_name,
    deviceModel: device!.device_model ?? undefined,
    lastSeenAt: now,
    lastHeartbeatAt: device!.last_heartbeat_at ?? undefined,
    linkedAt: device!.linked_at ?? undefined,
    createdAt: device!.created_at,
  };
}

/**
 * Update device heartbeat
 */
export function updateHeartbeat(deviceId: string): void {
  const now = Date.now();
  db.prepare(
    'UPDATE devices SET last_heartbeat_at = ?, last_seen_at = ? WHERE id = ?'
  ).run(now, now, deviceId);
}

/**
 * Link a device to a user
 */
export function linkDeviceToUser(
  deviceId: string,
  userId: string,
  deviceName?: string
): void {
  const now = Date.now();

  db.prepare(
    `UPDATE devices
     SET user_id = ?, linked_at = ?, device_name = COALESCE(?, device_name), last_seen_at = ?
     WHERE id = ?`
  ).run(userId, now, deviceName ?? null, now, deviceId);

  logger.info({ deviceId, userId }, 'Device linked to user');
}

/**
 * Unlink a device from user
 */
export function unlinkDevice(deviceId: string): boolean {
  const result = db.prepare(
    'UPDATE devices SET user_id = NULL, linked_at = NULL WHERE id = ?'
  ).run(deviceId);

  if (result.changes > 0) {
    logger.info({ deviceId }, 'Device unlinked');
    return true;
  }

  return false;
}

/**
 * Get user ID for a device
 */
export function getDeviceUserId(deviceId: string): string | null {
  const row = db.prepare('SELECT user_id FROM devices WHERE id = ?').get(deviceId) as {
    user_id: string | null;
  } | undefined;

  return row?.user_id ?? null;
}

/**
 * Get all devices linked to a user
 */
export function getUserDevices(userId: string): LinkedDevice[] {
  const rows = db
    .prepare(
      `SELECT id, device_name, linked_at
       FROM devices
       WHERE user_id = ?
       ORDER BY linked_at DESC`
    )
    .all(userId) as { id: string; device_name: string; linked_at: number }[];

  return rows.map((row) => ({
    deviceId: row.id,
    deviceName: row.device_name,
    linkedAt: row.linked_at,
  }));
}

/**
 * Get device details for API response
 */
export function getDevicesForUser(
  userId: string,
  onlineDeviceIds: Set<string>
): Array<{
  deviceId: string;
  deviceName: string;
  deviceModel?: string;
  linkedAt: number;
  lastSeenAt: number;
  isOnline: boolean;
}> {
  const rows = db
    .prepare(
      `SELECT id, device_name, device_model, linked_at, last_seen_at
       FROM devices
       WHERE user_id = ?
       ORDER BY linked_at DESC`
    )
    .all(userId) as {
      id: string;
      device_name: string;
      device_model: string | null;
      linked_at: number;
      last_seen_at: number;
    }[];

  return rows.map((row) => ({
    deviceId: row.id,
    deviceName: row.device_name,
    deviceModel: row.device_model ?? undefined,
    linkedAt: row.linked_at,
    lastSeenAt: row.last_seen_at,
    isOnline: onlineDeviceIds.has(row.id),
  }));
}

/**
 * Delete a device
 */
export function deleteDevice(deviceId: string, userId: string): boolean {
  const result = db.prepare(
    'DELETE FROM devices WHERE id = ? AND user_id = ?'
  ).run(deviceId, userId);

  return result.changes > 0;
}
