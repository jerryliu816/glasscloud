import { google } from 'googleapis';
import { logger } from '../utils/logger.js';

const MAX_BODY_SIZE = 10240; // 10KB

/**
 * Execute a Gmail MCP tool
 */
export async function executeGmailTool(
  toolName: string,
  args: Record<string, unknown>,
  accessToken: string
): Promise<string> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth });

  const action = toolName.split('.')[1];

  switch (action) {
    case 'get_unread':
      return getUnreadEmails(gmail, args.maxResults as number);
    case 'search':
      return searchEmails(gmail, args.query as string, args.maxResults as number);
    case 'get_message':
      return getMessage(gmail, args.messageId as string);
    default:
      throw new Error(`Unknown Gmail tool: ${toolName}`);
  }
}

async function getUnreadEmails(
  gmail: ReturnType<typeof google.gmail>,
  maxResults: number
): Promise<string> {
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
    maxResults,
  });

  const messages = response.data.messages ?? [];

  if (messages.length === 0) {
    return 'You have no unread emails.';
  }

  const summaries: string[] = [];

  for (const msg of messages.slice(0, maxResults)) {
    if (!msg.id) continue;

    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });

      const headers = detail.data.payload?.headers ?? [];
      const from = headers.find((h) => h.name === 'From')?.value ?? 'Unknown';
      const subject = headers.find((h) => h.name === 'Subject')?.value ?? '(No subject)';
      const date = headers.find((h) => h.name === 'Date')?.value ?? '';

      summaries.push(`- From: ${from}\n  Subject: ${subject}\n  Date: ${date}`);
    } catch (error) {
      logger.error({ error, messageId: msg.id }, 'Failed to get message details');
    }
  }

  return `You have ${messages.length} unread email(s):\n\n${summaries.join('\n\n')}`;
}

async function searchEmails(
  gmail: ReturnType<typeof google.gmail>,
  query: string,
  maxResults: number
): Promise<string> {
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  });

  const messages = response.data.messages ?? [];

  if (messages.length === 0) {
    return `No emails found matching: "${query}"`;
  }

  const summaries: string[] = [];

  for (const msg of messages.slice(0, maxResults)) {
    if (!msg.id) continue;

    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });

      const headers = detail.data.payload?.headers ?? [];
      const from = headers.find((h) => h.name === 'From')?.value ?? 'Unknown';
      const subject = headers.find((h) => h.name === 'Subject')?.value ?? '(No subject)';
      const date = headers.find((h) => h.name === 'Date')?.value ?? '';

      summaries.push(
        `- ID: ${msg.id}\n  From: ${from}\n  Subject: ${subject}\n  Date: ${date}`
      );
    } catch (error) {
      logger.error({ error, messageId: msg.id }, 'Failed to get message details');
    }
  }

  return `Found ${messages.length} email(s) matching "${query}":\n\n${summaries.join('\n\n')}`;
}

async function getMessage(
  gmail: ReturnType<typeof google.gmail>,
  messageId: string
): Promise<string> {
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const message = response.data;
  const headers = message.payload?.headers ?? [];

  const from = headers.find((h) => h.name === 'From')?.value ?? 'Unknown';
  const to = headers.find((h) => h.name === 'To')?.value ?? 'Unknown';
  const subject = headers.find((h) => h.name === 'Subject')?.value ?? '(No subject)';
  const date = headers.find((h) => h.name === 'Date')?.value ?? '';

  // Extract body
  let body = '';
  const payload = message.payload;

  if (payload?.body?.data) {
    body = Buffer.from(payload.body.data, 'base64').toString('utf8');
  } else if (payload?.parts) {
    // Multipart message - find text/plain or text/html
    const textPart = payload.parts.find(
      (p) => p.mimeType === 'text/plain' || p.mimeType === 'text/html'
    );
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
    }
  }

  // Strip HTML tags if present
  body = body.replace(/<[^>]*>/g, '').trim();

  // Truncate if too long
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_SIZE) {
    const truncated = Buffer.from(body, 'utf8')
      .subarray(0, MAX_BODY_SIZE)
      .toString('utf8');

    const lastSentence = truncated.lastIndexOf('. ');
    body =
      (lastSentence > MAX_BODY_SIZE * 0.8
        ? truncated.substring(0, lastSentence + 1)
        : truncated) +
      '\n\n[...Email truncated due to size. Full content not available...]';
  }

  // Get attachment info
  const attachments: string[] = [];
  if (payload?.parts) {
    for (const part of payload.parts) {
      if (part.filename && part.filename.length > 0) {
        attachments.push(`${part.filename} (${part.mimeType})`);
      }
    }
  }

  let result = `From: ${from}\nTo: ${to}\nSubject: ${subject}\nDate: ${date}\n\n${body}`;

  if (attachments.length > 0) {
    result += `\n\nAttachments (not included):\n- ${attachments.join('\n- ')}`;
  }

  return result;
}
