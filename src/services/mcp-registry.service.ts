import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import type { McpServiceRegistration, McpToolDefinition } from '../types/mcp.js';

interface ThirdPartyServiceRow {
  id: string;
  name: string;
  description: string;
  is_global: number;
  owner_user_id: string | null;
  endpoint_url: string;
  auth_type: string;
  auth_config_encrypted: string | null;
  tools_json: string;
  created_at: number;
  updated_at: number;
}

/**
 * Register a new third-party MCP service
 */
export function registerService(
  userId: string,
  registration: McpServiceRegistration
): string {
  const id = uuidv4();
  const now = Date.now();

  // Encrypt API key if provided
  let authConfigEncrypted: string | null = null;
  if (registration.authType === 'api_key' && registration.apiKey) {
    authConfigEncrypted = encrypt(
      JSON.stringify({ apiKey: registration.apiKey })
    );
  }

  // Validate toolsJson is valid JSON array
  JSON.parse(registration.toolsJson);

  db.prepare(
    `INSERT INTO third_party_mcp_services
     (id, name, description, is_global, owner_user_id, endpoint_url, auth_type, auth_config_encrypted, tools_json, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    registration.name,
    registration.description,
    userId,
    registration.endpointUrl,
    registration.authType,
    authConfigEncrypted,
    registration.toolsJson,
    now,
    now
  );

  logger.info({ serviceId: id, userId, name: registration.name }, 'Third-party MCP service registered');

  return id;
}

/**
 * Get all third-party services owned by a user
 */
export function getServicesForUser(userId: string): ThirdPartyServiceRow[] {
  return db
    .prepare('SELECT * FROM third_party_mcp_services WHERE owner_user_id = ? ORDER BY created_at DESC')
    .all(userId) as ThirdPartyServiceRow[];
}

/**
 * Get a single service by ID (for public config endpoint)
 */
export function getServiceById(serviceId: string): ThirdPartyServiceRow | undefined {
  return db
    .prepare('SELECT * FROM third_party_mcp_services WHERE id = ?')
    .get(serviceId) as ThirdPartyServiceRow | undefined;
}

/**
 * Delete a service (only if owned by user)
 */
export function deleteService(serviceId: string, userId: string): boolean {
  const result = db
    .prepare('DELETE FROM third_party_mcp_services WHERE id = ? AND owner_user_id = ?')
    .run(serviceId, userId);

  if (result.changes > 0) {
    logger.info({ serviceId, userId }, 'Third-party MCP service deleted');
    return true;
  }
  return false;
}

/**
 * Decrypt the API key from a service row's auth_config_encrypted field
 */
export function decryptApiKey(authConfigEncrypted: string): string | null {
  try {
    const config = JSON.parse(decrypt(authConfigEncrypted));
    return config.apiKey ?? null;
  } catch {
    logger.error('Failed to decrypt API key');
    return null;
  }
}

/**
 * Fetch tool definitions from a third-party MCP endpoint
 */
export async function fetchToolsFromEndpoint(
  endpointUrl: string,
  authType: 'none' | 'api_key',
  apiKey?: string
): Promise<McpToolDefinition[]> {
  const url = `${endpointUrl.replace(/\/+$/, '')}/tools/list`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authType === 'api_key' && apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });

  if (!response.ok) {
    throw new Error(`Failed to fetch tools: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { tools?: McpToolDefinition[] };

  if (!data.tools || !Array.isArray(data.tools)) {
    throw new Error('Invalid response: expected { tools: [...] }');
  }

  return data.tools;
}
