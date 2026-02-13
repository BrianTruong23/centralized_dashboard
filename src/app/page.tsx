'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useProjects } from '@/hooks/useProjects';
import { TaskInput } from '@/components/TaskInput';
import { TaskList } from '@/components/TaskList';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { FocusSessionModal } from '@/components/FocusSessionModal';
import { TaskItem } from '@/components/TaskItem';
import { pickNextTask, generateDayPlan } from '@/lib/scheduler';
import { Task } from '@/types/task';
import { FocusTimer } from '@/components/FocusTimer';
import { AuthModal } from '@/components/AuthModal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Zap, CalendarRange, Loader2, Filter, ChevronUp, ChevronDown, Play } from 'lucide-react';
import { DailyNotes } from '@/components/DailyNotes';
import { AmbientSound } from '@/components/AmbientSound';
import { Sidebar } from '@/components/Sidebar';
import { KanbanBoard } from '@/components/KanbanBoard';
import { FilterPanel } from '@/components/FilterPanel';
import { TaskStatus, TaskPriority, TaskCategory } from '@/types/task';
import clsx from 'clsx';
import { supabase, authReady, SESSION_KEY } from '@/lib/supabase';
import Link from 'next/link';

const loadingMessages = [
  'Loading dashboard...',
  'Hang tight...',
  'Almost there...',
  'Getting things ready...',
  'Just a moment...',
];

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
  const { tasks, addTask, updateTask, deleteTask, isLoaded } = useTasks();
  const { projects } = useProjects();
  const [showPlan, setShowPlan] = useState(false);
  const [dayPlan, setDayPlan] = useState<Task[]>([]);
  const [isFocusing, setIsFocusing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [currentView, setCurrentView] = useState('today');
  
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

  const getDefaultDate = () => {
    if (currentView === 'today') {
      return new Date().toISOString().split('T')[0];
    }
    if (currentView === 'upcoming') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
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
        } else {
            setUser(null);
        }
    }) || { data: { subscription: { unsubscribe: () => {} } } };

    return () => {
        authListener?.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    if (!supabase) return;
    try {
        await supabase.auth.signOut();
        localStorage.removeItem(SESSION_KEY);
        setUser(null);
    } catch (error) {
        console.error('Logout error:', error);
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
    const plan = generateDayPlan(tasks, { now: new Date(), energyLevel: 'medium', availableTimeMinutes: 480 });
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

  const handleFocusTask = (task: Task) => {
    setManualFocusTaskId(task.id);
  };

  const handleStartFocusSession = (task: Task) => {
    setActiveFocusTask(task);
    setIsFocusModalOpen(true);
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
    if (currentView === 'inbox' || currentView === 'kanban') {
        return result;
    }
    if (currentView === 'today') {
        const now = new Date();
        return result.filter(t => {
            if (!t.deadline) return false;
            // Parse as local date to compare day matches
            // (Assuming deadline stored as YYYY-MM-DD or ISO)
            const d = new Date(t.deadline);
            return d.getDate() === now.getDate() && 
                   d.getMonth() === now.getMonth() && 
                   d.getFullYear() === now.getFullYear();
        });
    }
    if (currentView === 'upcoming') {
        const now = new Date();
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        return result.filter(t => {
             if (!t.deadline) return false;
             return new Date(t.deadline) > todayEnd;
        });
    }
    if (currentView.startsWith('project-')) {
        const tag = currentView.replace('project-', '');
        return result.filter(t => t.tags?.includes(tag));
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
       />

       <CreateTaskModal
          isOpen={isCreateTaskModalOpen}
          onClose={() => setIsCreateTaskModalOpen(false)}
          onAddTask={addTask}
          userId={userId}
       />

      <main className={`flex-1 overflow-y-auto px-8 py-8 ${!user ? 'blur-sm pointer-events-none select-none' : ''}`}>
        <header className="mb-8 flex items-start justify-between max-w-4xl mx-auto relative">
          <div>
            <h1 className="text-3xl font-bold tracking-tighter mb-1 font-mono uppercase">
               {viewTitle}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
                {currentView === 'kanban' ? 'Visual workflow' : 'Design your day, master your time.'} 
                <Link href="/features" className="underline hover:text-black dark:hover:text-white ml-2">Features</Link>
            </p>
          </div>

          <div className="flex items-center gap-2">
             <div className="relative group">
                 <input 
                   type="text" 
                   placeholder="Search..." 
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-black dark:focus:border-white outline-none px-2 py-1 text-sm w-32 focus:w-48 transition-all"
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
                 />
             </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto">
            {/* Focus Now section removed */}

            {currentView === 'kanban' ? (
                <section className="h-[calc(100vh-200px)]">
                    <KanbanBoard 
                        tasks={filteredTasks} 
                        onUpdateTask={updateTask} 
                        onDeleteTask={deleteTask}
                        onFocusTask={handleFocusTask}
                    />
                </section>
            ) : currentView === 'daily-notes' ? (
                <section className="mb-8">
                    <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                        Today&apos;s Notes
                    </h2>
                    <DailyNotes userId={userId} onAddTask={addTask} showHistory={true} />
                </section>
            ) : (
                <>
                    <section className="mb-8">
                    <section className="mb-8">
                        <TaskInput 
                            onAddTask={addTask} 
                            defaultDate={getDefaultDate()}
                        />
                    </section>
                    </section>

                    {(currentView === 'inbox' || currentView === 'today') && (
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
                                    <button onClick={() => setShowPlan(false)} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">Close</button>
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
                                            <div className="flex-1 pb-1 flex items-start justify-between gap-4">
                                                <div className="flex-1">
                                                    <TaskItem 
                                                        task={task} 
                                                        onUpdate={updateTask} 
                                                        onDelete={deleteTask} 
                                                        onFocus={handleFocusTask}
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => handleStartFocusSession(task)}
                                                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black text-xs font-bold rounded-lg hover:opacity-80 transition-opacity mt-1"
                                                >
                                                    <Play size={10} fill="currentColor" />
                                                    Focus
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
                        />
                    </section>
                    
                    {(currentView === 'inbox' || currentView === 'today') && (
                        <section className="mb-8">
                            <DailyNotes userId={userId} onAddTask={addTask} showHistory={false} />
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
      />

      <FocusSessionModal 
        isOpen={isFocusModalOpen}
        onClose={() => setIsFocusModalOpen(false)}
        task={activeFocusTask}
        onComplete={(task) => {
          updateTask({ ...task, status: 'done' });
          setIsFocusModalOpen(false);
          setActiveFocusTask(null);
        }}
      />
      <AmbientSound />
    </div>
  );
}
