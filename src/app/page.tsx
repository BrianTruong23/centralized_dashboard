'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useProjects } from '@/hooks/useProjects';
import { TaskInput } from '@/components/TaskInput';
import { QuickCaptureDock } from '@/components/QuickCaptureDock';
import { TaskList } from '@/components/TaskList';
import { UpcomingTaskList } from '@/components/UpcomingTaskList';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { FocusSessionModal } from '@/components/FocusSessionModal';
import { pickNextTask, generateDayPlan, filterTasksDueToday } from '@/lib/scheduler';
import { Task } from '@/types/task';
import { AuthModal } from '@/components/AuthModal';
import { Zap, CalendarRange, Loader2, Filter, ChevronUp, ChevronDown, Play, Sparkles, Trash2, GripVertical, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { DailyNotes } from '@/components/DailyNotes';
import { DailyNotesHistory } from '@/components/DailyNotesHistory';
import { AmbientSound } from '@/components/AmbientSound';
import { Sidebar } from '@/components/Sidebar';
import { KanbanBoard } from '@/components/KanbanBoard';
import { FilterPanel } from '@/components/FilterPanel';
import { AutoPlanModal } from '@/components/AutoPlanModal';
import { InboxCleanupModal } from '@/components/InboxCleanupModal';
import { CreateProjectModal } from '@/components/CreateProjectModal';
import { ActivityLogModal } from '@/components/ActivityLogModal';
import { SettingsModal } from '@/components/SettingsModal';
import { TaskStatus, TaskPriority, TaskCategory } from '@/types/task';
import clsx from 'clsx';
import {
  awaitAuthenticatedSession,
  awaitAuthBootstrap,
  getAccessToken,
  getAuthBootstrapSnapshot,
  SESSION_KEY,
  subscribeAuthBootstrap,
  supabase,
  type AuthBootstrapSnapshot,
} from '@/lib/supabase';
import Link from 'next/link';
import { formatDateKey } from '@/lib/dateKey';
import { usePremium } from '@/hooks/usePremium';
import { AiAssistant } from '@/components/AiAssistant';
import { CalendarWorkspace } from '@/components/CalendarWorkspace';
import { PlanningPreferences, defaultPlanningPreferences } from '@/types/planningPreferences';
import OnboardingModal from '@/components/OnboardingModal';
import { OnboardingPreferences } from '@/types/onboarding';
import { db } from '@/lib/db';
import confetti from 'canvas-confetti';

const loadingMessages = [
  'Loading dashboard...',
  'Hang tight...',
  'Almost there...',
  'Getting things ready...',
  'Just a moment...',
];

function formatPlanDate(deadline?: string): string | null {
  if (!deadline) return null;
  const keyMatch = deadline.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (keyMatch) {
    return `${keyMatch[2]}-${keyMatch[3]}-${keyMatch[1]}`;
  }
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return null;
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const yyyy = parsed.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

function toDateKey(value?: string): string | null {
  if (!value) return null;
  const direct = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDateKey(parsed);
}

function plannedDateKey(task: Task): string | null {
  return toDateKey(task.scheduled_on || task.scheduled_date || task.scheduled_start || task.start_time);
}

function effectiveDateKey(task: Task): string | null {
  return plannedDateKey(task) || toDateKey(task.deadline);
}

// Sortable queue item for plan mode
function SortableQueueItem({
  task,
  index,
  onMakeNow,
}: {
  task: Task;
  index: number;
  onMakeNow?: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-2 px-2 rounded-md border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing"
      >
        <GripVertical size={14} />
      </button>
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 flex items-center justify-center text-[10px] font-medium">
        {index + 2}
      </span>
      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
        {task.title}
      </span>
      {onMakeNow && (
        <button
          type="button"
          onClick={() => onMakeNow(task.id)}
          className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Now
        </button>
      )}
    </div>
  );
}

function LoadingScreen() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-gray-400 dark:text-gray-500">
      <Loader2 size={32} className="animate-spin mb-3" />
      <span className="transition-opacity duration-300">{loadingMessages[messageIndex]}</span>
    </div>
  );
}

