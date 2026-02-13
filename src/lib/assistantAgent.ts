import { Task } from '@/types/task';

export type AgentIntent = 'plan' | 'prioritize_inbox' | 'clear_inbox' | 'delete_task';

const STOP_WORDS = new Set([
  'delete', 'remove', 'task', 'tasks', 'please', 'the', 'a', 'an', 'from', 'inbox', 'my', 'me'
]);

export function detectAgentIntent(input: string): AgentIntent {
  const t = input.toLowerCase();

  if ((t.includes('clear') || t.includes('empty')) && t.includes('inbox')) return 'clear_inbox';
  if ((t.includes('top') || t.includes('priority') || t.includes('priorities')) && t.includes('inbox')) return 'prioritize_inbox';
  if (t.includes('delete') || t.includes('remove')) return 'delete_task';
  return 'plan';
}

function isInboxTask(task: Task): boolean {
  return !task.project_id && task.status !== 'done';
}

function urgencyScore(task: Task, now: Date): number {
  if (!task.deadline) return 0;
  const due = new Date(task.deadline);
  const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (diffHours < 0) return 200;
  if (diffHours <= 24) return 100;
  if (diffHours <= 72) return 60;
  return 20;
}

export function rankInboxTasks(tasks: Task[], now: Date = new Date()): Task[] {
  return tasks
    .filter(isInboxTask)
    .slice()
    .sort((a, b) => {
      const scoreA = (6 - a.priority) * 25 + urgencyScore(a, now);
      const scoreB = (6 - b.priority) * 25 + urgencyScore(b, now);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.createdAt - b.createdAt;
    });
}

export function getInboxTasks(tasks: Task[]): Task[] {
  return tasks.filter(isInboxTask);
}

export function findTaskCandidatesForDelete(tasks: Task[], input: string): Task[] {
  const words = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOP_WORDS.has(w));

  if (words.length === 0) return [];

  return tasks
    .filter(isInboxTask)
    .filter((task) => {
      const title = task.title.toLowerCase();
      return words.every((w) => title.includes(w));
    })
    .slice(0, 8);
}
