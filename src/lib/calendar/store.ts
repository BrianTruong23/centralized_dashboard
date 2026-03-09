import { getSupabaseServerClient } from '@/lib/server/supabaseAdmin';
import { CalendarConnectionRecord, CalendarConnectionSummary, CalendarProvider } from './types';
import { writeDebugLog } from '@/lib/server/debugLog';

type UpsertConnectionInput = {
  user_id: string;
  provider: CalendarProvider;
  status: 'connected' | 'error';
  scope: string;
  access_token_encrypted: string;
  refresh_token_encrypted?: string | null;
  token_type?: string | null;
  access_token_expires_at?: string | null;
  provider_account_email?: string | null;
  provider_account_id?: string | null;
  calendar_timezone?: string | null;
  last_synced_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
};

function sanitizeErrorMessage(message?: string | null): string | null {
  if (!message) return null;
  return message.slice(0, 240);
}

export async function getCalendarConnection(
  accessToken: string,
  userId: string,
  provider: CalendarProvider
): Promise<CalendarConnectionRecord | null> {
  const supabase = getSupabaseServerClient(accessToken);
  const { data, error } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (error) throw new Error(`Failed to load calendar connection: ${error.message}`);
  return (data as CalendarConnectionRecord | null) ?? null;
}

export async function upsertCalendarConnection(accessToken: string, input: UpsertConnectionInput): Promise<void> {
  const supabase = getSupabaseServerClient(accessToken);
  const { error } = await supabase.from('calendar_connections').upsert(
    {
      ...input,
      last_error_message: sanitizeErrorMessage(input.last_error_message),
    },
    { onConflict: 'user_id,provider' }
  );

  if (error) {
    await writeDebugLog('calendar-finalize.log', 'calendar.upsertCalendarConnection.error', {
      userId: input.user_id,
      provider: input.provider,
      error: error.message,
    });
    throw new Error(`Failed to save calendar connection: ${error.message}`);
  }

  await writeDebugLog('calendar-finalize.log', 'calendar.upsertCalendarConnection.success', {
    userId: input.user_id,
    provider: input.provider,
    status: input.status,
  });
}

export async function updateCalendarConnection(
  accessToken: string,
  userId: string,
  provider: CalendarProvider,
  patch: Partial<UpsertConnectionInput>
): Promise<void> {
  const supabase = getSupabaseServerClient(accessToken);
  const { error } = await supabase
    .from('calendar_connections')
    .update({
      ...patch,
      last_error_message: sanitizeErrorMessage(patch.last_error_message),
    })
    .eq('user_id', userId)
    .eq('provider', provider);

  if (error) throw new Error(`Failed to update calendar connection: ${error.message}`);
}

export async function deleteCalendarConnection(accessToken: string, userId: string, provider: CalendarProvider): Promise<void> {
  const supabase = getSupabaseServerClient(accessToken);
  const { error } = await supabase.from('calendar_connections').delete().eq('user_id', userId).eq('provider', provider);
  if (error) throw new Error(`Failed to delete calendar connection: ${error.message}`);
}

export function summarizeCalendarConnection(
  connection: CalendarConnectionRecord | null
): CalendarConnectionSummary {
  if (!connection) {
    return {
      provider: 'google',
      status: 'disconnected',
      readOnly: true,
      writeEnabled: false,
    };
  }

  return {
    provider: connection.provider,
    status: connection.status,
    readOnly: true,
    writeEnabled: false,
    connectedAt: connection.created_at,
    accountEmail: connection.provider_account_email,
    calendarTimezone: connection.calendar_timezone,
    scope: connection.scope,
    lastSyncedAt: connection.last_synced_at,
    lastError: connection.last_error_message,
  };
}
