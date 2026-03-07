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
import { Zap, CalendarRange, Loader2, Filter, ChevronUp, ChevronDown, Play, Sparkles, Trash2, GripVertical } from 'lucide-react';
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
import { supabase, authReady, SESSION_KEY } from '@/lib/supabase';
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

// Sortable queue item for plan mode
function SortableQueueItem({ task, index }: { task: Task; index: number }) {
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
      className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
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
  const { projects, addProject: addProjectFn, deleteProject } = useProjects();
  
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
  const [user, setUser] = useState<any>(() => {
    // Optimistic load from cache to speed up dashboard display
    if (typeof window !== 'undefined') {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (raw) {
                const cached = JSON.parse(raw);
                if (cached?.user) return cached.user;
            }
        } catch { /* ignore */ }
    }
    return null;
  });

  const [currentView, setCurrentView] = useState('today');
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

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
  
  // Auto Plan State
  const [isAutoPlanModalOpen, setIsAutoPlanModalOpen] = useState(false);
  const [isInboxCleanupModalOpen, setIsInboxCleanupModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
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
        await authReady;
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) { setUser(user); return; }
        } catch { /* network error */ }
        // Fallback: read cached user when Supabase is unreachable
        try {
          const raw = localStorage.getItem(SESSION_KEY);
          if (raw) {
            const cached = JSON.parse(raw);
            if (cached?.user) setUser(cached.user);
          }
        } catch { /* ignore */ }
    };
    fetchUser();

    // Listen for auth changes
    const { data: authListener } = supabase?.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
            setUser(session.user);
            // Persist session to local storage for next load
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        } else {
            setUser(null);
            localStorage.removeItem(SESSION_KEY);
        }
    }) || { data: { subscription: { unsubscribe: () => {} } } };

    return () => {
        authListener?.subscription.unsubscribe();
    };
  }, []);

  // Check if onboarding is needed for new users
  useEffect(() => {
    const checkOnboarding = async () => {
      if (!user || onboardingChecked) return;

      try {
        const status = await db.getOnboardingStatus(user.id);
        setOnboardingChecked(true);

        // Show onboarding only if user has never completed it
        if (!status || !status.completed) {
          setIsOnboardingOpen(true);
        }
      } catch (error: any) {
        console.error('Error checking onboarding status:', error);
        if (error.details) console.error('Error details:', error.details);
        setOnboardingChecked(true);
      }
    };

    checkOnboarding();
  }, [user, onboardingChecked]);

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
    const dueTodayTasks = filterTasksDueToday(tasks, new Date());
    const plan = generateDayPlan(dueTodayTasks, { now: new Date(), energyLevel: 'medium', availableTimeMinutes: 480 });
    setDayPlan(plan);
    setShowPlan(true);
    // Set first task as focused
    if (plan.length > 0) {
      setFocusedTaskId(plan[0].id);
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
    setIsFocusModalOpen(true);
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
    setIsFocusModalOpen(true);
  };

  const handleStartFocusSession = (task: Task) => {
    setActiveFocusTask(task);
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
  const [activeFilters, setActiveFilters] = useState<{
    status: TaskStatus[];
    priority: TaskPriority[];
    category: TaskCategory[];
  }>({
    status: [],
    priority: [],
    category: []
  });

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
        return result.filter(t => t.deadline === todayStr);
    }
    if (currentView === 'upcoming') {
        const todayStr = formatDateKey(new Date());
        return result.filter(t => {
             if (!t.deadline) return false;
             return t.deadline > todayStr;
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

  if (!isLoaded) {
    return <LoadingScreen />;
  }

  const todoTasks = filteredTasks.filter(t => t.status !== 'done');
  const userId = user?.id;

  return (
    <div className="flex h-screen bg-[#fafafa] dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans overflow-hidden">
      
      {/* Auth Modal Blocking */}
      {!user && (
         <AuthModal 
            isOpen={true} 
            onAuthSuccess={(u) => setUser(u)} 
         />
      )}

      {/* Sidebar */}
       <Sidebar
          currentView={currentView}
          onViewChange={setCurrentView}
          tasks={tasks}
          onAddTask={() => setIsCreateTaskModalOpen(true)}
          user={user}
          onLogout={handleLogout}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          projects={projects}
          onDeleteProject={deleteProject}

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

      <main className={`flex-1 overflow-y-auto p-4 md:p-8 ${!user ? 'blur-sm pointer-events-none select-none' : ''}`}>
        <header className={clsx(
          "flex flex-col md:flex-row md:items-start justify-between gap-4 md:gap-0 mx-auto relative",
          currentView === 'calendar' ? "max-w-[1400px]" : "max-w-4xl",
          (currentView === 'today' || currentView === 'inbox' || currentView === 'upcoming' || currentView === 'calendar') ? "mb-4" : "mb-8"
        )}>
          <div>
            <h1 className={clsx(
              "font-bold tracking-tighter mb-1 font-mono uppercase",
              (currentView === 'today' || currentView === 'inbox') ? "text-xl" : "text-3xl"
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

          <div className={clsx("flex items-center gap-2 w-full md:w-auto", currentView === 'calendar' && "hidden")}>
             <div className="relative group flex-1 md:flex-none">
                 <input 
                   type="text" 
                   placeholder="Search..." 
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-black dark:focus:border-white outline-none px-2 py-1 text-sm w-full md:w-32 focus:w-full md:focus:w-48 transition-all"
                 />
             </div>
             
             <div className="relative">
                     <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className={clsx(
                        "p-2 rounded-full transition-colors",
                        showFilters || Object.values(activeFilters).flat().length > 0 
                            ? "bg-black text-white dark:bg-white dark:text-black" 
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
                </div>
        </header>

        <div className={clsx("mx-auto", currentView === 'calendar' ? "max-w-[1400px]" : "max-w-4xl")}>
            {currentView === 'calendar' ? (
                <section>
                    <CalendarWorkspace
                        tasks={tasks.filter(t => t.status !== 'done')}
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
                        <DailyNotes userId={userId} onAddTask={addTask} projects={projects} addProject={addProjectFn} />
          </section>
        <section className="mb-8">
                        <DailyNotesHistory userId={userId} />
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
                                </div>
                                
                                {/* Plan Mode: Clean Execution Queue */}
                                {showPlan && dayPlan.length > 0 && (
                                    <div className="mb-4 space-y-4">
                                        {/* Focus Now - Single Task */}
                                        {(() => {
                                            const focusTask = dayPlan.find(t => t.id === focusedTaskId) || dayPlan[0];
                                            const isCompleted = focusTask.status === 'done';
                                            return (
                                                <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Focus Now</h3>
                                                        <button 
                                                            onClick={() => setShowPlan(false)} 
                                                            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <p className={clsx(
                                                                "text-sm font-medium text-gray-900 dark:text-gray-100",
                                                                isCompleted && "line-through opacity-60"
                                                            )}>
                                                                {focusTask.title}
                                                            </p>
                                                            {focusTask.estimatedMinutes && (
                                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                                    {focusTask.estimatedMinutes}m
                                                                </p>
                                                            )}
                                                        </div>
            <button 
                                                            onClick={handleFocusNextFromPlan}
                                                            disabled={isCompleted}
                                                            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black text-xs font-semibold rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
                                                            <Play size={12} fill="currentColor" />
                                                            Start focus
            </button>
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
                                                <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                                                    <div className="mb-2">
                                                        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Up next</h3>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                                            Ordered by urgency, priority, and effort. Drag to reorder.
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
                                                                    <SortableQueueItem key={task.id} task={task} index={idx} />
                                                                ))}
               </div>
                                                        </SortableContext>
                                                    </DndContext>
                                                </section>
                                            );
                                        })()}
                       </div>
                                )}
                                
                                {/* Full Task List - Always visible */}
                                <div className="max-h-[calc(100vh-400px)] overflow-y-auto">
                                    <TaskList
                                        tasks={filteredTasks}
                                        onUpdateTask={updateTask}
                                        onDeleteTask={deleteTask}
                                        onFocusTask={handleFocusTask}
                                        projects={projects}
                                    />
                       </div>
                            </section>

                            {/* Upcoming Preview - Collapsed */}
                            {(() => {
                                const upcomingTasks = tasks.filter(t => {
                                    if (t.status === 'done') return false;
                                    if (!t.deadline) return false;
                                    const todayStr = formatDateKey(new Date());
                                    return t.deadline > todayStr;
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
                                        <DailyNotes userId={userId} onAddTask={addTask} projects={projects} addProject={addProjectFn} />
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
                                const overdue = inboxTasks.filter(t => t.deadline && t.deadline < todayStr).length;
                                const noDate = inboxTasks.filter(t => !t.deadline).length;
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
                                            {effectiveIsPro && (
                                                <button
                                                    onClick={() => setIsInboxCleanupModalOpen(true)}
                                                    className="ml-auto text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1 transition-colors"
                                                    title="Review inbox for cleanup suggestions"
                                                >
                                                    <Sparkles size={12} />
                                                    Clean-up
                                                </button>
               )}
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
                                        onFocusTask={handleFocusTask}
                                        projects={projects}
                                        isInbox={true}
                                    />
                                </div>
        </section>

                            {/* Notes - Collapsed */}
        <section>
                                <details className="group">
                                    <summary className="cursor-pointer text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center justify-between py-2 px-1">
                                        <span>Notes</span>
                                        <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                                    </summary>
                                    <div className="mt-2">
                                        <DailyNotes userId={userId} onAddTask={addTask} projects={projects} addProject={addProjectFn} />
                                    </div>
                                </details>
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
                                    if (!t.deadline) return false;
                                    const taskDate = new Date(t.deadline);
                                    const weekFromNow = new Date();
                                    weekFromNow.setDate(weekFromNow.getDate() + 7);
                                    return taskDate <= weekFromNow;
                                }).length;
                                const thisMonth = upcomingTasks.filter(t => {
                                    if (!t.deadline) return false;
                                    const taskDate = new Date(t.deadline);
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
                                        onFocusTask={handleFocusTask}
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
                                    onFocusTask={handleFocusTask}
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
        onClose={() => setIsFocusModalOpen(false)}
        task={activeFocusTask}
        showFocusPlant={focusPlantEnabled}
        onComplete={(task) => {
          updateTask({ ...task, status: 'done' });
          setIsFocusModalOpen(false);
          setActiveFocusTask(null);
        }}
      />
      <AiAssistant
        userId={user?.id}
      />
      <AmbientSound />
      
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
