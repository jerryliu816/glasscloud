# GlassCloud

MCP Relay Server for GlassBridge - a cloud service that bridges the GlassBridge Android app with Google services and third-party tools via the Model Context Protocol (MCP).

## Purpose

GlassCloud solves a fundamental challenge in mobile AI assistants: **how do you give a voice assistant on smart glasses access to your personal data (email, calendar) securely?**

The answer is a cloud relay that:
1. **Authenticates users** via Google OAuth on a web browser
2. **Links devices** via QR code scanning (no typing passwords on glasses)
3. **Proxies tool calls** from the Android app to Google APIs
4. **Manages OAuth tokens** securely with encryption at rest

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Smart Glasses  │────▶│   GlassCloud    │────▶│  Google APIs    │
│  + Android App  │ WS  │  (This Server)  │     │  Gmail/Calendar │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  Web Console    │
                        │  (OAuth + QR)   │
                        └─────────────────┘
```

## Key Features

- **WebSocket Relay** - Real-time bidirectional communication with Android devices
- **Google OAuth** - Secure authentication without exposing credentials to the mobile app
- **QR Code Linking** - Scan-to-link flow for easy device pairing
- **MCP Tool Execution** - Gmail and Calendar tools with automatic token refresh
- **Voice-First Design** - Progress messages for immediate audio feedback during tool execution

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your settings (see Configuration below)

# Development (auto-reload)
npm run dev

# Production
npm run build
npm start
```

Then open: **http://localhost:3000/console**

## Configuration

### Required Environment Variables

```bash
# Security - MUST be unique random values (32+ chars)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
JWT_SECRET=your-random-secret-here
ENCRYPTION_KEY=your-random-key-here

# Google OAuth (optional for dev, required for production)
# Create at: https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

### Optional Settings

```bash
PORT=3000                      # Server port
NODE_ENV=development           # development | production
LOG_LEVEL=debug               # trace | debug | info | warn | error
DATABASE_PATH=./data/glasscloud.db
CORS_ORIGINS=http://localhost:3000
```

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        GlassCloud Server                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │  WebSocket  │   │  REST API   │   │  MCP Proxy  │           │
│  │   Server    │   │  (Express)  │   │   Manager   │           │
│  │             │   │             │   │             │           │
│  │ - Device    │   │ - OAuth     │   │ - Gmail     │           │
│  │   connections│   │ - QR codes  │   │ - Calendar  │           │
│  │ - Tool      │   │ - Devices   │   │ - Token     │           │
│  │   routing   │   │ - Console   │   │   refresh   │           │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘           │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │                                     │
│                  ┌────────┴────────┐                            │
│                  │   SQLite + WAL  │                            │
│                  │                 │                            │
│                  │ - Users         │                            │
│                  │ - Devices       │                            │
│                  │ - OAuth tokens  │                            │
│                  │ - Link tokens   │                            │
│                  └─────────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
src/
├── index.ts                 # Entry point, server startup
├── config/
│   ├── env.ts              # Zod environment validation
│   ├── mcp-services.ts     # Built-in service definitions
│   └── index.ts
├── server/
│   ├── express.ts          # Express app setup (CORS, helmet, rate limiting)
│   └── websocket.ts        # WebSocket server with zombie cleanup
├── routes/
│   ├── auth.ts             # Google OAuth flow
│   ├── console.ts          # Web console UI
│   ├── devices.ts          # Device management API
│   ├── health.ts           # Health check endpoint
│   ├── link.ts             # QR code token generation
│   └── mcp.ts              # MCP services API
├── websocket/
│   ├── handler.ts          # Message routing with progress feedback
│   ├── protocol.ts         # Message type definitions
│   └── connection.ts       # Connection tracking
├── services/
│   ├── auth.service.ts     # OAuth + token refresh mutex
│   ├── device.service.ts   # Device CRUD operations
│   ├── link.service.ts     # QR code token handling
│   └── mcp-proxy.service.ts # Tool execution + input coercion
├── mcp/
│   ├── gmail.ts            # Gmail API integration
│   ├── calendar.ts         # Calendar API integration
│   └── registry.ts
├── db/
│   ├── index.ts            # SQLite connection + WAL mode
│   └── schema.ts           # Table definitions
├── utils/
│   ├── logger.ts           # Pino structured logging
│   ├── crypto.ts           # AES-256-GCM encryption
│   └── cache.ts            # LRU cache for tool results
└── types/
    ├── api.ts              # REST API types
    ├── mcp.ts              # MCP types
    └── websocket.ts        # WebSocket message types
```

## Design Decisions

### Why a Cloud Relay?

1. **OAuth Security** - Google OAuth requires a web browser redirect flow. Smart glasses can't do this, but they can scan a QR code.

2. **Token Management** - OAuth tokens must be refreshed periodically. Doing this on-device means storing refresh tokens on the phone. The relay handles this centrally.

3. **Connection Stability** - Mobile connections are flaky. The relay maintains persistent connections to Google APIs while tolerating device disconnects.

### SQLite with WAL Mode

We use SQLite instead of PostgreSQL for simplicity:
- **Zero configuration** - No separate database server
- **Faster for single-instance** - No network latency
- **WAL mode** - Enables concurrent reads during writes

