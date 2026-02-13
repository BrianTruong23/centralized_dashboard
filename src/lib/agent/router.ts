import { AgentIntent } from './types';

export function routeIntent(input: string): AgentIntent {
  const text = input.toLowerCase();
  if (text.includes('priorit')) return 'prioritize';
  if (text.includes('schedule') || text.includes('week plan') || text.includes('weekly plan')) return 'schedule';
  if (text.includes('declutter') || text.includes('stale') || text.includes('duplicate')) return 'declutter';
  if (text.includes('clear inbox') || text.includes('cleanup')) return 'cleanup';
  if (
    text.includes('delete') ||
    text.includes('archive') ||
    text.includes('edit task') ||
    text.includes('update task')
  ) {
    return 'edit_tasks';
  }
  return 'qna';
}

