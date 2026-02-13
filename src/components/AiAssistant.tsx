'use client';

import { useMemo, useState } from 'react';
import {
  Sparkles,
  Loader2,
  Send,
  X,
  CheckCircle2,
  Trash2,
  ListChecks,
  AlertTriangle,
} from 'lucide-react';
import { Task } from '@/types/task';
import { Project, CreateProjectInput } from '@/types/project';
import { formatDateKey } from '@/lib/dateKey';
import { supabase } from '@/lib/supabase';
import { PlanningPreferences } from '@/types/planningPreferences';
import {
  detectAgentIntent,
  findTaskCandidatesForDelete,
  getInboxTasks,
  rankInboxTasks,
} from '@/lib/assistantAgent';

type PlannedTask = {
  title: string;
  reason: string;
  estimated_minutes: number;
  project: string;
  priority: 1 | 2 | 3 | 4 | 5;
  is_assumption?: boolean;
};

type WeekPlanDay = {
  day: string;
  date: string;
  tasks: PlannedTask[];
};

interface AiAssistantProps {
  userId?: string;
  tasks: Task[];
  projects: Project[];
  addProject: (input: CreateProjectInput) => Promise<Project | undefined>;
  onAddTasks: (tasks: Task[]) => Promise<void> | void;
  onDeleteTask: (taskId: string) => Promise<void> | void;
  proOverride?: boolean;
  planningPreferences: PlanningPreferences;
}

type PanelMode = 'idle' | 'plan' | 'priorities' | 'delete' | 'clear';

