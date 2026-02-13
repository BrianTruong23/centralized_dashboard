'use client';

import { useMemo, useState } from 'react';
import { Sparkles, Loader2, Send, X, CheckCircle2 } from 'lucide-react';
import { Task } from '@/types/task';
import { Project, CreateProjectInput } from '@/types/project';
import { formatDateKey } from '@/lib/dateKey';
import { supabase } from '@/lib/supabase';

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
  projects: Project[];
  addProject: (input: CreateProjectInput) => Promise<Project | undefined>;
  onAddTasks: (tasks: Task[]) => Promise<void> | void;
  proOverride?: boolean;
}

export function AiAssistant({ userId, projects, addProject, onAddTasks, proOverride = false }: AiAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekPlan, setWeekPlan] = useState<WeekPlanDay[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [assistantMessage, setAssistantMessage] = useState<string>('What do you want to do today?');

  const selectedCount = selected.size;
  const totalCount = useMemo(() => weekPlan.reduce((acc, day) => acc + day.tasks.length, 0), [weekPlan]);

  const toggleSelected = (dayDate: string, idx: number) => {
    const key = `${dayDate}-${idx}`;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const runAssistant = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    setError(null);
    setWeekPlan([]);
    setAssumptions([]);

    try {
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
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to generate plan');

      const parsedWeekPlan = (data.week_plan || []) as WeekPlanDay[];
      setWeekPlan(parsedWeekPlan);
      setAssumptions((data.assumptions || []) as string[]);

      const all = new Set<string>();
      parsedWeekPlan.forEach((day) => {
        day.tasks.forEach((_, idx) => all.add(`${day.date}-${idx}`));
      });
      setSelected(all);

      setAssistantMessage(
        `I drafted ${all.size} task${all.size === 1 ? '' : 's'} across ${parsedWeekPlan.length} day${parsedWeekPlan.length === 1 ? '' : 's'}. Review and choose what to add.`
      );
    } catch (err: any) {
      setError(err?.message || 'Could not generate a plan');
    } finally {
      setIsLoading(false);
    }
  };

  const addSelectedTasks = async () => {
    if (!userId) {
      setError('Please sign in to add tasks');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const selectedTasks: Array<{ item: PlannedTask; date: string }> = [];
      weekPlan.forEach((day) => {
        day.tasks.forEach((item, idx) => {
          if (selected.has(`${day.date}-${idx}`)) {
            selectedTasks.push({ item, date: day.date });
          }
        });
      });

      if (selectedTasks.length === 0) {
        setIsSaving(false);
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

      const tasks: Task[] = selectedTasks.map(({ item, date }) => {
        const projectId = projectMap.get(item.project.trim().toLowerCase());
        const steps = item.reason ? `Suggested breakdown: ${item.reason}` : '';
        return {
          id: crypto.randomUUID(),
          user_id: userId,
          title: item.title,
          description: steps,
          category: item.project?.trim() || 'Life',
          priority: item.priority,
          estimatedMinutes: item.estimated_minutes,
          energyLevel: 'medium',
          status: 'todo',
          deadline: date,
          tags: ['ai-assistant'],
          createdAt: Date.now(),
          project_id: projectId,
        };
      });

      await onAddTasks(tasks);
      setAssistantMessage(`Added ${tasks.length} task${tasks.length === 1 ? '' : 's'} to your plan.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to add tasks');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {isOpen && (
        <div className="fixed bottom-20 right-4 sm:right-20 z-[300] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><Sparkles size={14} /> AI Assistant</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Conversational planning</p>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={16} /></button>
          </div>

          <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
            <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/40 rounded-lg p-3">
              {assistantMessage}
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Example: I need to prepare a launch plan, finish payroll, and schedule gym sessions this week..."
              className="w-full h-24 text-sm p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
            />

            {error && <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-100 dark:border-red-900/40">{error}</div>}

            <button
              onClick={runAssistant}
              disabled={isLoading || !input.trim()}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-black dark:bg-white text-white dark:text-black text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={14} />}
              Generate Plan
            </button>

            {totalCount > 0 && (
              <div className="space-y-3 pt-1">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Suggested tasks: {selectedCount}/{totalCount} selected
                </div>

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
                          const checked = selected.has(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => toggleSelected(day.date, idx)}
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
                  onClick={addSelectedTasks}
                  disabled={isSaving || selectedCount === 0}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  Add Selected Tasks
                </button>
              </div>
            )}
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
