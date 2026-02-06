import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { BUILT_IN_SERVICES } from '../config/mcp-services.js';
import { db } from '../db/index.js';
import { getDevicesForUser } from '../services/device.service.js';
import { generateLinkToken } from '../services/link.service.js';
import { getOnlineDeviceIds, getConnectionCount, getActiveDeviceCount } from '../server/websocket.js';

export const consoleRouter = Router();

// Simple session storage (in production use proper sessions)
const sessions = new Map<string, { userId: string; email: string; name: string }>();

/**
 * Main console page
 */
consoleRouter.get('/', (req: Request, res: Response) => {
  const sessionId = req.query.session as string;
  const session = sessionId ? sessions.get(sessionId) : null;

  // Get stats
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  const deviceCount = (db.prepare('SELECT COUNT(*) as count FROM devices WHERE user_id IS NOT NULL').get() as { count: number }).count;

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GlassCloud Console</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; min-height: 100vh; }
    .container { max-width: 1000px; margin: 0 auto; padding: 20px; }
    header { background: #1a73e8; color: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; }
    header h1 { font-size: 24px; margin-bottom: 5px; }
    header p { opacity: 0.9; }
    .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card h2 { font-size: 18px; margin-bottom: 15px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }
    .stat { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px; }
    .stat-value { font-size: 32px; font-weight: bold; color: #1a73e8; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .btn { display: inline-block; padding: 10px 20px; background: #1a73e8; color: white; text-decoration: none; border-radius: 4px; border: none; cursor: pointer; font-size: 14px; }
    .btn:hover { background: #1557b0; }
    .btn-secondary { background: #6c757d; }
    .btn-secondary:hover { background: #545b62; }
    .user-info { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; }
    .user-info img { width: 48px; height: 48px; border-radius: 50%; }
    .services-list { display: grid; gap: 10px; }
    .service-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 4px; }
    .service-name { font-weight: 500; }
    .service-desc { font-size: 12px; color: #666; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
    .badge-blue { background: #e3f2fd; color: #1565c0; }
    .badge-green { background: #e8f5e9; color: #2e7d32; }
    .devices-list { margin-top: 15px; }
    .device-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee; }
    .device-item:last-child { border-bottom: none; }
    .online-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 8px; }
    .online-dot.online { background: #4caf50; }
    .online-dot.offline { background: #9e9e9e; }
    #qr-container { text-align: center; padding: 20px; }
    #qr-container canvas { margin: 10px auto; }
    .qr-data { font-family: monospace; font-size: 12px; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px; margin-top: 10px; }
    .alert { padding: 12px; border-radius: 4px; margin-bottom: 15px; }
    .alert-info { background: #e3f2fd; color: #1565c0; }
    .alert-warning { background: #fff3e0; color: #e65100; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
</head>
<body>
  <div class="container">
    <header>
      <h1>GlassCloud Console</h1>
      <p>MCP Relay Server for GlassBridge</p>
    </header>

    <div class="card">
      <h2>Server Status</h2>
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${getConnectionCount()}</div>
          <div class="stat-label">WebSocket Connections</div>
        </div>
        <div class="stat">
          <div class="stat-value">${getActiveDeviceCount()}</div>
          <div class="stat-label">Active Devices</div>
        </div>
        <div class="stat">
          <div class="stat-value">${userCount}</div>
          <div class="stat-label">Registered Users</div>
        </div>
        <div class="stat">
          <div class="stat-value">${deviceCount}</div>
          <div class="stat-label">Linked Devices</div>
        </div>
      </div>
    </div>

    ${session ? `
    <div class="card">
      <h2>Your Account</h2>
      <div class="user-info">
        <div>
          <strong>${session.name}</strong><br>
          <span style="color: #666; font-size: 14px;">${session.email}</span>
        </div>
      </div>
      <a href="/console/logout" class="btn btn-secondary">Sign Out</a>
    </div>

    <div class="card">
      <h2>Link a Device</h2>
      <p style="margin-bottom: 15px; color: #666;">Scan this QR code with the GlassBridge app to link your device.</p>
      <div id="qr-container">
        <button class="btn" onclick="generateQR('${sessionId}')">Generate QR Code</button>
        <div id="qr-display" style="display: none; margin-top: 20px;">
          <canvas id="qr-canvas"></canvas>
          <div class="qr-data" id="qr-data"></div>
          <p style="margin-top: 10px; color: #666; font-size: 14px;">Expires in 5 minutes</p>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Your Devices</h2>
      <div id="devices-list" class="devices-list">
        Loading...
      </div>
      <script>
        fetch('/console/api/devices?session=${sessionId}')
          .then(r => r.json())
          .then(data => {
            const list = document.getElementById('devices-list');
            if (data.devices.length === 0) {
              list.innerHTML = '<p style="color: #666;">No devices linked yet. Generate a QR code above to link your first device.</p>';
            } else {
              list.innerHTML = data.devices.map(d => \`
                <div class="device-item">
                  <div>
                    <span class="online-dot \${d.isOnline ? 'online' : 'offline'}"></span>
                    <strong>\${d.deviceName}</strong>
                    <span style="color: #666; font-size: 12px;"> - Linked \${new Date(d.linkedAt).toLocaleDateString()}</span>
                  </div>
                  <button class="btn btn-secondary" style="padding: 5px 10px; font-size: 12px;" onclick="unlinkDevice('\${d.deviceId}', '${sessionId}')">Unlink</button>
                </div>
              \`).join('');
            }
          });
      </script>
    </div>
    ` : `
    <div class="card">
      <h2>Sign In</h2>
      <div class="alert alert-info">
        Sign in with Google to link devices and access your MCP services.
      </div>
      ${env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_ID.includes('your-client-id') ? `
      <a href="/console/auth/google" class="btn">Sign in with Google</a>
      ` : `
      <div class="alert alert-warning">
        <strong>Google OAuth not configured.</strong><br>
        Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.<br><br>
        <a href="/console/dev-login" class="btn">Use Dev Login (Testing Only)</a>
      </div>
      `}
    </div>
    `}

    <div class="card">
      <h2>Available MCP Services</h2>
      <div class="services-list">
        ${BUILT_IN_SERVICES.map(s => `
        <div class="service-item">
          <div>
            <div class="service-name">${s.name}</div>
            <div class="service-desc">${s.description} - ${s.tools.length} tools</div>
          </div>
          <div>
            <span class="badge badge-blue">Built-in</span>
            <span class="badge badge-green">${s.authType}</span>
          </div>
        </div>
        `).join('')}
      </div>
      <p style="margin-top: 15px; color: #666; font-size: 14px;">
        Third-party MCP server registration coming soon.
      </p>
    </div>

    <div class="card">
      <h2>API Documentation</h2>
      <p style="color: #666; margin-bottom: 10px;">REST API endpoints for integration:</p>
      <ul style="margin-left: 20px; color: #666;">
        <li><code>GET /health</code> - Health check</li>
        <li><code>POST /auth/google</code> - Initiate OAuth</li>
        <li><code>POST /api/link/generate</code> - Generate link token</li>
        <li><code>GET /api/devices</code> - List devices</li>
        <li><code>GET /api/mcp/services</code> - List MCP services</li>
      </ul>
      <p style="margin-top: 15px; color: #666; font-size: 14px;">
        WebSocket: <code>ws://localhost:${env.PORT}/ws?deviceId=DEVICE_ID</code>
      </p>
    </div>
  </div>

  <script>
    async function generateQR(sessionId) {
      const res = await fetch('/console/api/link/generate?session=' + sessionId, { method: 'POST' });
      const data = await res.json();

      document.getElementById('qr-display').style.display = 'block';
      document.getElementById('qr-data').textContent = data.qrCodeData;

      QRCode.toCanvas(document.getElementById('qr-canvas'), data.qrCodeData, { width: 256 });
    }

    async function unlinkDevice(deviceId, sessionId) {
      if (!confirm('Unlink this device?')) return;
      await fetch('/console/api/devices/' + deviceId + '?session=' + sessionId, { method: 'DELETE' });
      location.reload();
    }
  </script>
</body>
</html>
  `);
});

/**
 * Dev login (for testing without Google OAuth)
 */
consoleRouter.get('/dev-login', (_req: Request, res: Response) => {
  if (env.NODE_ENV === 'production') {
    return res.status(403).send('Dev login disabled in production');
  }

  // Create or get dev user
  const devEmail = 'dev@localhost';
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(devEmail) as { id: string; display_name: string } | undefined;

  if (!user) {
    const { v4: uuidv4 } = require('uuid');
    const userId = uuidv4();
    const now = Date.now();
    db.prepare(
      `INSERT INTO users (id, google_id, email, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, 'dev-user', devEmail, 'Dev User', now, now);
    user = { id: userId, display_name: 'Dev User' };
  }

  // Create session
  const sessionId = require('crypto').randomBytes(16).toString('hex');
  sessions.set(sessionId, { userId: user.id, email: devEmail, name: user.display_name });

  res.redirect(`/console?session=${sessionId}`);
});

/**
 * Google OAuth redirect
 */
consoleRouter.get('/auth/google', (_req: Request, res: Response) => {
  const { v4: uuidv4 } = require('uuid');
  const state = uuidv4();

  // Store state for verification
  const { getAuthorizationUrl } = require('../services/auth.service.js');
  const url = getAuthorizationUrl(state);

  res.redirect(url);
});

/**
 * Logout
 */
consoleRouter.get('/logout', (req: Request, res: Response) => {
  const sessionId = req.query.session as string;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.redirect('/console');
});

/**
 * API: Get devices
 */
consoleRouter.get('/api/devices', (req: Request, res: Response) => {
  const sessionId = req.query.session as string;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const devices = getDevicesForUser(session.userId, getOnlineDeviceIds());
  res.json({ devices });
});

/**
 * API: Generate link token
 */
consoleRouter.post('/api/link/generate', (req: Request, res: Response) => {
  const sessionId = req.query.session as string;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const linkToken = generateLinkToken(session.userId, baseUrl);

  res.json({
    linkToken: linkToken.token,
    expiresAt: linkToken.expiresAt,
    qrCodeData: linkToken.qrCodeData,
  });
});

/**
 * API: Unlink device
 */
consoleRouter.delete('/api/devices/:deviceId', (req: Request, res: Response) => {
  const sessionId = req.query.session as string;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { deleteDevice } = require('../services/device.service.js');
  const success = deleteDevice(req.params.deviceId, session.userId);

  res.json({ success });
});
