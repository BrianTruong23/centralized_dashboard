import { parseTemporal } from '@/lib/temporalParser';

describe('temporalParser', () => {
  const now = new Date('2026-03-09T10:00:00');

  test('keeps simple date-only phrases as due dates', () => {
    const parsed = parseTemporal('finish report tomorrow', undefined, undefined, now);

    expect(parsed.interpretation_type).toBe('due');
    expect(parsed.due_date).toBe('2026-03-10');
    expect(parsed.due_time).toBeUndefined();
  });

  test('treats explicit deadline phrasing as due date + time', () => {
    const parsed = parseTemporal('finish report by tomorrow 5pm', undefined, undefined, now);

    expect(parsed.interpretation_type).toBe('due');
    expect(parsed.due_date).toBe('2026-03-10');
    expect(parsed.due_time).toBe('17:00:00');
  });

  test('removes deadline cue punctuation cleanly from task text', () => {
    const parsed = parseTemporal('by friday 5pm, i need to finish work', undefined, undefined, now);

    expect(parsed.cleanedText).toBe('i need to finish work');
    expect(parsed.detectedPhrases?.[0]?.phrase.toLowerCase()).toBe('by friday 5pm');
  });

  test('includes leading schedule cue in highlighted span', () => {
    const parsed = parseTemporal('finish report at 5 pm by monday', undefined, undefined, now);

    expect(parsed.detectedPhrases?.[0]?.phrase.toLowerCase()).toBe('at 5 pm by monday');
  });

  test('includes leading at cue when date comes before time', () => {
    const parsed = parseTemporal('at monday by 5pm, do data science homework', undefined, undefined, now);

    expect(parsed.detectedPhrases?.[0]?.phrase.toLowerCase()).toBe('at monday by 5pm');
  });

  test('treats explicit planned-work phrasing as scheduled time', () => {
    const parsed = parseTemporal('work on report tomorrow at 5pm', undefined, undefined, now);

    expect(parsed.interpretation_type).toBe('scheduled');
    expect(parsed.scheduled_date).toBe('2026-03-10');
    expect(parsed.scheduled_time).toBe('17:00:00');
    expect(parsed.start_time).toBe('17:00:00');
  });

  test('returns ambiguity when date + exact time lacks intent cues', () => {
    const parsed = parseTemporal('finish report tomorrow 5pm', undefined, undefined, now);

    expect(parsed.interpretation_type).toBe('ambiguous');
    expect(parsed.confidence).toBe('ambiguous');
    expect(parsed.alternatives).toHaveLength(2);
    expect(parsed.alternatives?.map((alt) => alt.interpretation_type)).toEqual(['due', 'scheduled']);
  });

  test('parses time ranges into scheduled start/end', () => {
    const parsed = parseTemporal('meeting prep tomorrow 2-4pm', undefined, undefined, now);

    expect(parsed.interpretation_type).toBe('scheduled');
    expect(parsed.scheduled_date).toBe('2026-03-10');
    expect(parsed.start_time).toBe('14:00:00');
    expect(parsed.end_time).toBe('16:00:00');
    expect(parsed.duration_minutes).toBe(120);
  });

  test('parses duration and derives end time', () => {
    const parsed = parseTemporal('write for 30 min at 3pm', undefined, undefined, now);

    expect(parsed.interpretation_type).toBe('scheduled');
    expect(parsed.scheduled_date).toBe('2026-03-09');
    expect(parsed.start_time).toBe('15:00:00');
    expect(parsed.end_time).toBe('15:30:00');
    expect(parsed.duration_minutes).toBe(30);
  });

  test('supports part-of-day phrasing for scheduled work', () => {
    const parsed = parseTemporal('study next monday afternoon', undefined, undefined, now);

    expect(parsed.interpretation_type).toBe('scheduled');
    expect(parsed.scheduled_date).toBe('2026-03-16');
    expect(parsed.start_time).toBe('14:00:00');
  });

  test('supports before-time deadline phrasing without explicit date', () => {
    const parsed = parseTemporal('finish before 6pm', undefined, undefined, now);

    expect(parsed.interpretation_type).toBe('due');
    expect(parsed.due_date).toBe('2026-03-09');
    expect(parsed.due_time).toBe('18:00:00');
  });
});
