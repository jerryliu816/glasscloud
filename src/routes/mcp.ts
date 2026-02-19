import { Router, type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env, BUILT_IN_SERVICES } from '../config/index.js';
import { hasValidOAuth } from '../services/auth.service.js';
import { getServicesForUser, getServiceById } from '../services/mcp-registry.service.js';
import type { McpServicesListResponse, McpServiceConfigResponse } from '../types/api.js';
import type { McpToolDefinition } from '../types/mcp.js';

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

  // Built-in services with OAuth status
  const builtInServices = BUILT_IN_SERVICES.map((service) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    isBuiltIn: true as const,
    isEnabled: true, // TODO: Check user preferences
    requiresAuth: service.authType === 'oauth',
    isAuthenticated: service.authType === 'oauth' ? hasOAuth : true,
  }));

  // Third-party services owned by user
  const thirdPartyRows = getServicesForUser(userId);
  const thirdPartyServices = thirdPartyRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isBuiltIn: false as const,
    isEnabled: true,
    requiresAuth: row.auth_type === 'api_key',
    isAuthenticated: true, // auth is server-side, always "authenticated" from user's perspective
  }));

  const response: McpServicesListResponse = {
    services: [...builtInServices, ...thirdPartyServices],
  };

  res.json(response);
});

/**
 * Public config endpoint for third-party MCP service (no auth required)
 * Used by Android app after scanning QR code
 */
mcpRouter.get('/services/:serviceId/config', (req: Request, res: Response) => {
  const serviceId = req.params['serviceId'] ?? '';

  const service = getServiceById(serviceId);
  if (!service) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Service not found' },
    });
    return;
  }

  let tools: McpToolDefinition[] = [];
  try {
    tools = JSON.parse(service.tools_json);
  } catch {
    tools = [];
  }

  const response: McpServiceConfigResponse = {
    id: service.id,
    name: service.name,
    description: service.description,
    endpointUrl: service.endpoint_url,
    authType: service.auth_type as 'none' | 'api_key',
    tools,
  };

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
