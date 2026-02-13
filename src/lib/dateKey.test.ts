import { formatDateKey, formatUtcDateKey, parseDateKey } from '@/lib/dateKey';

describe('dateKey utilities', () => {
  test('shows why UTC date keys can shift to previous day in positive-offset timezones', () => {
    const date = new Date('2026-02-13T00:30:00+07:00');

    expect(formatUtcDateKey(date)).toBe('2026-02-12');
    expect(formatDateKey(date, 'Asia/Ho_Chi_Minh')).toBe('2026-02-13');
  });

  test('returns YYYY-MM-DD format', () => {
    const date = new Date('2026-02-13T10:00:00Z');
    expect(formatDateKey(date, 'UTC')).toBe('2026-02-13');
  });

  test('parses full ISO datetime strings by normalizing to date key', () => {
    const parsed = parseDateKey('2026-02-21T00:00:00+00:00');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(1); // Feb = 1
    expect(parsed.getDate()).toBe(21);
  });
});
