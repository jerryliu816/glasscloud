import { db } from './index.js';
import { logger } from '../utils/logger.js';

const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    profile_picture_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    device_name TEXT NOT NULL,
    device_model TEXT,
    last_seen_at INTEGER NOT NULL,
    last_heartbeat_at INTEGER,
    linked_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_last_heartbeat ON devices(last_heartbeat_at);

-- Link tokens table
CREATE TABLE IF NOT EXISTS link_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    used_by_device_id TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_link_tokens_user_id ON link_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_link_tokens_expires_at ON link_tokens(expires_at);

-- OAuth tokens table
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    token_type TEXT NOT NULL,
    scope TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User MCP services table
CREATE TABLE IF NOT EXISTS user_mcp_services (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    auth_config_encrypted TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, service_id)
);

-- Third-party MCP services table
CREATE TABLE IF NOT EXISTS third_party_mcp_services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    is_global INTEGER NOT NULL DEFAULT 0,
    owner_user_id TEXT,
    endpoint_url TEXT NOT NULL,
    auth_type TEXT NOT NULL,
    auth_config_encrypted TEXT,
    tools_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Glass images table
CREATE TABLE IF NOT EXISTS glass_images (
    id TEXT PRIMARY KEY,
    device_model TEXT NOT NULL,
    device_instance_id TEXT NOT NULL,
    scene_description TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    thumbnail_filename TEXT NOT NULL,
    captured_at INTEGER,
    received_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_glass_images_received_at ON glass_images(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_glass_images_device_instance ON glass_images(device_instance_id);
`;

export function initializeSchema(): void {
  logger.info('Initializing database schema...');
  db.exec(schema);
  logger.info('Database schema initialized');
}
