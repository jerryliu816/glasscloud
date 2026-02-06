import { Router, type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env, BUILT_IN_SERVICES } from '../config/index.js';
import { hasValidOAuth } from '../services/auth.service.js';
import type { McpServicesListResponse } from '../types/api.js';

export const mcpRouter = Router();

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
 * List available MCP services
 */
mcpRouter.get('/services', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const hasOAuth = hasValidOAuth(userId);

  // For now, return built-in services with OAuth status
  const services = BUILT_IN_SERVICES.map((service) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    isBuiltIn: service.isBuiltIn,
    isEnabled: true, // TODO: Check user preferences
    requiresAuth: service.authType === 'oauth',
    isAuthenticated: service.authType === 'oauth' ? hasOAuth : true,
  }));

  const response: McpServicesListResponse = { services };

  res.json(response);
});

/**
 * Enable an MCP service for the user
 */
mcpRouter.post('/services/:serviceId/enable', authenticate, (req: AuthRequest, res: Response) => {
  // TODO: Implement user preferences
  res.json({ success: true });
});

/**
 * Disable an MCP service for the user
 */
mcpRouter.delete('/services/:serviceId/enable', authenticate, (req: AuthRequest, res: Response) => {
  // TODO: Implement user preferences
  res.json({ success: true });
});
