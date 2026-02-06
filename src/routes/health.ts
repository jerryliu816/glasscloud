import { Router } from 'express';
import { db } from '../db/index.js';
import { getConnectionCount, getActiveDeviceCount } from '../server/websocket.js';
import type { HealthResponse } from '../types/api.js';

export const healthRouter = Router();

const startTime = Date.now();

healthRouter.get('/', (_req, res) => {
  let dbStatus: 'connected' | 'disconnected' = 'disconnected';

  try {
    // Simple query to check DB connection
    db.prepare('SELECT 1').get();
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  const response: HealthResponse = {
    status: dbStatus === 'connected' ? 'healthy' : 'degraded',
    version: '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    connections: {
      websocket: getConnectionCount(),
      activeDevices: getActiveDeviceCount(),
      database: dbStatus,
    },
  };

  res.json(response);
});
