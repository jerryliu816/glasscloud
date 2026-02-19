import { Router, type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import multer, { type FileFilterCallback } from 'multer';
import { env } from '../config/env.js';
import { saveImage, getImageById } from '../services/image.service.js';

export const imagesRouter = Router();

interface AuthRequest extends Request {
  userId?: string;
}

/**
 * JWT Authentication middleware
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

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Multer configuration: memory storage, 20MB limit, type filter
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Unsupported file type'), { code: 'UNSUPPORTED_TYPE' }));
    }
  },
});

/**
 * POST /api/images/upload — Upload an image with scene metadata
 */
imagesRouter.post(
  '/upload',
  authenticate,
  upload.single('image'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { scene_description, device_model, device_instance_id, captured_at } = req.body as Record<string, string>;

    if (!req.file) {
      res.status(400).json({ error: { code: 'MISSING_FILE', message: 'No image file provided' } });
      return;
    }
    if (!scene_description) {
      res.status(400).json({ error: { code: 'MISSING_FIELD', message: 'scene_description is required' } });
      return;
    }
    if (!device_model) {
      res.status(400).json({ error: { code: 'MISSING_FIELD', message: 'device_model is required' } });
      return;
    }
    if (!device_instance_id) {
      res.status(400).json({ error: { code: 'MISSING_FIELD', message: 'device_instance_id is required' } });
      return;
    }

    try {
      const result = await saveImage({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalFilename: req.file.originalname,
        sceneDescription: scene_description,
        deviceModel: device_model,
        deviceInstanceId: device_instance_id,
        capturedAtIso: captured_at,
      });

      res.status(201).json({
        imageId: result.imageId,
        originalFilename: result.originalFilename,
        thumbnailFilename: result.thumbnailFilename,
        receivedAt: result.receivedAt,
        capturedAt: result.capturedAt,
      });
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'UNSUPPORTED_TYPE') {
        res.status(415).json({ error: { code: 'UNSUPPORTED_TYPE', message: 'Unsupported image type' } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to save image' } });
    }
  }
);

/**
 * GET /api/images/:id — Get image metadata by ID
 */
imagesRouter.get('/:id', authenticate, (req: AuthRequest, res: Response): void => {
  const image = getImageById(req.params['id'] ?? '');
  if (!image) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Image not found' } });
    return;
  }
  res.json(image);
});

/**
 * Multer error handler — must be added after routes in express.ts
 */
export function multerErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'File exceeds 20MB limit' } });
      return;
    }
    res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: err.message } });
    return;
  }
  const typedErr = err as NodeJS.ErrnoException;
  if (typedErr.code === 'UNSUPPORTED_TYPE') {
    res.status(415).json({ error: { code: 'UNSUPPORTED_TYPE', message: 'Only JPEG, PNG, and WebP images are accepted' } });
    return;
  }
  next(err);
}
