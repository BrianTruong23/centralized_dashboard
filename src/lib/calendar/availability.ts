import { AvailabilityBlock, AvailabilityDay, AvailabilitySummary, NormalizedCalendarEvent } from './types';

function dateRange(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function addDays(dateKey: string, delta: number): string {
  const cursor = new Date(`${dateKey}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + delta);
  return cursor.toISOString().slice(0, 10);
}

function compareDateKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

function getDateParts(value: string, timeZone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value));

  const part = (type: string) => parts.find((item) => item.type === type)?.value || '00';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

function mergeBlocks(blocks: AvailabilityBlock[]): AvailabilityBlock[] {
  if (blocks.length === 0) return [];
  const sorted = [...blocks].sort((a, b) => a.startMinute - b.startMinute);
  const merged: AvailabilityBlock[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const previous = merged[merged.length - 1];
    if (current.startMinute <= previous.endMinute) {
      previous.endMinute = Math.max(previous.endMinute, current.endMinute);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

function invertBlocks(blocks: AvailabilityBlock[], workStart: number, workEnd: number): AvailabilityBlock[] {
  const free: AvailabilityBlock[] = [];
  let cursor = workStart;

  blocks.forEach((block) => {
    if (block.startMinute > cursor) {
      free.push({ startMinute: cursor, endMinute: block.startMinute });
    }
    cursor = Math.max(cursor, block.endMinute);
  });

  if (cursor < workEnd) {
    free.push({ startMinute: cursor, endMinute: workEnd });
  }

  return free;
}

export function computeAvailabilitySummary(
  events: NormalizedCalendarEvent[],
  window: { from: string; to: string; timeZone: string },
  workHours = { start: '08:00', end: '18:00' }
): AvailabilitySummary {
  const [workStartHour, workStartMinute] = workHours.start.split(':').map(Number);
  const [workEndHour, workEndMinute] = workHours.end.split(':').map(Number);
  const workStart = workStartHour * 60 + workStartMinute;
  const workEnd = workEndHour * 60 + workEndMinute;
  const days = dateRange(window.from, window.to);

  const blocksByDay = new Map<string, AvailabilityBlock[]>();
  const allDayBusy = new Set<string>();

  for (const event of events) {
    if (event.status === 'cancelled') continue;

    if (event.isAllDay && event.startDate && event.endDateExclusive) {
      let day = event.startDate;
      while (compareDateKeys(day, event.endDateExclusive) < 0) {
        if (compareDateKeys(day, window.from) >= 0 && compareDateKeys(day, window.to) <= 0) {
          allDayBusy.add(day);
        }
        day = addDays(day, 1);
      }
      continue;
    }

    if (!event.startAt || !event.endAt) continue;

    const start = getDateParts(event.startAt, window.timeZone);
    const end = getDateParts(event.endAt, window.timeZone);
    let cursor = start.date;

    while (compareDateKeys(cursor, end.date) <= 0) {
      if (compareDateKeys(cursor, window.from) >= 0 && compareDateKeys(cursor, window.to) <= 0) {
        const dayStart = cursor === start.date ? start.minutes : 0;
        const dayEnd = cursor === end.date ? end.minutes : 24 * 60;
        const clippedStart = Math.max(dayStart, workStart);
        const clippedEnd = Math.min(dayEnd, workEnd);
        if (clippedEnd > clippedStart) {
          const existing = blocksByDay.get(cursor) || [];
          existing.push({ startMinute: clippedStart, endMinute: clippedEnd });
          blocksByDay.set(cursor, existing);
        }
      }
      cursor = addDays(cursor, 1);
    }
  }

  const summaries: AvailabilityDay[] = days.map((date) => {
    if (allDayBusy.has(date)) {
      return {
        date,
        isAllDayBusy: true,
        busyMinutes: workEnd - workStart,
        freeMinutes: 0,
        busyBlocks: [{ startMinute: workStart, endMinute: workEnd }],
        freeBlocks: [],
        status: 'busy',
      };
    }

    const merged = mergeBlocks(blocksByDay.get(date) || []);
    const busyMinutes = merged.reduce((total, block) => total + (block.endMinute - block.startMinute), 0);
    const freeMinutes = Math.max(0, (workEnd - workStart) - busyMinutes);
    const freeBlocks = invertBlocks(merged, workStart, workEnd);

    return {
      date,
      isAllDayBusy: false,
      busyMinutes,
      freeMinutes,
      busyBlocks: merged,
      freeBlocks,
      status: busyMinutes >= (workEnd - workStart) * 0.8 ? 'busy' : busyMinutes >= (workEnd - workStart) * 0.4 ? 'limited' : 'free',
    };
  });

  return {
    timeZone: window.timeZone,
    workHours,
    days: summaries,
  };
}
