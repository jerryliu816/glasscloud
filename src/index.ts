import 'dotenv/config';
import http from 'node:http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { initializeSchema } from './db/schema.js';
import { createExpressApp } from './server/express.js';
import { setupWebSocketServer } from './server/websocket.js';
import { cleanupExpiredTokens } from './services/link.service.js';

async function main(): Promise<void> {
  logger.info({ env: env.NODE_ENV }, 'Starting GlassCloud server...');

  // Initialize database schema
  initializeSchema();

  // Create Express app
  const app = createExpressApp();

  // Create HTTP server
  const server = http.createServer(app);

  // Setup WebSocket server
  setupWebSocketServer(server);

  // Periodic cleanup of expired link tokens
  setInterval(() => {
    cleanupExpiredTokens();
  }, 60 * 1000); // Every minute

  // Start server
  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'GlassCloud server listening');
    logger.info(`Console: http://localhost:${env.PORT}/console`);
    logger.info(`Health: http://localhost:${env.PORT}/health`);
    logger.info(`WebSocket: ws://localhost:${env.PORT}/ws?deviceId=DEVICE_ID`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start server');
  process.exit(1);
});