export default function Home() {
  const { tasks, addTask: _addTask, addTasksBatch, updateTask: _updateTask, deleteTask, isLoaded } = useTasks();
  const { projects, addProject: addProjectFn, deleteProject, updateProject } = useProjects();
  
  const [tutorialStep, setTutorialStep] = useState<'none' | 'input' | 'list'>('none');

  const updateTask = async (task: Task) => {
      // Check if we are completing the FIRST task (tutorial step 'list')
      if (tutorialStep === 'list' && task.status === 'done') {
          // Fire confetti for completion
          confetti({
            particleCount: 150,
            spread: 100,
            origin: { y: 0.6 },
            colors: ['#22c55e', '#3b82f6', '#f59e0b'] // Green/Blue/Amber
          });
          setTutorialStep('none'); // End tutorial
      }
      
      // Auto-promote next task in plan when current focus is completed
      if (showPlan && dayPlan.length > 0 && task.status === 'done' && focusedTaskId === task.id) {
        const currentIndex = dayPlan.findIndex(t => t.id === task.id);
        if (currentIndex >= 0 && currentIndex < dayPlan.length - 1) {
          // Promote next task to focus
          setFocusedTaskId(dayPlan[currentIndex + 1].id);
        } else {
          // No more tasks in queue
          setFocusedTaskId(null);
        }
      }
      
      await _updateTask(task);
  };

  const addTask = async (task: Task) => {
    if (tutorialStep === 'input') {
      setTutorialStep('list');
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
    await _addTask(task);
  };



  const { isPro, loading: premiumLoading } = usePremium();
  const [forceProUser, setForceProUser] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('force_pro_user') === 'true';
  });
  const effectiveIsPro = isPro || forceProUser;
  const [showPlan, setShowPlan] = useState(false);
  const [dayPlan, setDayPlan] = useState<Task[]>([]);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  const [currentView, setCurrentView] = useState('today');
  const [inboxDisplayView, setInboxDisplayView] = useState<'inbox' | 'kanban' | 'calendar'>(() => {
    if (typeof window === 'undefined') return 'inbox';
    const stored = localStorage.getItem('inbox_display_view');
    if (stored === 'kanban' || stored === 'calendar' || stored === 'inbox') return stored;
    return 'inbox';
  });
  const [calendarSetupMessage, setCalendarSetupMessage] = useState<string | null>(null);
  const [isFinalizingCalendarConnect, setIsFinalizingCalendarConnect] = useState(false);
  const [authSnapshot, setAuthSnapshot] = useState<AuthBootstrapSnapshot>(() => getAuthBootstrapSnapshot());
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [notesRefreshToken, setNotesRefreshToken] = useState(0);

  const handleStartTutorial = () => {
    setTutorialStep('input');
  };

  const handleDismissTutorial = () => {
    setTutorialStep('none');
  };
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  
  // Resolve project name for display
  const currentProject = projects.find(p => `project-${p.id}` === currentView);
  const viewTitle = currentProject 
    ? `# ${currentProject.name}`
    : currentView.startsWith('project-') 
        ? currentView.replace('project-', '# ') 
        : currentView.replace('-', ' ');

  const [manualFocusTaskId, setManualFocusTaskId] = useState<string | null>(null);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [activeFocusTask, setActiveFocusTask] = useState<Task | null>(null);
  const [isFocusModalOpen, setIsFocusModalOpen] = useState(false);
  const [focusModalAutoStart, setFocusModalAutoStart] = useState(false);
  
  // Auto Plan State
  const [isAutoPlanModalOpen, setIsAutoPlanModalOpen] = useState(false);
  const [isInboxCleanupModalOpen, setIsInboxCleanupModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [isClearingCompleted, setIsClearingCompleted] = useState(false);
  const [focusPlantEnabled, setFocusPlantEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const raw = localStorage.getItem('focus_plant_enabled');
    return raw === null ? true : raw === 'true';
  });
  const [planningPreferences, setPlanningPreferences] = useState<PlanningPreferences>(() => {
    if (typeof window === 'undefined') return defaultPlanningPreferences;
    try {
      const raw = localStorage.getItem('planning_preferences');
      if (!raw) return defaultPlanningPreferences;
      return { ...defaultPlanningPreferences, ...JSON.parse(raw) } as PlanningPreferences;
    } catch {
      return defaultPlanningPreferences;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('focus_plant_enabled', String(focusPlantEnabled));
    } catch {
      // ignore storage errors
    }
  }, [focusPlantEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('force_pro_user', String(forceProUser));
    } catch {
      // ignore storage errors
    }
  }, [forceProUser]);

  useEffect(() => {
    try {
      localStorage.setItem('planning_preferences', JSON.stringify(planningPreferences));
    } catch {
      // ignore storage errors
    }
  }, [planningPreferences]);

  useEffect(() => {
    return subscribeAuthBootstrap((snapshot) => {
      setAuthSnapshot(snapshot);
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    const status = url.searchParams.get('calendar_status');
    const message = url.searchParams.get('calendar_message');
    const requestedView = url.searchParams.get('view');
    const calendarCode = url.searchParams.get('calendar_code');

    const moveToRequestedInboxView = () => {
      const nextView = requestedView === 'calendar' ? 'calendar' : 'inbox';
      setInboxDisplayView(nextView);
      setCurrentView(nextView);
      try {
        localStorage.setItem('inbox_display_view', nextView);
      } catch {
        // ignore storage errors
      }
    };

    const clearCalendarParams = () => {
      url.searchParams.delete('calendar_status');
      url.searchParams.delete('calendar_message');
      url.searchParams.delete('calendar_code');
      url.searchParams.delete('view');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    };

    const finalizeCalendarConnect = async () => {
      moveToRequestedInboxView();

      if (status === 'error') {
        setCalendarSetupMessage(message || 'Google Calendar connection failed.');
        clearCalendarParams();
        return;
      }

      if (!calendarCode) {
        if (requestedView === 'inbox') {
          clearCalendarParams();
        }
        return;
      }

      setIsFinalizingCalendarConnect(true);
      setCalendarSetupMessage('Restoring your Minismo session and finishing Google Calendar connection...');

      try {
        if (!supabase) throw new Error('Supabase not configured');
        const session = await awaitAuthenticatedSession(12_000);
        if (!session?.access_token) {
          throw new Error(
            'Google returned successfully, but Minismo could not finish restoring your authenticated session within the expected time. Automatic recovery was attempted but no active Supabase access token became available. Confirm you are still signed in, then try Connect Google Calendar again.'
          );
        }

        const res = await fetch('/api/calendar/google/finalize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ code: calendarCode }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Failed to finish Google Calendar connection.');

        setCalendarSetupMessage('Google Calendar connected.');
      } catch (error: unknown) {
        setCalendarSetupMessage(error instanceof Error ? error.message : 'Google Calendar connection failed.');
      } finally {
        setIsFinalizingCalendarConnect(false);
        clearCalendarParams();
      }
    };

    if (!status && !message && !requestedView && !calendarCode) return;
    void finalizeCalendarConnect();
  }, []);

  useEffect(() => {
    if (calendarSetupMessage !== 'Google Calendar connected.') return;
    const timeout = window.setTimeout(() => {
      setCalendarSetupMessage(null);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [calendarSetupMessage]);

  useEffect(() => {
    if (currentView === 'inbox' || currentView === 'kanban' || currentView === 'calendar') {
      setInboxDisplayView(currentView);
      try {
        localStorage.setItem('inbox_display_view', currentView);
      } catch {
        // ignore storage errors
      }
    }
  }, [currentView]);

  const switchInboxDisplayView = (next: 'inbox' | 'kanban' | 'calendar') => {
    setInboxDisplayView(next);
    try {
      localStorage.setItem('inbox_display_view', next);
    } catch {
      // ignore storage errors
    }
    setCurrentView(next);
  };

  const handleSidebarViewChange = (nextView: string) => {
    if (nextView === 'inbox') {
      setCurrentView(inboxDisplayView);
      return;
    }
    setCurrentView(nextView);
  };

  const getDefaultDate = () => {
    if (currentView === 'today') {
      return formatDateKey(new Date());
    }
    if (currentView === 'upcoming') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return formatDateKey(tomorrow);
    }
    return undefined;
  };

  useEffect(() => {
    const fetchUser = async () => {
        if (!supabase) return;
        const snapshot = await awaitAuthBootstrap();
        if (snapshot.state === 'authenticated' && snapshot.user) {
          setUser(snapshot.user);
          return;
        }
        setUser(null);
    };
    fetchUser();
    return subscribeAuthBootstrap((snapshot) => {
      if (snapshot.state === 'signed_out' || snapshot.state === 'restore_failed') {
        setUser(null);
        return;
      }
      if (snapshot.state === 'authenticated' && snapshot.user) {
        setUser(snapshot.user);
      }
    });
  }, []);

  // Check if onboarding is needed for new users
  useEffect(() => {
    const checkOnboarding = async () => {
      if (!user || onboardingChecked) return;

      try {
        const session = await awaitAuthenticatedSession(10_000);
        if (!session?.access_token && !getAccessToken()) {
          return;
        }
        const status = await db.getOnboardingStatus(user.id);
        setOnboardingChecked(true);

        // Show onboarding only if user has never completed it
        if (!status || !status.completed) {
          setIsOnboardingOpen(true);
        }
      } catch (error: any) {
        console.error('Error checking onboarding status:', error);
        if (error.details) console.error('Error details:', error.details);
        if (
          error instanceof Error &&
          (error.message.includes('session is still restoring') || error.message.includes('Auth bootstrap timed out'))
        ) {
          return;
        }
        setOnboardingChecked(true);
      }
    };

    checkOnboarding();
  }, [user, onboardingChecked, authSnapshot.state]);

  const handleOnboardingComplete = async (preferences: OnboardingPreferences) => {
    if (!user) return;

    try {
      await db.createOnboardingStatus(user.id, preferences);
      setIsOnboardingOpen(false);

      // Optionally store preferences in localStorage for quick access
      localStorage.setItem('onboarding_preferences', JSON.stringify(preferences));
    } catch (error) {
      console.error('Error saving onboarding preferences:', error);
    }
  };

  const handleOnboardingSkip = async () => {
    if (!user) return;

    try {
      await db.skipOnboarding(user.id);
      setIsOnboardingOpen(false);
    } catch (error) {
      console.error('Error skipping onboarding:', error);
    }
  };

  const handleLogout = async () => {
    console.log('[handleLogout] 🔴 Logout initiated');
    try {
        if (supabase) {
            console.log('[handleLogout] Calling supabase.auth.signOut({ scope: "local" })...');
            // Use scope:'local' — clears the session client-side only.
            // This avoids hangs when the Supabase API is unreachable (the default
            // scope:'global' makes a network request to revoke the token).
            // Race against a 3s timeout so a hung signOut can't block logout.
            const signOutPromise = supabase.auth.signOut({ scope: 'local' });
            const timeoutPromise = new Promise<{ error: { message: string } }>((_, reject) =>
                setTimeout(() => reject(new Error('signOut timed out after 3s')), 3000)
            );
            try {
                const { error } = await Promise.race([signOutPromise, timeoutPromise]);
                if (error) {
                    console.error('[handleLogout] signOut returned error:', error.message);
                } else {
                    console.log('[handleLogout] signOut succeeded');
                }
            } catch (raceErr) {
                console.warn('[handleLogout] signOut failed/timed out:', raceErr);
            }
        }
    } catch (error) {
        console.error('[handleLogout] signOut threw:', error);
    } finally {
        console.log('[handleLogout] Cleaning up local state...');
        // Always clear local state — including Supabase's own session keys
        // so a failed signOut() doesn't leave stale tokens that re-authenticate on reload
        localStorage.removeItem(SESSION_KEY);
        try {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('sb-')) localStorage.removeItem(key);
            });
        } catch { /* ignore storage errors */ }
        console.log('[handleLogout] localStorage cleared, setting user to null');
        setUser(null);
        console.log('[handleLogout] Redirecting to /');
        window.location.href = '/';
    }
  };

  const suggestedTask = useMemo(() => {
    if (!isLoaded || tasks.length === 0) return null;
    
    // If user manually selected a task to focus on, return that one
    if (manualFocusTaskId) {
        const found = tasks.find(t => t.id === manualFocusTaskId);
        if (found && found.status !== 'done') return found;
    }

    return pickNextTask(tasks, { now: new Date(), energyLevel: 'medium' });
  }, [tasks, isLoaded, manualFocusTaskId]);

  const handleGeneratePlan = () => {
    const dueTodayTasks = filteredTasks.filter((t) => t.status !== 'done');
    const plan = generateDayPlan(dueTodayTasks, { now: new Date(), energyLevel: 'medium', availableTimeMinutes: 480 });
    setDayPlan(plan);
    setShowPlan(true);
    // Set first task as focused
    if (plan.length > 0) {
      setFocusedTaskId(plan[0].id);
    } else {
      setFocusedTaskId(null);
    }
  };

  const moveTaskUp = (index: number) => {
    if (index <= 0) return;
    setDayPlan(prev => {
        const newPlan = [...prev];
        [newPlan[index], newPlan[index - 1]] = [newPlan[index - 1], newPlan[index]];
        return newPlan;
    });
  };

  const moveTaskDown = (index: number) => {
    if (index >= dayPlan.length - 1) return;
    setDayPlan(prev => {
        const newPlan = [...prev];
        [newPlan[index], newPlan[index + 1]] = [newPlan[index + 1], newPlan[index]];
        return newPlan;
    });
  };

  const removeTaskFromPlan = (taskId: string) => {
    // Proposal-only removal: this does NOT delete from DB/tasks list.
    setDayPlan(prev => prev.filter(t => t.id !== taskId));
  };

  const handleFocusNextFromPlan = () => {
    if (dayPlan.length === 0) return;
    const taskToFocus = focusedTaskId 
      ? dayPlan.find(t => t.id === focusedTaskId) || dayPlan[0]
      : dayPlan[0];
    setActiveFocusTask(taskToFocus);
    setFocusModalAutoStart(true);
    setIsFocusModalOpen(true);
  };

  const handleSetFocusNow = (taskId: string) => {
    setFocusedTaskId(taskId);
  };

  const handleSkipFocusTask = () => {
    if (!focusedTaskId || dayPlan.length <= 1) return;
    setDayPlan((prev) => {
      const idx = prev.findIndex((t) => t.id === focusedTaskId);
      if (idx === -1) return prev;
      const next = [...prev];
      const [focus] = next.splice(idx, 1);
      next.push(focus);
      setFocusedTaskId(next[0]?.id ?? null);
      return next;
    });
  };

  const handleCompleteFocusTask = async () => {
    const focusTask = dayPlan.find((t) => t.id === focusedTaskId) || dayPlan[0];
    if (!focusTask) return;
    await updateTask({ ...focusTask, status: 'done' });
    setDayPlan((prev) => prev.filter((t) => t.id !== focusTask.id));
  };

  const handlePlanDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = dayPlan.findIndex(t => t.id === active.id);
    const newIndex = dayPlan.findIndex(t => t.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      setDayPlan(prev => {
        const newPlan = [...prev];
        const [moved] = newPlan.splice(oldIndex, 1);
        newPlan.splice(newIndex, 0, moved);
        return newPlan;
      });
    }
  };

  const planSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleFocusTask = (task: Task) => {
    setManualFocusTaskId(task.id);
    setActiveFocusTask(task);
    setFocusModalAutoStart(false);
    setIsFocusModalOpen(true);
  };

  const handleStartFocusSession = (task: Task) => {
    setActiveFocusTask(task);
    setFocusModalAutoStart(true);
    setIsFocusModalOpen(true);
  };

  const handleAutoPlanTasks = async (newTasks: Task[]) => {
      console.log(`[handleAutoPlanTasks] Received ${newTasks.length} tasks to add (batch)`);
      try {
          await addTasksBatch(newTasks);
          console.log(`[handleAutoPlanTasks] ✅ Batch insert done`);
      } catch (e: any) {
          console.error(`[handleAutoPlanTasks] ✗ Batch insert failed:`, e?.message || e);
      }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{
    status: TaskStatus[];
    priority: TaskPriority[];
    category: TaskCategory[];
  }>({
    status: [],
    priority: [],
    category: []
  });

  useEffect(() => {
    if (!['inbox', 'kanban', 'calendar'].includes(currentView)) {
      setShowViewDropdown(false);
    }
  }, [currentView]);

  useEffect(() => {
    if (currentView !== 'today' || !showPlan) return;
    const todayKey = formatDateKey(new Date());
    const candidates = tasks.filter((t) => t.status !== 'done' && effectiveDateKey(t) === todayKey);
    setDayPlan((prev) => {
      const prevIds = new Set(prev.map((t) => t.id));
      const ordered = prev
        .map((existing) => candidates.find((c) => c.id === existing.id))
        .filter(Boolean) as Task[];
      const additions = candidates.filter((c) => !prevIds.has(c.id));
      return [...ordered, ...additions];
    });
  }, [currentView, tasks, showPlan]);

  useEffect(() => {
    if (dayPlan.length === 0) {
      setFocusedTaskId(null);
      return;
    }
    if (!focusedTaskId || !dayPlan.some((t) => t.id === focusedTaskId)) {
      setFocusedTaskId(dayPlan[0].id);
    }
  }, [dayPlan, focusedTaskId]);

  // ... (existing effects)

  const filteredTasks = useMemo(() => {
    let result = tasks;

    // 1. Text Search (Global)
    if (searchQuery.trim()) {
       const q = searchQuery.toLowerCase();
       result = result.filter(t => 
         t.title.toLowerCase().includes(q) || 
         t.description.toLowerCase().includes(q)
       );
    }

    // 2. Advanced Filters (Global)
    if (activeFilters.status.length > 0) {
        result = result.filter(t => activeFilters.status.includes(t.status));
    }
    if (activeFilters.priority.length > 0) {
        result = result.filter(t => activeFilters.priority.includes(t.priority));
    }
    if (activeFilters.category.length > 0) {
        result = result.filter(t => activeFilters.category.includes(t.category));
    }

    // 3. View-specific filtering
    
    // Explicitly handle "Completed" view
    if (currentView === 'completed') {
        return result.filter(t => t.status === 'done');
    }

    // For other views (except Kanban/Search), usually hide completed tasks?
    // User said: "not show up in inbox section" (and implies others).
    // Let's filter out 'done' for Inbox, Today, Upcoming, Projects.
    // Kanban usually needs 'done' for the Done column.
    
    const hideCompleted = currentView !== 'kanban';
    if (hideCompleted) {
        result = result.filter(t => t.status !== 'done');
    }

    if (currentView === 'inbox') {
        return result;
    }
    if (currentView === 'kanban') {
        return result; // filteredTasks passed to Kanban, but we just filtered out done if hideCompleted was true. Wait.
        // If currentView is kanban, hideCompleted is false. So result has done tasks. Correct.
    }

    if (currentView === 'today') {
        const todayStr = formatDateKey(new Date());
        return result.filter(t => effectiveDateKey(t) === todayStr);
    }
    if (currentView === 'upcoming') {
        const todayStr = formatDateKey(new Date());
        return result.filter(t => {
             const key = effectiveDateKey(t);
             if (!key) return false;
             return key > todayStr;
        });
    }
    if (currentView.startsWith('project-')) {
        const project = projects.find(p => `project-${p.id}` === currentView);
        if (project) {
             return result.filter(t => t.project_id === project.id);
        }
        // Fallback for tags? Or just ID? 
        // Previous code: const tag = currentView.replace('project-', ''); return result.filter(t => t.tags?.includes(tag));
        // But we switched to project_id in Sidebar. Sidebar sends `project-${project.id}`.
        // So we should match project_id.
        // Let's stick to project_id.
        const id = currentView.replace('project-', '');
        return result.filter(t => t.project_id === id);
    }
    return result;
  }, [tasks, currentView, searchQuery, activeFilters]);

  // Handler for filter changes
  const handleFilterChange = (type: 'status' | 'priority' | 'category', value: any) => {
      setActiveFilters(prev => {
          const current = prev[type] as any[];
          const next = current.includes(value) 
             ? current.filter(v => v !== value)
             : [...current, value];
          return { ...prev, [type]: next };
      });
  };

  const clearFilters = () => {
    setActiveFilters({ status: [], priority: [], category: [] });
  };

  const handleDeleteAllCompleted = async () => {
    const completedTaskIds = tasks.filter((t) => t.status === 'done').map((t) => t.id);
    if (completedTaskIds.length === 0 || isClearingCompleted) return;

    setIsClearingCompleted(true);
    try {
      await Promise.all(completedTaskIds.map((id) => deleteTask(id)));
    } finally {
      setIsClearingCompleted(false);
    }
  };

  const isAuthBootstrapping = authSnapshot.state === 'booting' || authSnapshot.state === 'restoring_session';
  const isAuthenticated = authSnapshot.state === 'authenticated' && !!user;
  const shouldShowAuthModal = !isAuthBootstrapping && !isAuthenticated;

  if (!isLoaded || isAuthBootstrapping) {
    return <LoadingScreen />;
  }

  const todoTasks = filteredTasks.filter(t => t.status !== 'done');
  const userId = user?.id;
  const showViewSwitcher = ['inbox', 'kanban', 'calendar'].includes(currentView);
  const viewSwitcherLabel =
    currentView === 'kanban' ? 'Kanban' : currentView === 'calendar' ? 'Calendar' : 'List';

  return (
    <div className="flex h-screen bg-[#fafafa] dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans overflow-hidden">
      
      {/* Auth Modal Blocking */}
      {shouldShowAuthModal && (
         <AuthModal 
            isOpen={true} 
            onAuthSuccess={(u) => setUser(u)} 
         />
      )}

      {/* Sidebar */}
       <Sidebar
          currentView={currentView}
          onViewChange={handleSidebarViewChange}
          tasks={tasks}
          onAddTask={() => setIsCreateTaskModalOpen(true)}
          user={user}
          onLogout={handleLogout}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          projects={projects}
          onDeleteProject={deleteProject}
          onUpdateProject={updateProject}

          focusPlantEnabled={focusPlantEnabled}
          onToggleFocusPlant={setFocusPlantEnabled}
          isPro={effectiveIsPro}
          forceProUser={forceProUser}
          onToggleForceProUser={setForceProUser}
          planningPreferences={planningPreferences}
          onPlanningPreferencesChange={setPlanningPreferences}
          onRestartOnboarding={() => setIsOnboardingOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenProjectModal={() => setIsProjectModalOpen(true)}
          onOpenActivityLog={() => setIsActivityLogOpen(true)}
       />

       {/* CreateTaskModal rendered once at the bottom of the component */}

      <main className={`flex-1 overflow-y-auto p-4 md:p-8 ${shouldShowAuthModal ? 'blur-sm pointer-events-none select-none' : ''}`}>
        <header className={clsx(
          "flex flex-col md:flex-row md:items-start justify-between gap-4 md:gap-0 mx-auto relative",
          currentView === 'calendar' ? "max-w-[1400px]" : "max-w-4xl",
          (currentView === 'today' || currentView === 'inbox' || currentView === 'upcoming' || currentView === 'calendar') ? "mb-4" : "mb-8"
        )}>
          <div>
            <h1 className={clsx(
              "font-bold tracking-tighter mb-1 font-mono uppercase text-[var(--accent-solid)]",
              (currentView === 'today' || currentView === 'inbox' || currentView === 'upcoming' || currentView === 'completed' || currentView === 'daily-notes') ? "text-xl" : "text-3xl"
            )}>
               {currentView === 'today' ? (
                 <div className="flex items-center gap-3">
                   <span>Today</span>
                   <span className="text-sm font-normal text-gray-500 dark:text-gray-400 normal-case">
                     {todoTasks.length} {todoTasks.length === 1 ? 'task' : 'tasks'}
                   </span>
          </div>
               ) : currentView === 'inbox' ? (
                 <div className="flex items-center gap-3">
                   <span>Inbox</span>
                   <span className="text-sm font-normal text-gray-500 dark:text-gray-400 normal-case">
                     {todoTasks.length} {todoTasks.length === 1 ? 'item' : 'items'}
                   </span>
                   </div>
               ) : currentView === 'upcoming' ? (
                     <div className="flex items-center gap-3">
                   <span>Upcoming</span>
                   <span className="text-sm font-normal text-gray-500 dark:text-gray-400 normal-case">
                     {todoTasks.length} {todoTasks.length === 1 ? 'task' : 'tasks'}
                        </span>
                 </div>
              ) : currentView === 'completed' ? (
                <div className="flex items-center gap-3">
                  <span>Completed</span>
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400 normal-case">
                    {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
                  </span>
                </div>
               ) : currentView === 'calendar' ? (
                 <div className="flex items-center gap-3">
                   <span>Calendar</span>
                   <span className="text-sm font-normal text-gray-500 dark:text-gray-400 normal-case">
                     Plan tasks in time
                   </span>
                 </div>
               ) : viewTitle}
            </h1>
            {currentView !== 'today' && currentView !== 'inbox' && currentView !== 'calendar' && (
              <p className="text-gray-500 dark:text-gray-400 text-sm min-h-[20px]">
                {currentView === 'kanban' ? 'Visual workflow' : null}
              </p>
                        )}
                     </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
             {showViewSwitcher && (
               <>
                 <div className="md:hidden">
                   <select
                     value={currentView === 'kanban' ? 'kanban' : currentView === 'calendar' ? 'calendar' : 'inbox'}
                     onChange={(e) => switchInboxDisplayView(e.target.value as 'inbox' | 'kanban' | 'calendar')}
                     className="h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 text-sm text-gray-700 dark:text-gray-200 outline-none"
                   >
                     <option value="inbox">List</option>
                     <option value="kanban">Kanban</option>
                     <option value="calendar">Calendar</option>
                   </select>
                 </div>

                 <div className="relative hidden md:block">
                   <button
                     onClick={() => setShowViewDropdown((prev) => !prev)}
                     className="px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1 bg-white dark:bg-gray-900"
                   >
                     {viewSwitcherLabel}
                     <ChevronDown size={12} />
                   </button>
                   {showViewDropdown && (
                     <div className="absolute left-0 md:left-auto md:right-0 top-full mt-1 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-[120] min-w-[140px]">
                       <button
                         type="button"
                         onClick={() => {
                           switchInboxDisplayView('inbox');
                           setShowViewDropdown(false);
                         }}
                         className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                       >
                         List
                       </button>
                       <button
                         type="button"
                         onClick={() => {
                           switchInboxDisplayView('kanban');
                           setShowViewDropdown(false);
                         }}
                         className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                       >
                         Kanban
                       </button>
                       <button
                         type="button"
                         onClick={() => {
                           switchInboxDisplayView('calendar');
                           setShowViewDropdown(false);
                         }}
                         className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                       >
                         Calendar
                       </button>
                     </div>
                   )}
                 </div>
               </>
             )}

             <div className="relative group flex-1 md:flex-none">
                 <input 
                   type="text" 
                   placeholder="Search..." 
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-[var(--accent-border)] outline-none px-2 py-1 text-sm w-full md:w-32 focus:w-full md:focus:w-48 transition-all"
                 />
             </div>
             
             <div className="relative">
                    <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className={clsx(
                        "p-2 rounded-full transition-colors",
                        showFilters || Object.values(activeFilters).flat().length > 0 
                            ? "bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)] border border-[var(--accent-border)]" 
                            : "bg-gray-100 text-gray-400 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                    )}
                 >
                    <Filter size={18} />
                     </button>
                 <FilterPanel
                    isOpen={showFilters}
                    onClose={() => setShowFilters(false)}
                    activeFilters={activeFilters}
                    onFilterChange={handleFilterChange}
                    onClearFilters={clearFilters}
                    projects={projects}
                 />
                   </div>

             {effectiveIsPro && ['inbox', 'kanban', 'calendar'].includes(currentView) && (
               <button
                 onClick={() => setIsInboxCleanupModalOpen(true)}
                 className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1 transition-colors text-sm"
                 title="Review inbox for cleanup suggestions"
               >
                 <Sparkles size={14} />
                 Clean-up
               </button>
             )}
                </div>
        </header>

        {(calendarSetupMessage || authSnapshot.state === 'restoring_session') && (
          <div
            className={clsx(
              "mx-auto mb-4 max-w-4xl rounded-xl border px-4 py-3 text-sm",
              isFinalizingCalendarConnect || authSnapshot.state === 'restoring_session'
                ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <span>{calendarSetupMessage || 'Restoring your Minismo session...'}</span>
              {calendarSetupMessage && !isFinalizingCalendarConnect && authSnapshot.state !== 'restoring_session' && (
                <button
                  type="button"
                  onClick={() => setCalendarSetupMessage(null)}
                  className="mt-0.5 shrink-0 rounded-md p-0.5 opacity-70 transition hover:opacity-100"
                  aria-label="Dismiss calendar setup message"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        )}

        <div className={clsx("mx-auto", currentView === 'calendar' ? "max-w-[1400px]" : "max-w-4xl")}>
            {currentView === 'calendar' ? (
                <section>
                    <CalendarWorkspace
                        tasks={filteredTasks}
                        projects={projects}
                        onUpdateTask={updateTask}
                    />
                </section>
            ) : currentView === 'kanban' ? (
                <section className="h-[calc(100vh-200px)]">
                    <KanbanBoard
                        tasks={filteredTasks}
                        onUpdateTask={updateTask}
                        onDeleteTask={deleteTask}
                        onFocusTask={handleFocusTask}
                        projects={projects}
                    />
                </section>
            ) : currentView === 'daily-notes' ? (
                <>
                    <section className="mb-12">
                        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                            Today&apos;s Notes
                        </h2>
                        <DailyNotes
                          userId={userId}
                          onAddTask={addTask}
                          projects={projects}
                          addProject={addProjectFn}
                          onNoteSaved={() => setNotesRefreshToken((prev) => prev + 1)}
                          isPro={effectiveIsPro}
                        />
          </section>
        <section className="mb-8">
                        <DailyNotesHistory userId={userId} refreshToken={notesRefreshToken} />
        </section>
                </>
            ) : (
                <>
                    {currentView === 'today' ? (
                        <>
                            {/* Today's Tasks - Primary Content */}
                            <section className="mb-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Today&apos;s Tasks
                                    </h2>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!showPlan) handleGeneratePlan();
                                        else setShowPlan(false);
                                      }}
                                      className={clsx(
                                        "text-xs font-semibold px-2.5 py-1.5 rounded-md border transition-colors",
                                        showPlan
                                          ? "bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] border-[var(--accent-border)]"
                                          : "accent-solid-btn"
                                      )}
                                    >
                                      {showPlan ? 'Hide focus' : 'Focus now'}
                                    </button>
                                </div>
                                
                                {/* Plan Mode: Clean Execution Queue */}
                                {showPlan && (
                                    <div className="mb-4 space-y-4">
                                      {dayPlan.length === 0 ? (
                                        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                                          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Now</h3>
                                          <p className="text-sm text-gray-600 dark:text-gray-300">
                                            No focus task is ready yet. Add a due date for today, then tap <span className="font-semibold">Focus now</span>.
                                          </p>
                                        </section>
                                      ) : (
                                        <>
                                        {/* Focus Now - Single Task */}
                                        {(() => {
                                            const focusTask = dayPlan.find(t => t.id === focusedTaskId) || dayPlan[0];
                                            const isCompleted = focusTask.status === 'done';
                                            return (
                                                <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Now</h3>
                                                        <button
                                                          onClick={() => setShowPlan(false)}
                                                          className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                                                        >
                                                          ×
                                                        </button>
                                                    </div>
                                                    <div className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)]/70 p-4">
                                                      <p className={clsx(
                                                        "text-lg font-semibold text-gray-900 dark:text-gray-100 leading-snug",
                                                        isCompleted && "line-through opacity-60"
                                                      )}>
                                                        {focusTask.title}
                                                      </p>
                                                      <div className="mt-2 flex items-center gap-2">
                                                        {focusTask.estimatedMinutes && (
                                                          <span className="text-xs px-2 py-1 rounded-full border border-[var(--accent-border)] text-[var(--accent-soft-foreground)]">
                                                            {focusTask.estimatedMinutes}m
                                                          </span>
                                                        )}
                                                        <span className="text-xs px-2 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                                                          P{focusTask.priority || 4}
                                                        </span>
                                                      </div>
                                                      <div className="mt-4 flex flex-wrap gap-2">
                                                        <button
                                                          onClick={handleFocusNextFromPlan}
                                                          disabled={isCompleted}
                                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md disabled:opacity-50 transition-opacity accent-solid-btn"
                                                        >
                                                          <Play size={12} fill="currentColor" />
                                                          Start
                                                        </button>
                                                        <button
                                                          onClick={handleCompleteFocusTask}
                                                          className="px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                                        >
                                                          Mark complete
                                                        </button>
                                                        <button
                                                          onClick={handleSkipFocusTask}
                                                          className="px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                                        >
                                                          Skip
                                                        </button>
                                                      </div>
                                                    </div>
                                                </section>
                                            );
                                        })()}

                                        {/* Up Next - Reorderable Queue */}
                                        {(() => {
                                            const focusTask = dayPlan.find(t => t.id === focusedTaskId) || dayPlan[0];
                                            const queueTasks = dayPlan.filter(t => t.id !== focusTask.id).slice(0, 5);
                                            
                                            if (queueTasks.length === 0) return null;

                                            return (
                                                <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                                                    <div className="mb-2">
                                                        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Up next</h3>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                                            Drag to reorder. Pick any task to make it `Now`.
                                                        </p>
                                                    </div>
                                                    <DndContext
                                                        sensors={planSensors}
                                                        collisionDetection={closestCenter}
                                                        onDragEnd={handlePlanDragEnd}
                                                    >
                                                        <SortableContext
                                                            items={queueTasks.map(t => t.id)}
                                                            strategy={verticalListSortingStrategy}
                                                        >
                                                            <div className="space-y-0.5">
                                                                {queueTasks.map((task, idx) => (
                                                                    <SortableQueueItem
                                                                      key={task.id}
                                                                      task={task}
                                                                      index={idx}
                                                                      onMakeNow={handleSetFocusNow}
                                                                    />
                                                                ))}
               </div>
                                                        </SortableContext>
                                                    </DndContext>
                                                </section>
                                            );
                                        })()}
                                        </>
                                      )}
                       </div>
                                )}
                                
                                {/* Task list stays accessible but de-emphasized while focusing */}
                                {showPlan ? (
                                  <details className="group">
                                    <summary className="cursor-pointer text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center justify-between py-2 px-1">
                                      <span>All today tasks ({filteredTasks.length})</span>
                                      <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                                    </summary>
                                    <div className="mt-2 max-h-[360px] overflow-y-auto">
                                      <TaskList
                                        tasks={filteredTasks}
                                        onUpdateTask={updateTask}
                                        onDeleteTask={deleteTask}
                                        projects={projects}
                                      />
                                    </div>
                                  </details>
                                ) : (
                                  <div className="max-h-[calc(100vh-400px)] overflow-y-auto">
                                    <TaskList
                                      tasks={filteredTasks}
                                      onUpdateTask={updateTask}
                                      onDeleteTask={deleteTask}
                                      projects={projects}
                                    />
                                  </div>
                                )}
                            </section>

                            {/* Upcoming Preview - Collapsed */}
                            {(() => {
                                const upcomingTasks = tasks.filter(t => {
                                    if (t.status === 'done') return false;
                                    const key = effectiveDateKey(t);
                                    if (!key) return false;
                                    const todayStr = formatDateKey(new Date());
                                    return key > todayStr;
                                }).slice(0, 3);
                                
                                if (upcomingTasks.length === 0) return null;
                                
                                return (
                                    <section className="mb-3">
                                        <details className="group">
                                            <summary className="cursor-pointer text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center justify-between py-2 px-1">
                                                <span>Upcoming ({upcomingTasks.length})</span>
                                                <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                                            </summary>
                                            <div className="mt-2 space-y-1 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
                                                {upcomingTasks.map(task => (
                                                    <div key={task.id} className="text-xs text-gray-600 dark:text-gray-400 py-1">
                                                        {task.title}
                     </div>
                   ))}
                   </div>
                                        </details>
                                    </section>
                                );
                            })()}

                            {/* Notes - Collapsed */}
                            <section>
                                <details className="group">
                                    <summary className="cursor-pointer text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center justify-between py-2 px-1">
                                        <span>Notes</span>
                                        <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                                    </summary>
                                    <div className="mt-2">
                                        <DailyNotes userId={userId} onAddTask={addTask} projects={projects} addProject={addProjectFn} isPro={effectiveIsPro} />
                 </div>
                                </details>
                            </section>
                        </>
                    ) : currentView === 'inbox' ? (
                        <>
                            {/* Inbox: Fast Triage View */}
                            
                            {/* Compact Summary Row */}
                            {(() => {
                                const inboxTasks = tasks.filter(t => t.status !== 'done');
                                const todayStr = formatDateKey(new Date());
                                const overdue = inboxTasks.filter(t => {
                                  const dueKey = toDateKey(t.deadline);
                                  return !!dueKey && dueKey < todayStr;
                                }).length;
                                const noDate = inboxTasks.filter(t => !effectiveDateKey(t) && !t.deadline).length;
                                const noPriority = inboxTasks.filter(t => !t.priority || t.priority >= 5).length;
                                
                                return (
                                    <section className="mb-3">
                                        <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                                            <span className="font-medium">{inboxTasks.length} items</span>
                                            {overdue > 0 && (
                                                <span className="text-red-600 dark:text-red-400">{overdue} overdue</span>
                                            )}
                                            {noDate > 0 && (
                                                <span>{noDate} no date</span>
                                            )}
                                            {noPriority > 0 && (
                                                <span>{noPriority} no priority</span>
                                            )}

                                            <div className="ml-auto flex items-center gap-2" />
                                        </div>
                                    </section>
                                );
                            })()}

                            {/* Inbox Task List - Primary Content */}
                            <section className="mb-4">
                                <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                                    <TaskList
                                        tasks={filteredTasks}
                                        onUpdateTask={updateTask}
                                        onDeleteTask={deleteTask}
                                        projects={projects}
                                    />
                                </div>
        </section>

                        </>
                    ) : currentView === 'upcoming' ? (
                        <>
                            {/* Upcoming: Minimal, Calm, Scannable */}
                            
                            {/* Compact Summary */}
                            {(() => {
                                const upcomingTasks = filteredTasks;
                                const todayStr = formatDateKey(new Date());
                                const thisWeek = upcomingTasks.filter(t => {
                                    const key = effectiveDateKey(t);
                                    if (!key) return false;
                                    const taskDate = new Date(`${key}T00:00:00`);
                                    const weekFromNow = new Date();
                                    weekFromNow.setDate(weekFromNow.getDate() + 7);
                                    return taskDate <= weekFromNow;
                                }).length;
                                const thisMonth = upcomingTasks.filter(t => {
                                    const key = effectiveDateKey(t);
                                    if (!key) return false;
                                    const taskDate = new Date(`${key}T00:00:00`);
                                    const monthFromNow = new Date();
                                    monthFromNow.setMonth(monthFromNow.getMonth() + 1);
                                    return taskDate <= monthFromNow;
                                }).length;
                                
                                return (
                                    <section className="mb-3">
                                        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                                            {thisWeek > 0 && <span>{thisWeek} this week</span>}
                                            {thisMonth > thisWeek && <span>{thisMonth - thisWeek} later</span>}
                                        </div>
                                    </section>
                                );
                            })()}

                            {/* Upcoming Task List - Primary Content */}
                            <section className="mb-4">
                                <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                                    <UpcomingTaskList
                                        tasks={filteredTasks}
                                        onUpdateTask={updateTask}
                                        onDeleteTask={deleteTask}
                                        projects={projects}
                                    />
                                </div>
                            </section>
                        </>
                    ) : currentView === 'completed' ? (
                        <>
                            <section className="mb-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Completed Tasks ({filteredTasks.length})
                                    </h2>
                                    <button
                                      type="button"
                                      onClick={handleDeleteAllCompleted}
                                      disabled={filteredTasks.length === 0 || isClearingCompleted}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-red-200 dark:border-red-900/50 text-xs font-semibold text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <Trash2 size={13} />
                                      {isClearingCompleted ? 'Deleting...' : 'Delete all completed'}
                                    </button>
                                </div>
                                <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                                    <TaskList
                                      tasks={filteredTasks}
                                      onUpdateTask={updateTask}
                                      onDeleteTask={deleteTask}
                                      projects={projects}
                                    />
                                </div>
                            </section>
                        </>
                    ) : (
                        <>
                            {/* Other views keep original layout */}
                            <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        {currentProject ? `${currentProject.name} Tasks (${todoTasks.length})` : 
                                         `${currentView.replace('-', ' ')} Tasks (${todoTasks.length})`}
                                    </h2>
          </div>
          <TaskList 
                                    tasks={filteredTasks}
            onUpdateTask={updateTask} 
            onDeleteTask={deleteTask} 
                                    projects={projects}
          />
        </section>
                        </>
                    )}
                </>
            )}
        </div>
      </main>

      {/* Floating Quick Capture Dock */}
      {user && (
        <QuickCaptureDock
          onAddTask={addTask}
          defaultDate={getDefaultDate()}
          projects={projects}
          defaultProjectId={currentProject?.id}
          topInputSelector="#task-input"
        />
      )}

      <CreateTaskModal 
        isOpen={isCreateTaskModalOpen}
        onClose={() => setIsCreateTaskModalOpen(false)}
        onAddTask={addTask}
        userId={user?.id}
        defaultDate={getDefaultDate()}
        projects={projects}
        defaultProjectId={currentProject?.id}
      />

      <AutoPlanModal
        isOpen={isAutoPlanModalOpen}
        onClose={() => setIsAutoPlanModalOpen(false)}
        onAddTasks={handleAutoPlanTasks}
        userId={user?.id}
        projects={projects}
        addProject={addProjectFn}
        proOverride={forceProUser}
        planningPreferences={planningPreferences}
      />

      <InboxCleanupModal
        isOpen={isInboxCleanupModalOpen}
        onClose={() => setIsInboxCleanupModalOpen(false)}
        tasks={currentView === 'inbox' ? tasks.filter(t => t.status !== 'done') : filteredTasks}
        onUpdateTask={updateTask}
        onDeleteTask={deleteTask}
      />

      <OnboardingModal
        isOpen={isOnboardingOpen}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
        onStartTutorial={handleStartTutorial}
      />

      {tutorialStep === 'input' && (
        <TutorialOverlay
          targetId="task-input"
          message="This is where you add tasks"
          position="bottom"
          onDismiss={handleDismissTutorial}
        />
      )}

      {tutorialStep === 'list' && (
        <TutorialOverlay
          targetId="first-task"
          message="Awesome! You just added your first task. Mark it done!"
          position="right"
          onDismiss={handleDismissTutorial}
        />
      )}

      {/* Show completion message briefly? Actually user said: "when user is done... confetti... and 'Way to go! You just finished your first task!'" */}
      
      <FocusSessionModal 
        isOpen={isFocusModalOpen}
        onClose={() => {
          setIsFocusModalOpen(false);
          setFocusModalAutoStart(false);
        }}
        task={activeFocusTask}
        showFocusPlant={focusPlantEnabled}
        autoStart={focusModalAutoStart}
        onComplete={(task) => {
          updateTask({ ...task, status: 'done' });
          setIsFocusModalOpen(false);
          setFocusModalAutoStart(false);
          setActiveFocusTask(null);
        }}
      />
      {isAuthenticated && (
        <>
          <AiAssistant
            userId={user?.id}
            tasks={tasks}
            onUpdateTask={updateTask}
          />
          <AmbientSound />
        </>
      )}
      
      <SettingsModal 
         isOpen={isSettingsOpen}
         onClose={() => setIsSettingsOpen(false)}
         user={user}
         onLogout={handleLogout}
         focusPlantEnabled={focusPlantEnabled}
         onToggleFocusPlant={setFocusPlantEnabled}
         isPro={effectiveIsPro}
         forceProUser={forceProUser}
         onToggleForceProUser={setForceProUser}
         planningPreferences={planningPreferences}
         onPlanningPreferencesChange={setPlanningPreferences}
         onRestartOnboarding={() => setIsOnboardingOpen(true)}
         tasks={tasks}
         filteredTasks={filteredTasks}
         projects={projects}
         currentView={currentView}
      />

      <CreateProjectModal 
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onAddProject={addProjectFn}
      />

      <ActivityLogModal
        isOpen={isActivityLogOpen}
        onClose={() => setIsActivityLogOpen(false)}
        userId={user?.id}
      />
    </div>
  );
}
