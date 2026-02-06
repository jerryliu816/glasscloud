export { env, type Env } from './env.js';
export { BUILT_IN_SERVICES, gmailTools, calendarTools } from './mcp-services.js';

// Google OAuth scopes
export const GOOGLE_SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];
