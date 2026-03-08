'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Sparkles, Send, X, Maximize2, Minimize2, Eraser, History, ChevronDown, Loader2, Brain } from 'lucide-react';
import { formatDateKey } from '@/lib/dateKey';
import { Task } from '@/types/task';
import { buildInboxCopilotReply, InboxCopilotReply, SuggestedAction } from '@/lib/inboxCopilot';

interface AiAssistantProps {
  userId?: string;
  tasks: Task[];
  onUpdateTask: (task: Task) => Promise<void> | void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  reply?: InboxCopilotReply;
  mode?: 'answer_only' | 'answer_with_suggested_actions';
}

interface ConversationHistoryItem {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface PlanTaskDraft {
  id: string;
  title: string;
  priority: number;
  included: boolean;
}

interface PlanDayDraft {
  date: string;
  label: string;
  tasks: PlanTaskDraft[];
}

interface NextAssistOption {
  key: string;
  label: string;
  prompt: string;
  aliases: string[];
}

type PendingFollowUp =
  | { type: 'apply_actions'; messageId: string }
  | { type: 'different_action_set'; fromMessageId: string; fromActionSkills: string[] }
  | { type: 'choose_next_assist_mode'; options: NextAssistOption[] }
  | null;

type NextAssistResponse = {
  options: NextAssistOption[];
  question: string;
};

const QUICK_PROMPTS = [
  'What should I do today?',
  'What is most urgent in my inbox?',
  'Declutter my inbox',
  'Auto plan my week',
];

function nextWorkDates(count: number): string[] {
  const dates: string[] = [];
  const cursor = new Date();
  while (dates.length < count) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(formatDateKey(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function buildFallbackAlternativeModes(fromSkills: string[]): NextAssistOption[] {
  const base: NextAssistOption[] = [
    {
      key: 'today',
      label: 'Suggest what to do today',
      prompt: 'What should I do today?',
      aliases: ['today', 'do today', 'what today', 'focus today', 'suggest today'],
    },
    {
      key: 'declutter',
      label: 'Declutter inbox',
      prompt: 'Declutter my inbox',
      aliases: ['declutter', 'cleanup', 'clean up', 'organize inbox', 'inbox cleanup'],
    },
    {
      key: 'plan',
      label: 'Auto plan week',
      prompt: 'Auto plan my week',
      aliases: ['plan', 'auto plan', 'schedule', 'week', 'weekly plan'],
    },
  ];

  const lastWasDeclutter = fromSkills.includes('declutter') || fromSkills.includes('rewrite_title');
  const lastWasPlan = fromSkills.includes('auto_plan');
  const lastWasPrioritize = fromSkills.includes('move_to_today') || fromSkills.includes('move_status');

  if (lastWasDeclutter) return base.filter((o) => o.key !== 'declutter');
  if (lastWasPlan) return base.filter((o) => o.key !== 'plan');
  if (lastWasPrioritize) return base.filter((o) => o.key !== 'today');
  return base.slice(0, 2);
}

export function AiAssistant({ userId, tasks, onUpdateTask }: AiAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [isApplying, setIsApplying] = useState<Record<string, boolean>>({});
  const [appliedResult, setAppliedResult] = useState<Record<string, string>>({});
  const [appliedFlags, setAppliedFlags] = useState<Record<string, boolean>>({});
  const [actionUndo, setActionUndo] = useState<Record<string, Task[]>>({});
  const [isThinking, setIsThinking] = useState(false);
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDayDraft[]>>({});
  const [draggingPlan, setDraggingPlan] = useState<{ key: string; fromDate: string; taskId: string } | null>(null);
  const [pendingFollowUp, setPendingFollowUp] = useState<PendingFollowUp>(null);
  const [actionsVisibleByMessage, setActionsVisibleByMessage] = useState<Record<string, boolean>>({});
  const [appliedHistory, setAppliedHistory] = useState<Array<{ messageId: string; actionId: string }>>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationHistoryItem[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  const panelClass = useMemo(
    () =>
      expanded
        ? 'fixed inset-4 z-[300] rounded-[18px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-[0_18px_40px_rgba(0,0,0,0.12)] overflow-hidden'
        : 'fixed left-1/2 top-1/2 z-[300] w-[min(94vw,760px)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-[0_18px_40px_rgba(0,0,0,0.12)] overflow-hidden',
    [expanded]
  );

  const actionKey = (messageId: string, actionId: string) => `${messageId}:${actionId}`;
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const historyStorageKey = `ai_assistant_history_v1:${userId || 'anon'}`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(historyStorageKey);
      if (!raw) {
        setConversationHistory([]);
        return;
      }
      const parsed = JSON.parse(raw) as ConversationHistoryItem[];
      if (!Array.isArray(parsed)) {
        setConversationHistory([]);
        return;
      }
      const normalized = parsed
        .map((item: unknown) => {
          const it = (item ?? {}) as Partial<ConversationHistoryItem> & { userText?: string; assistantReply?: InboxCopilotReply; mode?: Message['mode'] };
          if (Array.isArray(it.messages)) {
            return {
              id: String(it.id || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
              title: String(it.title || 'Conversation'),
              messages: it.messages as Message[],
              createdAt: String(it.createdAt || new Date().toISOString()),
              updatedAt: String(it.updatedAt || it.createdAt || new Date().toISOString()),
            } as ConversationHistoryItem;
          }
          if (typeof it.userText === 'string' && it.assistantReply) {
            const now = new Date().toISOString();
            return {
              id: String(it.id || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
              title: it.userText.slice(0, 80),
              messages: [
                { id: `legacy-u-${Date.now()}`, role: 'user', content: it.userText },
                { id: `legacy-a-${Date.now()}`, role: 'assistant', reply: it.assistantReply, mode: it.mode },
              ],
              createdAt: String(it.createdAt || now),
              updatedAt: String(it.createdAt || now),
            } as ConversationHistoryItem;
          }
          return null;
        })
        .filter((item): item is ConversationHistoryItem => Boolean(item));
      setConversationHistory(normalized.slice(-10));
    } catch {
      setConversationHistory([]);
    }
  }, [historyStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(historyStorageKey, JSON.stringify(conversationHistory.slice(-10)));
    } catch {
      // ignore storage errors
    }
  }, [conversationHistory, historyStorageKey]);

  useEffect(() => {
    if (!currentConversationId || messages.length === 0) return;
    const nowIso = new Date().toISOString();
    const firstUserText =
      messages.find((m) => m.role === 'user' && typeof m.content === 'string')?.content?.trim() || 'Conversation';
    const title = firstUserText.length > 80 ? `${firstUserText.slice(0, 77)}...` : firstUserText;

    setConversationHistory((prev) => {
      const existing = prev.find((item) => item.id === currentConversationId);
      if (!existing) {
        return [
          ...prev,
          {
            id: currentConversationId,
            title,
            messages,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        ].slice(-10);
      }
      return prev
        .map((item) =>
          item.id === currentConversationId
            ? {
                ...item,
                title,
                messages,
                updatedAt: nowIso,
              }
            : item
        )
        .slice(-10);
    });
  }, [messages, currentConversationId]);

  const pushAssistantMessage = (
    reply: InboxCopilotReply,
    mode?: 'answer_only' | 'answer_with_suggested_actions'
  ) => {
    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: Message = { id: assistantId, role: 'assistant', reply, mode };
    setMessages((prev) => [...prev, assistantMessage]);
    return assistantId;
  };

  const buildContextSummary = () => {
    const active = tasks.filter((t) => t.status !== 'done');
    const today = formatDateKey(new Date());
    const overdue = active.filter((t) => t.deadline && t.deadline < today).length;
    const noDate = active.filter((t) => !t.deadline).length;
    const doing = active.filter((t) => t.status === 'doing').length;
    return `active=${active.length}; overdue=${overdue}; no_date=${noDate}; doing=${doing}`;
  };

  const buildConversationSummary = () => {
    const recent = messages.slice(-8).map((m) => {
      if (m.role === 'user') return `user: ${String(m.content || '').slice(0, 160)}`;
      const answer = String(m.reply?.answer || '').replace(/\s+/g, ' ').slice(0, 180);
      return `assistant: ${answer}`;
    });
    return recent.join('\n');
  };

  const clearConversationHistory = () => {
    setConversationHistory([]);
    try {
      localStorage.removeItem(historyStorageKey);
    } catch {
      // ignore storage errors
    }
  };

  const loadHistoryIntoConversation = (item: ConversationHistoryItem) => {
    setMessages(item.messages);
    setCurrentConversationId(item.id);
    setPendingFollowUp(null);
    setInput('');
  };

  const buildAppliedActionsSummary = () => {
    const recent = [...appliedHistory].slice(-8);
    if (recent.length === 0) return 'none';
    return recent
      .map((entry) => {
        const action = findActionFromMessage(entry.messageId, entry.actionId);
        return action ? `${action.skill}: ${action.label}` : `${entry.actionId}`;
      })
      .join(' | ');
  };

  const routeResponseMode = async (message: string): Promise<'answer_only' | 'answer_with_suggested_actions'> => {
    try {
      const res = await fetch('/api/agent/route-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, contextSummary: buildContextSummary() }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.mode === 'answer_only' || data?.mode === 'answer_with_suggested_actions') return data.mode;
    } catch {
      // fallback below
    }
    const lower = message.toLowerCase();
    const actionLike = /(move|set|change|apply|plan|declutter|clean up|cleanup|rewrite|clarify|defer|batch|mark|update)/.test(lower);
    return actionLike ? 'answer_with_suggested_actions' : 'answer_only';
  };

  const suggestNextAssistOptions = async (fromSkills: string[]): Promise<NextAssistResponse> => {
    try {
      const res = await fetch('/api/agent/next-assist-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextSummary: buildContextSummary(),
          fromActionSkills: fromSkills,
          recentUserMessages: messages.filter((m) => m.role === 'user').slice(-5).map((m) => m.content || ''),
          conversationSummary: buildConversationSummary(),
          appliedActionsSummary: buildAppliedActionsSummary(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data?.options) && data.options.length > 0) {
        const options = data.options
          .map((opt: unknown) => {
            const option = (opt ?? {}) as { key?: unknown; label?: unknown; prompt?: unknown; aliases?: unknown };
            return {
              key: String(option.key || '').trim().toLowerCase(),
              label: String(option.label || '').trim(),
              prompt: String(option.prompt || '').trim(),
              aliases: Array.isArray(option.aliases)
                ? option.aliases.map((a: unknown) => String(a || '').toLowerCase()).filter(Boolean)
                : [],
            };
          })
          .filter((opt: NextAssistOption) => opt.key && opt.label && opt.prompt);
        if (options.length > 0) {
          return {
            options: options.slice(0, 3),
            question: String(data?.question || '').trim(),
          };
        }
      }
    } catch {
      // fallback below
    }
    const options = buildFallbackAlternativeModes(fromSkills);
    return {
      options,
      question: `Do you want me to continue with ${options.map((o) => o.label.toLowerCase()).join(' or ')}?`,
    };
  };

  const findActionFromMessage = (messageId: string, actionId: string): SuggestedAction | null => {
    const msg = messages.find((m) => m.id === messageId);
    const action = msg?.reply?.actions?.find((a) => a.id === actionId);
    return action || null;
  };

  const buildPlanDraft = (action: SuggestedAction): PlanDayDraft[] => {
    const dates = nextWorkDates(5);
    const days: PlanDayDraft[] = dates.map((date) => ({
      date,
      label: date,
      tasks: [],
    }));
    const taskIds = action.taskIds || [];
    taskIds.forEach((taskId, idx) => {
      const task = taskById.get(taskId);
      if (!task) return;
      const dayIdx = idx % days.length;
      days[dayIdx].tasks.push({
        id: task.id,
        title: task.title,
        priority: task.priority || 4,
        included: true,
      });
    });
    return days;
  };

  const wasActionApplied = (messageId: string, actionId: string) => Boolean(appliedFlags[actionKey(messageId, actionId)]);

  const revertAction = async (messageId: string, action: SuggestedAction) => {
    const key = actionKey(messageId, action.id);
    const snapshots = actionUndo[key] || [];
    if (snapshots.length === 0) {
      setAppliedResult((prev) => ({ ...prev, [key]: 'Nothing to revert for this action.' }));
      return;
    }
    setIsApplying((prev) => ({ ...prev, [key]: true }));
    try {
      for (const snapshot of snapshots) {
        await onUpdateTask(snapshot);
      }
      setAppliedFlags((prev) => ({ ...prev, [key]: false }));
      setAppliedResult((prev) => ({ ...prev, [key]: `Reverted. Restored ${snapshots.length} task(s).` }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to revert action.';
      setAppliedResult((prev) => ({ ...prev, [key]: `Error: ${message}` }));
    } finally {
      setIsApplying((prev) => ({ ...prev, [key]: false }));
    }
  };

  const executeAction = async (messageId: string, action: SuggestedAction) => {
    if (!action.executable) return;
    const key = actionKey(messageId, action.id);

    setIsApplying((prev) => ({ ...prev, [key]: true }));

    try {
      const byId = new Map(tasks.map((t) => [t.id, t]));
      const targetTasks = (action.taskIds || []).map((id) => byId.get(id)).filter(Boolean) as Task[];
      const snapshots = targetTasks.map((task) => ({ ...task }));

      if (targetTasks.length === 0) {
        setAppliedResult((prev) => ({ ...prev, [key]: 'Nothing changed. No matching tasks found.' }));
        return;
      }

      const today = formatDateKey(new Date());

      if (action.skill === 'move_to_today' || action.skill === 'declutter') {
        for (const task of targetTasks) {
          await onUpdateTask({ ...task, deadline: today });
        }
        setActionUndo((prev) => ({ ...prev, [key]: snapshots }));
        setAppliedFlags((prev) => ({ ...prev, [key]: true }));
        setAppliedHistory((prev) => [...prev, { messageId, actionId: action.id }]);
        setAppliedResult((prev) => ({ ...prev, [key]: `Applied. Moved ${targetTasks.length} task(s) to Today.` }));
        return;
      }

      if (action.skill === 'move_status') {
        const status = action.status || 'doing';
        for (const task of targetTasks) {
          await onUpdateTask({ ...task, status });
        }
        setActionUndo((prev) => ({ ...prev, [key]: snapshots }));
        setAppliedFlags((prev) => ({ ...prev, [key]: true }));
        setAppliedHistory((prev) => [...prev, { messageId, actionId: action.id }]);
        setAppliedResult((prev) => ({ ...prev, [key]: `Applied. Updated ${targetTasks.length} task(s) to ${status}.` }));
        return;
      }

      if (action.skill === 'change_priority') {
        const priority = action.priority || 3;
        for (const task of targetTasks) {
          await onUpdateTask({ ...task, priority: Math.max(1, Math.min(5, priority)) as Task['priority'] });
        }
        setActionUndo((prev) => ({ ...prev, [key]: snapshots }));
        setAppliedFlags((prev) => ({ ...prev, [key]: true }));
        setAppliedHistory((prev) => [...prev, { messageId, actionId: action.id }]);
        setAppliedResult((prev) => ({ ...prev, [key]: `Applied. Set priority to P${priority} for ${targetTasks.length} task(s).` }));
        return;
      }

      if (action.skill === 'set_due_date') {
        if (!action.dueDate) {
          setAppliedResult((prev) => ({ ...prev, [key]: 'Nothing changed. Missing due date.' }));
          return;
        }
        for (const task of targetTasks) {
          await onUpdateTask({ ...task, deadline: action.dueDate });
        }
        setActionUndo((prev) => ({ ...prev, [key]: snapshots }));
        setAppliedFlags((prev) => ({ ...prev, [key]: true }));
        setAppliedHistory((prev) => [...prev, { messageId, actionId: action.id }]);
        setAppliedResult((prev) => ({ ...prev, [key]: `Applied. Set due date to ${action.dueDate} for ${targetTasks.length} task(s).` }));
        return;
      }

      if (action.skill === 'rewrite_title') {
        const titleByTaskId = action.titleByTaskId || {};
        const rewriteTargets = targetTasks.filter((task) => typeof titleByTaskId[task.id] === 'string');
        if (rewriteTargets.length === 0) {
          setAppliedResult((prev) => ({ ...prev, [key]: 'Nothing changed. No title suggestions found.' }));
          return;
        }
        for (const task of rewriteTargets) {
          const nextTitle = titleByTaskId[task.id];
          await onUpdateTask({ ...task, title: nextTitle });
        }
        setActionUndo((prev) => ({ ...prev, [key]: rewriteTargets.map((t) => ({ ...t })) }));
        setAppliedFlags((prev) => ({ ...prev, [key]: true }));
        setAppliedHistory((prev) => [...prev, { messageId, actionId: action.id }]);
        setAppliedResult((prev) => ({ ...prev, [key]: `Applied. Rewrote ${rewriteTargets.length} task title(s).` }));
        return;
      }

      if (action.skill === 'clarify_task') {
        const titleByTaskId = action.titleByTaskId || {};
        const clarifyTargets = targetTasks.filter((task) => typeof titleByTaskId[task.id] === 'string');
        if (clarifyTargets.length === 0) {
          setAppliedResult((prev) => ({ ...prev, [key]: 'Nothing changed. No clarification suggestions found.' }));
          return;
        }
        for (const task of clarifyTargets) {
          const nextTitle = titleByTaskId[task.id];
          await onUpdateTask({ ...task, title: nextTitle });
        }
        setActionUndo((prev) => ({ ...prev, [key]: clarifyTargets.map((t) => ({ ...t })) }));
        setAppliedFlags((prev) => ({ ...prev, [key]: true }));
        setAppliedHistory((prev) => [...prev, { messageId, actionId: action.id }]);
        setAppliedResult((prev) => ({ ...prev, [key]: `Applied. Clarified ${clarifyTargets.length} task(s).` }));
        return;
      }

      if (action.skill === 'defer_task') {
        const deferDate = action.dueDate || (() => {
          const nextWeek = new Date();
          nextWeek.setDate(nextWeek.getDate() + 7);
          return formatDateKey(nextWeek);
        })();
        for (const task of targetTasks) {
          await onUpdateTask({ ...task, deadline: deferDate });
        }
        setActionUndo((prev) => ({ ...prev, [key]: snapshots }));
        setAppliedFlags((prev) => ({ ...prev, [key]: true }));
        setAppliedHistory((prev) => [...prev, { messageId, actionId: action.id }]);
        setAppliedResult((prev) => ({ ...prev, [key]: `Applied. Deferred ${targetTasks.length} task(s) to ${deferDate}.` }));
        return;
      }

      if (action.skill === 'auto_plan') {
        const draft = planDrafts[key] || buildPlanDraft(action);
        const includedAssignments = draft.flatMap((day) =>
          day.tasks.filter((t) => t.included).map((t) => ({ date: day.date, taskId: t.id }))
        );
        if (includedAssignments.length === 0) {
          setAppliedResult((prev) => ({ ...prev, [key]: 'Nothing changed. No selected tasks in the weekly plan.' }));
          return;
        }

        const includedTasks = includedAssignments.map((a) => byId.get(a.taskId)).filter(Boolean) as Task[];
        const autoSnapshots = includedTasks.map((task) => ({ ...task }));
        for (const assignment of includedAssignments) {
          const task = byId.get(assignment.taskId);
          if (!task) continue;
          await onUpdateTask({ ...task, deadline: assignment.date });
        }
        setActionUndo((prev) => ({ ...prev, [key]: autoSnapshots }));
        setAppliedFlags((prev) => ({ ...prev, [key]: true }));
        setAppliedHistory((prev) => [...prev, { messageId, actionId: action.id }]);
        setAppliedResult((prev) => ({ ...prev, [key]: `Applied. Planned ${includedAssignments.length} task(s) across this week.` }));
        return;
      }

      setAppliedResult((prev) => ({ ...prev, [key]: 'No supported action applied.' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply action.';
      setAppliedResult((prev) => ({ ...prev, [key]: `Error: ${message}` }));
    } finally {
      setIsApplying((prev) => ({ ...prev, [key]: false }));
    }
  };

  const applyAllActionsForMessage = async (messageId: string, actions: SuggestedAction[]) => {
    const executable = actions.filter((a) => a.executable);
    if (executable.length === 0) return 'Nothing changed. No executable actions available.';

    const remaining = executable.filter((a) => !wasActionApplied(messageId, a.id));
    if (remaining.length === 0) return 'Applied already. All suggested actions were already applied.';

    const allKey = actionKey(messageId, '__all__');
    setIsApplying((prev) => ({ ...prev, [allKey]: true }));
    try {
      for (const action of remaining) {
        await executeAction(messageId, action);
      }
      return `Applied. ${remaining.length} action(s) were applied.`;
    } finally {
      setIsApplying((prev) => ({ ...prev, [allKey]: false }));
    }
  };

  const submitMessage = async () => {
    const text = input.trim();
    if (!text) return;

    if (!currentConversationId) {
      setCurrentConversationId(`conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    const textNormalized = text.toLowerCase().trim();
    const yesLike = /^(yes|yep|yeah|sure|ok|okay|please do|go ahead|apply|apply all)\b/.test(textNormalized);
    const showActionsLike = /(show actions|show suggested|show options|show me actions)/.test(textNormalized);
    const applyAllLike = /^(apply all|do all|do that|apply them)\b/.test(textNormalized);
    const applyFirstLike = /(apply (the )?(first|1st|one)|do the first)/.test(textNormalized);
    const undoLike = /^(undo|undo that|revert|revert that)\b/.test(textNormalized);
    const latestAssistantWithActions = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant' && (m.reply?.actions?.length || 0) > 0);

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsThinking(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (showActionsLike) {
      const hidden = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant' && (m.reply?.actions?.length || 0) > 0 && actionsVisibleByMessage[m.id] === false);
      if (hidden) {
        setActionsVisibleByMessage((prev) => ({ ...prev, [hidden.id]: true }));
        setPendingFollowUp({ type: 'apply_actions', messageId: hidden.id });
        pushAssistantMessage({
          understanding: 'You asked to see suggested actions.',
          known: [],
          inferred: [],
          answer: 'I have shown the suggested actions for the latest answer.',
          actions: [],
          confirmation: 'You can apply one action, apply all, or say undo later.',
        });
        setIsThinking(false);
        return;
      }
    }

    if (applyAllLike && latestAssistantWithActions?.reply) {
      const status = await applyAllActionsForMessage(latestAssistantWithActions.id, latestAssistantWithActions.reply.actions || []);
      pushAssistantMessage({
        understanding: 'You asked to apply all suggested actions.',
        known: [],
        inferred: [],
        answer: status,
        actions: [],
        confirmation: 'If you want, I can suggest a different action set next.',
      });
      setPendingFollowUp({ type: 'different_action_set', fromMessageId: latestAssistantWithActions.id, fromActionSkills: (latestAssistantWithActions.reply.actions || []).map((a) => a.skill) });
      setIsThinking(false);
      return;
    }

    if (applyFirstLike && latestAssistantWithActions?.reply) {
      const first = (latestAssistantWithActions.reply.actions || []).find((a) => a.executable);
      if (first) {
        await executeAction(latestAssistantWithActions.id, first);
        pushAssistantMessage({
          understanding: 'You asked to apply the first suggested action.',
          known: [],
          inferred: [],
          answer: `Applied "${first.label}".`,
          actions: [],
          confirmation: 'If you want, I can apply the rest or suggest a different set.',
        });
      }
      setIsThinking(false);
      return;
    }

    if (undoLike) {
      const last = [...appliedHistory].reverse()[0];
      if (last) {
        const action = findActionFromMessage(last.messageId, last.actionId);
        if (action) {
          await revertAction(last.messageId, action);
          setAppliedHistory((prev) => {
            const idx = prev.findIndex((it) => it.messageId === last.messageId && it.actionId === last.actionId);
            if (idx === -1) return prev;
            const copy = [...prev];
            copy.splice(idx, 1);
            return copy;
          });
          pushAssistantMessage({
            understanding: 'You asked to undo the latest applied action.',
            known: [],
            inferred: [],
            answer: `Reverted "${action.label}".`,
            actions: [],
            confirmation: 'You can continue or ask for new suggestions.',
          });
          setIsThinking(false);
          return;
        }
      }
      pushAssistantMessage({
        understanding: 'You asked to undo.',
        known: [],
        inferred: [],
        answer: 'I could not find a recent applied action to undo.',
        actions: [],
        confirmation: 'Try applying an action first, then ask undo.',
      });
      setIsThinking(false);
      return;
    }

    if (yesLike && pendingFollowUp?.type === 'different_action_set') {
      const nextAssist = await suggestNextAssistOptions(pendingFollowUp.fromActionSkills);
      const options = nextAssist.options;
      const defaultHint = options.map((option, idx) => `(${idx + 1}) ${option.label}`).join(', or ');
      const dynamicQuestion = nextAssist.question?.trim() || `Great. I can do one of these next: ${defaultHint}`;
      const optionLines = options.map((option, idx) => `${idx + 1}. ${option.label}`).join('\n');

      const choiceReply: InboxCopilotReply = {
        understanding: 'You want another helpful action set after applying the last one.',
        known: ['I can continue with a different assistant mode.'],
        inferred: [],
        answer: `${dynamicQuestion}\n\nNext steps I can run now:\n${optionLines}`,
        actions: [],
        confirmation: `You can reply with a number (1-${options.length}) or the mode name.`,
      };
      pushAssistantMessage(choiceReply);
      setPendingFollowUp({ type: 'choose_next_assist_mode', options });
      setIsThinking(false);
      return;
    }

    if (pendingFollowUp?.type === 'choose_next_assist_mode') {
      const lower = text.toLowerCase();
      const numericChoiceMatch = lower.match(/\b([1-3])\)?\b/);
      const numericIndex = numericChoiceMatch ? Number(numericChoiceMatch[1]) - 1 : -1;
      const selectedOption = pendingFollowUp.options.find(
        (option) =>
          lower.includes(option.key) ||
          option.aliases.some((alias) => lower.includes(alias))
      ) || (numericIndex >= 0 ? pendingFollowUp.options[numericIndex] : undefined);
      const modePrompt = selectedOption?.prompt || null;

      if (!modePrompt) {
        const aliases = pendingFollowUp.options.map((o) => `"${o.key}"`).join(' / ');
        const nudgeReply: InboxCopilotReply = {
          understanding: 'I am waiting for your mode selection.',
          known: [],
          inferred: [],
          answer: 'Please choose one mode so I can continue.',
          actions: [],
          confirmation: `Reply with ${aliases}.`,
        };
        pushAssistantMessage(nudgeReply);
        setIsThinking(false);
        return;
      }

      const reply = buildInboxCopilotReply(tasks, modePrompt);
      const nextAssistantId = pushAssistantMessage(reply);
      if ((reply.actions || []).length > 0) {
        setPendingFollowUp({ type: 'apply_actions', messageId: nextAssistantId });
      } else {
        setPendingFollowUp(null);
      }
      setIsThinking(false);
      return;
    }

    if (yesLike && (pendingFollowUp?.type === 'apply_actions' || latestAssistantWithActions?.reply)) {
      const assistantId = pendingFollowUp?.type === 'apply_actions' ? pendingFollowUp.messageId : latestAssistantWithActions!.id;
      const targetMessage = messages.find((m) => m.id === assistantId) || latestAssistantWithActions;
      const targetActions = targetMessage?.reply?.actions || [];
      const statusText = await applyAllActionsForMessage(assistantId, targetActions);
      const allAppliedAlready = statusText.startsWith('Applied already');

      const memoryReply: InboxCopilotReply = {
        understanding: 'You want me to apply the suggested actions from the previous step.',
        known: ['I checked the latest pending action set in this conversation memory and its apply state.'],
        inferred: [],
        answer: statusText,
        actions: [],
        confirmation: allAppliedAlready
          ? 'If you want, I can suggest a different action set.'
          : 'Applied. If you want, I can now suggest a different action set.',
      };
      pushAssistantMessage(memoryReply);
      const appliedFromSkills = (targetActions || []).map((a) => a.skill);
      setPendingFollowUp({
        type: 'different_action_set',
        fromMessageId: assistantId,
        fromActionSkills: appliedFromSkills,
      });
      setIsThinking(false);
      return;
    }

    const mode = await routeResponseMode(text);
    const reply = buildInboxCopilotReply(tasks, text);
    const assistantMessageId = pushAssistantMessage(reply, mode);
    const autoPlanActions = (reply.actions || []).filter((a) => a.skill === 'auto_plan');
    if (autoPlanActions.length > 0) {
      setPlanDrafts((prev) => {
        const next = { ...prev };
        autoPlanActions.forEach((action) => {
          const key = actionKey(assistantMessageId, action.id);
          if (!next[key]) next[key] = buildPlanDraft(action);
        });
        return next;
      });
    }
    if ((reply.actions || []).length > 0 && mode === 'answer_with_suggested_actions') {
      setPendingFollowUp({ type: 'apply_actions', messageId: assistantMessageId });
    } else {
      setPendingFollowUp(null);
    }
    if ((reply.actions || []).length > 0) {
      setActionsVisibleByMessage((prev) => ({ ...prev, [assistantMessageId]: mode === 'answer_with_suggested_actions' }));
    }
    setIsThinking(false);
  };

  const onPromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submitMessage();
    }
  };

  const clearContext = () => {
    setMessages([]);
    setInput('');
    setAppliedResult({});
    setIsApplying({});
    setAppliedFlags({});
    setActionUndo({});
    setPlanDrafts({});
    setDraggingPlan(null);
    setPendingFollowUp(null);
    setActionsVisibleByMessage({});
    setAppliedHistory([]);
    setCurrentConversationId(null);
  };

  const togglePlanTaskIncluded = (key: string, taskId: string) => {
    setPlanDrafts((prev) => {
      const draft = prev[key];
      if (!draft) return prev;
      return {
        ...prev,
        [key]: draft.map((day) => ({
          ...day,
          tasks: day.tasks.map((task) =>
            task.id === taskId ? { ...task, included: !task.included } : task
          ),
        })),
      };
    });
  };

  const movePlanTask = (key: string, fromDate: string, toDate: string, taskId: string) => {
    if (fromDate === toDate) return;
    setPlanDrafts((prev) => {
      const draft = prev[key];
      if (!draft) return prev;
      const fromDay = draft.find((d) => d.date === fromDate);
      const toDay = draft.find((d) => d.date === toDate);
      if (!fromDay || !toDay) return prev;
      const task = fromDay.tasks.find((t) => t.id === taskId);
      if (!task) return prev;

      return {
        ...prev,
        [key]: draft.map((day) => {
          if (day.date === fromDate) {
            return { ...day, tasks: day.tasks.filter((t) => t.id !== taskId) };
          }
          if (day.date === toDate) {
            return { ...day, tasks: [...day.tasks, task] };
          }
          return day;
        }),
      };
    });
  };

  return (
    <>
      {isOpen && (
        <div className={panelClass}>
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-neutral-50/70 dark:bg-gray-900 flex items-start justify-between">
            <div className="min-w-0">
              <h3 className="text-base font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <Sparkles size={16} />
                AI Assistant
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">Grounded inbox copilot with explicit actions and confirmation.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1"
                aria-label={expanded ? 'Shrink' : 'Expand'}
              >
                {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex flex-col h-[calc(85vh-120px)]">
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  <Sparkles size={32} className="mx-auto mb-3 text-gray-400" />
                  <p className="text-sm">Ask anything about your inbox. I will answer from real task context only.</p>
                  <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setInput(prompt)}
                        className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] border border-[var(--accent-border)] flex items-center justify-center">
                      <Sparkles size={16} />
                    </div>
                  )}

                  {msg.role === 'user' ? (
                    <div className="max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed accent-solid-btn">{msg.content}</div>
                  ) : (
                    <div className="max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 space-y-3">
                      <details className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                        <summary className="list-none cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5"><Brain size={12} /> Thinking</span>
                          <ChevronDown size={14} />
                        </summary>
                        <div className="px-3 pb-3 space-y-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Understanding</p>
                            <p>{msg.reply?.understanding}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">What I know</p>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {(msg.reply?.known || []).map((line) => (
                                <li key={`${msg.id}-known-${line}`}>{line}</li>
                              ))}
                            </ul>
                          </div>
                          {(msg.reply?.inferred || []).length > 0 && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">What I inferred</p>
                              <ul className="list-disc pl-4 space-y-0.5">
                                {(msg.reply?.inferred || []).map((line) => (
                                  <li key={`${msg.id}-infer-${line}`}>{line}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </details>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Answer</p>
                        <p className="whitespace-pre-line">{msg.reply?.answer}</p>
                      </div>

                      {(msg.reply?.actions || []).length > 0 && (actionsVisibleByMessage[msg.id] ?? true) && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Suggested actions</p>
                          <button
                            type="button"
                            onClick={() => void applyAllActionsForMessage(msg.id, msg.reply?.actions || [])}
                            disabled={Boolean(isApplying[actionKey(msg.id, '__all__')])}
                            className="w-full px-3 py-2 rounded-md text-xs font-semibold border accent-solid-btn disabled:opacity-60"
                          >
                            {isApplying[actionKey(msg.id, '__all__')] ? (
                              <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Applying all…</span>
                            ) : (
                              'Apply all actions'
                            )}
                          </button>
                          {(msg.reply?.actions || []).map((action) => {
                            const key = actionKey(msg.id, action.id);
                            const applying = Boolean(isApplying[key]);
                            const result = appliedResult[key];
                            const applied = wasActionApplied(msg.id, action.id);
                            const planDraft = action.skill === 'auto_plan' ? planDrafts[key] || [] : [];
                            return (
                              <div key={action.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 bg-white dark:bg-gray-900">
                                {action.skill === 'auto_plan' && planDraft.length > 0 && (
                                  <div className="mb-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                                      Weekly plan preview (drag tasks across days)
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                                      {planDraft.map((day) => (
                                        <div
                                          key={`${key}-${day.date}`}
                                          className="rounded-md border border-gray-200 dark:border-gray-700 p-2 bg-gray-50/70 dark:bg-gray-800/50 min-h-[120px]"
                                          onDragOver={(e) => e.preventDefault()}
                                          onDrop={(e) => {
                                            e.preventDefault();
                                            if (!draggingPlan || draggingPlan.key !== key) return;
                                            movePlanTask(key, draggingPlan.fromDate, day.date, draggingPlan.taskId);
                                            setDraggingPlan(null);
                                          }}
                                        >
                                          <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1.5">{day.label}</p>
                                          <div className="space-y-1.5">
                                            {day.tasks.map((task) => (
                                              <div
                                                key={`${key}-${day.date}-${task.id}`}
                                                draggable
                                                onDragStart={() => setDraggingPlan({ key, fromDate: day.date, taskId: task.id })}
                                                onDragEnd={() => setDraggingPlan(null)}
                                                className={clsx(
                                                  'rounded-md border p-1.5 text-xs cursor-grab active:cursor-grabbing bg-white dark:bg-gray-900',
                                                  task.included
                                                    ? 'border-gray-200 dark:border-gray-700'
                                                    : 'border-gray-100 dark:border-gray-800 opacity-50'
                                                )}
                                              >
                                                <label className="flex items-start gap-1.5">
                                                  <input
                                                    type="checkbox"
                                                    checked={task.included}
                                                    onChange={() => togglePlanTaskIncluded(key, task.id)}
                                                    className="mt-0.5 rounded border-gray-300"
                                                  />
                                                  <span className="leading-tight">{task.title}</span>
                                                </label>
                                              </div>
                                            ))}
                                            {day.tasks.length === 0 && (
                                              <p className="text-[11px] text-gray-400 italic">No tasks</p>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium">{action.label}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{action.description}</p>
                                    {Array.isArray(action.taskIds) && action.taskIds.length > 0 && (
                                      <div className="mt-2 space-y-1">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                          Tasks in this action
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {action.taskIds.slice(0, 6).map((taskId) => {
                                            const task = taskById.get(taskId);
                                            const title = task?.title || taskId;
                                            const rewritten = action.titleByTaskId?.[taskId];
                                            return (
                                              <span
                                                key={`${key}-${taskId}`}
                                                className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-700 dark:text-gray-300"
                                                title={rewritten ? `${title} -> ${rewritten}` : title}
                                              >
                                                {rewritten ? `${title} -> ${rewritten}` : title}
                                              </span>
                                            );
                                          })}
                                          {action.taskIds.length > 6 && (
                                            <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                              +{action.taskIds.length - 6} more
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    {action.skill === 'break_into_subtasks' &&
                                      action.subtasksByTaskId &&
                                      Object.keys(action.subtasksByTaskId).length > 0 && (
                                        <div className="mt-2 space-y-1">
                                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                            Suggested subtasks
                                          </p>
                                          <ul className="list-disc pl-4 text-[11px] text-gray-600 dark:text-gray-300 space-y-0.5">
                                            {Object.values(action.subtasksByTaskId).flat().slice(0, 6).map((line, idx) => (
                                              <li key={`${key}-subtask-${idx}`}>{line}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                  </div>
                                  <button
                                    type="button"
                                    disabled={(!action.executable && !applied) || applying}
                                    onClick={() => void (applied ? revertAction(msg.id, action) : executeAction(msg.id, action))}
                                    className={clsx(
                                      'px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors',
                                      applied
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                        : action.executable
                                        ? 'accent-solid-btn'
                                        : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800',
                                      applying && 'opacity-80'
                                    )}
                                  >
                                    {applying ? (
                                      <Loader2 size={13} className="animate-spin" />
                                    ) : applied ? (
                                      'Applied'
                                    ) : action.executable ? (
                                      'Apply'
                                    ) : (
                                      'Unavailable'
                                    )}
                                  </button>
                                </div>
                                {action.missingInfo && (
                                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">Missing info: {action.missingInfo}</p>
                                )}
                                {result && <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1.5">{result}</p>}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {(msg.reply?.actions || []).length > 0 && !(actionsVisibleByMessage[msg.id] ?? true) && (
                        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Suggested actions are hidden for this advice-style answer.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setActionsVisibleByMessage((prev) => ({ ...prev, [msg.id]: true }));
                              setPendingFollowUp({ type: 'apply_actions', messageId: msg.id });
                            }}
                            className="mt-2 px-3 py-1.5 rounded-md text-xs font-semibold border accent-solid-btn"
                          >
                            Show suggested actions
                          </button>
                        </div>
                      )}

                      <p className="text-sm font-medium">
                        {(msg.reply?.actions || []).length > 0 && !(actionsVisibleByMessage[msg.id] ?? true)
                          ? 'If you want, tap "Show suggested actions".'
                          : msg.reply?.confirmation}
                      </p>
                    </div>
                  )}
                </div>
              ))}

              {isThinking && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] border border-[var(--accent-border)] flex items-center justify-center">
                    <Sparkles size={16} />
                  </div>
                  <div className="max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Agent thinking...
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 p-4 bg-white dark:bg-gray-900">
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onPromptKeyDown}
                  placeholder="Ask about inbox: urgent tasks, what to do next, declutter, due dates..."
                  className="flex-1 min-h-[44px] max-h-32 px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]/30 resize-none"
                  rows={1}
                  disabled={!userId || isThinking}
                />
                <button
                  type="button"
                  onClick={clearContext}
                  disabled={messages.length === 0 && !input}
                  className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors flex items-center justify-center"
                  title="Clear context"
                >
                  <Eraser size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => void submitMessage()}
                  disabled={!userId || !input.trim() || isThinking}
                  className="px-4 py-2 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] hover:bg-[var(--accent-solid)] hover:text-[var(--accent-solid-foreground)] disabled:opacity-50 transition-colors flex items-center justify-center"
                >
                  {isThinking ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
              {!userId && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Sign in to use chat UI.</p>}
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setShowActivity((v) => !v)}
                className="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <History size={14} />
                  <span>View activity</span>
                </div>
                <ChevronDown size={14} className={`transition-transform duration-200 ${showActivity ? 'rotate-180' : ''}`} />
              </button>

              {showActivity && (
                <div className="px-4 pb-3 max-h-48 overflow-y-auto">
                  <div className="mb-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={clearConversationHistory}
                      disabled={conversationHistory.length === 0}
                      className="px-2 py-1 rounded-md text-[11px] border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                    >
                      Clear history
                    </button>
                  </div>
                  {conversationHistory.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400 py-2">No activity yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {[...conversationHistory]
                        .slice()
                        .reverse()
                        .map((item) => (
                          <div
                            key={`activity-${item.id}`}
                            className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 text-xs text-gray-700 dark:text-gray-200"
                          >
                            <div className="font-medium text-gray-800 dark:text-gray-100 truncate">{item.title}</div>
                            <div className="text-gray-500 dark:text-gray-400 mt-1">
                              {item.messages.filter((m) => m.role === 'user').length} user messages ·{' '}
                              {item.messages.filter((m) => m.role === 'assistant').length} assistant replies
                            </div>
                            <div className="text-gray-400 dark:text-gray-500 mt-1 line-clamp-2">
                              {item.messages
                                .filter((m) => m.role === 'assistant' && m.reply?.answer)
                                .slice(-1)[0]
                                ?.reply?.answer || 'No assistant response yet'}
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-[10px] text-gray-400">{new Date(item.updatedAt).toLocaleString()}</span>
                              <button
                                type="button"
                                onClick={() => loadHistoryIntoConversation(item)}
                                className="px-2 py-1 rounded-md text-[11px] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                              >
                                Load into chat
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-6 md:bottom-4 right-4 md:right-20 z-[300] p-3 rounded-full shadow-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] hover:bg-[var(--accent-solid)] hover:text-[var(--accent-solid-foreground)] transition-colors"
        title="AI assistant"
      >
        <Sparkles size={20} />
      </button>
    </>
  );
}
