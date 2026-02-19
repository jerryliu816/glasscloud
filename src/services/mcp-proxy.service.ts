import { z } from 'zod';
import { BUILT_IN_SERVICES } from '../config/index.js';
import { getValidToken } from './auth.service.js';
import { getDeviceUserId } from './device.service.js';
import { getServicesForUser as getThirdPartyServices, getServiceById, decryptApiKey } from './mcp-registry.service.js';
import { executeGmailTool } from '../mcp/gmail.js';
import { executeCalendarTool } from '../mcp/calendar.js';
import { toolResultCache, getToolCacheKey } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import type { McpToolCall, McpToolResult, McpServer, McpToolDefinition } from '../types/mcp.js';

const MAX_CONTENT_LENGTH = 10240; // 10KB

/**
 * Get available servers for a device
 */
export function getAvailableServers(deviceId: string): McpServer[] {
  const userId = getDeviceUserId(deviceId);

  if (!userId) {
    return [];
  }

  const builtIn: McpServer[] = BUILT_IN_SERVICES.map((service) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    isBuiltIn: service.isBuiltIn,
    tools: service.tools,
  }));

  // Include third-party services owned by user
  const thirdPartyRows = getThirdPartyServices(userId);
  const thirdParty: McpServer[] = thirdPartyRows.map((row) => {
    let tools: McpToolDefinition[] = [];
    try {
      tools = JSON.parse(row.tools_json);
    } catch { /* ignore parse errors */ }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isBuiltIn: false,
      tools,
    };
  });

  return [...builtIn, ...thirdParty];
}

/**
 * Execute an MCP tool
 */
export async function executeTool(
  deviceId: string,
  call: McpToolCall
): Promise<McpToolResult> {
  const userId = getDeviceUserId(deviceId);

  if (!userId) {
    return {
      success: false,
      isError: true,
      content: 'Device not linked to any user account',
    };
  }

  // Check cache first
  const cacheKey = getToolCacheKey(call.toolName, call.arguments);
  const cachedResult = toolResultCache.get(cacheKey);
  if (cachedResult) {
    logger.debug({ toolName: call.toolName }, 'Returning cached result');
    return {
      success: true,
      isError: false,
      content: cachedResult,
    };
  }

  try {
    // Route to appropriate service
    const [serverId] = call.toolName.split('.');

    let result: string;

    switch (serverId) {
      case 'gmail': {
        const args = validateAndCoerceArgs(call.toolName, call.arguments);
        result = await executeGmailToolWithAuth(userId, call.toolName, args);
        break;
      }
      case 'calendar': {
        const args = validateAndCoerceArgs(call.toolName, call.arguments);
        result = await executeCalendarToolWithAuth(userId, call.toolName, args);
        break;
      }
      default: {
        // Try third-party service proxy
        result = await executeThirdPartyTool(userId, call);
        break;
      }
    }

    // Truncate if needed
    const truncatedResult = truncateContent(result);

    // Cache successful result
    toolResultCache.set(cacheKey, truncatedResult);

    return {
      success: true,
      isError: false,
      content: truncatedResult,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Input validation failed
      const issues = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      return {
        success: false,
        isError: true,
        content: `Invalid arguments: ${issues}`,
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, toolName: call.toolName }, 'Tool execution failed');

    return {
      success: false,
      isError: true,
      content: `Error: ${message}`,
    };
  }
}

/**
 * Validate and coerce tool arguments using Zod
 */
function validateAndCoerceArgs(
  toolName: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  // Define schemas for each tool with coercion
  const schemas: Record<string, z.ZodObject<z.ZodRawShape>> = {
    'gmail.get_unread': z.object({
      maxResults: z.coerce.number().int().min(1).max(50).default(10),
    }),
    'gmail.search': z.object({
      query: z.string().min(1),
      maxResults: z.coerce.number().int().min(1).max(50).default(10),
    }),
    'gmail.get_message': z.object({
      messageId: z.string().min(1),
    }),
    'calendar.get_today': z.object({}),
    'calendar.get_events': z.object({
      days: z.coerce.number().int().min(1).max(30).default(7),
      startDate: z.string().optional(),
    }),
    'calendar.create_event': z.object({
      title: z.string().min(1),
      startTime: z.string().min(1),
      endTime: z.string().optional(),
      description: z.string().optional(),
    }),
  };

  const schema = schemas[toolName];
  if (!schema) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  return schema.parse(args);
}

/**
 * Execute Gmail tool with authentication
 */
async function executeGmailToolWithAuth(
  userId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const token = await getValidToken(userId);
  if (!token) {
    throw new Error('No valid OAuth token. Please re-authenticate.');
  }

  return executeGmailTool(toolName, args, token.accessToken);
}

/**
 * Execute Calendar tool with authentication
 */
async function executeCalendarToolWithAuth(
  userId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const token = await getValidToken(userId);
  if (!token) {
    throw new Error('No valid OAuth token. Please re-authenticate.');
  }

  return executeCalendarTool(toolName, args, token.accessToken);
}

/**
 * Execute a tool on a third-party MCP server via HTTP proxy
 */
async function executeThirdPartyTool(
  userId: string,
  call: McpToolCall
): Promise<string> {
  const service = getServiceById(call.serverId);

  if (!service) {
    throw new Error(`Unknown service: ${call.serverId}`);
  }

  // Verify user owns the service
  if (service.owner_user_id !== userId) {
    throw new Error(`Access denied to service: ${call.serverId}`);
  }

  // Build request
  const url = `${service.endpoint_url.replace(/\/+$/, '')}/tools/call`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (service.auth_type === 'api_key' && service.auth_config_encrypted) {
    const apiKey = decryptApiKey(service.auth_config_encrypted);
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }

  // Extract the tool name portion (after the serverId prefix if present)
  const toolName = call.toolName.includes('.')
    ? call.toolName.substring(call.toolName.indexOf('.') + 1)
    : call.toolName;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: toolName, arguments: call.arguments }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Third-party service error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text: string }>;
  };

  if (!data.content || !Array.isArray(data.content)) {
    return JSON.stringify(data);
  }

  // Concatenate text content
  return data.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

/**
 * Truncate content if too long, with notification to LLM
 */
function truncateContent(content: string): string {
  if (Buffer.byteLength(content, 'utf8') <= MAX_CONTENT_LENGTH) {
    return content;
  }

  // Truncate to max bytes and find last complete sentence/word
  let truncated = Buffer.from(content, 'utf8')
    .subarray(0, MAX_CONTENT_LENGTH)
    .toString('utf8');

  // Try to end at a sentence boundary
  const lastSentence = truncated.lastIndexOf('. ');
  if (lastSentence > MAX_CONTENT_LENGTH * 0.8) {
    truncated = truncated.substring(0, lastSentence + 1);
  }

  // Append truncation notice for LLM awareness
  return truncated + '\n\n[...Content truncated due to size. Full content not available...]';
}

/**
 * Get progress message for a tool
 */
export function getToolProgressMessage(toolName: string): string {
  const parts = toolName.split('.');
  const serverId = parts[0] ?? '';
  const action = parts[1] ?? '';

  const messages: Record<string, Record<string, string>> = {
    gmail: {
      get_unread: 'Checking your emails...',
      search: 'Searching emails...',
      get_message: 'Retrieving email...',
    },
    calendar: {
      get_today: 'Checking your schedule...',
      get_events: 'Looking up events...',
      create_event: 'Creating event...',
    },
  };

  return messages[serverId]?.[action] ?? 'Processing...';
}
