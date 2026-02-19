import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { authRouter } from '../routes/auth.js';
import { devicesRouter } from '../routes/devices.js';
import { linkRouter } from '../routes/link.js';
import { healthRouter } from '../routes/health.js';
import { mcpRouter } from '../routes/mcp.js';
import { consoleRouter } from '../routes/console.js';
import { imagesRouter, multerErrorHandler } from '../routes/images.js';
import { galleryRouter } from '../routes/gallery.js';

export function createExpressApp(): Express {
  const app = express();

  // Trust proxy (for rate limiting behind reverse proxy)
  app.set('trust proxy', 1);

  // Security headers
  app.use(helmet());

  // CORS
  const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    })
  );

  // Body parsing
  app.use(express.json());

  // Static file serving for uploaded images
  app.use('/images/originals', express.static(path.resolve('./data/images'), { maxAge: '1d', immutable: true, fallthrough: false }));
  app.use('/images/thumbnails', express.static(path.resolve('./data/thumbnails'), { maxAge: '7d', immutable: true, fallthrough: false }));

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug({ method: req.method, path: req.path }, 'Request');
    next();
  });

  // Rate limiting
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests, please try again later',
      },
    },
  });
  app.use('/api', limiter);

  // Routes
  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  app.use('/api/images', imagesRouter);
  app.use('/api/link', linkRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/mcp', mcpRouter);
  app.use('/console/gallery', galleryRouter);
  app.use('/console', consoleRouter);

  // Redirect root to console
  app.get('/', (_req, res) => res.redirect('/console'));

  // Multer error handler (must come before general error handler)
  app.use(multerErrorHandler);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
    });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ error: err }, 'Unhandled error');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      },
    });
  });

  return app;
}
