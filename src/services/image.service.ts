import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';

const ORIGINALS_DIR = path.resolve('./data/images');
const THUMBNAILS_DIR = path.resolve('./data/thumbnails');

// Create storage directories if they don't exist
fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface SaveImageInput {
  buffer: Buffer;
  mimeType: string;
  originalFilename: string;
  sceneDescription: string;
  deviceModel: string;
  deviceInstanceId: string;
  capturedAtIso?: string;
}

export interface SavedImageResult {
  imageId: string;
  originalFilename: string;
  thumbnailFilename: string;
  receivedAt: number;
  capturedAt: number | null;
}

export interface GalleryImage {
  id: string;
  deviceModel: string;
  deviceInstanceId: string;
  sceneDescription: string;
  originalFilename: string;
  thumbnailFilename: string;
  capturedAt: number | null;
  receivedAt: number;
  createdAt: number;
}

export async function saveImage(input: SaveImageInput): Promise<SavedImageResult> {
  const ext = ALLOWED_MIME_TYPES[input.mimeType];
  if (!ext) {
    throw Object.assign(new Error('Unsupported image type'), { code: 'UNSUPPORTED_TYPE' });
  }

  const id = uuidv4();
  const originalFilename = `${id}.${ext}`;
  const thumbnailFilename = `${id}_thumb.jpg`;
  const originalPath = path.join(ORIGINALS_DIR, originalFilename);
  const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename);

  const now = Date.now();

  // Parse captured_at
  let capturedAt: number | null = null;
  if (input.capturedAtIso) {
    const parsed = new Date(input.capturedAtIso).getTime();
    if (!isNaN(parsed)) {
      capturedAt = parsed;
    }
  }

  let wroteOriginal = false;
  let wroteThumbnail = false;

  try {
    // Write original
    fs.writeFileSync(originalPath, input.buffer);
    wroteOriginal = true;

    // Generate thumbnail
    await sharp(input.buffer)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);
    wroteThumbnail = true;

    // Insert DB row
    db.prepare(
      `INSERT INTO glass_images
       (id, device_model, device_instance_id, scene_description, original_filename, thumbnail_filename, captured_at, received_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.deviceModel,
      input.deviceInstanceId,
      input.sceneDescription,
      originalFilename,
      thumbnailFilename,
      capturedAt,
      now,
      now
    );

    return {
      imageId: id,
      originalFilename,
      thumbnailFilename,
      receivedAt: now,
      capturedAt,
    };
  } catch (err) {
    // Cleanup on error
    try {
      if (wroteOriginal) fs.unlinkSync(originalPath);
    } catch { /* ignore */ }
    try {
      if (wroteThumbnail) fs.unlinkSync(thumbnailPath);
    } catch { /* ignore */ }
    logger.error({ error: err }, 'Failed to save image');
    throw err;
  }
}

export function listImages(opts: {
  fromMs?: number;
  toMs?: number;
  limit: number;
  offset: number;
}): { images: GalleryImage[]; total: number } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.fromMs !== undefined) {
    conditions.push('received_at >= ?');
    params.push(opts.fromMs);
  }
  if (opts.toMs !== undefined) {
    conditions.push('received_at <= ?');
    params.push(opts.toMs);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM glass_images ${where}`).get(...params) as { count: number }
  ).count;

  const rows = db
    .prepare(
      `SELECT id, device_model, device_instance_id, scene_description, original_filename, thumbnail_filename,
              captured_at, received_at, created_at
       FROM glass_images ${where}
       ORDER BY received_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, opts.limit, opts.offset) as Array<{
    id: string;
    device_model: string;
    device_instance_id: string;
    scene_description: string;
    original_filename: string;
    thumbnail_filename: string;
    captured_at: number | null;
    received_at: number;
    created_at: number;
  }>;

  const images: GalleryImage[] = rows.map((r) => ({
    id: r.id,
    deviceModel: r.device_model,
    deviceInstanceId: r.device_instance_id,
    sceneDescription: r.scene_description,
    originalFilename: r.original_filename,
    thumbnailFilename: r.thumbnail_filename,
    capturedAt: r.captured_at,
    receivedAt: r.received_at,
    createdAt: r.created_at,
  }));

  return { images, total };
}

export function getImageById(id: string): GalleryImage | undefined {
  const row = db
    .prepare(
      `SELECT id, device_model, device_instance_id, scene_description, original_filename, thumbnail_filename,
              captured_at, received_at, created_at
       FROM glass_images WHERE id = ?`
    )
    .get(id) as
    | {
        id: string;
        device_model: string;
        device_instance_id: string;
        scene_description: string;
        original_filename: string;
        thumbnail_filename: string;
        captured_at: number | null;
        received_at: number;
        created_at: number;
      }
    | undefined;

  if (!row) return undefined;

  return {
    id: row.id,
    deviceModel: row.device_model,
    deviceInstanceId: row.device_instance_id,
    sceneDescription: row.scene_description,
    originalFilename: row.original_filename,
    thumbnailFilename: row.thumbnail_filename,
    capturedAt: row.captured_at,
    receivedAt: row.received_at,
    createdAt: row.created_at,
  };
}
