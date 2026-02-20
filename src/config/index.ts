export { env, type Env } from './env.js';
export { BUILT_IN_SERVICES, gmailTools, calendarTools } from './mcp-services.js';

// Google OAuth scopes - basic login only needs openid/profile/email.
// Gmail and Calendar scopes are requested via incremental auth when
// the user enables those MCP services.
export const GOOGLE_LOGIN_SCOPES = [
  'openid',
  'profile',
  'email',
];

export const GOOGLE_MCP_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

export const GOOGLE_SCOPES = [...GOOGLE_LOGIN_SCOPES, ...GOOGLE_MCP_SCOPES];
