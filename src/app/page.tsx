'use client';

import { useState, useMemo } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { TaskInput } from '@/components/TaskInput';
import { TaskList } from '@/components/TaskList';
import { TaskItem } from '@/components/TaskItem';
import { pickNextTask, generateDayPlan } from '@/lib/scheduler';
import { Task } from '@/types/task';
import { Zap, CalendarRange } from 'lucide-react';

export default function Home() {
  const { tasks, addTask, updateTask, deleteTask, isLoaded } = useTasks();
  const [showPlan, setShowPlan] = useState(false);
  const [dayPlan, setDayPlan] = useState<Task[]>([]);

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
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading dashboard...</div>;
  }

  const todoTasks = tasks.filter(t => t.status !== 'done');

  return (
    <div className="min-h-screen bg-[#fafafa] text-gray-900 font-sans pb-20">
      <main className="max-w-xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">My Dashboard</h1>
          <p className="text-gray-500 text-sm">Design your day, master your time.</p>
        </header>

        {/* Now Panel */}
        {suggestedTask && (
          <section className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="bg-black text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
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
                   onClick={() => updateTask({ ...suggestedTask, status: 'done' })}
                   className="mt-6 w-full bg-white text-black font-bold py-2 rounded-lg hover:bg-gray-100 transition-colors"
                 >
                   Mark as Done
                 </button>
               </div>
            </div>
          </section>
        )}

        <section className="mb-8">
          <TaskInput onAddTask={addTask} />
        </section>

        {/* Day Plan Generator */}
        <section className="mb-8">
          {!showPlan ? (
            <button 
              onClick={handleGeneratePlan}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-all"
            >
              <CalendarRange size={18} />
              Generate Today's Plan
            </button>
          ) : (
            <div className="bg-white p-4 rounded-xl border border-gray-200">
               <div className="flex items-center justify-between mb-4">
                 <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Today's Schedule</h2>
                 <button onClick={() => setShowPlan(false)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
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

        <section>
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">All Tasks ({todoTasks.length})</h2>
          </div>
          <TaskList 
            tasks={tasks} 
            onUpdateTask={updateTask} 
            onDeleteTask={deleteTask} 
          />
        </section>
      </main>
    </div>
  );
}
