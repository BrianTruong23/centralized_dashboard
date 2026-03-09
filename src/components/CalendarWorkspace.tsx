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

interface TimedEntryLayout {
  kind: 'entry' | 'overflow';
  id: string;
  start: Date;
  end: Date;
  laneIndex: number;
  laneCount: number;
  entry?: TimelineEntry;
  hiddenEntries?: TimelineEntry[];
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
const MONTH_EVENT_PREVIEW_LIMIT = 3;
const GOOGLE_EVENT_COLORS = ['#c08457', '#7c8ea3', '#8f9b7a'];

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

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const safeHex = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;
  const red = parseInt(safeHex.slice(0, 2), 16);
  const green = parseInt(safeHex.slice(2, 4), 16);
  const blue = parseInt(safeHex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function formatEntryTime(entry: TimelineEntry): string {
  if (entry.isAllDay) return 'All day';
  return `${format(entry.start, 'HH:mm')} - ${format(entry.end, 'HH:mm')}`;
}

function getWeekLaneMetrics(laneCount: number, isAllDay: boolean): { baseInset: number; horizontalGap: number } {
  if (isAllDay) return { baseInset: 6, horizontalGap: 0 };
  if (laneCount <= 1) return { baseInset: 8, horizontalGap: 0 };
  if (laneCount === 2) return { baseInset: 6, horizontalGap: 6 };
  return { baseInset: 5, horizontalGap: 4 };
}

function buildTimedEntryLayouts(entries: TimelineEntry[]): TimedEntryLayout[] {
  const timedEntries = entries
    .filter((entry) => !entry.isAllDay)
    .sort((a, b) => {
      const startDiff = a.start.getTime() - b.start.getTime();
      if (startDiff !== 0) return startDiff;
      return a.end.getTime() - b.end.getTime();
    });

  const layouts: TimedEntryLayout[] = [];
  let groupEntries: TimelineEntry[] = [];
  let groupEnd = -Infinity;

  const flushGroup = () => {
    if (groupEntries.length === 0) return;
    const laneEndTimes: number[] = [];
    const groupAssignments: Array<{ entry: TimelineEntry; laneIndex: number }> = [];
    let groupStart = Infinity;
    let groupMaxEnd = -Infinity;

    groupEntries.forEach((entry) => {
      let laneIndex = laneEndTimes.findIndex((laneEnd) => laneEnd <= entry.start.getTime());
      if (laneIndex === -1) {
        laneIndex = laneEndTimes.length;
        laneEndTimes.push(entry.end.getTime());
      } else {
        laneEndTimes[laneIndex] = entry.end.getTime();
      }
      groupAssignments.push({ entry, laneIndex });
      groupStart = Math.min(groupStart, entry.start.getTime());
      groupMaxEnd = Math.max(groupMaxEnd, entry.end.getTime());
    });

    const laneCount = Math.max(laneEndTimes.length, 1);
    if (laneCount <= 3) {
      groupAssignments.forEach(({ entry, laneIndex }) => {
        layouts.push({
          kind: 'entry',
          id: entry.id,
          entry,
          start: entry.start,
          end: entry.end,
          laneIndex,
          laneCount,
        });
      });
    } else {
      groupAssignments
        .filter(({ laneIndex }) => laneIndex < 2)
        .forEach(({ entry, laneIndex }) => {
          layouts.push({
            kind: 'entry',
            id: entry.id,
            entry,
            start: entry.start,
            end: entry.end,
            laneIndex,
            laneCount: 3,
          });
        });

      const hiddenEntries = groupAssignments
        .filter(({ laneIndex }) => laneIndex >= 2)
        .map(({ entry }) => entry)
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      layouts.push({
        kind: 'overflow',
        id: `overflow-${groupEntries[0]?.dayKey}-${groupStart}`,
        start: new Date(groupStart),
        end: new Date(groupMaxEnd),
        laneIndex: 2,
        laneCount: 3,
        hiddenEntries,
      });
    }

    groupEntries = [];
    groupEnd = -Infinity;
  };

  timedEntries.forEach((entry) => {
    if (groupEntries.length === 0) {
      groupEntries = [entry];
      groupEnd = entry.end.getTime();
      return;
    }

    if (entry.start.getTime() < groupEnd) {
      groupEntries.push(entry);
      groupEnd = Math.max(groupEnd, entry.end.getTime());
      return;
    }

    flushGroup();
    groupEntries = [entry];
    groupEnd = entry.end.getTime();
  });

  flushGroup();
  return layouts;
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
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [selectedDetailEntryId, setSelectedDetailEntryId] = useState<string | null>(null);
  const [showUnscheduledTasks, setShowUnscheduledTasks] = useState(false);

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
    const {
      data: { session },
    } = await supabase.auth.getSession();
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
      const eventColor = getStableColor(`${event.source.summary}:${event.title}`.toLowerCase(), GOOGLE_EVENT_COLORS);
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

  const entriesByDay = useMemo(() => {
    const map = new Map<string, TimelineEntry[]>();
    timelineEntries.forEach((entry) => {
      const current = map.get(entry.dayKey) || [];
      current.push(entry);
      map.set(entry.dayKey, current);
    });
    map.forEach((entries, dayKey) => {
      map.set(
        dayKey,
        [...entries].sort((a, b) => {
          if (a.source !== b.source) return a.source === 'task' ? -1 : 1;
          return a.start.getTime() - b.start.getTime();
        })
      );
    });
    return map;
  }, [timelineEntries]);

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
      setCalendarWarning(
        data?.revoked
          ? null
          : 'Local connection removed. Remote revoke may need to be completed in Google account settings.'
      );
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

  const selectedDayEntries = selectedDayKey ? entriesByDay.get(selectedDayKey) || [] : [];
  const selectedDayTaskCount = selectedDayEntries.filter((entry) => entry.source === 'task').length;
  const selectedDayCalendarCount = selectedDayEntries.length - selectedDayTaskCount;
  const connectionSummary = connection.status === 'connected'
    ? [connection.accountEmail || null, connection.calendarTimezone || null].filter(Boolean).join(' • ')
    : 'Read-only calendar hints';

  return (
    <section className="overflow-hidden rounded-[28px] border border-gray-200 dark:border-gray-700 bg-[linear-gradient(180deg,rgba(248,248,247,0.96),rgba(255,255,255,1))] dark:bg-[linear-gradient(180deg,rgba(17,24,39,0.96),rgba(17,24,39,1))] shadow-[0_24px_60px_-36px_rgba(15,23,42,0.35)]">
      <div className="border-b border-gray-200/80 dark:border-gray-700/80 px-5 py-4 md:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                <span>Calendar</span>
                <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                <span>{viewMode}</span>
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{headerLabel}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Overview first. Tasks are editable here, external calendar events stay read-only.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="inline-flex rounded-full border border-gray-200 dark:border-gray-700 bg-white/85 dark:bg-gray-900/75 p-1 shadow-sm">
                <button
                  onClick={() => setViewMode('month')}
                  className={clsx(
                    'rounded-full px-3 py-1.5 text-sm transition-colors',
                    viewMode === 'month'
                      ? 'bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)]'
                      : 'text-gray-500 dark:text-gray-400'
                  )}
                >
                  Month
                </button>
                <button
                  onClick={() => setViewMode('week')}
                  className={clsx(
                    'rounded-full px-3 py-1.5 text-sm transition-colors',
                    viewMode === 'week'
                      ? 'bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)]'
                      : 'text-gray-500 dark:text-gray-400'
                  )}
                >
                  Week
                </button>
                <button
                  onClick={() => setViewMode('day')}
                  className={clsx(
                    'rounded-full px-3 py-1.5 text-sm transition-colors',
                    viewMode === 'day'
                      ? 'bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)]'
                      : 'text-gray-500 dark:text-gray-400'
                  )}
                >
                  Day
                </button>
              </div>

              <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 bg-white/85 dark:bg-gray-900/75 p-1 shadow-sm">
                <button
                  onClick={() => handleNavigate('prev')}
                  className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => handleNavigate('next')}
                  className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {unscheduledTasks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowUnscheduledTasks((current) => !current)}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors',
                    showUnscheduledTasks
                      ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900'
                      : 'border-gray-200 bg-white/85 text-gray-600 dark:border-gray-700 dark:bg-gray-900/75 dark:text-gray-300'
                  )}
                >
                  Unscheduled
                  <span className={clsx('rounded-full px-2 py-0.5 text-xs', showUnscheduledTasks ? 'bg-white/15 dark:bg-black/10' : 'bg-gray-100 dark:bg-gray-800')}>
                    {unscheduledTasks.length}
                  </span>
                </button>
              )}

              {connection.status === 'connected' ? (
                <button
                  onClick={() => void disconnectCalendar()}
                  disabled={connectionActionLoading}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/85 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900/75 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <Unlink2 size={14} />
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => void connectGoogleCalendar()}
                  disabled={connectionActionLoading}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm disabled:opacity-60',
                    connection.status === 'error'
                      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                      : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                  )}
                >
                  <CalendarSync size={14} />
                  {connection.status === 'error' ? 'Reconnect Google' : 'Connect Google'}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <span className="h-2 w-2 rounded-full bg-gray-900 dark:bg-gray-100" />
              Tasks
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Google Calendar
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              <ShieldCheck size={12} />
              Read-only
            </span>
            {connection.status === 'connected' && (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300">
                <CalendarCheck size={12} />
                {connectionSummary}
              </span>
            )}
          </div>

          {showUnscheduledTasks && unscheduledTasks.length > 0 && (
            <div className="rounded-2xl border border-gray-200/90 bg-white/80 p-3 dark:border-gray-700 dark:bg-gray-900/65">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Unscheduled tasks</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Drag these into the calendar when you want to place them.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUnscheduledTasks(false)}
                  className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="grid max-h-44 gap-2 overflow-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
                {unscheduledTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
                    className="rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm transition-colors hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600"
                  >
                    <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{task.title}</div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-800">P{task.priority}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-800">Task</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(connection.lastError || calendarWarning) && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              {connection.lastError || calendarWarning}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-5 md:px-6 md:pb-6">
        <div className="overflow-auto rounded-[24px] border border-gray-200/80 bg-white/80 shadow-inner shadow-gray-100/80 dark:border-gray-700 dark:bg-gray-900/75 dark:shadow-none">
          {isStatusLoading || isEventsLoading ? (
            <div className="p-10 text-sm text-gray-500 dark:text-gray-400">Loading calendar view...</div>
          ) : viewMode === 'month' ? (
            <div className="min-w-[860px]">
              <div className="grid grid-cols-7 border-b border-gray-200/80 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/40">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                  <div key={label} className="border-l border-gray-200/70 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 first:border-l-0 dark:border-gray-700 dark:text-gray-500">
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthDays.map((day) => {
                  const dayKey = formatDateKey(day);
                  const entries = entriesByDay.get(dayKey) || [];
                  const visibleEntries = entries.slice(0, MONTH_EVENT_PREVIEW_LIMIT);
                  const hiddenCount = Math.max(entries.length - visibleEntries.length, 0);
                  const isCurrentMonth = day.getMonth() === anchorDate.getMonth();
                  return (
                    <div
                      key={dayKey}
                      className={clsx(
                        'min-h-[152px] border-t border-l border-gray-200/80 px-3 py-2.5 first:border-l-0 dark:border-gray-700',
                        !isCurrentMonth && 'bg-gray-50/40 dark:bg-gray-800/20',
                        isSameDay(day, new Date()) && 'bg-[var(--accent-soft)]/20'
                      )}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const taskId = e.dataTransfer.getData('text/plain');
                        if (taskId) void handleDropTask(taskId, dayKey, 9);
                      }}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedDayKey(dayKey)}
                          className={clsx(
                            'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                            isSameDay(day, new Date())
                              ? 'bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)]'
                              : isCurrentMonth
                                ? 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
                                : 'text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-800'
                          )}
                        >
                          {format(day, 'd')}
                        </button>
                        {entries.length > 0 && (
                          <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">{entries.length}</span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {visibleEntries.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            draggable={entry.source === 'task' && !!entry.task}
                            onDragStart={(event) => {
                              if (entry.task) event.dataTransfer.setData('text/plain', entry.task.id);
                            }}
                            onClick={() => {
                              if (entry.source === 'task' && entry.task) {
                                openTaskEditor(entry.task);
                                return;
                              }
                              setSelectedDayKey(dayKey);
                              setSelectedDetailEntryId(entry.id);
                            }}
                            className={clsx(
                              'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors',
                              entry.source === 'task'
                                ? 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white'
                                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                            )}
                            style={
                              entry.source === 'calendar'
                                ? {
                                    borderColor: hexToRgba(entry.color, 0.28),
                                    backgroundColor: hexToRgba(entry.color, 0.12),
                                  }
                                : {
                                    boxShadow: `inset 3px 0 0 ${entry.color}`,
                                  }
                            }
                            title={entry.isAllDay ? `${entry.title} (all day)` : `${entry.title} (${format(entry.start, 'HH:mm')})`}
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: entry.source === 'task' ? '#ffffff' : entry.color }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[11px] font-semibold">
                                {entry.isAllDay ? entry.title : `${format(entry.start, 'HH:mm')} ${entry.title}`}
                              </div>
                              <div
                                className={clsx(
                                  'mt-0.5 text-[10px]',
                                  entry.source === 'task' ? 'text-white/70 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'
                                )}
                              >
                                {entry.source === 'task' ? 'Task' : 'Google Calendar'}
                              </div>
                            </div>
                          </button>
                        ))}
                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDayKey(dayKey);
                              setSelectedDetailEntryId(null);
                            }}
                            className="w-full rounded-xl border border-dashed border-gray-200 px-2.5 py-2 text-left text-[11px] font-medium text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-800"
                          >
                            +{hiddenCount} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={clsx('min-w-[640px]', viewMode === 'week' && 'min-w-[1320px]')}>
              <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40">
                <div className="w-16 p-2 text-xs text-gray-400" />
                {days.map((day) => (
                  <div key={day.toISOString()} className="flex-1 min-w-[180px] border-l border-gray-200 bg-white/45 p-3 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-900/20 dark:text-gray-300">
                    <div className="uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">{format(day, 'EEE')}</div>
                    <div className={clsx('mt-1 text-sm', isSameDay(day, new Date()) && 'text-black dark:text-white')}>{format(day, 'MMM d')}</div>
                  </div>
                ))}
              </div>

              <div className="flex">
                <div className="w-16 shrink-0">
                  {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map((hour) => (
                    <div key={hour} className="h-16 border-t border-gray-100 pr-2 text-right text-xs text-gray-400 dark:border-gray-800">
                      {format(new Date(2026, 0, 1, hour, 0, 0), 'HH:mm')}
                    </div>
                  ))}
                </div>

                {days.map((day) => {
                  const dayKey = formatDateKey(day);
                  const entries = entriesByDay.get(dayKey) || [];
                  const timedEntryLayouts = buildTimedEntryLayouts(entries);
                  const timedLayoutById = new Map(
                    timedEntryLayouts
                      .filter((layout) => layout.kind === 'entry' && layout.entry)
                      .map((layout) => [layout.entry!.id, layout])
                  );
                  const overflowLayouts = timedEntryLayouts.filter((layout) => layout.kind === 'overflow');
                  const renderEntries = entries.filter((entry) => entry.isAllDay || timedLayoutById.has(entry.id));
                  return (
                    <div key={dayKey} className="relative flex-1 min-w-[180px] border-l border-gray-200 bg-white/30 dark:border-gray-700 dark:bg-gray-900/10">
                      {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map((hour) => (
                        <div
                          key={`${dayKey}-${hour}`}
                          className="h-16 border-t border-gray-100 hover:bg-gray-50/60 dark:border-gray-800 dark:hover:bg-gray-800/40"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const taskId = e.dataTransfer.getData('text/plain');
                            if (taskId) void handleDropTask(taskId, dayKey, hour);
                          }}
                        />
                      ))}

                      {renderEntries.map((entry) => {
                        const startHour = entry.isAllDay ? START_HOUR : getHours(entry.start);
                        const startMin = entry.isAllDay ? 0 : getMinutes(entry.start);
                        const durationMin = entry.isAllDay
                          ? (END_HOUR - START_HOUR) * 60
                          : Math.max((entry.end.getTime() - entry.start.getTime()) / (60 * 1000), 30);
                        const top = ((startHour - START_HOUR) + startMin / 60) * ROW_HEIGHT;
                        const height = Math.max((durationMin / 60) * ROW_HEIGHT, 28);
                        const timedLayout = timedLayoutById.get(entry.id);
                        const laneCount = timedLayout?.laneCount || 1;
                        const laneIndex = timedLayout?.laneIndex || 0;
                        const { baseInset, horizontalGap } = getWeekLaneMetrics(laneCount, entry.isAllDay === true);
                        const usableWidth = entry.isAllDay
                          ? `calc(100% - ${baseInset * 2}px)`
                          : `calc((100% - ${baseInset * 2}px - ${horizontalGap * (laneCount - 1)}px) / ${laneCount})`;
                        const left = !timedLayout
                          ? `${baseInset}px`
                          : `calc(${baseInset}px + (${usableWidth} + ${horizontalGap}px) * ${laneIndex})`;
                        const isCompact = laneCount >= 3;
                        const isMedium = laneCount === 2;
                        const isShort = height < 82;
                        const useDenseBody = isCompact || isShort;
                        const isSelected = selectedDetailEntryId === entry.id;
                        return (
                          <div
                            key={entry.id}
                            draggable={entry.source === 'task' && !!entry.task}
                            onDragStart={(e) => {
                              if (entry.task) e.dataTransfer.setData('text/plain', entry.task.id);
                            }}
                            onClick={() => {
                              if (entry.source === 'task' && entry.task) {
                                openTaskEditor(entry.task);
                                return;
                              }
                              setSelectedDayKey(dayKey);
                              setSelectedDetailEntryId(entry.id);
                            }}
                            className={clsx(
                              'absolute overflow-hidden transition-all duration-150',
                              entry.source === 'task'
                                ? 'cursor-pointer border border-slate-200/95 bg-white text-slate-800 shadow-[0_8px_18px_-14px_rgba(15,23,42,0.45)] hover:border-slate-300 hover:shadow-[0_10px_22px_-16px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-slate-600'
                                : 'cursor-default border bg-white/90 text-slate-700 shadow-[0_8px_18px_-14px_rgba(15,23,42,0.22)] dark:bg-slate-900/92 dark:text-slate-100'
                            )}
                            style={
                              entry.source === 'task'
                                ? {
                                    top,
                                    height,
                                    left,
                                    width: usableWidth,
                                    borderRadius: isCompact ? 14 : 18,
                                    boxShadow: `${isSelected ? `0 0 0 2px var(--accent-solid), ` : ''}inset 3px 0 0 ${entry.color}`,
                                  }
                                : {
                                    top,
                                    height,
                                    left,
                                    width: usableWidth,
                                    borderRadius: isCompact ? 14 : 18,
                                    borderColor: hexToRgba(entry.color, 0.28),
                                    backgroundColor: hexToRgba(entry.color, isCompact ? 0.12 : 0.16),
                                    boxShadow: isSelected ? '0 0 0 2px var(--accent-solid)' : undefined,
                                  }
                            }
                            title={entry.isAllDay ? `${entry.title} (all day)` : `${entry.title} (${format(entry.start, 'HH:mm')} - ${format(entry.end, 'HH:mm')})`}
                          >
                            <div className={clsx('h-full w-full min-w-0', useDenseBody ? 'px-2 py-2' : 'px-3 py-2.5')}>
                              <div className="min-w-0">
                                {!useDenseBody && (
                                  <div className="mb-1 flex items-center gap-1.5">
                                    <span
                                      className={clsx(
                                        'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                        entry.source === 'task'
                                          ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                          : 'text-slate-600 dark:text-slate-300'
                                      )}
                                      style={entry.source === 'calendar' ? { backgroundColor: hexToRgba(entry.color, 0.14) } : undefined}
                                    >
                                      {entry.isAllDay ? 'All day' : format(entry.start, 'HH:mm')}
                                    </span>
                                    {!isMedium && (
                                      <span className="truncate text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                        {entry.source === 'task' ? 'Task' : 'Google'}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className={clsx('truncate font-semibold leading-tight', useDenseBody ? 'text-[11px]' : 'text-xs')}>
                                  {entry.title}
                                </div>
                                <div
                                  className={clsx(
                                    'truncate leading-tight text-slate-500 dark:text-slate-400',
                                    useDenseBody ? 'mt-0.5 text-[10px]' : 'mt-1 text-[11px]'
                                  )}
                                >
                                  {useDenseBody
                                    ? `${entry.isAllDay ? 'All day' : format(entry.start, 'HH:mm')}${entry.source === 'task' ? '' : ' • Google'}`
                                    : isMedium
                                      ? `${formatEntryTime(entry)} • ${entry.source === 'task' ? 'Task' : 'Google'}`
                                      : `${formatEntryTime(entry)}${entry.source === 'task' ? '' : ' • External calendar'}`}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {overflowLayouts.map((layout) => {
                        const startHour = getHours(layout.start);
                        const startMin = getMinutes(layout.start);
                        const durationMin = Math.max((layout.end.getTime() - layout.start.getTime()) / (60 * 1000), 30);
                        const top = ((startHour - START_HOUR) + startMin / 60) * ROW_HEIGHT;
                        const height = Math.max((durationMin / 60) * ROW_HEIGHT, 32);
                        const { baseInset, horizontalGap } = getWeekLaneMetrics(layout.laneCount, false);
                        const usableWidth = `calc((100% - ${baseInset * 2}px - ${horizontalGap * (layout.laneCount - 1)}px) / ${layout.laneCount})`;
                        const left = `calc(${baseInset}px + (${usableWidth} + ${horizontalGap}px) * ${layout.laneIndex})`;
                        const hiddenCount = layout.hiddenEntries?.length || 0;
                        const earliestHidden = layout.hiddenEntries?.[0];
                        return (
                          <button
                            key={layout.id}
                            type="button"
                            onClick={() => {
                              setSelectedDayKey(dayKey);
                              setSelectedDetailEntryId(null);
                            }}
                            className="absolute overflow-hidden rounded-[16px] border border-dashed border-gray-300 bg-white/92 px-2 py-2 text-left text-gray-600 shadow-[0_8px_18px_-14px_rgba(15,23,42,0.22)] hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900/92 dark:text-gray-300 dark:hover:bg-gray-800"
                            style={{
                              top,
                              height,
                              left,
                              width: usableWidth,
                            }}
                            title={`${hiddenCount} overlapping events`}
                          >
                            <div className="truncate text-[11px] font-semibold">
                              +{hiddenCount} more
                            </div>
                            <div className="mt-1 truncate text-[10px] text-gray-500 dark:text-gray-400">
                              {earliestHidden ? formatEntryTime(earliestHidden) : 'Open details'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedDayKey && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
          onClick={() => {
            setSelectedDayKey(null);
            setSelectedDetailEntryId(null);
          }}
        >
          <div
            className="flex h-[min(78vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Day detail</div>
                <h3 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {format(parseLocalDateTime(selectedDayKey), 'EEEE, MMMM d')}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {selectedDayEntries.length} items • {selectedDayTaskCount} tasks • {selectedDayCalendarCount} Google Calendar
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedDayKey(null);
                  setSelectedDetailEntryId(null);
                }}
                className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <span className="h-2 w-2 rounded-full bg-gray-900 dark:bg-gray-100" />
                  Task
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Google Calendar
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-5 py-4">
              {selectedDayEntries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Nothing scheduled for this date.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDayEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        if (entry.source === 'task' && entry.task) {
                          setSelectedDayKey(null);
                          setSelectedDetailEntryId(null);
                          openTaskEditor(entry.task);
                        }
                      }}
                      className={clsx(
                        'w-full rounded-2xl border px-4 py-3 text-left transition-colors',
                        entry.source === 'task'
                          ? 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-950 dark:hover:border-gray-600'
                          : 'dark:border-gray-700',
                        selectedDetailEntryId === entry.id && 'ring-2 ring-[var(--accent-solid)] ring-offset-2 dark:ring-offset-gray-900'
                      )}
                      style={
                        entry.source === 'task'
                          ? {
                              boxShadow: `inset 4px 0 0 ${entry.color}`,
                            }
                          : {
                              borderColor: hexToRgba(entry.color, 0.28),
                              backgroundColor: hexToRgba(entry.color, 0.12),
                            }
                      }
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                              {entry.source === 'task' ? 'Task' : 'Google Calendar'}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{formatEntryTime(entry)}</span>
                          </div>
                          <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{entry.title}</div>
                          {entry.source === 'task' && (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Click to edit this task.</div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
