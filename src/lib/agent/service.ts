import { AgentIntent } from './types';
import { createProposal, rankTasksForPriority } from './planner';
import { policyGate } from './policy';
import { executeApprovedActions } from './executor';
import { createSupabaseAgentTools } from './supabaseTools';
import { AgentPreference, AgentProposal, AgentRunRecord, ProposedAction } from './types';
import { analyzeInboxCleanup, CleanupReview } from './inboxCleanup';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function baseHeaders(token: string): Record<string, string> {
  return {
    apikey: env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function getAuthUserId(userToken: string): Promise<string> {
  const res = await fetch(`${env('NEXT_PUBLIC_SUPABASE_URL')}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      Authorization: `Bearer ${userToken}`,
    },
  });
  if (!res.ok) throw new Error('Unauthorized');
  const body = await res.json();
  if (!body?.id || typeof body.id !== 'string') throw new Error('Unauthorized');
  return body.id;
}

async function fetchRuns(userToken: string, userId: string): Promise<AgentRunRecord[]> {
  const url = new URL(`${env('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/agent_runs`);
  url.searchParams.set('select', '*');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '10');
  const res = await fetch(url.toString(), { method: 'GET', headers: baseHeaders(userToken) });
  if (!res.ok) throw new Error('Failed to load run history');
  return (await res.json()) as AgentRunRecord[];
}

async function insertRun(
  userToken: string,
  row: Omit<AgentRunRecord, 'id' | 'created_at'>
): Promise<AgentRunRecord> {
  const res = await fetch(`${env('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/agent_runs?select=*`, {
    method: 'POST',
    headers: { ...baseHeaders(userToken), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error('Failed to save agent run');
  const data = (await res.json()) as AgentRunRecord[];
  return data[0];
}

async function updateRun(
  userToken: string,
  runId: string,
  patch: Partial<AgentRunRecord>
): Promise<AgentRunRecord> {
  const res = await fetch(`${env('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/agent_runs?id=eq.${runId}&select=*`, {
    method: 'PATCH',
    headers: { ...baseHeaders(userToken), Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to update agent run');
  const data = (await res.json()) as AgentRunRecord[];
  return data[0];
}

async function getRunById(userToken: string, runId: string, userId: string): Promise<AgentRunRecord | null> {
  const url = new URL(`${env('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/agent_runs`);
  url.searchParams.set('select', '*');
  url.searchParams.set('id', `eq.${runId}`);
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const res = await fetch(url.toString(), { method: 'GET', headers: baseHeaders(userToken) });
  if (!res.ok) throw new Error('Failed to load agent run');
  const rows = (await res.json()) as AgentRunRecord[];
  return rows[0] ?? null;
}

function mergeApprovals(
  proposed: ProposedAction[],
  approvedActionIds: string[]
): ProposedAction[] {
  const approvedSet = new Set(approvedActionIds);
  return proposed.map((action) => ({
    ...action,
    approved: approvedSet.has(action.action_id),
  }));
}

function inferIntentFromRequest(input: string): AgentIntent {
  const t = input.toLowerCase();
  const compact = t.replace(/\s+/g, '');
  const nextQuestionPattern = /what.*(i\s*do|do)\s*next/;

  if (
    t.includes('plan my week') ||
    t.includes('auto plan') ||
    t.includes('schedule my week') ||
    t.includes('weekly plan') ||
    t.includes('plan this week')
  ) {
    return 'schedule';
  }
  if (
    t.includes('declutter') ||
    t.includes('clean up') ||
    t.includes('cleanup') ||
    t.includes('clear inbox') ||
    t.includes('organize inbox')
  ) {
    return 'declutter';
  }
  if (
    t.includes('what should i do next') ||
    t.includes('what do i do next') ||
    t.includes('what i do next') ||
    t.includes('what next') ||
    t.includes('do next') ||
    t.includes('next task') ||
    t.includes('prioritize') ||
    t.includes('top tasks') ||
    t.includes('focus next') ||
    compact.includes('whatidonext') ||
    nextQuestionPattern.test(t)
  ) {
    return 'prioritize';
  }
  if (t.includes('delete') || t.includes('remove') || t.includes('archive') || t.includes('rename')) {
    return 'edit_tasks';
  }
  return 'qna';
}

function safeDate(dateLike?: string | null): string {
  if (!dateLike) return '';
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function formatWeekPlanSummary(proposal: AgentProposal, tasksById: Map<string, string>): string {
  const days = proposal.proposed_plan?.days || [];
  const lines: string[] = ['Here is your week plan preview. Nothing changed yet.'];
  const activeDays = days.filter((day) => day.task_ids.length > 0);

  activeDays.slice(0, 5).forEach((day) => {
    const titles = day.task_ids
      .slice(0, 3)
      .map((id) => tasksById.get(id) || 'Task')
      .join(', ');
    lines.push(`- ${day.date}: ${titles}${day.task_ids.length > 3 ? '...' : ''}`);
  });

  if (activeDays.length === 0) {
    lines.push('- I could not place tasks this week with current constraints.');
  }

  return lines.join('\n');
}

function formatPrioritiesSummary(tasks: ReturnType<typeof rankTasksForPriority>): string {
  if (tasks.length === 0) {
    return 'You are clear for now. I did not find active tasks to prioritize.';
  }
  const lines = ['Here is what you should do next:', ...tasks.slice(0, 5).map((task, i) => {
    const due = safeDate(task.due_at);
    return `${i + 1}. ${task.title}${due ? ` (due ${due})` : ''}`;
  })];
  return lines.join('\n');
}

function buildDeclutterActions(review: CleanupReview, tasksById: Map<string, string>): ProposedAction[] {
  const actions: ProposedAction[] = [];
  let idx = 1;
  const seenDeleteTargets = new Set<string>();

  review.duplicates.forEach((item) => {
    const keep = item.details?.merge_with || item.task_ids[0];
    item.task_ids
      .filter((id) => id && id !== keep)
      .forEach((id) => {
        if (seenDeleteTargets.has(id)) return;
        seenDeleteTargets.add(id);
        actions.push({
          action_id: `action_${idx++}`,
          type: 'delete_task',
          destructive: true,
          requires_approval: true,
          target_task_id: id,
          patch: { task_title: tasksById.get(id) || 'Task' },
          reason: item.explanation || 'Duplicate inbox item.',
          expected_outcome: `Remove duplicate task "${tasksById.get(id) || 'Task'}".`,
        });
      });
  });

  review.stale.forEach((item) => {
    item.task_ids.forEach((id) => {
      actions.push({
        action_id: `action_${idx++}`,
        type: 'archive_task',
        destructive: true,
        requires_approval: true,
        target_task_id: id,
        patch: { task_title: tasksById.get(id) || 'Task' },
        reason: item.explanation || 'Likely stale task.',
        expected_outcome: `Archive "${tasksById.get(id) || 'Task'}" to declutter inbox.`,
      });
    });
  });

  review.vague.forEach((item) => {
    const taskId = item.task_ids[0];
    if (!taskId || !item.details?.suggested_title) return;
    actions.push({
      action_id: `action_${idx++}`,
      type: 'update_task',
      destructive: false,
      requires_approval: false,
      target_task_id: taskId,
      patch: { title: item.details.suggested_title, task_title: tasksById.get(taskId) || 'Task' },
      reason: item.explanation || 'Improve task clarity.',
      expected_outcome: `Rename to "${item.details.suggested_title}".`,
    });
  });

  review.missing_metadata.forEach((item) => {
    const taskId = item.task_ids[0];
    if (!taskId || !item.details?.suggested_metadata) return;
    const meta = item.details.suggested_metadata;
    actions.push({
      action_id: `action_${idx++}`,
      type: 'update_task',
      destructive: false,
      requires_approval: false,
      target_task_id: taskId,
      patch: {
        due_at: meta.deadline || undefined,
        priority: typeof meta.priority === 'number' ? meta.priority : undefined,
        project_id: meta.project_id || undefined,
        task_title: tasksById.get(taskId) || 'Task',
      },
      reason: item.explanation || 'Add missing metadata.',
      expected_outcome: `Add metadata to "${tasksById.get(taskId) || 'Task'}".`,
    });
  });

  return actions;
}

function formatDeclutterSummary(review: CleanupReview): string {
  const dup = review.duplicates.length;
  const stale = review.stale.length;
  const vague = review.vague.length;
  const missing = review.missing_metadata.length;
  const total = dup + stale + vague + missing;

  if (total === 0) {
    return 'I reviewed your inbox and it already looks clean. No high-confidence cleanup actions needed.';
  }

  const lines = [
    'I reviewed your inbox and prepared a cleanup preview. Nothing changed yet.',
    `- Duplicates: ${dup}`,
    `- Stale tasks: ${stale}`,
    `- Vague titles: ${vague}`,
    `- Missing metadata: ${missing}`,
    'Approve the actions below and I will apply them.',
  ];
  return lines.join('\n');
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isVagueTitle(title: string): boolean {
  const t = normalizeTitle(title);
  const words = t.split(' ').filter(Boolean);
  if (words.length <= 2) return true;
  const vagueTokens = ['task', 'stuff', 'thing', 'misc', 'todo', 'work on', 'update', 'fix'];
  return vagueTokens.some((token) => t === token || t.startsWith(`${token} `));
}

function plusDays(dayOffset: number): string {
  const base = new Date();
  base.setDate(base.getDate() + dayOffset);
  return base.toISOString().slice(0, 10);
}

function isInboxQuestion(input: string): boolean {
  const t = input.toLowerCase();
  const cues = [
    'inbox',
    'urgent',
    'overdue',
    'today',
    'next',
    'focus',
    'defer',
    'low priority',
    'duplicate',
    'unclear',
    'rewrite',
    'schedule',
    'categorize',
    'tag',
    'subtask',
    'break down',
  ];
  return cues.some((cue) => t.includes(cue));
}

function buildInboxAdvisorProposal(
  requestText: string,
  inboxTasks: ReturnType<typeof rankTasksForPriority>,
  allTasks: ReturnType<typeof rankTasksForPriority>
): AgentProposal {
  const query = requestText.toLowerCase();
  const ranked = rankTasksForPriority(inboxTasks, new Date());
  const byId = new Map(inboxTasks.map((task) => [task.id, task]));
  const actions: ProposedAction[] = [];
  let actionIndex = 1;

  const overdue = ranked.filter((task) => {
    if (!task.due_at) return false;
    const ts = Date.parse(task.due_at);
    return Number.isFinite(ts) && ts < Date.now();
  });
  const lowPriority = ranked.filter((task) => (task.priority ?? 3) >= 4);
  const noDueDate = ranked.filter((task) => !task.due_at);
  const vague = ranked.filter((task) => isVagueTitle(task.title));

  const duplicates: string[][] = [];
  const duplicateMap = new Map<string, string[]>();
  ranked.forEach((task) => {
    const key = normalizeTitle(task.title);
    const group = duplicateMap.get(key) || [];
    group.push(task.id);
    duplicateMap.set(key, group);
  });
  duplicateMap.forEach((ids) => {
    if (ids.length > 1) duplicates.push(ids);
  });

  const asksOverdue = query.includes('overdue') || query.includes('urgent');
  const asksLowPriority = query.includes('low priority');
  const asksDefer = query.includes('defer');
  const asksDuplicate = query.includes('duplicate');
  const asksRewrite = query.includes('unclear') || query.includes('rewrite');
  const asksToday = query.includes('today');
  const asksSchedule = query.includes('schedule');
  const asksSubtasks = query.includes('subtask') || query.includes('break down');
  const asksCategorize = query.includes('categorize') || query.includes('tag');

  const primaryList =
    asksOverdue
      ? overdue
      : asksLowPriority || asksDefer
        ? lowPriority
        : ranked;

  const answerLines: string[] = [];
  if (asksOverdue) {
    answerLines.push(`I found ${overdue.length} overdue/urgent inbox task${overdue.length === 1 ? '' : 's'}.`);
  } else if (asksLowPriority) {
    answerLines.push(`I found ${lowPriority.length} low-priority inbox task${lowPriority.length === 1 ? '' : 's'}.`);
  } else if (asksDuplicate) {
    answerLines.push(`I found ${duplicates.length} duplicate group${duplicates.length === 1 ? '' : 's'} in your inbox.`);
  } else if (asksRewrite) {
    answerLines.push(`I found ${vague.length} task${vague.length === 1 ? '' : 's'} with unclear titles.`);
  } else {
    answerLines.push("Here is what I recommend from your inbox right now.");
  }

  primaryList.slice(0, 5).forEach((task, index) => {
    const due = safeDate(task.due_at);
    answerLines.push(`${index + 1}. ${task.title}${due ? ` (due ${due})` : ''}`);
  });

  const topForDoing = primaryList.slice(0, 3);
  topForDoing.forEach((task) => {
    actions.push({
      action_id: `action_${actionIndex++}`,
      type: 'update_task',
      destructive: false,
      requires_approval: false,
      reason: `Move "${task.title}" to in progress so you can focus immediately.`,
      expected_outcome: `Set "${task.title}" to doing.`,
      target_task_id: task.id,
      patch: { status: 'doing', task_title: task.title },
    });
  });

  if (asksToday || query.includes('what should i do')) {
    topForDoing.slice(0, 2).forEach((task) => {
      actions.push({
        action_id: `action_${actionIndex++}`,
        type: 'update_task',
        destructive: false,
        requires_approval: true,
        reason: `Put "${task.title}" into Today.`,
        expected_outcome: `Set due date to today for "${task.title}".`,
        target_task_id: task.id,
        patch: { due_at: plusDays(0), task_title: task.title },
      });
    });
  }

  if (asksOverdue && overdue.length > 0) {
    overdue.slice(0, 3).forEach((task) => {
      actions.push({
        action_id: `action_${actionIndex++}`,
        type: 'update_task',
        destructive: false,
        requires_approval: true,
        reason: `Raise priority for overdue task "${task.title}".`,
        expected_outcome: `Set "${task.title}" priority to P1.`,
        target_task_id: task.id,
        patch: { priority: 1, task_title: task.title },
      });
    });
  }

  if (asksLowPriority || asksDefer) {
    lowPriority.slice(0, 3).forEach((task, idx) => {
      actions.push({
        action_id: `action_${actionIndex++}`,
        type: 'update_task',
        destructive: false,
        requires_approval: true,
        reason: `Defer low-priority task "${task.title}" to reduce load now.`,
        expected_outcome: `Schedule "${task.title}" later this week.`,
        target_task_id: task.id,
        patch: { due_at: plusDays(4 + idx), task_title: task.title },
      });
    });
  }

  if (asksDuplicate || query.includes('declutter')) {
    duplicates.slice(0, 3).forEach((group) => {
      const [, ...toDelete] = group;
      toDelete.forEach((taskId) => {
        const task = byId.get(taskId);
        if (!task) return;
        actions.push({
          action_id: `action_${actionIndex++}`,
          type: 'delete_task',
          destructive: true,
          requires_approval: true,
          reason: `Likely duplicate of "${byId.get(group[0])?.title || 'another task'}".`,
          expected_outcome: `Remove duplicate "${task.title}".`,
          target_task_id: task.id,
          patch: { task_title: task.title },
        });
      });
    });
  }

  if (asksRewrite) {
    vague.slice(0, 3).forEach((task) => {
      const suggestedTitle = `Clarify: ${task.title}`;
      actions.push({
        action_id: `action_${actionIndex++}`,
        type: 'update_task',
        destructive: false,
        requires_approval: false,
        reason: `Rewrite vague title for "${task.title}".`,
        expected_outcome: `Rename to "${suggestedTitle}".`,
        target_task_id: task.id,
        patch: { title: suggestedTitle, task_title: task.title },
      });
    });
  }

  if (asksSchedule || noDueDate.length > 0) {
    noDueDate.slice(0, 2).forEach((task, idx) => {
      actions.push({
        action_id: `action_${actionIndex++}`,
        type: 'update_task',
        destructive: false,
        requires_approval: true,
        reason: `Add a date so "${task.title}" becomes actionable.`,
        expected_outcome: `Set due date for "${task.title}".`,
        target_task_id: task.id,
        patch: { due_at: plusDays(1 + idx), task_title: task.title },
      });
    });
  }

  if (asksSubtasks) {
    const biggest = ranked
      .slice()
      .sort((a, b) => (b.estimate_minutes ?? 0) - (a.estimate_minutes ?? 0))[0];
    if (biggest) {
      ['Plan', 'Execute', 'Review'].forEach((phase) => {
        actions.push({
          action_id: `action_${actionIndex++}`,
          type: 'create_task',
          destructive: false,
          requires_approval: true,
          reason: `Break "${biggest.title}" into smaller steps.`,
          expected_outcome: `Create subtask "${phase} ${biggest.title}".`,
          patch: {
            title: `${phase} ${biggest.title}`,
            status: 'todo',
            priority: biggest.priority ?? 3,
            due_at: biggest.due_at ?? null,
            project_id: biggest.project_id ?? null,
          },
        });
      });
    }
  }

  if (asksCategorize) {
    const commonProject = allTasks
      .filter((task) => !!task.project_id)
      .map((task) => task.project_id as string)[0];
    if (commonProject) {
      noDueDate.slice(0, 2).forEach((task) => {
        actions.push({
          action_id: `action_${actionIndex++}`,
          type: 'update_task',
          destructive: false,
          requires_approval: true,
          reason: `Categorize "${task.title}" into an existing project.`,
          expected_outcome: `Assign "${task.title}" to a project.`,
          target_task_id: task.id,
          patch: { project_id: commonProject, task_title: task.title },
        });
      });
    }
  }

  return {
    intent: 'qna',
    analysis_summary: `${answerLines.join('\n')}\n\nNext: choose suggested actions to apply.`,
    questions: [
      'Would you like me to apply only safe changes first?',
      'Should I focus only on overdue tasks next?',
    ],
    proposed_actions: actions,
  };
}

export async function proposeAgentRun(userToken: string, requestText: string): Promise<AgentRunRecord> {
  const userId = await getAuthUserId(userToken);
  const tools = createSupabaseAgentTools(userToken);
  const preferences =
    (await tools.getPreferences(userId)) ??
    ({
      user_id: userId,
      work_hours: { start: '09:00', end: '17:00' },
      max_tasks_per_day: 5,
      timezone: 'UTC',
      scheduling_style: 'balanced',
    } satisfies AgentPreference);
  const tasks = await tools.listTasks({ user_id: userId, archived: false });
  const cleanTasks = tasks.filter((t) => t.user_id === preferences.user_id && !t.archived && t.status !== 'done');
  const inboxTasks = cleanTasks.filter((task) => task.inbox === true || !task.project_id);
  const intent = inferIntentFromRequest(requestText);
  const tasksById = new Map(cleanTasks.map((task) => [task.id, task.title]));

  let rawProposal: AgentProposal;
  if (intent === 'schedule') {
    const proposal = createProposal(requestText, 'schedule', tasks, preferences);
    rawProposal = {
      ...proposal,
      analysis_summary: formatWeekPlanSummary(proposal, tasksById),
    };
  } else if (intent === 'declutter' || intent === 'cleanup') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      rawProposal = createProposal(requestText, 'declutter', tasks, preferences);
      rawProposal.analysis_summary = 'I can run exact duplicate cleanup now. Set OPENROUTER_API_KEY to enable full inbox declutter analysis.';
    } else {
      const review = await analyzeInboxCleanup(
        inboxTasks.map((task) => ({
          id: task.id,
          title: task.title,
          deadline: task.due_at || null,
          priority: task.priority ?? null,
          project_id: task.project_id ?? null,
          created_at: task.created_at || null,
          status: task.status,
        })),
        apiKey
      );
      rawProposal = {
        intent: 'declutter',
        analysis_summary: formatDeclutterSummary(review),
        questions: [],
        proposed_actions: buildDeclutterActions(review, tasksById),
      };
    }
  } else if (intent === 'prioritize') {
    const ranked = rankTasksForPriority(cleanTasks, new Date());
    const top = ranked.slice(0, 5);
    const today = new Date().toISOString().slice(0, 10);
    const proposedActions: ProposedAction[] = [];
    top.forEach((task, index) => {
      proposedActions.push({
        action_id: `action_${proposedActions.length + 1}`,
        type: 'update_task',
        destructive: false,
        requires_approval: false,
        reason: `Set "${task.title}" as in progress so it appears in your active workflow.`,
        expected_outcome: `Move "${task.title}" to in progress.`,
        target_task_id: task.id,
        patch: {
          task_title: task.title,
          status: 'doing',
        },
      });

      if (index < 2) {
        proposedActions.push({
          action_id: `action_${proposedActions.length + 1}`,
          type: 'update_task',
          destructive: false,
          requires_approval: true,
          reason: `Place "${task.title}" into Today so it becomes actionable right away.`,
          expected_outcome: `Schedule "${task.title}" for today (${today}).`,
          target_task_id: task.id,
          patch: {
            task_title: task.title,
            due_at: today,
          },
        });
      }
    });

    rawProposal = {
      intent,
      analysis_summary: formatPrioritiesSummary(top),
      questions: top.length === 0 ? ['Add or unarchive tasks so I can suggest your next actions.'] : [],
      proposed_actions: proposedActions,
    };
  } else if (intent === 'qna') {
    rawProposal = isInboxQuestion(requestText)
      ? buildInboxAdvisorProposal(requestText, inboxTasks, cleanTasks)
      : {
          intent,
          analysis_summary: 'I can help you plan your week, declutter inbox, or suggest the next tasks to work on. Try one of those prompts and I will generate actionable steps.',
          questions: [],
          proposed_actions: [],
        };
  } else {
    rawProposal = createProposal(requestText, intent, tasks, preferences);
  }
  const gatedProposal: AgentProposal = {
    ...rawProposal,
    proposed_actions: policyGate(rawProposal.proposed_actions),
  };

  return insertRun(userToken, {
    user_id: userId,
    request_text: requestText,
    intent,
    proposed_plan_json: gatedProposal,
    approved_actions_json: [],
    executed_actions_json: [],
  });
}

export async function executeAgentRun(
  userToken: string,
  runId: string,
  approvedActionIds: string[],
  modifiedActions?: Partial<ProposedAction>[]
): Promise<AgentRunRecord> {
  const userId = await getAuthUserId(userToken);
  const run = await getRunById(userToken, runId, userId);
  if (!run) throw new Error('Run not found');

  let approved = mergeApprovals(run.proposed_plan_json.proposed_actions, approvedActionIds);
  
  // Merge user overrides (like DND reordering the plan) into the approved actions array
  if (modifiedActions && modifiedActions.length > 0) {
    approved = approved.map(action => {
      const override = modifiedActions.find(m => m.action_id === action.action_id);
      if (override) {
        return { ...action, ...override } as ProposedAction;
      }
      return action;
    });
  }

  const tools = createSupabaseAgentTools(userToken);
  const alreadyExecuted = new Set((run.executed_actions_json || []).map((a) => a.action_id));
  const executed = await executeApprovedActions(approved, tools, {
    userId,
    actor: userId,
    alreadyExecutedActionIds: alreadyExecuted,
  });

  const mergedExecuted = [...(run.executed_actions_json ?? []), ...executed];
  return updateRun(userToken, run.id, {
    approved_actions_json: approved.filter((a) => a.approved),
    executed_actions_json: mergedExecuted,
  });
}

export async function listAgentRuns(userToken: string): Promise<AgentRunRecord[]> {
  const userId = await getAuthUserId(userToken);
  return fetchRuns(userToken, userId);
}

export async function getAgentPreferences(userToken: string): Promise<AgentPreference | null> {
  const userId = await getAuthUserId(userToken);
  const tools = createSupabaseAgentTools(userToken);
  return tools.getPreferences(userId);
}

export async function patchAgentPreferences(
  userToken: string,
  patch: Partial<AgentPreference>
): Promise<AgentPreference> {
  const userId = await getAuthUserId(userToken);
  const tools = createSupabaseAgentTools(userToken);
  return tools.updatePreferences(userId, patch);
}
