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

export interface McpServiceConfigResponse {
  id: string;
  name: string;
  description: string;
  endpointUrl: string;
  authType: 'none' | 'api_key';
  tools: import('./mcp.js').McpToolDefinition[];
}

export interface ImageUploadResponse {
  imageId: string;
  originalFilename: string;
  thumbnailFilename: string;
  receivedAt: number;
  capturedAt: number | null;
}

export interface ImageMetadataResponse {
  id: string;
  deviceModel: string;
  deviceInstanceId: string;
  sceneDescription: string;
  originalFilename: string;
  thumbnailFilename: string;
  capturedAt: number | null;
  receivedAt: number;
  createdAt: number;
}

export interface GalleryListResponse {
  images: ImageMetadataResponse[];
  total: number;
  page: number;
  pageSize: number;
}
