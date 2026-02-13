import { policyGate } from '@/lib/agent/policy';
import { executeApprovedActions } from '@/lib/agent/executor';
import { buildWeeklySchedule, createProposal, rankTasksForPriority } from '@/lib/agent/planner';
import { AgentTools } from '@/lib/agent/tools';
import { AgentPreference, AgentTask, ProposedAction } from '@/lib/agent/types';

function makeTask(partial: Partial<AgentTask> & Pick<AgentTask, 'id' | 'title' | 'user_id'>): AgentTask {
  return {
    id: partial.id,
    title: partial.title,
    user_id: partial.user_id,
    status: partial.status ?? 'todo',
    priority: partial.priority ?? 3,
    due_at: partial.due_at ?? null,
    estimate_minutes: partial.estimate_minutes ?? 60,
    archived: partial.archived ?? false,
    inbox: partial.inbox ?? true,
  };
}

function makeTools(): AgentTools & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async listTasks() {
      return [];
    },
    async createTask(payload) {
      calls.push('createTask');
      return makeTask({ id: 'new', title: payload.title, user_id: payload.user_id });
    },
    async updateTask() {
      calls.push('updateTask');
    },
    async archiveTask() {
      calls.push('archiveTask');
    },
    async deleteTask() {
      calls.push('deleteTask');
    },
    async createPlan() {
      calls.push('createPlan');
    },
    async logActivity() {
      calls.push('logActivity');
    },
    async getPreferences() {
      return null;
    },
    async updatePreferences(userId) {
      return { user_id: userId };
    },
  };
}

describe('agent console policy + executor', () => {
  test('No delete without approval (attempt -> pending approval)', async () => {
    const base: ProposedAction = {
      action_id: 'a1',
      type: 'delete_task',
      target_task_id: 't1',
      destructive: false,
      requires_approval: false,
      reason: 'test',
      expected_outcome: 'test',
    };
    const gated = policyGate([base]);
    expect(gated[0].destructive).toBe(true);
    expect(gated[0].requires_approval).toBe(true);
    expect(gated[0].approved).toBe(false);

    const tools = makeTools();
    const executed = await executeApprovedActions(gated, tools, { userId: 'u1', actor: 'u1' });
    expect(executed).toHaveLength(0);
    expect(tools.calls).not.toContain('deleteTask');
  });

  test('Bulk cleanup creates proposals, not execution', async () => {
    const tasks = [
      makeTask({ id: '1', title: 'Inbox Zero', user_id: 'u1' }),
      makeTask({ id: '2', title: 'Inbox Zero', user_id: 'u1' }),
      makeTask({ id: '3', title: 'Design docs', user_id: 'u1' }),
    ];
    const pref: AgentPreference = { user_id: 'u1' };
    const proposal = createProposal('declutter duplicates', 'declutter', tasks, pref);
    expect(proposal.proposed_actions.length).toBeGreaterThan(0);
    expect(proposal.proposed_actions.every((a) => a.requires_approval)).toBe(true);

    const tools = makeTools();
    const executed = await executeApprovedActions(proposal.proposed_actions, tools, { userId: 'u1', actor: 'u1' });
    expect(executed).toHaveLength(0);
    expect(tools.calls).toEqual([]);
  });

  test('Idempotency: running same approved actions twice does not double-apply', async () => {
    const actions: ProposedAction[] = [
      {
        action_id: 'a1',
        type: 'archive_task',
        target_task_id: 't1',
        destructive: true,
        requires_approval: true,
        approved: true,
        reason: 'cleanup',
        expected_outcome: 'archive',
      },
    ];
    const tools = makeTools();
    const first = await executeApprovedActions(actions, tools, { userId: 'u1', actor: 'u1' });
    const second = await executeApprovedActions(actions, tools, {
      userId: 'u1',
      actor: 'u1',
      alreadyExecutedActionIds: new Set(first.map((a) => a.action_id)),
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(tools.calls.filter((c) => c === 'archiveTask')).toHaveLength(1);
  });

  test('Audit log always written for executed actions', async () => {
    const actions: ProposedAction[] = [
      {
        action_id: 'a1',
        type: 'update_task',
        target_task_id: 't1',
        patch: { status: 'doing' },
        destructive: false,
        requires_approval: false,
        approved: true,
        reason: 'start task',
        expected_outcome: 'task in progress',
      },
    ];
    const tools = makeTools();
    await executeApprovedActions(actions, tools, { userId: 'u1', actor: 'u1' });
    expect(tools.calls).toContain('updateTask');
    expect(tools.calls).toContain('logActivity');
  });

  test('Permission boundaries: agent cannot modify tasks outside user scope', async () => {
    const actions: ProposedAction[] = [
      {
        action_id: 'a1',
        type: 'update_task',
        target_task_id: 't1',
        patch: { user_id: 'u2', status: 'done' },
        destructive: false,
        requires_approval: false,
        approved: true,
        reason: 'bad patch',
        expected_outcome: 'should fail',
      },
    ];
    const tools = makeTools();
    await expect(executeApprovedActions(actions, tools, { userId: 'u1', actor: 'u1' })).rejects.toThrow(
      'Permission denied'
    );
  });
});

describe('agent ranking and scheduling constraints', () => {
  test('Ranking respects due dates and overdue items', () => {
    const ranked = rankTasksForPriority(
      [
        makeTask({ id: 'a', title: 'No due', user_id: 'u1', priority: 1 }),
        makeTask({ id: 'b', title: 'Due tomorrow', user_id: 'u1', due_at: '2026-02-14T00:00:00Z', priority: 3 }),
        makeTask({ id: 'c', title: 'Overdue', user_id: 'u1', due_at: '2026-02-10T00:00:00Z', priority: 5 }),
      ],
      new Date('2026-02-13T00:00:00Z')
    );
    expect(ranked[0].id).toBe('c');
    expect(ranked[1].id).toBe('b');
  });

  test('Scheduling constraints: never exceed max tasks/day or work hours', () => {
    const tasks = [
      makeTask({ id: '1', title: 'Task 1', user_id: 'u1', estimate_minutes: 120 }),
      makeTask({ id: '2', title: 'Task 2', user_id: 'u1', estimate_minutes: 120 }),
      makeTask({ id: '3', title: 'Task 3', user_id: 'u1', estimate_minutes: 120 }),
      makeTask({ id: '4', title: 'Task 4', user_id: 'u1', estimate_minutes: 120 }),
      makeTask({ id: '5', title: 'Task 5', user_id: 'u1', estimate_minutes: 120 }),
    ];
    const pref: AgentPreference = {
      user_id: 'u1',
      max_tasks_per_day: 2,
      work_hours: { start: '09:00', end: '12:00' },
    };
    const days = buildWeeklySchedule(tasks, pref, new Date('2026-02-16T00:00:00Z'));
    for (const day of days) {
      expect(day.task_ids.length).toBeLessThanOrEqual(2);
      expect(day.total_minutes).toBeLessThanOrEqual(180);
    }
  });
});

