import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { env, GOOGLE_SCOPES, GOOGLE_LOGIN_SCOPES, GOOGLE_MCP_SCOPES } from '../config/index.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

export interface OAuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

export interface User {
  id: string;
  googleId: string;
  email: string;
  displayName: string;
  profilePictureUrl?: string;
}

// Mutex for token refresh - prevents race conditions
const refreshPromises = new Map<string, Promise<OAuthToken>>();

// Token expiry buffer (refresh 5 minutes before expiry)
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

const oauth2Client = new google.auth.OAuth2(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_CALLBACK_URL
);

/**
 * Generate Google OAuth authorization URL
 */
export function getAuthorizationUrl(state: string, scopes?: string[]): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes ?? GOOGLE_LOGIN_SCOPES,
    state,
    prompt: 'consent', // Force consent to get refresh token
    include_granted_scopes: true, // Preserve previously granted scopes
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string
): Promise<{ user: User; tokens: OAuthToken }> {
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Missing tokens in OAuth response');
  }

  oauth2Client.setCredentials(tokens);

  // Get user info
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data: userInfo } = await oauth2.userinfo.get();

  if (!userInfo.id || !userInfo.email) {
    throw new Error('Missing user info in OAuth response');
  }

  const now = Date.now();

  // Find or create user
  let user = db
    .prepare('SELECT * FROM users WHERE google_id = ?')
    .get(userInfo.id) as User | undefined;

  if (!user) {
    const userId = uuidv4();
    db.prepare(
      `INSERT INTO users (id, google_id, email, display_name, profile_picture_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      userInfo.id,
      userInfo.email,
      userInfo.name ?? userInfo.email,
      userInfo.picture ?? null,
      now,
      now
    );
    user = {
      id: userId,
      googleId: userInfo.id,
      email: userInfo.email,
      displayName: userInfo.name ?? userInfo.email,
      profilePictureUrl: userInfo.picture ?? undefined,
    };
    logger.info({ userId, email: user.email }, 'Created new user');
  } else {
    // Update user info
    db.prepare(
      `UPDATE users SET email = ?, display_name = ?, profile_picture_url = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      userInfo.email,
      userInfo.name ?? userInfo.email,
      userInfo.picture ?? null,
      now,
      user.id
    );
  }

  const oauthToken: OAuthToken = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date ?? now + 3600 * 1000,
    scope: tokens.scope ?? GOOGLE_SCOPES.join(' '),
  };

  // Store tokens
  await storeTokens(user.id, oauthToken);

  return { user, tokens: oauthToken };
}

/**
 * Store OAuth tokens (encrypted)
 */
async function storeTokens(userId: string, tokens: OAuthToken): Promise<void> {
  const now = Date.now();
  const id = uuidv4();

  const existing = db
    .prepare('SELECT id FROM oauth_tokens WHERE user_id = ?')
    .get(userId);

  if (existing) {
    db.prepare(
      `UPDATE oauth_tokens
       SET access_token_encrypted = ?, refresh_token_encrypted = ?,
           token_type = ?, scope = ?, expires_at = ?, updated_at = ?
       WHERE user_id = ?`
    ).run(
      encrypt(tokens.accessToken),
      encrypt(tokens.refreshToken),
      'Bearer',
      tokens.scope,
      tokens.expiresAt,
      now,
      userId
    );
  } else {
    db.prepare(
      `INSERT INTO oauth_tokens
       (id, user_id, provider, access_token_encrypted, refresh_token_encrypted,
        token_type, scope, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      userId,
      'google',
      encrypt(tokens.accessToken),
      encrypt(tokens.refreshToken),
      'Bearer',
      tokens.scope,
      tokens.expiresAt,
      now,
      now
    );
  }
}

/**
 * Get valid OAuth token for user (with automatic refresh and mutex)
 */
export async function getValidToken(userId: string): Promise<OAuthToken | null> {
  const row = db
    .prepare('SELECT * FROM oauth_tokens WHERE user_id = ?')
    .get(userId) as {
      access_token_encrypted: string;
      refresh_token_encrypted: string;
      expires_at: number;
      scope: string;
    } | undefined;

  if (!row) {
    return null;
  }

  const token: OAuthToken = {
    accessToken: decrypt(row.access_token_encrypted),
    refreshToken: decrypt(row.refresh_token_encrypted),
    expiresAt: row.expires_at,
    scope: row.scope,
  };

  // Check if token is expiring soon
  if (token.expiresAt - Date.now() > EXPIRY_BUFFER_MS) {
    return token;
  }

  // Token needs refresh - use mutex to prevent race conditions
  const existingRefresh = refreshPromises.get(userId);
  if (existingRefresh) {
    logger.debug({ userId }, 'Waiting for existing token refresh');
    return existingRefresh;
  }

  logger.info({ userId }, 'Refreshing expired token');

  const refreshPromise = refreshToken(userId, token);
  refreshPromises.set(userId, refreshPromise);

  try {
    const newToken = await refreshPromise;
    return newToken;
  } finally {
    refreshPromises.delete(userId);
  }
}

/**
 * Refresh an OAuth token
 */
async function refreshToken(
  userId: string,
  token: OAuthToken
): Promise<OAuthToken> {
  oauth2Client.setCredentials({
    refresh_token: token.refreshToken,
  });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('Failed to refresh token');
  }

  const newToken: OAuthToken = {
    accessToken: credentials.access_token,
    refreshToken: credentials.refresh_token ?? token.refreshToken,
    expiresAt: credentials.expiry_date ?? Date.now() + 3600 * 1000,
    scope: token.scope,
  };

  await storeTokens(userId, newToken);
  logger.info({ userId }, 'Token refreshed successfully');

  return newToken;
}

/**
 * Get user by ID
 */
export function getUserById(userId: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as {
    id: string;
    google_id: string;
    email: string;
    display_name: string;
    profile_picture_url: string | null;
  } | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    googleId: row.google_id,
    email: row.email,
    displayName: row.display_name,
    profilePictureUrl: row.profile_picture_url ?? undefined,
  };
}

/**
 * Check if user has valid OAuth tokens
 */
export function hasValidOAuth(userId: string): boolean {
  const row = db
    .prepare('SELECT expires_at FROM oauth_tokens WHERE user_id = ?')
    .get(userId) as { expires_at: number } | undefined;

  return row !== undefined;
}
