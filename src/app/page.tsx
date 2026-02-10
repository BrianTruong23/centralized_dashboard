'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { TaskInput } from '@/components/TaskInput';
import { TaskList } from '@/components/TaskList';
import { TaskItem } from '@/components/TaskItem';
import { pickNextTask, generateDayPlan } from '@/lib/scheduler';
import { Task } from '@/types/task';
import { FocusTimer } from '@/components/FocusTimer';
import { Auth } from '@/components/Auth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Zap, CalendarRange, Loader2 } from 'lucide-react';
import { DailyNotes } from '@/components/DailyNotes';
import { AmbientSound } from '@/components/AmbientSound';
import { supabase, authReady } from '@/lib/supabase';

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
  const [showPlan, setShowPlan] = useState(false);
  const [dayPlan, setDayPlan] = useState<Task[]>([]);
  const [isFocusing, setIsFocusing] = useState(false);
  const [userId, setUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const fetchUser = async () => {
        if (!supabase) return;
        await authReady;
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setUserId(user.id);
    };
    fetchUser();

    // Listen for auth changes
    const { data: authListener } = supabase?.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
            setUserId(session.user.id);
        } else {
            setUserId(undefined);
        }
    }) || { data: { subscription: { unsubscribe: () => {} } } };

    return () => {
        authListener?.subscription.unsubscribe();
    };
  }, []);

  /* Logic restored */
  const suggestedTask = useMemo(() => {
    if (!isLoaded || tasks.length === 0) return null;
    return pickNextTask(tasks, { now: new Date(), energyLevel: 'medium' });
  }, [tasks, isLoaded]);

  const handleGeneratePlan = () => {
    const plan = generateDayPlan(tasks, { now: new Date(), energyLevel: 'medium', availableTimeMinutes: 480 });
    setDayPlan(plan);
    setShowPlan(true);
  };

  if (!isLoaded) {
    return <LoadingScreen />;
  }

  const todoTasks = tasks.filter(t => t.status !== 'done');

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans pb-20">
      <main className="max-w-xl mx-auto px-4 py-8">
        <header className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1">My Dashboard</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Design your day, master your time. <Link href="/features" className="underline hover:text-black dark:hover:text-white">Features</Link></p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Auth />
          </div>
        </header>

        {/* Now Panel */}
        {suggestedTask && (
          <section className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            {isFocusing ? (
              <FocusTimer 
                task={suggestedTask} 
                onComplete={(t) => {
                  updateTask({ ...t, status: 'done' });
                  setIsFocusing(false);
                }}
                onStop={() => setIsFocusing(false)}
              />
            ) : (
                <div className="bg-black dark:bg-gray-800 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-10">
                     <Zap size={100} />
                   </div>
                   <div className="relative z-10">
                     <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Focus Now</h2>
                     <h3 className="text-2xl font-bold mb-2">{suggestedTask.title}</h3>
                     <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                       {suggestedTask.description || 'No description provided.'}
                     </p>
                     <div className="flex items-center gap-3">
                        <span className="text-xs bg-gray-800 px-2 py-1 rounded border border-gray-700">
                          {suggestedTask.estimatedMinutes}m
                        </span>
                        <span className="text-xs bg-gray-800 px-2 py-1 rounded border border-gray-700 capitalize">
                          {suggestedTask.category}
                        </span>
                        {suggestedTask.deadline && (
                          <span className="text-xs text-red-400 font-medium">
                            Due soon
                          </span>
                        )}
                     </div>
                     <button 
                       onClick={() => setIsFocusing(true)}
                       className="mt-6 w-full bg-white text-black font-bold py-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                     >
                       <Zap size={16} fill="currentColor" />
                       Start Focus Session
                     </button>
                   </div>
                </div>
            )}
          </section>
        )}

        <section className="mb-8">
          <TaskInput onAddTask={addTask} />
        </section>

        {/* All Tasks Section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">All Tasks ({todoTasks.length})</h2>
          </div>
          <TaskList
            tasks={tasks}
            onUpdateTask={updateTask}
            onDeleteTask={deleteTask}
          />
        </section>

        {/* Day Plan Generator */}
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
                       <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold border border-blue-100 z-10">
                         {idx + 1}
                       </div>
                       <div className="flex-1 pb-1">
                          <TaskItem task={task} onUpdate={updateTask} onDelete={deleteTask} />
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

        {/* Daily Notes Section */}
        <section className="mb-8">
            <DailyNotes userId={userId} onAddTask={addTask} />
        </section>
      </main>
      <AmbientSound />
    </div>
  );
}
