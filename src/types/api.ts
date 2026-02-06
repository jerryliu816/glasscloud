export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  connections: {
    websocket: number;
    activeDevices: number;
    database: 'connected' | 'disconnected';
  };
}

export interface LinkTokenResponse {
  linkToken: string;
  expiresAt: number;
  qrCodeData: string;
}

export interface DeviceResponse {
  deviceId: string;
  deviceName: string;
  deviceModel?: string;
  linkedAt: number;
  lastSeenAt: number;
  isOnline: boolean;
}

export interface DevicesListResponse {
  devices: DeviceResponse[];
}

export interface McpServiceResponse {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  isEnabled: boolean;
  requiresAuth: boolean;
  isAuthenticated: boolean;
}

export interface McpServicesListResponse {
  services: McpServiceResponse[];
}
