import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { getAuthorizationUrl, exchangeCodeForTokens } from '../services/auth.service.js';
import { logger } from '../utils/logger.js';

export const authRouter = Router();

// Store pending auth states (in production, use Redis)
const pendingStates = new Map<string, { expiresAt: number }>();

// Clean up expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of pendingStates) {
    if (data.expiresAt < now) {
      pendingStates.delete(state);
    }
  }
}, 60000);

/**
 * Initiate Google OAuth flow
 */
authRouter.post('/google', (_req, res) => {
  const state = uuidv4();
  pendingStates.set(state, { expiresAt: Date.now() + 10 * 60 * 1000 }); // 10 min expiry

  const redirectUrl = getAuthorizationUrl(state);

  res.json({ redirectUrl });
});

/**
 * Google OAuth callback
 */
authRouter.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    logger.warn({ error }, 'OAuth error');
    return res.redirect('/auth/error?message=oauth_denied');
  }

  if (!code || typeof code !== 'string') {
    return res.redirect('/auth/error?message=missing_code');
  }

  if (!state || typeof state !== 'string' || !pendingStates.has(state)) {
    return res.redirect('/auth/error?message=invalid_state');
  }

  // Remove used state
  pendingStates.delete(state);

  try {
    const { user, tokens } = await exchangeCodeForTokens(code);

    // Create session token
    const sessionToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    logger.info({ userId: user.id }, 'User authenticated');

    // In a real app, set cookie or redirect with token
    // For now, redirect with token in query (not ideal for production)
    res.redirect(`/auth/success?token=${sessionToken}`);
  } catch (err) {
    logger.error({ error: err }, 'OAuth callback error');
    res.redirect('/auth/error?message=auth_failed');
  }
});

/**
 * Simple success page
 */
authRouter.get('/success', (req, res) => {
  const { token } = req.query;
  res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>Authentication Successful</title></head>
      <body>
        <h1>Authentication Successful!</h1>
        <p>You can now link your GlassBridge device.</p>
        <p>Token: <code>${token}</code></p>
        <p><a href="/api/link/generate">Generate Link QR Code</a></p>
      </body>
    </html>
  `);
});

/**
 * Simple error page
 */
authRouter.get('/error', (req, res) => {
  const { message } = req.query;
  res.status(400).send(`
    <!DOCTYPE html>
    <html>
      <head><title>Authentication Error</title></head>
      <body>
        <h1>Authentication Error</h1>
        <p>${message ?? 'Unknown error'}</p>
        <p><a href="/auth/google">Try Again</a></p>
      </body>
    </html>
  `);
});
