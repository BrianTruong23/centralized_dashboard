import { computeAvailabilitySummary } from '@/lib/calendar/availability';
import { NormalizedCalendarEvent } from '@/lib/calendar/types';

describe('computeAvailabilitySummary', () => {
  test('computes free blocks around timed events', () => {
    const events: NormalizedCalendarEvent[] = [
      {
        id: 'evt-1',
        provider: 'google',
        source: { id: 'primary', summary: 'Primary' },
        title: 'Meeting',
        status: 'confirmed',
        isAllDay: false,
        isRecurring: false,
        startAt: '2026-03-10T14:00:00Z',
        endAt: '2026-03-10T15:30:00Z',
        startDate: null,
        endDateExclusive: null,
        timeZone: 'UTC',
      },
    ];

    const summary = computeAvailabilitySummary(events, {
      from: '2026-03-10',
      to: '2026-03-10',
      timeZone: 'UTC',
    });

    expect(summary.days[0].busyMinutes).toBe(90);
    expect(summary.days[0].freeBlocks).toEqual([
      { startMinute: 480, endMinute: 840 },
      { startMinute: 930, endMinute: 1080 },
    ]);
  });

  test('treats all-day events as fully busy', () => {
    const events: NormalizedCalendarEvent[] = [
      {
        id: 'evt-2',
        provider: 'google',
        source: { id: 'primary', summary: 'Primary' },
        title: 'Vacation',
        status: 'confirmed',
        isAllDay: true,
        isRecurring: false,
        startAt: null,
        endAt: null,
        startDate: '2026-03-11',
        endDateExclusive: '2026-03-12',
        timeZone: 'UTC',
      },
    ];

    const summary = computeAvailabilitySummary(events, {
      from: '2026-03-11',
      to: '2026-03-11',
      timeZone: 'UTC',
    });

    expect(summary.days[0].isAllDayBusy).toBe(true);
    expect(summary.days[0].freeMinutes).toBe(0);
  });

  test('ignores cancelled events in availability totals', () => {
    const events: NormalizedCalendarEvent[] = [
      {
        id: 'evt-3',
        provider: 'google',
        source: { id: 'primary', summary: 'Primary' },
        title: 'Cancelled',
        status: 'cancelled',
        isAllDay: false,
        isRecurring: false,
        startAt: '2026-03-10T14:00:00Z',
        endAt: '2026-03-10T15:00:00Z',
        startDate: null,
        endDateExclusive: null,
        timeZone: 'UTC',
      },
    ];

    const summary = computeAvailabilitySummary(events, {
      from: '2026-03-10',
      to: '2026-03-10',
      timeZone: 'UTC',
    });

    expect(summary.days[0].busyMinutes).toBe(0);
  });
});
