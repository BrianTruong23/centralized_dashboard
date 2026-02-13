import { detectAgentIntent, rankInboxTasks, findTaskCandidatesForDelete } from './assistantAgent';
import { Task } from '@/types/task';

function makeTask(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    id: partial.id,
    title: partial.title,
    description: partial.description || '',
    status: partial.status || 'todo',
    category: partial.category || 'Inbox',
    priority: partial.priority || 3,
    estimatedMinutes: partial.estimatedMinutes || 30,
    energyLevel: partial.energyLevel || 'medium',
    tags: partial.tags || [],
    createdAt: partial.createdAt || Date.now(),
    deadline: partial.deadline,
    user_id: partial.user_id,
    project_id: partial.project_id,
  };
}

describe('assistant agent intent detection', () => {
  test('detects clear inbox intent', () => {
    expect(detectAgentIntent('please clear inbox')).toBe('clear_inbox');
  });

  test('detects prioritize inbox intent', () => {
    expect(detectAgentIntent('what are my top priorities from inbox?')).toBe('prioritize_inbox');
  });

  test('detects delete task intent', () => {
    expect(detectAgentIntent('delete the payroll task')).toBe('delete_task');
  });

  test('falls back to plan intent', () => {
    expect(detectAgentIntent('plan my week for launch')).toBe('plan');
  });
});

describe('assistant inbox ranking', () => {
  test('prioritizes high-priority and urgent inbox tasks first', () => {
    const tasks: Task[] = [
      makeTask({ id: '1', title: 'Low priority inbox', priority: 5, project_id: undefined }),
      makeTask({ id: '2', title: 'High priority inbox', priority: 1, project_id: undefined }),
      makeTask({ id: '3', title: 'Project task', priority: 1, project_id: 'proj-1' }),
    ];

    const ranked = rankInboxTasks(tasks, new Date('2026-02-13T12:00:00Z'));
    expect(ranked[0]?.id).toBe('2');
    expect(ranked.some((t) => t.id === '3')).toBe(false);
  });
});

describe('assistant delete candidates', () => {
  test('finds matching inbox tasks by query words', () => {
    const tasks: Task[] = [
      makeTask({ id: 'a', title: 'Send payroll reminder', project_id: undefined }),
      makeTask({ id: 'b', title: 'Buy groceries', project_id: undefined }),
      makeTask({ id: 'c', title: 'Payroll docs update', project_id: 'work-proj' }),
    ];

    const matches = findTaskCandidatesForDelete(tasks, 'delete payroll');
    expect(matches.map((m) => m.id)).toEqual(['a']);
  });
});
