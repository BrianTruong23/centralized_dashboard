import { formatDateKey } from '@/lib/dateKey';

export const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const SHORT_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const dayRegex = new RegExp(`\\b(${DAYS.join('|')}|${SHORT_DAYS.join('|')})\\b`, 'gi');

export interface DateMatch {
  match: string;
  date: string; // ISO YYYY-MM-DD
  index: number;
}

export function parseDateFromText(text: string): DateMatch | null {
  // Reset regex lastIndex
  dayRegex.lastIndex = 0;
  
  const match = dayRegex.exec(text);
  if (!match) return null;

  const dayStr = match[0].toLowerCase();
  
  // Find index of day (0-6)
  let dayIndex = DAYS.indexOf(dayStr);
  if (dayIndex === -1) {
    dayIndex = SHORT_DAYS.indexOf(dayStr);
  }

  if (dayIndex === -1) return null;

  const today = new Date();
  const currentDay = today.getDay();

  // Calculate days until next occurrence
  // standard: next occurrence. If today is Wed (3) and user types Wed, assume NEXT week (7 days)? 
  // Or today? Usually means upcoming. Todoist treats "today" as today.
  // Let's assume upcoming.
  let daysUntil = dayIndex - currentDay;
  
  if (daysUntil <= 0) {
    daysUntil += 7;
  }

  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntil);

  return {
    match: match[0],
    date: formatDateKey(targetDate),
    index: match.index
  };
}

export const tagRegex = /#(\w+)/gi;

export function parseTagFromText(text: string): string | null {
  tagRegex.lastIndex = 0;
  const match = tagRegex.exec(text);
  if (match) {
    return match[1]; // Return the captured word (without #)
  }
  return null;
}
