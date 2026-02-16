'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useProjects } from '@/hooks/useProjects';
import { TaskInput } from '@/components/TaskInput';
import { TaskList } from '@/components/TaskList';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { FocusSessionModal } from '@/components/FocusSessionModal';
import { pickNextTask, generateDayPlan, filterTasksDueToday } from '@/lib/scheduler';
import { Task } from '@/types/task';
import { AuthModal } from '@/components/AuthModal';
import { Zap, CalendarRange, Loader2, Filter, ChevronUp, ChevronDown, Play, Sparkles, Trash2 } from 'lucide-react';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { DailyNotes } from '@/components/DailyNotes';
import { DailyNotesHistory } from '@/components/DailyNotesHistory';
import { AmbientSound } from '@/components/AmbientSound';
import { Sidebar } from '@/components/Sidebar';
import { KanbanBoard } from '@/components/KanbanBoard';
import { FilterPanel } from '@/components/FilterPanel';
import { AutoPlanModal } from '@/components/AutoPlanModal';
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
  const { projects, addProject: addProjectFn } = useProjects();
  
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
    setActiveFocusTask(dayPlan[0]);
    setIsFocusModalOpen(true);
  };

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
        <header className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-4 md:gap-0 max-w-4xl mx-auto relative">
          <div>
            <h1 className="text-3xl font-bold tracking-tighter mb-1 font-mono uppercase">
               {viewTitle}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm min-h-[20px]">
                {currentView === 'kanban' ? 'Visual workflow' : 
                 currentView === 'today' ? (
                    <>
                        Design your day, master your time. 
                        <Link href="https://forms.gle/K8z21uKNX5ieb7Ai9" target="_blank" rel="noopener noreferrer" className="underline hover:text-black dark:hover:text-white ml-2">Features</Link>
                    </>
                 ) : null}
            </p>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
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

        <div className="max-w-4xl mx-auto">
            {currentView === 'kanban' ? (
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
                    {suggestedTask && (
                        <section className="mb-6">
                            <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                        Focus Now
                                    </p>
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                        {suggestedTask.title}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleStartFocusSession(suggestedTask)}
                                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black text-xs font-bold rounded-lg hover:opacity-90 transition-opacity"
                                >
                                    <Zap size={14} />
                                    Focus Now
                                </button>
                            </div>
                        </section>
                    )}

                    <section className="mb-8">
                        <TaskInput
                            onAddTask={addTask}
                            defaultDate={getDefaultDate()}
                            projects={projects}
                            defaultProjectId={currentProject?.id}
                            isHighlighted={tutorialStep === 'input'}
                        />
                    </section>

                    {/* Auto Plan Section for Inbox */}
                     {currentView === 'inbox' && (
                        <section className="mb-8">
                             {effectiveIsPro ? (
                                <button
                                  onClick={() => setIsAutoPlanModalOpen(true)}
                                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-gray-500 dark:text-gray-400 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-all font-medium"
                                >
                                  <Sparkles size={18} />
                                  Auto Plan My Week
                                </button>
                             ) : (
                                <div className="w-full rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/10 p-4">
                                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-1">Pro Feature</p>
                                  <p className="text-xs text-amber-700/90 dark:text-amber-300/90 mb-3">
                                    Auto Plan is available on Pro. Upgrade to unlock AI-assisted weekly planning.
                                  </p>
                                  <Link
                                    href="/upgrade"
                                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity"
                                  >
                                    <Sparkles size={14} />
                                    {premiumLoading ? 'Checking plan...' : 'Upgrade to Pro'}
                                  </Link>
                                </div>
                             )}
                        </section>
                    )}

                    {currentView === 'today' && (
                        <section className="mb-8">
                            {!showPlan ? (
                                <button
                                onClick={handleGeneratePlan}
                                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-all"
                                >
                                <CalendarRange size={18} />
                                Generate Today&apos;s Plan
                                </button>
                            ) : (
                                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Today&apos;s Schedule</h2>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={handleFocusNextFromPlan}
                                        disabled={dayPlan.length === 0}
                                        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black text-xs font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                                      >
                                        <Play size={10} fill="currentColor" />
                                        Focus Next
                                      </button>
                                      <button onClick={() => setShowPlan(false)} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">Close</button>
                                    </div>
                                </div>
                                {dayPlan.length > 0 ? (
                                    <div className="space-y-4">
                                    {dayPlan.map((task, idx) => (
                                        <div key={task.id} className="flex gap-3 relative">
                                        {idx !== dayPlan.length - 1 && <div className="absolute left-3.5 top-8 bottom-[-16px] w-0.5 bg-gray-100" />}
                                        <div className="flex-shrink-0 w-7 h-[60px] flex flex-col items-center justify-between py-1 bg-blue-50 text-blue-600 rounded-full border border-blue-100 z-10">
                                            <button 
                                                onClick={() => moveTaskUp(idx)} 
                                                disabled={idx === 0}
                                                className="p-0.5 text-blue-400 hover:text-blue-700 disabled:opacity-30"
                                            >
                                                <ChevronUp size={12} />
                                            </button>
                                            <span className="text-xs font-bold leading-none">{idx + 1}</span>
                                            <button 
                                                onClick={() => moveTaskDown(idx)} 
                                                disabled={idx === dayPlan.length - 1}
                                                className="p-0.5 text-blue-400 hover:text-blue-700 disabled:opacity-30"
                                            >
                                                <ChevronDown size={12} />
                                            </button>
                                        </div>
                                            <div className="flex-1 pb-1 flex items-start justify-between gap-4 border-b border-gray-100 dark:border-gray-700 py-2">
                                                <div className="min-w-0">
                                                  <p className="text-base font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</p>
                                                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                                    <span>{task.category}</span>
                                                    <span>·</span>
                                                    <span>{task.estimatedMinutes}m</span>
                                                    <span>·</span>
                                                    <span>P{task.priority}</span>
                                                    {task.deadline && (
                                                      <>
                                                        <span>·</span>
                                                        <span>{formatPlanDate(task.deadline) ?? task.deadline}</span>
                                                      </>
                                                    )}
                                                  </div>
                                                </div>
                                                <button
                                                  onClick={() => removeTaskFromPlan(task.id)}
                                                  className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                  title="Remove from today's plan (proposal only)"
                                                >
                                                  <Trash2 size={12} />
                                                  Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="mt-4 pt-4 border-t text-center text-xs text-gray-400">
                                        Total Focus: {dayPlan.reduce((acc, t) => acc + t.estimatedMinutes, 0) / 60} hours
                                    </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400 text-center py-4">No suitable tasks found for plan.</p>
                                )}
                                </div>
                            )}
                        </section>
                    )}

                    <section className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {currentProject ? `${currentProject.name} Tasks (${todoTasks.length})` : 
                                 currentView === 'inbox' ? `All Tasks (${todoTasks.length})` : 
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
                    
                    {(currentView === 'inbox' || currentView === 'today') && (
                        <section className="mb-8">
                            <DailyNotes userId={userId} onAddTask={addTask} projects={projects} addProject={addProjectFn} />
                        </section>
                    )}
                </>
            
            )}
        </div>
      </main>
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

      <OnboardingModal
        isOpen={isOnboardingOpen}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
        onStartTutorial={handleStartTutorial}
      />

      {tutorialStep === 'input' && (
        <>
          <TutorialOverlay
            targetId="task-input"
            message="This is where you add tasks"
            position="bottom"
            onDismiss={handleDismissTutorial}
          />
          <TutorialOverlay
            targetId="sidebar-add-task"
            message="Or use this button"
            position="right"
            onDismiss={handleDismissTutorial}
          />
        </>
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
