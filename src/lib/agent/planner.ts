import { AgentPreference, AgentProposal, AgentTask, ProposedAction, ProposedPlanDay } from './types';

function toTs(value?: string | null): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function isDoneOrArchived(task: AgentTask): boolean {
  return task.status === 'done' || task.archived === true;
}

export function rankTasksForPriority(tasks: AgentTask[], now: Date): AgentTask[] {
  const nowTs = now.getTime();
  return [...tasks]
    .filter((t) => !isDoneOrArchived(t))
    .sort((a, b) => {
      const dueA = toTs(a.due_at);
      const dueB = toTs(b.due_at);
      const overdueA = dueA !== null && dueA < nowTs ? 1 : 0;
      const overdueB = dueB !== null && dueB < nowTs ? 1 : 0;
      if (overdueA !== overdueB) return overdueB - overdueA;

      if (dueA !== null && dueB !== null && dueA !== dueB) return dueA - dueB;
      if (dueA !== null && dueB === null) return -1;
      if (dueA === null && dueB !== null) return 1;

      const priorityA = a.priority ?? 3;
      const priorityB = b.priority ?? 3;
      if (priorityA !== priorityB) return priorityA - priorityB;

      const estimateA = a.estimate_minutes ?? 60;
      const estimateB = b.estimate_minutes ?? 60;
      return estimateA - estimateB;
    });
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

export function buildWeeklySchedule(
  tasks: AgentTask[],
  preferences: AgentPreference,
  weekStart: Date
): ProposedPlanDay[] {
  const maxTasksPerDay = Math.max(1, preferences.max_tasks_per_day ?? 5);
  const workHours = preferences.work_hours ?? { start: '09:00', end: '17:00' };
  const [startHour, startMinute] = workHours.start.split(':').map(Number);
  const [endHour, endMinute] = workHours.end.split(':').map(Number);
  const totalWorkMinutes = Math.max(60, (endHour * 60 + endMinute) - (startHour * 60 + startMinute));

  const ranked = rankTasksForPriority(tasks, new Date(weekStart));
  const days: ProposedPlanDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    days.push({ date: formatDate(addDays(weekStart, i)), task_ids: [], total_minutes: 0 });
  }

  for (const task of ranked) {
    const estimate = Math.max(15, task.estimate_minutes ?? 60);
    const day = days.find((d) => d.task_ids.length < maxTasksPerDay && d.total_minutes + estimate <= totalWorkMinutes);
    if (!day) continue;
    day.task_ids.push(task.id);
    day.total_minutes += estimate;
  }

  return days;
}

function duplicateKeys(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function createAction(action: Omit<ProposedAction, 'action_id'>, index: number): ProposedAction {
  return {
    action_id: `action_${index + 1}`,
    ...action,
  };
}

export function createProposal(
  input: string,
  intent: AgentProposal['intent'],
  tasks: AgentTask[],
  preferences: AgentPreference
): AgentProposal {
  const actions: ProposedAction[] = [];
  const cleanTasks = tasks.filter((t) => t.user_id === preferences.user_id);

  if (intent === 'prioritize' || intent === 'qna') {
    const ranked = rankTasksForPriority(cleanTasks, new Date()).slice(0, 8);
    ranked.forEach((task, index) => {
      actions.push(
        createAction(
          {
            type: 'answer',
            destructive: false,
            requires_approval: false,
            reason: `Rank #${index + 1} by due date, urgency, and priority.`,
            expected_outcome: `Focus on "${task.title}" next.`,
            target_task_id: task.id,
            patch: {
              task_title: task.title,
              rank: index + 1,
            },
          },
          actions.length
        )
      );
    });
  }

  if (intent === 'schedule') {
    const weekStart = new Date();
    const days = buildWeeklySchedule(cleanTasks, preferences, weekStart);
    actions.push(
      createAction(
        {
          type: 'create_plan',
          destructive: false,
          requires_approval: false,
          reason: 'Create a weekly plan constrained by work hours and max tasks/day.',
          expected_outcome: 'A balanced week plan with realistic daily load.',
          patch: {
            week_range: `${formatDate(weekStart)}..${formatDate(addDays(weekStart, 6))}`,
            days,
          },
        },
        actions.length
      )
    );

    return {
      intent,
      analysis_summary: `Proposed weekly schedule from ${cleanTasks.length} tasks.`,
      questions: [],
      proposed_actions: actions,
      proposed_plan: {
        week_range: `${formatDate(weekStart)}..${formatDate(addDays(weekStart, 6))}`,
        days,
      },
    };
  }

  if (intent === 'declutter' || intent === 'cleanup') {
    const seen = new Map<string, AgentTask>();
    const duplicates: AgentTask[] = [];
    cleanTasks.forEach((task) => {
      if (isDoneOrArchived(task)) return;
      const key = duplicateKeys(task.title);
      const first = seen.get(key);
      if (first) duplicates.push(task);
      else seen.set(key, task);
    });

    const seenTargetIds = new Set<string>();
    duplicates.forEach((task) => {
      if (seenTargetIds.has(task.id)) return;
      seenTargetIds.add(task.id);
      actions.push(
        createAction(
          {
            type: 'archive_task',
            destructive: true,
            requires_approval: true,
            target_task_id: task.id,
            patch: {
              task_title: task.title,
            },
            reason: `Duplicate task candidate: "${task.title}".`,
            expected_outcome: `Archive duplicate "${task.title}" while keeping the original task.`,
          },
          actions.length
        )
      );
    });
  }

  if (intent === 'edit_tasks') {
    const lower = input.toLowerCase();
    const target = cleanTasks.find((task) => lower.includes(task.title.toLowerCase()));
    if (lower.includes('delete') && target) {
      actions.push(
        createAction(
          {
            type: 'delete_task',
            destructive: true,
            requires_approval: true,
            target_task_id: target.id,
            patch: {
              task_title: target.title,
            },
            reason: 'User requested deleting this task explicitly.',
            expected_outcome: 'Task is removed from active list.',
          },
          actions.length
        )
      );
    }
    if (lower.includes('archive') && target) {
      actions.push(
        createAction(
          {
            type: 'archive_task',
            destructive: true,
            requires_approval: true,
            target_task_id: target.id,
            patch: {
              task_title: target.title,
            },
            reason: 'User requested archiving this task explicitly.',
            expected_outcome: 'Task is archived and hidden from active list.',
          },
          actions.length
        )
      );
    }
  }

  return {
    intent,
    analysis_summary: `Prepared ${actions.length} proposed action${actions.length === 1 ? '' : 's'} from current task data.`,
    questions: actions.length === 0 ? ['I could not find a specific target task. Can you clarify task title or project?'] : [],
    proposed_actions: actions,
  };
}
