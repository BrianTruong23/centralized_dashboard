export type CalendarProvider = 'google';
export type CalendarConnectionStatus = 'connected' | 'error' | 'disconnected';

export interface CalendarConnectionRecord {
  id: string;
  user_id: string;
  provider: CalendarProvider;
  status: Exclude<CalendarConnectionStatus, 'disconnected'>;
  scope: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_type: string | null;
  access_token_expires_at: string | null;
  provider_account_email: string | null;
  provider_account_id: string | null;
  calendar_timezone: string | null;
  last_synced_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarConnectionSummary {
  provider: CalendarProvider;
  status: CalendarConnectionStatus;
  readOnly: true;
  writeEnabled: false;
  connectedAt?: string | null;
  accountEmail?: string | null;
  calendarTimezone?: string | null;
  scope?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}

export interface CalendarFetchWindow {
  from: string;
  to: string;
  timeZone: string;
}

export interface CalendarSource {
  id: string;
  summary: string;
  timeZone?: string | null;
  primary?: boolean;
}

export interface NormalizedCalendarEvent {
  id: string;
  provider: CalendarProvider;
  source: CalendarSource;
  title: string;
  description?: string | null;
  location?: string | null;
  status: 'confirmed' | 'tentative' | 'cancelled';
  isAllDay: boolean;
  isRecurring: boolean;
  startAt: string | null;
  endAt: string | null;
  startDate: string | null;
  endDateExclusive: string | null;
  timeZone: string;
  sourceUrl?: string | null;
}

export interface AvailabilityBlock {
  startMinute: number;
  endMinute: number;
}

export interface AvailabilityDay {
  date: string;
  isAllDayBusy: boolean;
  busyMinutes: number;
  freeMinutes: number;
  busyBlocks: AvailabilityBlock[];
  freeBlocks: AvailabilityBlock[];
  status: 'free' | 'limited' | 'busy';
}

export interface AvailabilitySummary {
  timeZone: string;
  workHours: { start: string; end: string };
  days: AvailabilityDay[];
}

export interface CalendarPlanningContext {
  connected: boolean;
  summary: string;
  availability: AvailabilitySummary | null;
  warning?: string;
}
