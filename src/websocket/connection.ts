// Re-export connection management from server module
export {
  getOnlineDeviceIds,
  getConnectionCount,
  getActiveDeviceCount,
} from '../server/websocket.js';
