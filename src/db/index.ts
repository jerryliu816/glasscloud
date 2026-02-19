import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Ensure the data directory exists
const dbDir = path.dirname(env.DATABASE_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create database connection
export const db: Database.Database = new Database(env.DATABASE_PATH);

// Enable Write-Ahead Logging for concurrent readers/writers
db.pragma('journal_mode = WAL');

// Balance between safety and speed
db.pragma('synchronous = NORMAL');

// Increase cache size for better performance (negative = KB)
db.pragma('cache_size = -64000'); // 64MB cache

// Enable foreign keys
db.pragma('foreign_keys = ON');

logger.info({ path: env.DATABASE_PATH }, 'Database connected with WAL mode');

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});