```typescript
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
```

### Token Refresh Mutex

When a user asks "Check my email and add a meeting", the LLM might fire two tool calls simultaneously. Without protection, both could try to refresh an expired OAuth token, causing one to fail.

Solution: A promise-based mutex that makes concurrent refresh requests wait for the first one.

```typescript
const refreshPromises = new Map<string, Promise<Token>>();

async function getValidToken(userId: string) {
  // If refresh in progress, wait for it
  const existing = refreshPromises.get(userId);
  if (existing) return existing;

  // Start new refresh
  const promise = refreshToken(userId);
  refreshPromises.set(userId, promise);
  // ...
}
```

### Voice-First UX

Tool execution can take 2-5 seconds. In a voice app, silence feels broken.

Solution: Send `tool_progress` immediately when execution starts:

```json
{"type": "tool_progress", "status": "executing", "message": "Checking your emails..."}
```

The Android app can play a "thinking" sound while waiting.

### Content Truncation

Large emails (10MB with attachments) would crash the Android JSON parser.

Solution: Truncate to 10KB and tell the LLM:
```
[...Email truncated due to size. Full content not available...]
```

This prevents the LLM from hallucinating the rest of the email.

### Input Coercion

LLMs often send `"10"` (string) when the schema expects `10` (number).

Solution: Use Zod with coercion:
```typescript
z.coerce.number().int().min(1).max(50)
// Accepts both 10 and "10"
```

## WebSocket Protocol

### Connection

```
ws://localhost:3000/ws?deviceId=UNIQUE_DEVICE_ID
```

### Client → Server Messages

```typescript
// Execute a tool
{ "type": "tool_execute", "requestId": "uuid", "serverId": "gmail",
  "toolName": "gmail.get_unread", "arguments": { "maxResults": 10 } }

// List available servers
{ "type": "get_servers", "requestId": "uuid" }

// Link device to user
{ "type": "link_device", "requestId": "uuid", "linkToken": "from-qr-code", "deviceId": "..." }

// Get user account info
{ "type": "get_user_account", "requestId": "uuid", "deviceId": "..." }
```

### Server → Client Messages

```typescript
// Tool execution started (for voice feedback)
{ "type": "tool_progress", "requestId": "uuid", "status": "executing",
  "message": "Checking your emails..." }

// Tool result
{ "type": "tool_result", "requestId": "uuid",
  "result": { "success": true, "isError": false, "content": "You have 3 unread emails..." } }

// Available servers
{ "type": "servers_list", "requestId": "uuid", "servers": [...] }

// Error
{ "type": "error", "requestId": "uuid", "error": "Token expired" }
```

## REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with connection stats |
| `/console` | GET | Web console UI |
| `/auth/google` | POST | Initiate OAuth flow |
| `/auth/google/callback` | GET | OAuth callback |
| `/api/link/generate` | POST | Generate QR code link token |
| `/api/devices` | GET | List user's linked devices |
| `/api/devices/:id` | DELETE | Unlink a device |
| `/api/mcp/services` | GET | List available MCP services |

## Available MCP Tools

### Gmail (`gmail.*`)

| Tool | Description |
|------|-------------|
| `gmail.get_unread` | Get unread email count and summaries |
| `gmail.search` | Search emails by query |
| `gmail.get_message` | Get full email content by ID |

### Calendar (`calendar.*`)

| Tool | Description |
|------|-------------|
| `calendar.get_today` | Get today's events |
| `calendar.get_events` | Get events for N days |
| `calendar.create_event` | Create a new event |

## Database Schema

```sql
-- Users (from Google OAuth)
users (id, google_id, email, display_name, profile_picture_url, created_at, updated_at)

-- Linked devices
devices (id, user_id, device_name, device_model, last_seen_at, last_heartbeat_at, linked_at, created_at)

-- QR code link tokens (single-use, 5 min expiry)
link_tokens (id, user_id, expires_at, used_at, used_by_device_id, created_at)

-- Encrypted OAuth tokens
oauth_tokens (id, user_id, provider, access_token_encrypted, refresh_token_encrypted, ...)
```

## Security Considerations

### Token Encryption
OAuth tokens are encrypted at rest using AES-256-GCM. The encryption key comes from the `ENCRYPTION_KEY` environment variable.

### Link Token Security
- Cryptographically random (32 bytes)
- Single-use (marked used after successful link)
- Short expiration (5 minutes)
- Stored as SHA-256 hash (original never stored)

### Google API Scopes
This app requests restricted scopes (`gmail.readonly`, `calendar.events`). For public deployment, you'll need Google's CASA security assessment ($15K-$75K/year). For testing, keep the app in "Testing" mode (100 user limit).

## Future Enhancements

- [ ] Third-party MCP server registration via console
- [ ] Push notifications via FCM
- [ ] Usage analytics and tool popularity metrics
- [ ] Multi-tenancy for organizations
- [ ] PostgreSQL migration for horizontal scaling

## Related Documentation

- [GlassBridge Android App](../glassbridge/)
- [Full Architecture Document](../glassbridge/docs/GLASSCLOUD_ARCHITECTURE.md)
- [MCP User Guide](../glassbridge/docs/MCP_USER_GUIDE.md)

## License

MIT
