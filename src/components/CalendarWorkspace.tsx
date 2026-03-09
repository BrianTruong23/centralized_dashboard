'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import clsx from 'clsx';
import {
  CalendarCheck,
  CalendarSync,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Unlink2,
  X,
} from 'lucide-react';
import { Task } from '@/types/task';
import { Project } from '@/types/project';
import { formatDateKey } from '@/lib/dateKey';
import { supabase } from '@/lib/supabase';
import type {
  AvailabilitySummary,
  CalendarConnectionSummary,
  NormalizedCalendarEvent,
} from '@/lib/calendar/types';

type CalendarViewMode = 'month' | 'day' | 'week';
type SyncState = 'task_only' | 'calendar_only';

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
  isAllDay?: boolean;
}

interface TaskEditDraft {
  title: string;
  priority: 1 | 2 | 3 | 4 | 5;
  status: 'todo' | 'doing' | 'done';
  project_id: string;
  date: string;
  time: string;
  duration: number;
}

const START_HOUR = 7;
const END_HOUR = 21;
const ROW_HEIGHT = 64;
const GOOGLE_EVENT_COLORS = ['#d97706', '#2563eb', '#0891b2', '#16a34a', '#9333ea', '#dc2626'];

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

function addUtcDays(dateKey: string, delta: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function listDateKeys(from: string, to: string): string[] {
  const result: string[] = [];
  let current = from;
  while (current <= to) {
    result.push(current);
    current = addUtcDays(current, 1);
  }
  return result;
}

function eventLocalDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function clampEventToDisplay(event: NormalizedCalendarEvent, dayKey: string): { start: Date; end: Date } | null {
  if (event.isAllDay) {
    return {
      start: parseLocalDateTime(dayKey, `${START_HOUR}:00:00`),
      end: parseLocalDateTime(dayKey, `${END_HOUR}:00:00`),
    };
  }

  if (!event.startAt || !event.endAt) return null;
  const actualStart = new Date(event.startAt);
  const actualEnd = new Date(event.endAt);
  const dayStart = parseLocalDateTime(dayKey, `${START_HOUR}:00:00`);
  const dayEnd = parseLocalDateTime(dayKey, `${END_HOUR}:00:00`);
  return {
    start: actualStart > dayStart ? actualStart : dayStart,
    end: actualEnd < dayEnd ? actualEnd : dayEnd,
  };
}

function getStableColor(value: string, palette: string[]): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length];
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export const CalendarWorkspace = ({ tasks, projects, onUpdateTask }: CalendarWorkspaceProps) => {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [connection, setConnection] = useState<CalendarConnectionSummary>({
    provider: 'google',
    status: 'disconnected',
    readOnly: true,
    writeEnabled: false,
  });
  const [calendarEvents, setCalendarEvents] = useState<NormalizedCalendarEvent[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySummary | null>(null);
  const [calendarWarning, setCalendarWarning] = useState<string | null>(null);
  const [isStatusLoading, setIsStatusLoading] = useState(true);
  const [isEventsLoading, setIsEventsLoading] = useState(false);
  const [connectionActionLoading, setConnectionActionLoading] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editDraft, setEditDraft] = useState<TaskEditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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
  const dayKeySet = useMemo(() => new Set(dayKeys), [dayKeys]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const fetchSessionToken = useCallback(async (): Promise<string> => {
    if (!supabase) throw new Error('Supabase not configured');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Please sign in to use calendar integration');
    return session.access_token;
  }, []);

  const fetchConnectionStatus = useCallback(async () => {
    try {
      setIsStatusLoading(true);
      const token = await fetchSessionToken();
      const res = await fetch('/api/calendar/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load calendar status');
      setConnection(data.connection);
    } catch (error: unknown) {
      setConnection({
        provider: 'google',
        status: 'error',
        readOnly: true,
        writeEnabled: false,
        lastError: getErrorMessage(error, 'Calendar status is unavailable.'),
      });
    } finally {
      setIsStatusLoading(false);
    }
  }, [fetchSessionToken]);

  useEffect(() => {
    void fetchConnectionStatus();
  }, [fetchConnectionStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const status = url.searchParams.get('calendar_status');
    const message = url.searchParams.get('calendar_message');
    if (!status) return;

    if (status === 'connected') {
      void fetchConnectionStatus();
    } else if (status === 'error') {
      setConnection((prev) => ({
        ...prev,
        status: 'error',
        lastError: message || 'Calendar connection failed.',
      }));
    }

    url.searchParams.delete('calendar_status');
    url.searchParams.delete('calendar_message');
    window.history.replaceState({}, '', url.toString());
  }, [fetchConnectionStatus]);

  const fetchWindow = useMemo(() => {
    if (viewMode === 'month') {
      return {
        from: formatDateKey(startOfWeek(startOfMonth(anchorDate), { weekStartsOn: 1 })),
        to: formatDateKey(endOfWeek(endOfMonth(anchorDate), { weekStartsOn: 1 })),
      };
    }
    if (viewMode === 'day') {
      const date = formatDateKey(anchorDate);
      return { from: date, to: date };
    }
    return {
      from: formatDateKey(days[0]),
      to: formatDateKey(days[days.length - 1]),
    };
  }, [viewMode, anchorDate, days]);

  useEffect(() => {
    if (connection.status !== 'connected') {
      setCalendarEvents([]);
      setAvailability(null);
      return;
    }

    let cancelled = false;

    const loadEvents = async () => {
      try {
        setIsEventsLoading(true);
        setCalendarWarning(null);
        const token = await fetchSessionToken();
        const params = new URLSearchParams({
          from: fetchWindow.from,
          to: fetchWindow.to,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        });
        const res = await fetch(`/api/calendar/events?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Failed to load calendar events');
        if (cancelled) return;
        setConnection(data.connection);
        setCalendarEvents(Array.isArray(data.events) ? data.events : []);
        setAvailability(data.availability || null);
        setCalendarWarning(data.warning || null);
      } catch (error: unknown) {
        if (cancelled) return;
        setCalendarEvents([]);
        setAvailability(null);
        setCalendarWarning(getErrorMessage(error, 'Calendar availability is unavailable.'));
      } finally {
        if (!cancelled) setIsEventsLoading(false);
      }
    };

    void loadEvents();
    return () => {
      cancelled = true;
    };
  }, [connection.status, fetchSessionToken, fetchWindow.from, fetchWindow.to]);

  const scheduledTaskEntries = useMemo<TimelineEntry[]>(() => {
    return tasks
      .filter((task) => task.status !== 'done' && !!getTaskTimeRange(task))
      .map((task) => {
        const range = getTaskTimeRange(task)!;
        const projectColor = task.project_id ? projectById.get(task.project_id)?.color : undefined;
        return {
          id: `task-${task.id}`,
          title: task.title,
          start: range.start,
          end: range.end,
          dayKey: range.dayKey,
          source: 'task' as const,
          task,
          syncState: 'task_only' as const,
          color: projectColor || '#111827',
        };
      })
      .filter((entry) => dayKeySet.has(entry.dayKey));
  }, [tasks, dayKeySet, projectById]);

  const calendarOnlyEntries = useMemo<TimelineEntry[]>(() => {
    const timeZone = availability?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const entries: TimelineEntry[] = [];

    calendarEvents.forEach((event) => {
      const eventColor = getStableColor(event.id, GOOGLE_EVENT_COLORS);
      if (event.isAllDay && event.startDate && event.endDateExclusive) {
        let current = event.startDate;
        while (current < event.endDateExclusive) {
          if (dayKeySet.has(current)) {
            const range = clampEventToDisplay(event, current);
            if (range) {
              entries.push({
                id: `${event.id}-${current}`,
                title: event.title,
                start: range.start,
                end: range.end,
                dayKey: current,
                source: 'calendar',
                syncState: 'calendar_only',
                color: eventColor,
                isAllDay: true,
              });
            }
          }
          current = addUtcDays(current, 1);
        }
        return;
      }

      if (!event.startAt || !event.endAt) return;
      const startDate = eventLocalDate(new Date(event.startAt), timeZone);
      const endDate = eventLocalDate(new Date(event.endAt), timeZone);

      listDateKeys(startDate, endDate).forEach((dayKey) => {
        if (!dayKeySet.has(dayKey)) return;
        const range = clampEventToDisplay(event, dayKey);
        if (!range) return;
        entries.push({
          id: `${event.id}-${dayKey}`,
          title: event.title,
          start: range.start,
          end: range.end,
          dayKey,
          source: 'calendar',
          syncState: 'calendar_only',
          color: eventColor,
        });
      });
    });

    return entries;
  }, [calendarEvents, dayKeySet, availability?.timeZone]);

  const timelineEntries = useMemo(
    () => [...scheduledTaskEntries, ...calendarOnlyEntries],
    [scheduledTaskEntries, calendarOnlyEntries]
  );

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

  const connectGoogleCalendar = async () => {
    try {
      setConnectionActionLoading(true);
      const token = await fetchSessionToken();
      const returnTo = '/?view=calendar';
      const res = await fetch('/api/calendar/google/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ returnTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.authUrl) throw new Error(data?.error || 'Failed to start calendar connection');
      window.location.assign(data.authUrl);
    } catch (error: unknown) {
      setConnection((prev) => ({
        ...prev,
        status: 'error',
        lastError: getErrorMessage(error, 'Failed to start calendar connection.'),
      }));
      setConnectionActionLoading(false);
    }
  };

  const disconnectCalendar = async () => {
    if (!window.confirm('Disconnect Google Calendar and revoke stored access for this app?')) return;

    try {
      setConnectionActionLoading(true);
      const token = await fetchSessionToken();
      const res = await fetch('/api/calendar/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to disconnect calendar');
      setConnection({
        provider: 'google',
        status: 'disconnected',
        readOnly: true,
        writeEnabled: false,
      });
      setCalendarEvents([]);
      setAvailability(null);
      setCalendarWarning(data?.revoked ? null : 'Local connection removed. Remote revoke may need to be completed in Google account settings.');
    } catch (error: unknown) {
      setConnection((prev) => ({
        ...prev,
        status: 'error',
        lastError: getErrorMessage(error, 'Failed to disconnect calendar.'),
      }));
    } finally {
      setConnectionActionLoading(false);
    }
  };

  const handleDropTask = async (taskId: string, dayKey: string, hour: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const newTime = `${String(hour).padStart(2, '0')}:00:00`;
    const startAt = parseLocalDateTime(dayKey, newTime);
    const endAt = new Date(startAt.getTime() + Math.max(task.estimatedMinutes || 60, 30) * 60 * 1000);

    await Promise.resolve(
      onUpdateTask({
        ...task,
        deadline: dayKey,
        start_time: startAt.toISOString(),
        end_time: endAt.toISOString(),
        scheduled_date: dayKey,
        scheduled_time: newTime,
        due_time: newTime,
      })
    );
  };

  const openTaskEditor = (task: Task) => {
    const range = getTaskTimeRange(task);
    const date = range
      ? formatDateKey(range.start)
      : normalizeDateKey(task.scheduled_date) || normalizeDateKey(task.deadline) || formatDateKey(new Date());
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
        })
      );
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

  const showSidePanel = unscheduledTasks.length > 0 || connection.status !== 'disconnected' || !!calendarWarning;

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
            {connection.status === 'connected' ? (
              <>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm">
                  <CalendarCheck size={14} />
                  Google Calendar connected
                </div>
                <button
                  onClick={() => void disconnectCalendar()}
                  disabled={connectionActionLoading}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm disabled:opacity-60"
                >
                  <Unlink2 size={14} />
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => void connectGoogleCalendar()}
                disabled={connectionActionLoading}
                className={clsx(
                  'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm disabled:opacity-60',
                  connection.status === 'error'
                    ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                    : 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                )}
              >
                <CalendarSync size={14} />
                {connection.status === 'error' ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{headerLabel}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Calendar data is read-only and advisory. Tasks stay unchanged unless you explicitly edit them.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">Task</span>
            <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">Calendar</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              <ShieldCheck size={12} />
              Write disabled
            </span>
          </div>
        </div>

        {(connection.lastError || calendarWarning) && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            {(connection.lastError || calendarWarning)}
          </div>
        )}
      </div>

      <div className={clsx('p-4 grid grid-cols-1 gap-4', showSidePanel && 'xl:grid-cols-[1fr_320px]')}>
        <div className="overflow-auto rounded-xl border border-gray-200 dark:border-gray-700">
          {isStatusLoading || isEventsLoading ? (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading calendar view...</div>
          ) : viewMode === 'month' ? (
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
                  const monthCellMinHeight = Math.max(132, 36 + entries.length * 30);
                  return (
                    <div
                      key={dayKey}
                      className={clsx(
                        'p-2 border-t border-l first:border-l-0 border-gray-200 dark:border-gray-700',
                        !isCurrentMonth && 'bg-gray-50/40 dark:bg-gray-800/30',
                        isSameDay(day, new Date()) && 'bg-[var(--accent-soft)]/25'
                      )}
                      style={{ minHeight: monthCellMinHeight }}
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
                        {entries.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => {
                              if (entry.source === 'task' && entry.task) openTaskEditor(entry.task);
                            }}
                            className={clsx(
                              'w-full text-left rounded-md px-1.5 py-1 text-[11px] truncate text-white',
                              entry.source === 'task' ? 'cursor-pointer' : 'cursor-default'
                            )}
                            style={{ backgroundColor: entry.color }}
                            title={entry.isAllDay ? `${entry.title} (all day)` : `${entry.title} (${format(entry.start, 'HH:mm')})`}
                          >
                            <span className="opacity-90 mr-1">{entry.isAllDay ? 'All day' : format(entry.start, 'HH:mm')}</span>
                            {entry.title}
                          </button>
                        ))}
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
                        const startHour = entry.isAllDay ? START_HOUR : getHours(entry.start);
                        const startMin = entry.isAllDay ? 0 : getMinutes(entry.start);
                        const durationMin = entry.isAllDay
                          ? (END_HOUR - START_HOUR) * 60
                          : Math.max((entry.end.getTime() - entry.start.getTime()) / (60 * 1000), 30);
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
                              entry.source === 'task' ? 'cursor-pointer' : 'cursor-default'
                            )}
                            style={{ top, height, backgroundColor: entry.color }}
                            title={entry.isAllDay ? `${entry.title} (all day)` : `${entry.title} (${format(entry.start, 'HH:mm')} - ${format(entry.end, 'HH:mm')})`}
                          >
                            <div className="font-medium truncate">{entry.title}</div>
                            <div className="opacity-90">{entry.isAllDay ? 'All day' : `${format(entry.start, 'HH:mm')} - ${format(entry.end, 'HH:mm')}`}</div>
                            <div className="opacity-90 uppercase tracking-wide">
                              {entry.syncState === 'task_only' ? 'Task' : 'Calendar'}
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

        {showSidePanel && (
          <aside className="space-y-4">
            {(connection.status !== 'disconnected' || calendarWarning) && (
              <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/60 dark:bg-gray-800/40">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck size={14} className="text-gray-500 dark:text-gray-400" />
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Calendar Guardrails
                  </h3>
                </div>
                <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
                  <p>Read-only access only. The app and AI use calendar data for availability hints, not as an authority to change tasks or events.</p>
                  <p>No events are created, edited, moved, or deleted from here. Disconnect removes stored access and keeps task planning functional.</p>
                  {connection.accountEmail && <p>Connected account: {connection.accountEmail}</p>}
                  {connection.calendarTimezone && <p>Calendar timezone: {connection.calendarTimezone}</p>}
                </div>
              </section>
            )}

            {unscheduledTasks.length > 0 && (
              <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/60 dark:bg-gray-800/40">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Unscheduled Tasks
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Drag tasks into a time slot to schedule work. Calendar events stay read-only.
                </p>
                <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                  {unscheduledTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 cursor-grab active:cursor-grabbing"
                    >
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{task.title}</div>
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">P{task.priority}</span>
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">Task only</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
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

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/50 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                Editing this task changes only the app task. External calendar events remain read-only.
              </div>
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
