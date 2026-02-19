export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      default?: unknown;
    }>;
    required?: string[];
  };
}

export interface McpServiceDefinition {
  id: string;
  name: string;
  description: string;
  authType: 'none' | 'api_key' | 'oauth';
  isBuiltIn: boolean;
  endpointUrl?: string;
  authConfig?: {
    headerName?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
  };
  tools: McpToolDefinition[];
}

export interface McpServer {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  tools: McpToolDefinition[];
}

export interface McpToolCall {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  requestId: string;
}

export interface McpToolResult {
  success: boolean;
  isError: boolean;
  content: string;
}

export interface McpServiceRegistration {
  name: string;
  description: string;
  endpointUrl: string;
  authType: 'none' | 'api_key';
  apiKey?: string;
  toolsJson: string; // JSON string of McpToolDefinition[]
}
