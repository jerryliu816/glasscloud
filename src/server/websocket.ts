import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { URL } from 'node:url';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { handleWebSocketMessage } from '../websocket/handler.js';
import { updateHeartbeat, getOrCreateDevice } from '../services/device.service.js';

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
  deviceId: string;
}

// Track active connections per device
const deviceConnections = new Map<string, Set<ExtWebSocket>>();

// Maximum connections per device
const MAX_CONNECTIONS_PER_DEVICE = 5;

export function setupWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    const extWs = ws as ExtWebSocket;

    // Extract deviceId from query string
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const deviceId = url.searchParams.get('deviceId');

    if (!deviceId) {
      logger.warn('WebSocket connection without deviceId');
      ws.close(4001, 'Missing deviceId');
      return;
    }

    extWs.deviceId = deviceId;
    extWs.isAlive = true;

    // Register device
    getOrCreateDevice(deviceId);

    // Track connection
    if (!deviceConnections.has(deviceId)) {
      deviceConnections.set(deviceId, new Set());
    }
    const connections = deviceConnections.get(deviceId)!;

    // Close old connections if limit exceeded
    if (connections.size >= MAX_CONNECTIONS_PER_DEVICE) {
      const oldest = connections.values().next().value;
      if (oldest) {
        logger.info({ deviceId }, 'Closing old connection due to limit');
        oldest.close(4002, 'Too many connections');
        connections.delete(oldest);
      }
    }

    connections.add(extWs);
    logger.info({ deviceId, totalConnections: wss.clients.size }, 'WebSocket connected');

    // Handle pong
    ws.on('pong', () => {
      extWs.isAlive = true;
      updateHeartbeat(deviceId);
    });

    // Handle messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleWebSocketMessage(extWs, message);
      } catch (error) {
        logger.error({ error }, 'Failed to parse WebSocket message');
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
      }
    });

    // Handle close
    ws.on('close', (code, reason) => {
      logger.info(
        { deviceId, code, reason: reason.toString() },
        'WebSocket disconnected'
      );
      connections.delete(extWs);
      if (connections.size === 0) {
        deviceConnections.delete(deviceId);
      }
    });

    // Handle error
    ws.on('error', (error) => {
      logger.error({ error, deviceId }, 'WebSocket error');
    });
  });

  // Zombie cleanup interval - runs every 30 seconds
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as ExtWebSocket;
      if (extWs.isAlive === false) {
        logger.info({ deviceId: extWs.deviceId }, 'Terminating zombie connection');
        return extWs.terminate();
      }
      extWs.isAlive = false;
      extWs.ping();
    });
  }, env.WS_PING_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  logger.info('WebSocket server initialized');

  return wss;
}

/**
 * Get set of online device IDs
 */
export function getOnlineDeviceIds(): Set<string> {
  return new Set(deviceConnections.keys());
}

/**
 * Get total connection count
 */
export function getConnectionCount(): number {
  let count = 0;
  for (const connections of deviceConnections.values()) {
    count += connections.size;
  }
  return count;
}

/**
 * Get active device count
 */
export function getActiveDeviceCount(): number {
  return deviceConnections.size;
}
