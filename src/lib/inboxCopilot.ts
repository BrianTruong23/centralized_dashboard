import { formatDateKey } from '@/lib/dateKey';
import { Task } from '@/types/task';

export type InboxSkill =
  | 'auto_plan'
  | 'declutter'
  | 'move_status'
  | 'change_priority'
  | 'set_due_date'
  | 'move_to_today'
  | 'rewrite_title'
  | 'break_into_subtasks'
  | 'suggest_next_step'
  | 'defer_task'
  | 'batch_similar_tasks'
  | 'clarify_task';

export type InboxIntent =
  | 'planning_help'
  | 'cleanup_help'
  | 'prioritization_help'
  | 'inbox_information'
  | 'status_update'
  | 'due_date_update'
  | 'move_to_today'
  | 'priority_update'
  | 'breakdown_help'
  | 'defer_help'
  | 'batch_help'
  | 'clarify_help'
  | 'unknown';

export interface SuggestedAction {
  id: string;
  label: string;
  description: string;
  skill: InboxSkill;
  taskIds?: string[];
  status?: Task['status'];
  priority?: number;
  dueDate?: string;
  titleByTaskId?: Record<string, string>;
  subtasksByTaskId?: Record<string, string[]>;
  executable: boolean;
  missingInfo?: string;
}

