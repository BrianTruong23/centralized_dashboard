import { CalendarFetchWindow, CalendarSource } from '../types';

export const GOOGLE_CALENDAR_PROVIDER = 'google';
export const GOOGLE_CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export interface GoogleCalendarListItem {
  id: string;
  summary?: string;
  timeZone?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  recurringEventId?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
}

function requireGoogleEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function googleRedirectUri(origin: string): string {
  return `${origin}/api/calendar/google/callback`;
}

export function buildGoogleAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: requireGoogleEnv('GOOGLE_CALENDAR_CLIENT_ID'),
    redirect_uri: googleRedirectUri(origin),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: GOOGLE_CALENDAR_READONLY_SCOPE,
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = typeof body?.error_description === 'string'
      ? body.error_description
      : typeof body?.error === 'string'
        ? body.error
        : `Google API request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export async function exchangeGoogleCode(origin: string, code: string): Promise<GoogleTokenResponse> {
  const params = new URLSearchParams({
    code,
    client_id: requireGoogleEnv('GOOGLE_CALENDAR_CLIENT_ID'),
    client_secret: requireGoogleEnv('GOOGLE_CALENDAR_CLIENT_SECRET'),
    redirect_uri: googleRedirectUri(origin),
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  return readJson<GoogleTokenResponse>(res);
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: requireGoogleEnv('GOOGLE_CALENDAR_CLIENT_ID'),
    client_secret: requireGoogleEnv('GOOGLE_CALENDAR_CLIENT_SECRET'),
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  return readJson<GoogleTokenResponse>(res);
}

export async function revokeGoogleToken(token: string): Promise<void> {
  const params = new URLSearchParams({ token });
  await fetch(`https://oauth2.googleapis.com/revoke?${params.toString()}`, { method: 'POST' });
}

export async function fetchGoogleProfile(accessToken: string): Promise<{ id?: string; email?: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  return readJson<{ id?: string; email?: string }>(res);
}

export async function fetchGoogleCalendarList(accessToken: string): Promise<CalendarSource[]> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const body = await readJson<{ items?: GoogleCalendarListItem[] }>(res);

  return (body.items || [])
    .filter((item) => item.selected !== false && item.accessRole && ['owner', 'writer', 'reader', 'freeBusyReader'].includes(item.accessRole))
    .map((item) => ({
      id: item.id,
      summary: item.summary || 'Calendar',
      timeZone: item.timeZone || null,
      primary: !!item.primary,
    }));
}

export async function fetchGoogleEvents(
  accessToken: string,
  calendarId: string,
  window: CalendarFetchWindow
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: `${window.from}T00:00:00`,
    timeMax: `${window.to}T23:59:59`,
    singleEvents: 'true',
    showDeleted: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
    timeZone: window.timeZone,
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    }
  );
  const body = await readJson<{ items?: GoogleCalendarEvent[] }>(res);
  return body.items || [];
}
