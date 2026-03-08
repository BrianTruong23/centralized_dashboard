'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  getHours,
  getMinutes,
  isSameDay,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import clsx from 'clsx';
import { CalendarCheck, CalendarSync, ChevronLeft, ChevronRight, Link2, Unlink2, X } from 'lucide-react';
import { Task } from '@/types/task';
import { Project } from '@/types/project';
import { formatDateKey } from '@/lib/dateKey';
import { generateId } from '@/lib/utils';

type CalendarViewMode = 'month' | 'day' | 'week';
type SyncState = 'task_only' | 'calendar_only' | 'linked';

interface GoogleCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  linkedTaskId?: string;
}

interface CalendarWorkspaceProps {
  tasks: Task[];
  projects: Project[];
  onUpdateTask: (task: Task) => Promise<void> | void;
}

interface TimelineEntry {
  id: string;
  title: string;
  start: Date;
  end: Date;
  dayKey: string;
  source: 'task' | 'calendar';
  task?: Task;
  syncState: SyncState;
  color: string;
}

interface TaskEditDraft {
  title: string;
  priority: 1 | 2 | 3 | 4 | 5;
  status: 'todo' | 'doing' | 'done';
  project_id: string;
  date: string;
  time: string;
  duration: number;
  linkGoogleEvent: boolean;
}

const CONNECTED_KEY = 'google_calendar_connected';
const SYNC_KEY = 'google_calendar_sync_enabled';
const EVENTS_KEY = 'google_calendar_events';
const START_HOUR = 7;
const END_HOUR = 21;
const ROW_HEIGHT = 64;

function parseLocalDateTime(dateKey: string, time?: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour = 9, minute = 0] = (time || '09:00:00').split(':').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hour, minute, 0, 0);
}

function normalizeDateKey(value?: string): string | null {
  if (!value) return null;
  const direct = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDateKey(parsed);
}

