export interface SessionData {
  userId: string;
  email: string;
  name: string;
}

export const sessions = new Map<string, SessionData>();
