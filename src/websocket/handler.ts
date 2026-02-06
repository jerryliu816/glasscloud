import type { WebSocket } from 'ws';
import { logger } from '../utils/logger.js';
import {
  executeTool,
  getAvailableServers,
  getToolProgressMessage,
} from '../services/mcp-proxy.service.js';
import { linkDeviceWithToken } from '../services/link.service.js';
import { unlinkDevice, getDeviceUserId, getUserDevices } from '../services/device.service.js';
import { getUserById } from '../services/auth.service.js';
import type {
  ClientMessage,
  ToolProgressMessage,
  ToolResultMessage,
  ServersListMessage,
  LinkResultMessage,
  UnlinkResultMessage,
  UserAccountMessage,
  ErrorMessage,
} from '../types/websocket.js';

interface ExtWebSocket extends WebSocket {
  deviceId: string;
}

export async function handleWebSocketMessage(
  ws: ExtWebSocket,
  message: ClientMessage
): Promise<void> {
  const { deviceId } = ws;

  logger.debug({ type: message.type, deviceId }, 'Received WebSocket message');

  try {
    switch (message.type) {
      case 'tool_execute':
        await handleToolExecute(ws, message);
        break;
      case 'get_servers':
        handleGetServers(ws, message);
        break;
      case 'link_device':
        handleLinkDevice(ws, message);
        break;
      case 'unlink_device':
        handleUnlinkDevice(ws, message);
        break;
      case 'get_user_account':
        handleGetUserAccount(ws, message);
        break;
      default:
        sendError(ws, (message as { requestId?: string }).requestId, 'Unknown message type');
    }
  } catch (error) {
    logger.error({ error, type: message.type }, 'Error handling WebSocket message');
    sendError(
      ws,
      (message as { requestId?: string }).requestId,
      error instanceof Error ? error.message : 'Internal error'
    );
  }
}

async function handleToolExecute(
  ws: ExtWebSocket,
  message: { type: 'tool_execute'; requestId: string; serverId: string; toolName: string; arguments: Record<string, unknown> }
): Promise<void> {
  const { requestId, serverId, toolName, arguments: args } = message;

  // Send progress immediately for voice UI feedback
  const progressMessage: ToolProgressMessage = {
    type: 'tool_progress',
    requestId,
    status: 'executing',
    toolName,
    message: getToolProgressMessage(toolName),
  };
  ws.send(JSON.stringify(progressMessage));

  // Execute tool
  const result = await executeTool(ws.deviceId, {
    serverId,
    toolName,
    arguments: args,
    requestId,
  });

  // Check if socket still open before sending
  if (ws.readyState === ws.OPEN) {
    const resultMessage: ToolResultMessage = {
      type: 'tool_result',
      requestId,
      result,
    };
    ws.send(JSON.stringify(resultMessage));
  } else {
    logger.warn({ requestId }, 'Connection closed before result delivery');
  }
}

function handleGetServers(
  ws: ExtWebSocket,
  message: { type: 'get_servers'; requestId: string }
): void {
  const { requestId } = message;

  const servers = getAvailableServers(ws.deviceId);

  const response: ServersListMessage = {
    type: 'servers_list',
    requestId,
    servers,
  };

  ws.send(JSON.stringify(response));
}

function handleLinkDevice(
  ws: ExtWebSocket,
  message: { type: 'link_device'; requestId: string; linkToken: string; deviceId: string }
): void {
  const { requestId, linkToken, deviceId } = message;

  const result = linkDeviceWithToken(linkToken, deviceId);

  if (!result) {
    sendError(ws, requestId, 'Invalid or expired link token');
    return;
  }

  const response: LinkResultMessage = {
    type: 'link_result',
    requestId,
    user: {
      userId: result.user.id,
      displayName: result.user.displayName,
      email: result.user.email,
      profilePictureUrl: result.user.profilePictureUrl,
      linkedDevices: result.linkedDevices,
    },
  };

  ws.send(JSON.stringify(response));
  logger.info({ deviceId, userId: result.user.id }, 'Device linked via WebSocket');
}

function handleUnlinkDevice(
  ws: ExtWebSocket,
  message: { type: 'unlink_device'; requestId: string; deviceId: string }
): void {
  const { requestId, deviceId } = message;

  const success = unlinkDevice(deviceId);

  const response: UnlinkResultMessage = {
    type: 'unlink_result',
    requestId,
    success,
  };

  ws.send(JSON.stringify(response));
}

function handleGetUserAccount(
  ws: ExtWebSocket,
  message: { type: 'get_user_account'; requestId: string; deviceId: string }
): void {
  const { requestId, deviceId } = message;

  const userId = getDeviceUserId(deviceId);

  if (!userId) {
    const response: UserAccountMessage = {
      type: 'user_account',
      requestId,
      user: null,
    };
    ws.send(JSON.stringify(response));
    return;
  }

  const user = getUserById(userId);

  if (!user) {
    const response: UserAccountMessage = {
      type: 'user_account',
      requestId,
      user: null,
    };
    ws.send(JSON.stringify(response));
    return;
  }

  const linkedDevices = getUserDevices(userId);

  const response: UserAccountMessage = {
    type: 'user_account',
    requestId,
    user: {
      userId: user.id,
      displayName: user.displayName,
      email: user.email,
      profilePictureUrl: user.profilePictureUrl,
      linkedDevices,
    },
  };

  ws.send(JSON.stringify(response));
}

function sendError(ws: WebSocket, requestId: string | undefined, error: string): void {
  const response: ErrorMessage = {
    type: 'error',
    requestId,
    error,
  };
  ws.send(JSON.stringify(response));
}
