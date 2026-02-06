import type { McpServiceDefinition } from '../types/mcp.js';

export const gmailTools = [
  {
    name: 'gmail.get_unread',
    description: 'Get unread email count and brief summaries',
    inputSchema: {
      type: 'object' as const,
      properties: {
        maxResults: {
          type: 'integer',
          description: 'Maximum emails to return (1-50)',
          default: 10,
        },
      },
    },
  },
  {
    name: 'gmail.search',
    description: 'Search emails by query',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Gmail search query (e.g., "from:boss@company.com")',
        },
        maxResults: {
          type: 'integer',
          description: 'Maximum emails to return',
          default: 10,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'gmail.get_message',
    description: 'Get the full content of a specific email',
    inputSchema: {
      type: 'object' as const,
      properties: {
        messageId: {
          type: 'string',
          description: 'The Gmail message ID',
        },
      },
      required: ['messageId'],
    },
  },
];

export const calendarTools = [
  {
    name: 'calendar.get_today',
    description: "Get today's calendar events",
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'calendar.get_events',
    description: 'Get upcoming calendar events',
    inputSchema: {
      type: 'object' as const,
      properties: {
        days: {
          type: 'integer',
          description: 'Number of days to look ahead (1-30)',
          default: 7,
        },
        startDate: {
          type: 'string',
          description: 'Start date (ISO 8601), defaults to today',
        },
      },
    },
  },
  {
    name: 'calendar.create_event',
    description: 'Create a new calendar event',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Event title',
        },
        startTime: {
          type: 'string',
          description: 'Start time (ISO 8601 or natural language like "tomorrow at 3pm")',
        },
        endTime: {
          type: 'string',
          description: 'End time (defaults to 1 hour after start)',
        },
        description: {
          type: 'string',
          description: 'Event description',
        },
      },
      required: ['title', 'startTime'],
    },
  },
];

export const BUILT_IN_SERVICES: McpServiceDefinition[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Access Gmail messages',
    authType: 'oauth',
    isBuiltIn: true,
    tools: gmailTools,
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    description: 'Access and manage calendar events',
    authType: 'oauth',
    isBuiltIn: true,
    tools: calendarTools,
  },
];
