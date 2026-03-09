import { decryptSecret, encryptSecret } from './security';
import { computeAvailabilitySummary } from './availability';
import { buildGoogleAuthUrl, exchangeGoogleCode, fetchGoogleCalendarList, fetchGoogleEvents, fetchGoogleProfile, GOOGLE_CALENDAR_PROVIDER, refreshGoogleAccessToken } from './providers/google';
import { filterVisibleNormalizedEvents, normalizeGoogleEvent } from './normalize';
import { deleteCalendarConnection, getCalendarConnection, summarizeCalendarConnection, updateCalendarConnection, upsertCalendarConnection } from './store';
import { CalendarConnectionRecord, CalendarConnectionSummary, CalendarFetchWindow, CalendarPlanningContext, NormalizedCalendarEvent } from './types';
import { writeDebugLog } from '@/lib/server/debugLog';

function addDays(dateKey: string, delta: number): string {
  const cursor = new Date(`${dateKey}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + delta);
  return cursor.toISOString().slice(0, 10);
}

export function getGoogleConnectUrl(origin: string, state: string): string {
  return buildGoogleAuthUrl(origin, state);
}

function tokenExpiryFromNow(expiresInSeconds?: number): string | null {
  if (!expiresInSeconds || !Number.isFinite(expiresInSeconds)) return null;
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

function shouldRefresh(connection: CalendarConnectionRecord): boolean {
  if (!connection.access_token_expires_at) return false;
  return Date.parse(connection.access_token_expires_at) - Date.now() < 60_000;
}

async function getUsableGoogleAccessToken(
  userAccessToken: string,
  connection: CalendarConnectionRecord
): Promise<{ accessToken: string; refreshToken: string | null }> {
  let googleAccessToken = decryptSecret(connection.access_token_encrypted);
  const refreshToken = connection.refresh_token_encrypted ? decryptSecret(connection.refresh_token_encrypted) : null;

  if (shouldRefresh(connection) && refreshToken) {
    const refreshed = await refreshGoogleAccessToken(refreshToken);
    googleAccessToken = refreshed.access_token;
    await updateCalendarConnection(userAccessToken, connection.user_id, GOOGLE_CALENDAR_PROVIDER, {
      access_token_encrypted: encryptSecret(googleAccessToken),
      refresh_token_encrypted: refreshed.refresh_token ? encryptSecret(refreshed.refresh_token) : connection.refresh_token_encrypted,
      token_type: refreshed.token_type || connection.token_type,
      scope: refreshed.scope || connection.scope,
      access_token_expires_at: tokenExpiryFromNow(refreshed.expires_in),
      status: 'connected',
      last_error_code: null,
      last_error_message: null,
    });
  }

  return { accessToken: googleAccessToken, refreshToken };
}

export async function saveGoogleConnectionFromOAuth(params: {
  accessToken: string;
  userId: string;
  origin: string;
  code: string;
}): Promise<void> {
  await writeDebugLog('calendar-finalize.log', 'calendar.saveGoogleConnectionFromOAuth.start', {
    userId: params.userId,
    origin: params.origin,
    hasAccessToken: Boolean(params.accessToken),
    codePreview: params.code ? `${params.code.slice(0, 12)}...` : null,
  });

  const token = await exchangeGoogleCode(params.origin, params.code);
  await writeDebugLog('calendar-finalize.log', 'calendar.exchangeGoogleCode.success', {
    hasRefreshToken: Boolean(token.refresh_token),
    scope: token.scope ?? null,
    tokenType: token.token_type ?? null,
  });
  const profile = await fetchGoogleProfile(token.access_token);
  await writeDebugLog('calendar-finalize.log', 'calendar.fetchGoogleProfile.success', {
    profileId: profile.id ?? null,
    email: profile.email ?? null,
  });
  const calendars = await fetchGoogleCalendarList(token.access_token);
  const primary = calendars.find((calendar) => calendar.primary) || calendars[0];
  await writeDebugLog('calendar-finalize.log', 'calendar.fetchGoogleCalendarList.success', {
    calendarCount: calendars.length,
    primaryCalendarId: primary?.id ?? null,
    primaryCalendarTimezone: primary?.timeZone ?? null,
  });

  await upsertCalendarConnection(params.accessToken, {
    user_id: params.userId,
    provider: GOOGLE_CALENDAR_PROVIDER,
    status: 'connected',
    scope: token.scope || '',
    access_token_encrypted: encryptSecret(token.access_token),
    refresh_token_encrypted: token.refresh_token ? encryptSecret(token.refresh_token) : null,
    token_type: token.token_type || null,
    access_token_expires_at: tokenExpiryFromNow(token.expires_in),
    provider_account_email: profile.email || null,
    provider_account_id: profile.id || null,
    calendar_timezone: primary?.timeZone || null,
    last_synced_at: new Date().toISOString(),
    last_error_code: null,
    last_error_message: null,
  });

  await writeDebugLog('calendar-finalize.log', 'calendar.saveGoogleConnectionFromOAuth.success', {
    userId: params.userId,
    provider: GOOGLE_CALENDAR_PROVIDER,
    accountEmail: profile.email ?? null,
  });
}

export async function getCalendarStatus(accessToken: string, userId: string): Promise<CalendarConnectionSummary> {
  const connection = await getCalendarConnection(accessToken, userId, GOOGLE_CALENDAR_PROVIDER);
  return summarizeCalendarConnection(connection);
}

export async function disconnectGoogleCalendar(accessToken: string, userId: string): Promise<{ revoked: boolean }> {
  const connection = await getCalendarConnection(accessToken, userId, GOOGLE_CALENDAR_PROVIDER);
  if (!connection) return { revoked: false };

  const refreshToken = connection.refresh_token_encrypted ? decryptSecret(connection.refresh_token_encrypted) : null;
  const googleAccessToken = decryptSecret(connection.access_token_encrypted);

  let revoked = false;
  try {
    const { revokeGoogleToken } = await import('./providers/google');
    await revokeGoogleToken(refreshToken || googleAccessToken);
    revoked = true;
  } catch {
    revoked = false;
  }

  await deleteCalendarConnection(accessToken, userId, GOOGLE_CALENDAR_PROVIDER);
  return { revoked };
}

export async function fetchReadOnlyCalendarData(
  accessToken: string,
  userId: string,
  window: CalendarFetchWindow
): Promise<{ connection: CalendarConnectionSummary; events: NormalizedCalendarEvent[]; availabilityWarning?: string }> {
  const connection = await getCalendarConnection(accessToken, userId, GOOGLE_CALENDAR_PROVIDER);
  if (!connection) {
    return {
      connection: summarizeCalendarConnection(null),
      events: [],
    };
  }

  try {
    const { accessToken: googleAccessToken } = await getUsableGoogleAccessToken(accessToken, connection);
    const calendars = await fetchGoogleCalendarList(googleAccessToken);
    const eventGroups = await Promise.all(
      calendars.map(async (calendar) => {
        const raw = await fetchGoogleEvents(googleAccessToken, calendar.id, window);
        return raw
          .map((item) => normalizeGoogleEvent(item, calendar, window.timeZone))
          .filter((item): item is NormalizedCalendarEvent => Boolean(item));
      })
    );

    const events = filterVisibleNormalizedEvents(eventGroups.flat());
    await updateCalendarConnection(accessToken, userId, GOOGLE_CALENDAR_PROVIDER, {
      status: 'connected',
      last_synced_at: new Date().toISOString(),
      calendar_timezone: calendars.find((calendar) => calendar.primary)?.timeZone || connection.calendar_timezone,
      last_error_code: null,
      last_error_message: null,
    });

    return {
      connection: summarizeCalendarConnection({
        ...connection,
        status: 'connected',
        last_synced_at: new Date().toISOString(),
      }),
      events,
    };
  } catch {
    await updateCalendarConnection(accessToken, userId, GOOGLE_CALENDAR_PROVIDER, {
      status: 'error',
      last_error_code: 'calendar_fetch_failed',
      last_error_message: 'Calendar access needs attention. Reconnect to resume availability-aware planning.',
    });

    return {
      connection: summarizeCalendarConnection({
        ...connection,
        status: 'error',
        last_error_message: 'Calendar access needs attention. Reconnect to resume availability-aware planning.',
      }),
      events: [],
      availabilityWarning: 'Calendar access failed. Planning fell back to task-only mode.',
    };
  }
}

function formatBlock(minute: number): string {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export async function buildPlanningCalendarContext(params: {
  accessToken: string;
  userId: string;
  timeZone: string;
  from: string;
  to?: string;
}): Promise<CalendarPlanningContext> {
  const to = params.to || addDays(params.from, 6);
  const { connection, events, availabilityWarning } = await fetchReadOnlyCalendarData(params.accessToken, params.userId, {
    from: params.from,
    to,
    timeZone: params.timeZone,
  });

  if (connection.status !== 'connected') {
    return {
      connected: false,
      summary: 'No live calendar availability was used. Plan from tasks and stated constraints only.',
      availability: null,
      warning: availabilityWarning,
    };
  }

  const availability = computeAvailabilitySummary(events, {
    from: params.from,
    to,
    timeZone: params.timeZone,
  });

  const dayLines = availability.days.slice(0, 7).map((day) => {
    if (day.isAllDayBusy) return `${day.date}: unavailable all day`;
    if (day.freeBlocks.length === 0) return `${day.date}: no free work blocks`;
    const freeText = day.freeBlocks
      .slice(0, 3)
      .map((block) => `${formatBlock(block.startMinute)}-${formatBlock(block.endMinute)}`)
      .join(', ');
    return `${day.date}: free ${freeText}`;
  });

  return {
    connected: true,
    summary: `Calendar is connected in read-only mode. Use these windows only as scheduling hints and never assume task changes are approved.\n${dayLines.join('\n')}`,
    availability,
    warning: availabilityWarning,
  };
}
