import { google } from 'googleapis';
import { logger } from '../utils/logger.js';

/**
 * Execute a Calendar MCP tool
 */
export async function executeCalendarTool(
  toolName: string,
  args: Record<string, unknown>,
  accessToken: string
): Promise<string> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth });

  const action = toolName.split('.')[1];

  switch (action) {
    case 'get_today':
      return getTodayEvents(calendar);
    case 'get_events':
      return getEvents(calendar, args.days as number, args.startDate as string | undefined);
    case 'create_event':
      return createEvent(
        calendar,
        args.title as string,
        args.startTime as string,
        args.endTime as string | undefined,
        args.description as string | undefined
      );
    default:
      throw new Error(`Unknown Calendar tool: ${toolName}`);
  }
}

async function getTodayEvents(
  calendar: ReturnType<typeof google.calendar>
): Promise<string> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items ?? [];

  if (events.length === 0) {
    return 'You have no events scheduled for today.';
  }

  const summaries = events.map((event) => {
    const start = event.start?.dateTime ?? event.start?.date ?? '';
    const end = event.end?.dateTime ?? event.end?.date ?? '';

    let timeStr = '';
    if (event.start?.dateTime) {
      const startTime = new Date(start).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      const endTime = new Date(end).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      timeStr = `${startTime} - ${endTime}`;
    } else {
      timeStr = 'All day';
    }

    let result = `- ${event.summary ?? '(No title)'} (${timeStr})`;
    if (event.location) {
      result += `\n  Location: ${event.location}`;
    }
    return result;
  });

  return `Today's events (${events.length}):\n\n${summaries.join('\n\n')}`;
}

async function getEvents(
  calendar: ReturnType<typeof google.calendar>,
  days: number,
  startDate?: string
): Promise<string> {
  const start = startDate ? new Date(startDate) : new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50,
  });

  const events = response.data.items ?? [];

  if (events.length === 0) {
    return `You have no events scheduled for the next ${days} day(s).`;
  }

  // Group by day
  const byDay = new Map<string, typeof events>();

  for (const event of events) {
    const eventDate = event.start?.dateTime ?? event.start?.date ?? '';
    const day = new Date(eventDate).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    if (!byDay.has(day)) {
      byDay.set(day, []);
    }
    byDay.get(day)!.push(event);
  }

  const sections: string[] = [];

  for (const [day, dayEvents] of byDay) {
    const eventLines = dayEvents.map((event) => {
      let timeStr = '';
      if (event.start?.dateTime) {
        const startTime = new Date(event.start.dateTime).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        timeStr = ` at ${startTime}`;
      } else {
        timeStr = ' (All day)';
      }
      return `  - ${event.summary ?? '(No title)'}${timeStr}`;
    });

    sections.push(`${day}:\n${eventLines.join('\n')}`);
  }

  return `Upcoming events (${events.length}):\n\n${sections.join('\n\n')}`;
}

async function createEvent(
  calendar: ReturnType<typeof google.calendar>,
  title: string,
  startTime: string,
  endTime?: string,
  description?: string
): Promise<string> {
  // Parse start time
  let startDate: Date;
  try {
    startDate = parseTimeString(startTime);
  } catch {
    return `Error: Could not parse start time "${startTime}". Please use ISO 8601 format or natural language like "tomorrow at 3pm".`;
  }

  // Parse or calculate end time
  let endDate: Date;
  if (endTime) {
    try {
      endDate = parseTimeString(endTime);
    } catch {
      // Default to 1 hour after start
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    }
  } else {
    // Default to 1 hour after start
    endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  }

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        description,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      },
    });

    const event = response.data;
    const eventStartTime = new Date(event.start?.dateTime ?? '').toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return `Event created successfully!\n\nTitle: ${event.summary}\nWhen: ${eventStartTime}\nLink: ${event.htmlLink}`;
  } catch (error) {
    logger.error({ error }, 'Failed to create calendar event');
    throw new Error('Failed to create calendar event');
  }
}

/**
 * Parse a time string (ISO 8601 or natural language)
 */
function parseTimeString(timeStr: string): Date {
  // Try ISO 8601 first
  const isoDate = new Date(timeStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Simple natural language parsing
  const now = new Date();
  const lower = timeStr.toLowerCase();

  // Handle "tomorrow"
  if (lower.includes('tomorrow')) {
    now.setDate(now.getDate() + 1);
  }

  // Handle time patterns like "at 3pm", "at 15:00"
  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3];

    if (meridiem === 'pm' && hours < 12) {
      hours += 12;
    } else if (meridiem === 'am' && hours === 12) {
      hours = 0;
    }

    now.setHours(hours, minutes, 0, 0);
    return now;
  }

  throw new Error(`Cannot parse time: ${timeStr}`);
}
