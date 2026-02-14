import { Task } from '@/types/task';

/**
 * Accountability and gentle nudge system for tasks
 */

export const POSTPONE_THRESHOLD = 3; // Show prompt after 3 postpones

/**
 * Check if a task should trigger the postpone prompt
 */
export function shouldShowPostponePrompt(task: Task): boolean {
  return (task.postponeCount || 0) >= POSTPONE_THRESHOLD && task.status !== 'done';
}

/**
 * Increment postpone count for a task
 */
export function incrementPostponeCount(task: Task): Task {
  return {
    ...task,
    postponeCount: (task.postponeCount || 0) + 1,
    lastPostponedAt: new Date().toISOString(),
  };
}

/**
 * Reset postpone count (e.g., when task is rescheduled or started)
 */
export function resetPostponeCount(task: Task): Task {
  return {
    ...task,
    postponeCount: 0,
    lastPostponedAt: undefined,
  };
}

/**
 * Check if weekly recap should be shown
 */
export function shouldShowWeeklyRecap(): boolean {
  const today = new Date();
  const dayOfWeek = today.getDay();

  // Show on Sundays (day 0) or user-configured day
  const lastShown = localStorage.getItem('weeklyRecap_lastShown');
  const weekKey = getWeekKey(today);

  return dayOfWeek === 0 && lastShown !== weekKey;
}

/**
 * Mark weekly recap as shown
 */
export function markWeeklyRecapShown(): void {
  const weekKey = getWeekKey(new Date());
  localStorage.setItem('weeklyRecap_lastShown', weekKey);
}

/**
 * Get a unique key for the current week
 */
function getWeekKey(date: Date): string {
  const year = date.getFullYear();
  const week = getWeekNumber(date);
  return `${year}-W${week}`;
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Get tasks that need attention (repeatedly postponed)
 */
export function getTasksNeedingAttention(tasks: Task[]): Task[] {
  return tasks
    .filter(task => shouldShowPostponePrompt(task))
    .sort((a, b) => (b.postponeCount || 0) - (a.postponeCount || 0));
}

/**
 * Suggest an intent label for a task based on its properties
 */
export function suggestIntentLabel(task: Task): string {
  const title = task.title.toLowerCase();
  const desc = (task.description || '').toLowerCase();

  // Check for keywords
  if (title.includes('email') || title.includes('message') || title.includes('call') ||
      desc.includes('email') || desc.includes('message') || desc.includes('send')) {
    return 'Message';
  }

  if (title.includes('errand') || title.includes('pick up') || title.includes('buy') ||
      title.includes('shopping') || desc.includes('outside')) {
    return 'Errand';
  }

  if (title.includes('waiting') || title.includes('blocked') || desc.includes('waiting for')) {
    return 'Waiting';
  }

  // Based on estimated time
  if (task.estimatedMinutes <= 15) {
    return 'Quick';
  }

  if (task.estimatedMinutes >= 60) {
    return 'Deep';
  }

  // Default based on priority
  if (task.priority <= 2) {
    return 'Deep';
  }

  return 'Quick';
}