export function AiAssistant({
  userId,
  tasks,
  projects,
  addProject,
  onAddTasks,
  onDeleteTask,
  proOverride = false,
  planningPreferences,
}: AiAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistantMessage, setAssistantMessage] = useState<string>('What do you want to do today?');

  const [mode, setMode] = useState<PanelMode>('idle');

  const [weekPlan, setWeekPlan] = useState<WeekPlanDay[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [selectedPlanTasks, setSelectedPlanTasks] = useState<Set<string>>(new Set());
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  const [priorityTasks, setPriorityTasks] = useState<Task[]>([]);

  const [deleteCandidates, setDeleteCandidates] = useState<Task[]>([]);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const [clearPreviewCount, setClearPreviewCount] = useState(0);
  const [isClearing, setIsClearing] = useState(false);

  const selectedPlanCount = selectedPlanTasks.size;
  const totalPlanCount = useMemo(() => weekPlan.reduce((acc, day) => acc + day.tasks.length, 0), [weekPlan]);

  const panelClass =
    'fixed left-1/2 top-1/2 z-[300] w-[min(92vw,720px)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-[0_18px_40px_rgba(0,0,0,0.12)] overflow-hidden animate-in fade-in duration-200';

  const quickPrompts = [
    'Prioritize my inbox for today',
    'Clear inbox',
    'Delete duplicate inbox tasks',
    'Plan this week from my notes',
  ];

  const togglePlanSelected = (dayDate: string, idx: number) => {
    const key = `${dayDate}-${idx}`;
    const next = new Set(selectedPlanTasks);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedPlanTasks(next);
  };

  const toggleDeleteSelected = (taskId: string) => {
    const next = new Set(selectedDeleteIds);
    if (next.has(taskId)) next.delete(taskId);
    else next.add(taskId);
    setSelectedDeleteIds(next);
  };

  const handlePlanIntent = async () => {
    if (!input.trim()) return;

    if (!supabase) throw new Error('Supabase is not configured');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Please sign in first');

    const res = await fetch('/api/auto-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...(proOverride ? { 'x-pro-override': 'true' } : {}),
      },
      body: JSON.stringify({
        notes: input,
        startDate: formatDateKey(new Date()),
        preferences: planningPreferences,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Failed to generate plan');

    const parsedWeekPlan = (data.week_plan || []) as WeekPlanDay[];
    setMode('plan');
    setWeekPlan(parsedWeekPlan);
    setAssumptions((data.assumptions || []) as string[]);

    const all = new Set<string>();
    parsedWeekPlan.forEach((day) => {
      day.tasks.forEach((_, idx) => all.add(`${day.date}-${idx}`));
    });
    setSelectedPlanTasks(all);
    setAssistantMessage(
      `I drafted ${all.size} task${all.size === 1 ? '' : 's'} across ${parsedWeekPlan.length} day${parsedWeekPlan.length === 1 ? '' : 's'}. Review and choose what to add.`
    );
  };

  const handlePrioritiesIntent = () => {
    const ranked = rankInboxTasks(tasks, new Date()).slice(0, 8);
    setPriorityTasks(ranked);
    setMode('priorities');
    if (ranked.length === 0) {
      setAssistantMessage('Your inbox is clear. Nothing to prioritize.');
    } else {
      setAssistantMessage(`Here are your top ${ranked.length} priorities from inbox.`);
    }
  };

  const handleDeleteIntent = () => {
    const matches = findTaskCandidatesForDelete(tasks, input);
    setDeleteCandidates(matches);
    setSelectedDeleteIds(new Set(matches.map((t) => t.id)));
    setMode('delete');
    if (matches.length === 0) {
      setAssistantMessage('I could not find matching inbox tasks to delete. Try including keywords from the title.');
    } else {
      setAssistantMessage(`I found ${matches.length} matching task${matches.length === 1 ? '' : 's'}. Confirm the ones you want to delete.`);
    }
  };

  const handleClearIntent = () => {
    const inbox = getInboxTasks(tasks);
    setClearPreviewCount(inbox.length);
    setMode('clear');
    setAssistantMessage(
      inbox.length === 0
        ? 'Your inbox is already clear.'
        : `I can clear ${inbox.length} inbox task${inbox.length === 1 ? '' : 's'}. Confirm to continue.`
    );
  };

  const runAssistant = async () => {
    if (!input.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const intent = detectAgentIntent(input);
      if (intent === 'prioritize_inbox') {
        handlePrioritiesIntent();
      } else if (intent === 'delete_task') {
        handleDeleteIntent();
      } else if (intent === 'clear_inbox') {
        handleClearIntent();
      } else {
        await handlePlanIntent();
      }
    } catch (err: any) {
      setError(err?.message || 'Could not process request');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void runAssistant();
    }
  };

  const addSelectedPlanTasks = async () => {
    if (!userId) {
      setError('Please sign in to add tasks');
      return;
    }

    setIsSavingPlan(true);
    setError(null);

    try {
      const selectedTasks: Array<{ item: PlannedTask; date: string }> = [];
      weekPlan.forEach((day) => {
        day.tasks.forEach((item, idx) => {
          if (selectedPlanTasks.has(`${day.date}-${idx}`)) selectedTasks.push({ item, date: day.date });
        });
      });

      if (selectedTasks.length === 0) {
        setIsSavingPlan(false);
        return;
      }

      const projectMap = new Map<string, string>();
      projects.forEach((p) => projectMap.set(p.name.trim().toLowerCase(), p.id));

      for (const { item } of selectedTasks) {
        const name = item.project?.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (!projectMap.has(key) && name !== 'Admin') {
          const created = await addProject({ name, color: '#3b82f6' });
          if (created) projectMap.set(key, created.id);
        }
      }

      const tasksToAdd: Task[] = selectedTasks.map(({ item, date }) => ({
        id: crypto.randomUUID(),
        user_id: userId,
        title: item.title,
        description: item.reason ? `Suggested breakdown: ${item.reason}` : '',
        category: item.project?.trim() || 'Life',
        priority: item.priority,
        estimatedMinutes: item.estimated_minutes,
        energyLevel: 'medium',
        status: 'todo',
        deadline: date,
        tags: ['ai-assistant'],
        createdAt: Date.now(),
        project_id: projectMap.get(item.project.trim().toLowerCase()),
      }));

      await onAddTasks(tasksToAdd);
      setAssistantMessage(`Added ${tasksToAdd.length} task${tasksToAdd.length === 1 ? '' : 's'} to your list.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to add tasks');
    } finally {
      setIsSavingPlan(false);
    }
  };

  const deleteSelectedTasks = async () => {
    if (selectedDeleteIds.size === 0) return;
    setIsDeleting(true);
    setError(null);

    try {
      for (const taskId of selectedDeleteIds) {
        await onDeleteTask(taskId);
      }
      setAssistantMessage(`Deleted ${selectedDeleteIds.size} task${selectedDeleteIds.size === 1 ? '' : 's'}.`);
      setDeleteCandidates([]);
      setSelectedDeleteIds(new Set());
    } catch (err: any) {
      setError(err?.message || 'Failed to delete tasks');
    } finally {
      setIsDeleting(false);
    }
  };

  const clearInboxTasks = async () => {
    const inbox = getInboxTasks(tasks);
    if (inbox.length === 0) return;

    setIsClearing(true);
    setError(null);

    try {
      for (const task of inbox) {
        await onDeleteTask(task.id);
      }
      setAssistantMessage(`Cleared ${inbox.length} task${inbox.length === 1 ? '' : 's'} from inbox.`);
      setClearPreviewCount(0);
    } catch (err: any) {
      setError(err?.message || 'Failed to clear inbox');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      {isOpen && (
        <div className={panelClass}>
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-neutral-50/70 dark:bg-gray-900/40 flex items-start justify-between">
            <div className="min-w-0">
              <h3 className="text-base font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <Sparkles size={16} />
                AI Agent
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Conversational + action agent
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
              aria-label="Close AI Agent"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(85vh-120px)]">
            <div className="space-y-3">
              <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/40 rounded-lg p-3">
                {assistantMessage}
              </div>

              <label htmlFor="ai-agent-prompt" className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Prompt
              </label>
              <textarea
                id="ai-agent-prompt"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Ask me to plan, prioritize inbox, delete tasks, or clear inbox..."
                aria-label="AI Agent prompt input"
                className="w-full min-h-[120px] text-sm p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">Enter to run • Shift+Enter for new line</p>

              <div className="flex flex-wrap gap-2 pt-1">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="px-2.5 py-1.5 text-xs rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {error && (
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-100 dark:border-red-900/40">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={runAssistant}
                  disabled={isLoading || !input.trim()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-black dark:bg-white text-white dark:text-black text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={14} />}
                  Run Agent
                </button>
              </div>

              {mode === 'priorities' && priorityTasks.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold flex items-center gap-1 text-gray-600 dark:text-gray-300"><ListChecks size={14} /> Top Inbox Priorities</div>
                {priorityTasks.map((task) => (
                  <div key={task.id} className="p-2 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{task.title}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">P{task.priority}{task.deadline ? ` · Due ${task.deadline}` : ''}</p>
                  </div>
                ))}
              </div>
              )}

              {mode === 'delete' && (
              <div className="space-y-2">
                <div className="text-xs font-semibold flex items-center gap-1 text-gray-600 dark:text-gray-300"><Trash2 size={14} /> Delete Candidates</div>
                {deleteCandidates.length === 0 ? (
                  <div className="text-xs text-gray-500">No matching inbox tasks found.</div>
                ) : (
                  <>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {deleteCandidates.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => toggleDeleteSelected(task.id)}
                          className={`w-full text-left p-2 rounded-md border text-xs ${selectedDeleteIds.has(task.id) ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/40'}`}
                        >
                          <p className="font-medium text-gray-800 dark:text-gray-100">{task.title}</p>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={deleteSelectedTasks}
                      disabled={isDeleting || selectedDeleteIds.size === 0}
                      className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50"
                    >
                      {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      Delete Selected ({selectedDeleteIds.size})
                    </button>
                  </>
                )}
              </div>
              )}

              {mode === 'clear' && (
              <div className="space-y-2 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
                <p className="text-sm font-semibold flex items-center gap-1 text-amber-700 dark:text-amber-300"><AlertTriangle size={14} /> Clear Inbox</p>
                <p className="text-xs text-amber-700/90 dark:text-amber-300/90">This will delete {clearPreviewCount} inbox task{clearPreviewCount === 1 ? '' : 's'}.</p>
                <button
                  onClick={clearInboxTasks}
                  disabled={isClearing || clearPreviewCount === 0}
                  className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50"
                >
                  {isClearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Confirm Clear Inbox
                </button>
              </div>
              )}

              {mode === 'plan' && totalPlanCount > 0 && (
                <div className="space-y-3 pt-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Suggested tasks: {selectedPlanCount}/{totalPlanCount} selected</div>

                {assumptions.length > 0 && (
                  <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700">
                    <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">Assumptions</p>
                    <ul className="text-[11px] text-gray-500 dark:text-gray-400 list-disc list-inside space-y-0.5">
                      {assumptions.map((a, idx) => <li key={idx}>{a}</li>)}
                    </ul>
                  </div>
                )}

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {weekPlan.map((day) => (
                    <div key={day.date} className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                      <div className="px-2.5 py-1.5 text-[11px] font-semibold bg-gray-50 dark:bg-gray-900/40">{day.day} · {day.date}</div>
                      <div className="p-2 space-y-1.5">
                        {day.tasks.map((task, idx) => {
                          const key = `${day.date}-${idx}`;
                          const checked = selectedPlanTasks.has(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => togglePlanSelected(day.date, idx)}
                              className={`w-full text-left p-2 rounded-md border text-xs transition-colors ${checked ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/40'}`}
                            >
                              <div className="flex items-start gap-2">
                                <span className={`mt-0.5 h-3 w-3 rounded-full border ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 dark:border-gray-600'}`} />
                                <div className="min-w-0">
                                  <p className="font-semibold text-gray-800 dark:text-gray-100 truncate">{task.title}</p>
                                  <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">{task.reason}</p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addSelectedPlanTasks}
                  disabled={isSavingPlan || selectedPlanCount === 0}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {isSavingPlan ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  Add Selected Tasks
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-4 right-20 z-[300] p-3 rounded-full shadow-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        title="AI assistant"
      >
        <Sparkles size={20} />
      </button>
    </>
  );
}
