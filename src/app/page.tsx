'use client';

import { useTasks } from '@/hooks/useTasks';
import { TaskInput } from '@/components/TaskInput';
import { TaskList } from '@/components/TaskList';

export default function Home() {
  const { tasks, addTask, updateTask, deleteTask, isLoaded } = useTasks();

  if (!isLoaded) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-gray-900 font-sans pb-20">
      <main className="max-w-xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">My Dashboard</h1>
          <p className="text-gray-500 text-sm">Design your day, master your time.</p>
        </header>

        <section className="mb-8">
          <TaskInput onAddTask={addTask} />
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Tasks ({tasks.filter(t => t.status !== 'done').length})</h2>
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