function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(
    date.getSeconds()
  ).padStart(2, '0')}`;
}

function getTaskTimeRange(task: Task): { start: Date; end: Date; dayKey: string } | null {
  const startFromTimestamp = toDate(task.start_time);
  if (startFromTimestamp) {
    const dayKeyFromDeadline = normalizeDateKey(task.deadline);
    const anchoredStart = dayKeyFromDeadline
      ? parseLocalDateTime(dayKeyFromDeadline, toTimeString(startFromTimestamp))
      : startFromTimestamp;

    const endFromTimestamp = toDate(task.end_time);
    const durationFromTimestamps =
      endFromTimestamp && endFromTimestamp.getTime() > startFromTimestamp.getTime()
        ? Math.round((endFromTimestamp.getTime() - startFromTimestamp.getTime()) / 60000)
        : null;
    const computedEnd = new Date(
      anchoredStart.getTime() +
        Math.max(durationFromTimestamps || task.estimatedMinutes || 60, 30) * 60 * 1000
    );

    return {
      start: anchoredStart,
      end: computedEnd,
      dayKey: dayKeyFromDeadline || formatDateKey(anchoredStart),
    };
  }

  const dateKey = normalizeDateKey(task.scheduled_date) || normalizeDateKey(task.deadline);
  if (!dateKey) return null;
  const fallbackStart = parseLocalDateTime(dateKey, task.scheduled_time || task.due_time || '09:00:00');
  const fallbackEnd = new Date(fallbackStart.getTime() + Math.max(task.estimatedMinutes || 60, 30) * 60 * 1000);
  return { start: fallbackStart, end: fallbackEnd, dayKey: formatDateKey(fallbackStart) };
}

function seedEvents(baseDate: Date): GoogleCalendarEvent[] {
  const day = formatDateKey(baseDate);
  const next = formatDateKey(addDays(baseDate, 1));
  return [
    {
      id: `gcal-${generateId()}`,
      title: 'Customer support',
      start: parseLocalDateTime(day, '09:30:00').toISOString(),
      end: parseLocalDateTime(day, '10:30:00').toISOString(),
    },
    {
      id: `gcal-${generateId()}`,
      title: 'Design meeting',
      start: parseLocalDateTime(next, '10:30:00').toISOString(),
      end: parseLocalDateTime(next, '11:30:00').toISOString(),
    },
  ];
}

export const CalendarWorkspace = ({ tasks, projects, onUpdateTask }: CalendarWorkspaceProps) => {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [googleConnected, setGoogleConnected] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(CONNECTED_KEY) === 'true';
  });
  const [syncEnabled, setSyncEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const storedSync = localStorage.getItem(SYNC_KEY);
    return storedSync === null ? true : storedSync === 'true';
  });
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(EVENTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editDraft, setEditDraft] = useState<TaskEditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CONNECTED_KEY, String(googleConnected));
    localStorage.setItem(SYNC_KEY, String(syncEnabled));
    localStorage.setItem(EVENTS_KEY, JSON.stringify(googleEvents));
  }, [googleConnected, syncEnabled, googleEvents]);

  const days = useMemo(() => {
    if (viewMode === 'day') return [startOfDay(anchorDate)];
    if (viewMode === 'month') return [];
    const weekStart = startOfWeek(anchorDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [viewMode, anchorDate]);

  const monthDays = useMemo(() => {
    if (viewMode !== 'month') return [] as Date[];
    const monthStart = startOfMonth(anchorDate);
    const monthEnd = endOfMonth(anchorDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const result: Date[] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) {
      result.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return result;
  }, [viewMode, anchorDate]);

  const dayKeys = useMemo(
    () => (viewMode === 'month' ? monthDays.map((d) => formatDateKey(d)) : days.map((d) => formatDateKey(d))),
    [viewMode, monthDays, days]
  );
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const scheduledTaskEntries = useMemo<TimelineEntry[]>(() => {
    return tasks
      .filter((task) => task.status !== 'done' && !!getTaskTimeRange(task))
      .map((task) => {
        const range = getTaskTimeRange(task)!;
        const linked = !!task.planningMetadata?.googleEventId;
        const projectColor = task.project_id ? projectById.get(task.project_id)?.color : undefined;
        return {
          id: `task-${task.id}`,
          title: task.title,
          start: range.start,
          end: range.end,
          dayKey: range.dayKey,
          source: 'task' as const,
          task,
          syncState: (linked ? 'linked' : 'task_only') as SyncState,
          color: linked ? '#047857' : projectColor || '#111827',
        };
      })
      .filter((entry) => dayKeys.includes(entry.dayKey));
  }, [tasks, dayKeys, projectById]);

  const calendarOnlyEntries = useMemo<TimelineEntry[]>(() => {
    if (!googleConnected) return [];
    return googleEvents
      .filter((evt) => !evt.linkedTaskId || !taskById.has(evt.linkedTaskId))
      .map((evt) => {
        const start = parseISO(evt.start);
        const end = parseISO(evt.end);
        return {
          id: `g-${evt.id}`,
          title: evt.title,
          start,
          end,
          dayKey: formatDateKey(start),
          source: 'calendar' as const,
          syncState: 'calendar_only' as SyncState,
          color: '#1d4ed8',
        };
      })
      .filter((entry) => dayKeys.includes(entry.dayKey));
  }, [googleConnected, googleEvents, taskById, dayKeys]);

  const timelineEntries = useMemo(() => [...scheduledTaskEntries, ...calendarOnlyEntries], [scheduledTaskEntries, calendarOnlyEntries]);

  const unscheduledTasks = useMemo(
    () => tasks.filter((task) => task.status !== 'done' && !task.scheduled_date && !task.deadline),
    [tasks]
  );

  const handleNavigate = (direction: 'prev' | 'next') => {
    setAnchorDate((prev) => {
      if (viewMode === 'month') return direction === 'next' ? addMonths(prev, 1) : subMonths(prev, 1);
      if (viewMode === 'day') return addDays(prev, direction === 'next' ? 1 : -1);
      return direction === 'next' ? addWeeks(prev, 1) : subWeeks(prev, 1);
    });
  };

  const connectGoogleCalendar = () => {
    setGoogleConnected(true);
    if (googleEvents.length === 0) setGoogleEvents(seedEvents(anchorDate));
  };

  const handleDropTask = async (taskId: string, dayKey: string, hour: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const newTime = `${String(hour).padStart(2, '0')}:00:00`;
    const startAt = parseLocalDateTime(dayKey, newTime);
    const endAt = new Date(startAt.getTime() + Math.max(task.estimatedMinutes || 60, 30) * 60 * 1000);
    let nextMetadata = { ...(task.planningMetadata || {}) };
    let nextEvents = [...googleEvents];

    if (googleConnected && syncEnabled) {
      const linkedId = task.planningMetadata?.googleEventId as string | undefined;
      const shouldSync = window.confirm(
        linkedId
          ? 'This task is linked to Google Calendar. Update the external event too?'
          : 'Create a linked Google Calendar event for this scheduled task?'
      );

      if (shouldSync) {
        const start = startAt;
        const end = endAt;
        if (linkedId) {
          nextEvents = nextEvents.map((evt) =>
            evt.id === linkedId ? { ...evt, title: task.title, start: start.toISOString(), end: end.toISOString() } : evt
          );
        } else {
          const newEvent: GoogleCalendarEvent = {
            id: `gcal-${generateId()}`,
            title: task.title,
            start: start.toISOString(),
            end: end.toISOString(),
            linkedTaskId: task.id,
          };
          nextEvents.push(newEvent);
          nextMetadata = { ...nextMetadata, googleEventId: newEvent.id };
        }
      }
    }

    await Promise.resolve(
      onUpdateTask({
        ...task,
        deadline: dayKey,
        start_time: startAt.toISOString(),
        end_time: endAt.toISOString(),
        scheduled_date: dayKey,
        scheduled_time: newTime,
        due_time: newTime,
        planningMetadata: nextMetadata,
      })
    );
    setGoogleEvents(nextEvents);
  };

  const openTaskEditor = (task: Task) => {
    const range = getTaskTimeRange(task);
    const date = range ? formatDateKey(range.start) : normalizeDateKey(task.scheduled_date) || normalizeDateKey(task.deadline) || formatDateKey(new Date());
    const rawTime = range
      ? `${String(range.start.getHours()).padStart(2, '0')}:${String(range.start.getMinutes()).padStart(2, '0')}`
      : (task.scheduled_time || task.due_time || '09:00:00').slice(0, 5);
    const duration = range
      ? Math.max(Math.round((range.end.getTime() - range.start.getTime()) / 60000), 30)
      : Math.max(task.estimatedMinutes || 60, 30);
    setEditingTask(task);
    setEditDraft({
      title: task.title,
      priority: task.priority,
      status: task.status,
      project_id: task.project_id || '',
      date,
      time: rawTime,
      duration,
      linkGoogleEvent: !!task.planningMetadata?.googleEventId,
    });
  };

  const closeTaskEditor = () => {
    setEditingTask(null);
    setEditDraft(null);
    setSavingEdit(false);
  };

  const handleSaveTaskEdit = async () => {
    if (!editingTask || !editDraft || savingEdit) return;
    setSavingEdit(true);
    try {
      const normalizedTime = editDraft.time.length === 5 ? `${editDraft.time}:00` : editDraft.time;
      const nextStartAt = parseLocalDateTime(editDraft.date, normalizedTime);
      const nextEndAt = new Date(nextStartAt.getTime() + Math.max(editDraft.duration, 30) * 60 * 1000);
      let nextMetadata = { ...(editingTask.planningMetadata || {}) };
      let nextEvents = [...googleEvents];
      const linkedId = (editingTask.planningMetadata?.googleEventId as string | undefined) || '';
      const shouldCreateLink = !linkedId && editDraft.linkGoogleEvent;

      if (googleConnected && syncEnabled && (linkedId || shouldCreateLink)) {
        const confirmed = window.confirm(
          linkedId
            ? 'This task is linked to Google Calendar. Apply these edits to the external event too?'
            : 'Create a linked Google Calendar event for this task when saving?'
        );

        if (confirmed) {
          const start = nextStartAt;
          const end = nextEndAt;
          if (linkedId) {
            nextEvents = nextEvents.map((evt) =>
              evt.id === linkedId
                ? { ...evt, title: editDraft.title, start: start.toISOString(), end: end.toISOString() }
                : evt
            );
          } else {
            const newEvent: GoogleCalendarEvent = {
              id: `gcal-${generateId()}`,
              title: editDraft.title,
              start: start.toISOString(),
              end: end.toISOString(),
              linkedTaskId: editingTask.id,
            };
            nextEvents.push(newEvent);
            nextMetadata = { ...nextMetadata, googleEventId: newEvent.id };
          }
        }
      }

      const nextProjectName = editDraft.project_id ? projectById.get(editDraft.project_id)?.name : undefined;
      await Promise.resolve(
        onUpdateTask({
          ...editingTask,
          title: editDraft.title.trim() || editingTask.title,
          priority: editDraft.priority,
          status: editDraft.status,
          project_id: editDraft.project_id || undefined,
          category: nextProjectName || editingTask.category,
          deadline: editDraft.date,
          start_time: nextStartAt.toISOString(),
          end_time: nextEndAt.toISOString(),
          scheduled_date: editDraft.date,
          due_time: normalizedTime,
          scheduled_time: normalizedTime,
          estimatedMinutes: Math.max(editDraft.duration, 30),
          planningMetadata: nextMetadata,
        })
      );
      setGoogleEvents(nextEvents);
      closeTaskEditor();
    } finally {
      setSavingEdit(false);
    }
  };

  const headerLabel =
    viewMode === 'month'
      ? format(anchorDate, 'MMMM yyyy')
      : viewMode === 'day'
      ? format(anchorDate, 'EEEE, MMM d, yyyy')
      : `${format(days[0], 'MMM d')} - ${format(days[days.length - 1], 'MMM d, yyyy')}`;

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5">
              <button
                onClick={() => setViewMode('month')}
                className={clsx('px-3 py-1.5 text-sm rounded-md', viewMode === 'month' ? 'bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] border border-[var(--accent-border)]' : 'text-gray-600 dark:text-gray-300')}
              >
                Month
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={clsx('px-3 py-1.5 text-sm rounded-md', viewMode === 'week' ? 'bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] border border-[var(--accent-border)]' : 'text-gray-600 dark:text-gray-300')}
              >
                Week
              </button>
              <button
                onClick={() => setViewMode('day')}
                className={clsx('px-3 py-1.5 text-sm rounded-md', viewMode === 'day' ? 'bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] border border-[var(--accent-border)]' : 'text-gray-600 dark:text-gray-300')}
              >
                Day
              </button>
            </div>
            <button onClick={() => handleNavigate('prev')} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => handleNavigate('next')} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!googleConnected ? (
              <button
                onClick={connectGoogleCalendar}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm"
              >
                <CalendarSync size={14} />
                Connect Google Calendar
              </button>
            ) : (
              <>
                <button
                  onClick={() => setSyncEnabled((prev) => !prev)}
                  className={clsx(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm',
                    syncEnabled
                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                  )}
                >
                  <CalendarCheck size={14} />
                  {syncEnabled ? 'Sync enabled' : 'Sync paused'}
                </button>
                <button
                  onClick={() => setGoogleConnected(false)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm"
                >
                  <Unlink2 size={14} />
                  Disconnect
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{headerLabel}</h2>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">Task only</span>
            <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Calendar only</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
              <Link2 size={12} />
              Linked
            </span>
          </div>
        </div>
      </div>

      <div className={clsx("p-4 grid grid-cols-1 gap-4", unscheduledTasks.length > 0 && "xl:grid-cols-[1fr_280px]")}>
        <div className="overflow-auto rounded-xl border border-gray-200 dark:border-gray-700">
          {viewMode === 'month' ? (
            <div className="min-w-[760px]">
              <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                  <div key={label} className="px-2 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border-l first:border-l-0 border-gray-200 dark:border-gray-700">
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthDays.map((day) => {
                  const dayKey = formatDateKey(day);
                  const entries = timelineEntries
                    .filter((entry) => entry.dayKey === dayKey)
                    .sort((a, b) => a.start.getTime() - b.start.getTime());
                  const isCurrentMonth = day.getMonth() === anchorDate.getMonth();
                  return (
                    <div
                      key={dayKey}
                      className={clsx(
                        'min-h-[132px] p-2 border-t border-l first:border-l-0 border-gray-200 dark:border-gray-700',
                        !isCurrentMonth && 'bg-gray-50/40 dark:bg-gray-800/30',
                        isSameDay(day, new Date()) && 'bg-[var(--accent-soft)]/25'
                      )}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const taskId = e.dataTransfer.getData('text/plain');
                        if (taskId) void handleDropTask(taskId, dayKey, 9);
                      }}
                    >
                      <div className={clsx('text-xs font-semibold mb-1.5', isCurrentMonth ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500')}>
                        {format(day, 'd')}
                      </div>
                      <div className="space-y-1">
                        {entries.slice(0, 3).map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => {
                              if (entry.source === 'task' && entry.task) openTaskEditor(entry.task);
                            }}
                            className={clsx(
                              'w-full text-left rounded-md px-1.5 py-1 text-[11px] truncate text-white',
                              entry.source === 'task' ? 'cursor-pointer' : 'cursor-default',
                              entry.syncState === 'linked' && 'ring-1 ring-emerald-200 dark:ring-emerald-700'
                            )}
                            style={{ backgroundColor: entry.color }}
                            title={`${entry.title} (${format(entry.start, 'HH:mm')})`}
                          >
                            <span className="opacity-90 mr-1">{format(entry.start, 'HH:mm')}</span>
                            {entry.title}
                          </button>
                        ))}
                        {entries.length > 3 && (
                          <div className="text-[11px] text-gray-500 dark:text-gray-400">+{entries.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={clsx('min-w-[640px]', viewMode === 'week' && 'min-w-[1180px]')}>
              <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                <div className="w-16 p-2 text-xs text-gray-400" />
                {days.map((day) => (
                  <div key={day.toISOString()} className="flex-1 min-w-[160px] p-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700">
                    <div>{format(day, 'EEE')}</div>
                    <div className={clsx('text-sm', isSameDay(day, new Date()) && 'text-black dark:text-white')}>{format(day, 'MMM d')}</div>
                  </div>
                ))}
              </div>

              <div className="flex">
                <div className="w-16 shrink-0">
                  {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map((hour) => (
                    <div key={hour} className="h-16 pr-2 text-right text-xs text-gray-400 border-t border-gray-100 dark:border-gray-800">
                      {format(new Date(2026, 0, 1, hour, 0, 0), 'HH:mm')}
                    </div>
                  ))}
                </div>

                {days.map((day) => {
                  const dayKey = formatDateKey(day);
                  const entries = timelineEntries.filter((entry) => entry.dayKey === dayKey);
                  return (
                    <div key={dayKey} className="relative flex-1 min-w-[160px] border-l border-gray-200 dark:border-gray-700">
                      {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map((hour) => (
                        <div
                          key={`${dayKey}-${hour}`}
                          className="h-16 border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/40"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const taskId = e.dataTransfer.getData('text/plain');
                            if (taskId) void handleDropTask(taskId, dayKey, hour);
                          }}
                        />
                      ))}

                      {entries.map((entry) => {
                        const startHour = getHours(entry.start);
                        const startMin = getMinutes(entry.start);
                        const durationMin = Math.max((entry.end.getTime() - entry.start.getTime()) / (60 * 1000), 30);
                        const top = ((startHour - START_HOUR) + startMin / 60) * ROW_HEIGHT;
                        const height = Math.max((durationMin / 60) * ROW_HEIGHT, 24);
                        return (
                          <div
                            key={entry.id}
                            draggable={entry.source === 'task' && !!entry.task}
                            onDragStart={(e) => {
                              if (entry.task) e.dataTransfer.setData('text/plain', entry.task.id);
                            }}
                            onClick={() => {
                              if (entry.source === 'task' && entry.task) openTaskEditor(entry.task);
                            }}
                            className={clsx(
                              'absolute left-1 right-1 rounded-lg px-2 py-1 text-xs text-white shadow-sm',
                              entry.source === 'task' ? 'cursor-pointer' : 'cursor-default',
                              entry.syncState === 'linked' && 'ring-1 ring-emerald-200 dark:ring-emerald-700'
                            )}
                            style={{ top, height, backgroundColor: entry.color }}
                            title={`${entry.title} (${format(entry.start, 'HH:mm')} - ${format(entry.end, 'HH:mm')})`}
                          >
                            <div className="font-medium truncate">{entry.title}</div>
                            <div className="opacity-90">{format(entry.start, 'HH:mm')} - {format(entry.end, 'HH:mm')}</div>
                            <div className="opacity-90 uppercase tracking-wide">
                              {entry.syncState === 'task_only' ? 'Task only' : entry.syncState === 'linked' ? 'Linked' : 'Calendar only'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {unscheduledTasks.length > 0 && (
        <aside className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/60 dark:bg-gray-800/40">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Unscheduled tasks
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Drag tasks into a time slot to schedule work.
          </p>
          <div className="space-y-2 max-h-[540px] overflow-auto pr-1">
            {unscheduledTasks.map((task) => {
              const linked = !!task.planningMetadata?.googleEventId;
              return (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 cursor-grab active:cursor-grabbing"
                >
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{task.title}</div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">P{task.priority}</span>
                    <span className={clsx('px-1.5 py-0.5 rounded', linked ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-gray-800')}>
                      {linked ? 'Linked' : 'Task only'}
                    </span>
                  </div>
                </div>
              );
            })}
            {unscheduledTasks.length === 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 italic">No unscheduled tasks.</div>
            )}
          </div>
        </aside>
        )}
      </div>

      {editingTask && editDraft && (
        <div className="fixed inset-0 z-[260] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Edit task</h3>
              <button
                type="button"
                onClick={closeTaskEditor}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Title</label>
                <input
                  value={editDraft.title}
                  onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Priority</label>
                  <select
                    value={editDraft.priority}
                    onChange={(e) =>
                      setEditDraft((prev) =>
                        prev ? { ...prev, priority: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 } : prev
                      )
                    }
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    {[1, 2, 3, 4, 5].map((p) => (
                      <option key={p} value={p}>
                        Priority {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Status</label>
                  <select
                    value={editDraft.status}
                    onChange={(e) =>
                      setEditDraft((prev) =>
                        prev ? { ...prev, status: e.target.value as 'todo' | 'doing' | 'done' } : prev
                      )
                    }
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="todo">To do</option>
                    <option value="doing">In progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Project</label>
                <select
                  value={editDraft.project_id}
                  onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, project_id: e.target.value } : prev))}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Date</label>
                  <input
                    type="date"
                    value={editDraft.date}
                    onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, date: e.target.value } : prev))}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Time</label>
                  <input
                    type="time"
                    value={editDraft.time}
                    onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, time: e.target.value } : prev))}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Duration (min)</label>
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={editDraft.duration}
                    onChange={(e) =>
                      setEditDraft((prev) => (prev ? { ...prev, duration: Number(e.target.value) || 30 } : prev))
                    }
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              {googleConnected && syncEnabled && (
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={editDraft.linkGoogleEvent}
                    onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, linkGoogleEvent: e.target.checked } : prev))}
                    className="rounded border-gray-300"
                  />
                  {editingTask.planningMetadata?.googleEventId ? 'Keep linked to Google Calendar' : 'Create Google Calendar event on save'}
                </label>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeTaskEditor}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveTaskEdit()}
                disabled={savingEdit}
                className="px-3 py-1.5 text-sm rounded-lg accent-solid-btn disabled:opacity-50"
              >
                {savingEdit ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
