import { normalizeGoogleEvent } from '@/lib/calendar/normalize';

describe('normalizeGoogleEvent', () => {
  const source = { id: 'primary', summary: 'Primary', timeZone: 'America/New_York', primary: true };

  test('normalizes all-day events with exclusive end date', () => {
    const event = normalizeGoogleEvent(
      {
        id: 'evt-1',
        summary: 'Offsite',
        start: { date: '2026-03-10' },
        end: { date: '2026-03-12' },
      },
      source,
      'America/New_York'
    );

    expect(event).toMatchObject({
      id: 'primary:evt-1',
      title: 'Offsite',
      isAllDay: true,
      startDate: '2026-03-10',
      endDateExclusive: '2026-03-12',
      startAt: null,
      endAt: null,
    });
  });

  test('fills missing titles and timed end values safely', () => {
    const event = normalizeGoogleEvent(
      {
        id: 'evt-2',
        start: { dateTime: '2026-03-10T14:00:00-04:00' },
      },
      source,
      'America/New_York'
    );

    expect(event?.title).toBe('Busy');
    expect(event?.isAllDay).toBe(false);
    expect(event?.endAt).toBe('2026-03-10T18:30:00.000Z');
  });

  test('marks cancelled events without dropping them during normalization', () => {
    const event = normalizeGoogleEvent(
      {
        id: 'evt-3',
        status: 'cancelled',
        summary: 'Cancelled',
        start: { dateTime: '2026-03-10T09:00:00-04:00' },
        end: { dateTime: '2026-03-10T10:00:00-04:00' },
      },
      source,
      'America/New_York'
    );

    expect(event?.status).toBe('cancelled');
  });
});