export interface InboxCopilotReply {
  understanding: string;
  known: string[];
  inferred: string[];
  answer: string;
  actions: SuggestedAction[];
  confirmation: string;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreTaskUrgency(task: Task, todayKey: string): number {
  const priorityScore = Math.max(0, 6 - (task.priority || 4)) * 2;
  const statusPenalty = task.status === 'doing' ? 2 : 0;
  let deadlineScore = 0;
  if (task.deadline) {
    if (task.deadline < todayKey) deadlineScore = 6;
    else if (task.deadline === todayKey) deadlineScore = 5;
    else deadlineScore = 2;
  }
  return priorityScore + deadlineScore + statusPenalty;
}

function parseRelativeDate(input: string, today: Date): string | null {
  const lower = input.toLowerCase();
  const next = new Date(today);
  const iso = (d: Date) => formatDateKey(d);

  if (lower.includes('today')) return iso(today);
  if (lower.includes('tomorrow')) {
    next.setDate(next.getDate() + 1);
    return iso(next);
  }
  if (lower.includes('next week')) {
    next.setDate(next.getDate() + 7);
    return iso(next);
  }
  return null;
}

function suggestBetterTitle(original: string): string {
  const cleaned = original.trim().replace(/\s+/g, ' ');
  const lower = cleaned.toLowerCase();
  if (!cleaned) return 'Define next actionable task';
  if (cleaned.split(' ').length <= 2) return `Define next step for ${cleaned}`;
  if (lower.startsWith('do ') || lower.startsWith('work on ') || lower.startsWith('task ')) {
    return cleaned.replace(/^(do|work on|task)\s+/i, 'Complete ');
  }
  return `Complete: ${cleaned}`;
}

function clarifyActionTitle(original: string): string {
  const cleaned = original.trim();
  if (!cleaned) return 'Define one concrete next action';
  const lower = cleaned.toLowerCase();
  if (lower.includes('research')) return 'Find 3 sources and summarize key points';
  if (lower.includes('paper')) return 'Draft paper outline and write introduction';
  if (lower.includes('email')) return 'Draft and send the email with clear ask';
  return suggestBetterTitle(cleaned);
}

function generateSubtasksFromTitle(title: string): string[] {
  const cleaned = title.trim();
  if (!cleaned) return ['Define scope', 'Create first actionable step', 'Execute first step'];
  return [
    `Define scope for "${cleaned}"`,
    `Create a first draft/checklist for "${cleaned}"`,
    `Execute the highest-impact next step for "${cleaned}"`,
  ];
}

function findMentionedTasks(tasks: Task[], input: string): Task[] {
  const query = normalize(input);
  if (!query) return [];
  return tasks.filter((task) => {
    const title = normalize(task.title);
    if (title.length === 0) return false;
    return query.includes(title) || title.includes(query);
  });
}

function findDuplicateGroups(tasks: Task[]): Task[][] {
  const groups = new Map<string, Task[]>();
  tasks.forEach((task) => {
    const key = normalize(task.title);
    if (!key) return;
    const bucket = groups.get(key) || [];
    bucket.push(task);
    groups.set(key, bucket);
  });
  return Array.from(groups.values()).filter((g) => g.length > 1);
}

function findVagueTasks(tasks: Task[]): Task[] {
  const vagueTerms = ['task', 'stuff', 'thing', 'misc', 'todo', 'work on', 'fix'];
  return tasks.filter((task) => {
    const title = normalize(task.title);
    if (title.split(' ').length <= 2) return true;
    return vagueTerms.some((term) => title === term || title.startsWith(`${term} `));
  });
}

function isAdviceStylePrioritizationQuery(input: string): boolean {
  const text = input.toLowerCase();
  const asksAdvice =
    /(what is most urgent|what's most urgent|what should i do next|what should i do today|best thing to do|best thing right now|focus on right now|for 1 hour)/.test(
      text
    );
  const asksMutation = /(move|set|change|apply|mark|update|schedule|plan|declutter|clean up|cleanup)/.test(text);
  return asksAdvice && !asksMutation;
}

export function detectInboxIntent(input: string): InboxIntent {
  const text = input.toLowerCase();

  if (/(auto plan|plan my week|schedule my week|weekly plan)/.test(text)) return 'planning_help';
  if (/(declutter|clean up|cleanup|messy inbox|inbox is a mess)/.test(text)) return 'cleanup_help';
  if (/(what should i do next|what should i do today|focus on next|most urgent|urgent)/.test(text)) return 'prioritization_help';
  if (/(move .* to doing|move .* to done|mark .* done|start .* task)/.test(text)) return 'status_update';
  if (/(set due|due date|deadline|set .* tomorrow|set .* next week)/.test(text)) return 'due_date_update';
  if (/(move .* to today|put .* in today)/.test(text)) return 'move_to_today';
  if (/(priority|low priority|high priority|change priority)/.test(text)) return 'priority_update';
  if (/(break down|breakdown|split task|subtask|smaller steps)/.test(text)) return 'breakdown_help';
  if (/(defer|postpone|later|next week|can wait)/.test(text)) return 'defer_help';
  if (/(batch|group similar|group my|cluster)/.test(text)) return 'batch_help';
  if (/(clarify|make clearer|actionable|unclear title)/.test(text)) return 'clarify_help';
  if (/(funny|weird|odd|strange|unusual)/.test(text)) return 'inbox_information';
  if (/(overdue|duplicates|duplicate|unclear|rewrite|defer|low priority|inbox)/.test(text)) return 'inbox_information';
  return 'unknown';
}

export function buildInboxCopilotReply(allTasks: Task[], rawInput: string): InboxCopilotReply {
  const input = rawInput.trim();
  const today = new Date();
  const todayKey = formatDateKey(today);
  const inboxTasks = allTasks.filter((t) => t.status !== 'done');
  const intent = detectInboxIntent(input);
  const ranked = [...inboxTasks].sort((a, b) => scoreTaskUrgency(b, todayKey) - scoreTaskUrgency(a, todayKey));
  const topThree = ranked.slice(0, 3);
  const overdue = inboxTasks.filter((t) => Boolean(t.deadline) && (t.deadline as string) < todayKey);
  const noDate = inboxTasks.filter((t) => !t.deadline);
  const lowPriority = inboxTasks.filter((t) => (t.priority || 4) >= 4);
  const duplicateGroups = findDuplicateGroups(inboxTasks);
  const vagueTasks = findVagueTasks(inboxTasks).slice(0, 5);
  const mentioned = findMentionedTasks(inboxTasks, input);
  const inferred = ['Ranked urgency using existing priority, status, and due date fields only.'];
  const known = [
    `Inbox tasks available: ${inboxTasks.length}.`,
    `Overdue tasks: ${overdue.length}.`,
    `Tasks with no due date: ${noDate.length}.`,
  ];

  if (inboxTasks.length === 0) {
    return {
      understanding: 'It looks like you want help with your inbox.',
      known: ['Your inbox currently has no active tasks.'],
      inferred: [],
      answer: 'There is nothing actionable in inbox right now.',
      actions: [],
      confirmation: 'Want me to wait until new inbox tasks arrive?',
    };
  }

  if (intent === 'prioritization_help') {
    const adviceOnly = isAdviceStylePrioritizationQuery(input);
    const actions: SuggestedAction[] = [];
    if (!adviceOnly && topThree.length > 0) {
      actions.push({
        id: 'suggest-next-step',
        label: `Suggest next step: ${topThree[0].title}`,
        description: 'Recommendation only. No task changes are made.',
        skill: 'suggest_next_step',
        taskIds: [topThree[0].id],
        executable: false,
      });
      actions.push({
        id: 'move-top-to-today',
        label: 'Move top 3 tasks to Today',
        description: 'Sets due date to today for the top-ranked tasks.',
        skill: 'move_to_today',
        taskIds: topThree.map((t) => t.id),
        executable: true,
      });
      actions.push({
        id: 'move-first-to-doing',
        label: `Move "${topThree[0].title}" to Doing`,
        description: 'Starts work on the highest-ranked task.',
        skill: 'move_status',
        taskIds: [topThree[0].id],
        status: 'doing',
        executable: true,
      });
    }

    const recommendation = topThree[0];
    return {
      understanding: 'It looks like you want to know what to focus on next from inbox.',
      known,
      inferred,
      answer:
        !recommendation
          ? 'I do not have enough actionable tasks to rank right now.'
          : `The best thing to do right now from your inbox is "${recommendation.title}" because it has the strongest urgency based on your current priority, status, and due-date signals.`,
      actions,
      confirmation: adviceOnly
        ? 'If you want, I can also suggest concrete actions next.'
        : 'Would you like me to apply one of these actions?',
    };
  }

  if (intent === 'breakdown_help') {
    const target = mentioned[0] || topThree[0];
    if (!target) {
      return {
        understanding: 'You want to break a task into smaller steps.',
        known,
        inferred: [],
        answer: 'I need the specific task to break down.',
        actions: [],
        confirmation: 'Which task should I break into subtasks?',
      };
    }
    const subtasks = generateSubtasksFromTitle(target.title);
    return {
      understanding: 'You want a large/vague task turned into actionable subtasks.',
      known,
      inferred: [],
      answer: `Here is a practical breakdown for "${target.title}".`,
      actions: [
        {
          id: 'break-into-subtasks',
          label: `Break "${target.title}" into subtasks`,
          description: 'Planning suggestion only. No task changes are made.',
          skill: 'break_into_subtasks',
          taskIds: [target.id],
          subtasksByTaskId: { [target.id]: subtasks },
          executable: false,
        },
      ],
      confirmation: 'Want me to help apply one of these as real tasks next?',
    };
  }

  if (intent === 'defer_help') {
    const deferDate = parseRelativeDate(input, today) || (() => {
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return formatDateKey(nextWeek);
    })();
    const targets = mentioned.length > 0 ? mentioned : ranked.slice(-2);
    return {
      understanding: 'You want to defer tasks out of the immediate queue.',
      known,
      inferred: [`Deferral date inferred as ${deferDate}.`],
      answer: `I can defer ${targets.length} task(s) to ${deferDate}.`,
      actions: [
        {
          id: 'defer-task',
          label: `Defer selected task(s) to ${deferDate}`,
          description: 'Updates due date to move work later.',
          skill: 'defer_task',
          taskIds: targets.map((t) => t.id),
          dueDate: deferDate,
          executable: targets.length > 0,
        },
      ],
      confirmation: 'Do you want me to apply this defer action?',
    };
  }

  if (intent === 'batch_help') {
    const smallTasks = inboxTasks.filter((t) => (t.estimatedMinutes || 60) <= 60).slice(0, 5);
    return {
      understanding: 'You want to batch similar or small tasks together.',
      known,
      inferred: ['I selected short tasks (<=60 min) as likely batch candidates.'],
      answer: smallTasks.length > 0 ? `I found ${smallTasks.length} good tasks to batch into one focused block.` : 'I could not find clear small-task candidates to batch right now.',
      actions: [
        {
          id: 'batch-similar',
          label: 'Batch similar small tasks',
          description: 'Recommendation only. No task changes are made.',
          skill: 'batch_similar_tasks',
          taskIds: smallTasks.map((t) => t.id),
          executable: false,
        },
      ],
      confirmation: 'Want me to convert this into a concrete next-step action?',
    };
  }

  if (intent === 'clarify_help') {
    const targets = (mentioned.length > 0 ? mentioned : vagueTasks).slice(0, 4);
    const mapping: Record<string, string> = {};
    targets.forEach((task) => {
      mapping[task.id] = clarifyActionTitle(task.title);
    });
    return {
      understanding: 'You want vague tasks rewritten to be clearly actionable.',
      known,
      inferred: [],
      answer: `I prepared clearer action-oriented rewrites for ${targets.length} task(s).`,
      actions: [
        {
          id: 'clarify-task',
          label: 'Clarify selected vague tasks',
          description: 'Rewrites task titles to concrete next actions.',
          skill: 'clarify_task',
          taskIds: targets.map((t) => t.id),
          titleByTaskId: mapping,
          executable: targets.length > 0,
        },
      ],
      confirmation: 'Would you like me to apply these clarifications?',
    };
  }

  if (intent === 'planning_help') {
    const planCandidates = ranked.slice(0, 6);
    return {
      understanding: 'It looks like you want an auto plan for your week.',
      known,
      inferred: [...inferred, 'Using top uncompleted inbox tasks as scheduling candidates.'],
      answer: `I can create a weekly plan from ${planCandidates.length} tasks and spread them across the next work days based on urgency.`,
      actions: [
        {
          id: 'auto-plan-week',
          label: 'Auto plan this week',
          description: 'Assigns due dates across the next 5 days for top inbox tasks.',
          skill: 'auto_plan',
          taskIds: planCandidates.map((t) => t.id),
          executable: planCandidates.length > 0,
          missingInfo: planCandidates.length > 0 ? undefined : 'No tasks available to schedule.',
        },
      ],
      confirmation: 'Want me to apply this weekly plan?',
    };
  }

  if (intent === 'cleanup_help') {
    const actions: SuggestedAction[] = [];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultDue = formatDateKey(tomorrow);
    const duplicateCandidates = duplicateGroups.flatMap((group) => group.slice(1));
    const vagueTitleMap: Record<string, string> = {};
    vagueTasks.slice(0, 4).forEach((task) => {
      vagueTitleMap[task.id] = suggestBetterTitle(task.title);
    });

    if (topThree.length > 0) {
      actions.push({
        id: 'declutter-prioritize',
        label: 'Declutter by moving top items to Today',
        description: 'Moves top-ranked tasks to today to reduce inbox noise.',
        skill: 'declutter',
        taskIds: topThree.map((t) => t.id),
        executable: true,
      });
    }

    if (lowPriority.length > 0) {
      actions.push({
        id: 'declutter-lower-priority',
        label: 'Set low-value tasks to Priority 4',
        description: 'De-emphasize low-priority inbox items.',
        skill: 'change_priority',
        taskIds: lowPriority.slice(0, 5).map((t) => t.id),
        priority: 4,
        executable: true,
      });
    }

    if (Object.keys(vagueTitleMap).length > 0) {
      actions.push({
        id: 'declutter-rewrite-vague',
        label: 'Rewrite vague titles with clearer action wording',
        description: 'Applies suggested, more actionable titles to unclear tasks.',
        skill: 'rewrite_title',
        taskIds: Object.keys(vagueTitleMap),
        titleByTaskId: vagueTitleMap,
        executable: true,
      });
    }

    if (noDate.length > 0) {
      const candidates = ranked.filter((t) => !t.deadline).slice(0, 3);
      if (candidates.length > 0) {
        actions.push({
          id: 'declutter-add-deadlines',
          label: `Add deadline (${defaultDue}) to top no-date tasks`,
          description: 'Adds a default deadline to tasks missing date metadata.',
          skill: 'set_due_date',
          taskIds: candidates.map((t) => t.id),
          dueDate: defaultDue,
          executable: true,
        });
      }
    }

    if (duplicateCandidates.length > 0) {
      actions.push({
        id: 'declutter-duplicate-cleanup',
        label: 'Mark duplicate candidates as low priority',
        description: 'Keeps one task in each duplicate group and de-emphasizes likely duplicates (P4).',
        skill: 'change_priority',
        taskIds: duplicateCandidates.map((t) => t.id),
        priority: 4,
        executable: true,
      });
    }

    return {
      understanding: 'It sounds like you want to declutter and organize inbox.',
      known: [
        ...known,
        `Duplicate title groups found: ${duplicateGroups.length}.`,
        `Potentially vague titles: ${vagueTasks.length}.`,
        `Tasks missing deadline metadata: ${noDate.length}.`,
      ],
      inferred,
      answer: `I found ${duplicateGroups.length} duplicate groups, ${vagueTasks.length} unclear titles, and ${noDate.length} tasks missing deadlines. I can clean these using safe, reversible updates.`,
      actions,
      confirmation: 'Do you want me to apply one of these declutter actions?',
    };
  }

  if (intent === 'due_date_update') {
    const parsedDate = parseRelativeDate(input, today);
    if (!parsedDate || mentioned.length === 0) {
      return {
        understanding: 'It looks like you want to update a due date.',
        known,
        inferred: [],
        answer: 'I can do that, but I need both a specific task and a clear date.',
        actions: [],
        confirmation: 'Which task should I update, and to what date?',
      };
    }
    return {
      understanding: 'It looks like you want to set a due date.',
      known,
      inferred: [`Date parsed from your message: ${parsedDate}.`],
      answer: `I matched ${mentioned.length} task(s) and can set their due date to ${parsedDate}.`,
      actions: [
        {
          id: 'set-due-date',
          label: `Set due date to ${parsedDate}`,
          description: 'Updates due date for matched tasks.',
          skill: 'set_due_date',
          taskIds: mentioned.map((t) => t.id),
          dueDate: parsedDate,
          executable: true,
        },
      ],
      confirmation: 'Would you like me to apply this due date update?',
    };
  }

  if (intent === 'move_to_today') {
    if (mentioned.length === 0) {
      return {
        understanding: 'It looks like you want to move a task to Today.',
        known,
        inferred: [],
        answer: 'I need the specific task title to apply that.',
        actions: [],
        confirmation: 'Which task should I move to Today?',
      };
    }
    return {
      understanding: 'You want to move tasks to Today.',
      known,
      inferred: [],
      answer: `I matched ${mentioned.length} task(s) from your message.`,
      actions: [
        {
          id: 'move-mentioned-to-today',
          label: 'Move matched task(s) to Today',
          description: 'Sets due date to today.',
          skill: 'move_to_today',
          taskIds: mentioned.map((t) => t.id),
          executable: true,
        },
      ],
      confirmation: 'Would you like me to apply this now?',
    };
  }

  if (intent === 'priority_update') {
    const priority = /high/.test(input.toLowerCase()) ? 1 : /low/.test(input.toLowerCase()) ? 4 : 2;
    const targets = mentioned.length > 0 ? mentioned : topThree;
    return {
      understanding: 'It looks like you want to adjust task priority.',
      known,
      inferred: [`Priority target inferred from your request: P${priority}.`],
      answer: `I can update ${targets.length} task(s) to P${priority}.`,
      actions: [
        {
          id: 'change-priority',
          label: `Set selected task(s) to P${priority}`,
          description: 'Updates task priority.',
          skill: 'change_priority',
          taskIds: targets.map((t) => t.id),
          priority,
          executable: targets.length > 0,
          missingInfo: targets.length > 0 ? undefined : 'No task identified.',
        },
      ],
      confirmation: 'Should I apply this priority change?',
    };
  }

  if (intent === 'status_update') {
    const nextStatus: Task['status'] = /done/.test(input.toLowerCase()) ? 'done' : /doing|start/.test(input.toLowerCase()) ? 'doing' : 'todo';
    if (mentioned.length === 0) {
      return {
        understanding: 'It looks like you want to change task status.',
        known,
        inferred: [],
        answer: 'I need the task title to apply that change safely.',
        actions: [],
        confirmation: 'Which task should I update?',
      };
    }
    return {
      understanding: 'You want to move task status.',
      known,
      inferred: [`Status inferred from message: ${nextStatus}.`],
      answer: `I can move ${mentioned.length} task(s) to ${nextStatus}.`,
      actions: [
        {
          id: 'move-status',
          label: `Move matched task(s) to ${nextStatus}`,
          description: 'Updates workflow state.',
          skill: 'move_status',
          taskIds: mentioned.map((t) => t.id),
          status: nextStatus,
          executable: true,
        },
      ],
      confirmation: 'Do you want me to apply this status update?',
    };
  }

  if (intent === 'inbox_information') {
    const lower = input.toLowerCase();
    const isFunnyQuery = /(funny|weird|odd|strange|unusual)/.test(lower);

    if (isFunnyQuery) {
      const funnyBits: string[] = [];
      if (duplicateGroups.length > 0) funnyBits.push(`${duplicateGroups.length} duplicate group(s)`);
      if (vagueTasks.length > 0) funnyBits.push(`${vagueTasks.length} vague title(s)`);
      if (noDate.length > 0) funnyBits.push(`${noDate.length} task(s) with no due date`);
      if (funnyBits.length === 0) funnyBits.push('it is actually fairly clean right now');

      return {
        understanding: 'You are asking what is unusual in your inbox.',
        known: [
          ...known,
          `Duplicate groups: ${duplicateGroups.length}.`,
          `Vague titles: ${vagueTasks.length}.`,
        ],
        inferred: [],
        answer: `The funny part is ${funnyBits.join(', ')}.`,
        actions: [
          {
            id: 'funny-declutter',
            label: 'Declutter the unusual items',
            description: 'Clean duplicates, clarify vague tasks, and organize dates.',
            skill: 'declutter',
            taskIds: ranked.slice(0, 5).map((t) => t.id),
            executable: ranked.length > 0,
          },
        ],
        confirmation: 'If you want, ask me to show or apply cleanup actions.',
      };
    }
  }

  return {
    understanding: 'It looks like you want inbox guidance.',
    known: [
      ...known,
      `Top urgent candidates: ${topThree.map((t) => `"${t.title}"`).join(', ') || 'none'}.`,
    ],
    inferred,
    answer:
      'From your current inbox, I can help prioritize urgent tasks, identify what to defer, and suggest concrete next actions based on real task metadata.',
    actions: [
      {
        id: 'suggest-next',
        label: 'Move top task to Doing',
        description: 'Start with the highest-ranked inbox task.',
        skill: 'move_status',
        taskIds: topThree[0] ? [topThree[0].id] : [],
        status: 'doing',
        executable: Boolean(topThree[0]),
      },
      {
        id: 'suggest-today',
        label: 'Move top 3 to Today',
        description: 'Commit your most urgent tasks to today.',
        skill: 'move_to_today',
        taskIds: topThree.map((t) => t.id),
        executable: topThree.length > 0,
      },
      {
        id: 'suggest-plan',
        label: 'Auto plan this week',
        description: 'Schedule inbox tasks across this week.',
        skill: 'auto_plan',
        taskIds: ranked.slice(0, 6).map((t) => t.id),
        executable: ranked.length > 0,
      },
    ],
    confirmation: 'Would you like me to apply one of these actions?',
  };
}
