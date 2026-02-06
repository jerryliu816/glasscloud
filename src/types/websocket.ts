import type { McpServer, McpToolResult } from './mcp.js';

// Base message with type discriminator
export interface BaseMessage {
  type: string;
  requestId?: string;
}

// Client -> Server Messages
export interface ToolExecuteMessage extends BaseMessage {
  type: 'tool_execute';
  requestId: string;
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface GetServersMessage extends BaseMessage {
  type: 'get_servers';
  requestId: string;
}

export interface LinkDeviceMessage extends BaseMessage {
  type: 'link_device';
  requestId: string;
  linkToken: string;
  deviceId: string;
}

export interface UnlinkDeviceMessage extends BaseMessage {
  type: 'unlink_device';
  requestId: string;
  deviceId: string;
}

export interface GetUserAccountMessage extends BaseMessage {
  type: 'get_user_account';
  requestId: string;
  deviceId: string;
}

export type ClientMessage =
  | ToolExecuteMessage
  | GetServersMessage
  | LinkDeviceMessage
  | UnlinkDeviceMessage
  | GetUserAccountMessage;

// Server -> Client Messages
export interface ToolProgressMessage extends BaseMessage {
  type: 'tool_progress';
  requestId: string;
  status: 'executing';
  toolName: string;
  message: string;
}

export interface ToolResultMessage extends BaseMessage {
  type: 'tool_result';
  requestId: string;
  result: McpToolResult;
}

export interface ServersListMessage extends BaseMessage {
  type: 'servers_list';
  requestId: string;
  servers: McpServer[];
}

export interface LinkedDevice {
  deviceId: string;
  deviceName: string;
  linkedAt: number;
}

export interface UserInfo {
  userId: string;
  displayName: string;
  email: string;
  profilePictureUrl?: string;
  linkedDevices: LinkedDevice[];
}

export interface LinkResultMessage extends BaseMessage {
  type: 'link_result';
  requestId: string;
  user: UserInfo;
}

export interface UnlinkResultMessage extends BaseMessage {
  type: 'unlink_result';
  requestId: string;
  success: boolean;
}

export interface UserAccountMessage extends BaseMessage {
  type: 'user_account';
  requestId: string;
  user: UserInfo | null;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  requestId?: string;
  error: string;
}

export type ServerMessage =
  | ToolProgressMessage
  | ToolResultMessage
  | ServersListMessage
  | LinkResultMessage
  | UnlinkResultMessage
  | UserAccountMessage
  | ErrorMessage;
