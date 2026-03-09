import { GoogleCalendarEvent } from './providers/google';
import { CalendarSource, NormalizedCalendarEvent } from './types';

function addDays(dateKey: string, delta: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function isIsoLike(value?: string | null): boolean {
  return !!value && !Number.isNaN(Date.parse(value));
}

function fallbackTimedEnd(startAt: string): string {
  return new Date(Date.parse(startAt) + 30 * 60 * 1000).toISOString();
}

export function normalizeGoogleEvent(
  event: GoogleCalendarEvent,
  source: CalendarSource,
  defaultTimeZone: string
): NormalizedCalendarEvent | null {
  if (!event?.id) return null;

  const isAllDay = !!event.start?.date;
  const startDate = isAllDay ? event.start?.date || null : null;
  const endDateExclusive = isAllDay
    ? event.end?.date || (startDate ? addDays(startDate, 1) : null)
    : null;

  const startAt = !isAllDay && isIsoLike(event.start?.dateTime) ? event.start?.dateTime || null : null;
  const endAt = !isAllDay
    ? isIsoLike(event.end?.dateTime)
      ? event.end?.dateTime || null
      : startAt
        ? fallbackTimedEnd(startAt)
        : null
    : null;

  if (!isAllDay && !startAt) return null;
  if (isAllDay && !startDate) return null;

  return {
    id: `${source.id}:${event.id}`,
    provider: 'google',
    source,
    title: (event.summary || '').trim() || 'Busy',
    description: event.description || null,
    location: event.location || null,
    status: event.status === 'cancelled' ? 'cancelled' : event.status === 'tentative' ? 'tentative' : 'confirmed',
    isAllDay,
    isRecurring: !!event.recurringEventId,
    startAt,
    endAt,
    startDate,
    endDateExclusive,
    timeZone: event.start?.timeZone || event.end?.timeZone || source.timeZone || defaultTimeZone,
    sourceUrl: event.htmlLink || null,
  };
}

export function filterVisibleNormalizedEvents(events: NormalizedCalendarEvent[]): NormalizedCalendarEvent[] {
  return events
    .filter((event) => event.status !== 'cancelled')
    .sort((a, b) => {
      const aKey = a.isAllDay ? `${a.startDate}T00:00:00` : a.startAt || '';
      const bKey = b.isAllDay ? `${b.startDate}T00:00:00` : b.startAt || '';
      return aKey.localeCompare(bKey);
    });
}
