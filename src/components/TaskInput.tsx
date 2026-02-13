import { useState, useEffect } from 'react';
import { Task, TaskPriority, TaskEnergyLevel, TaskCategory } from '@/types/task';
import { generateId } from '@/lib/utils';
import clsx from 'clsx';
import { Plus } from 'lucide-react';

interface TaskInputProps {
  onAddTask: (task: Task) => void;
  defaultDate?: string;
}

const CATEGORIES: TaskCategory[] = ['Research', 'Coding', 'Admin', 'Health', 'Life', 'Finance', 'Social', 'Content', 'UX'];

export const TaskInput = ({ onAddTask, defaultDate }: TaskInputProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('Life');
  const [priority, setPriority] = useState<TaskPriority>(3);
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [energyLevel, setEnergyLevel] = useState<TaskEnergyLevel>('medium');
  const [deadline, setDeadline] = useState(defaultDate || '');
  const [isExpanded, setIsExpanded] = useState(false);

  // Update deadline when defaultDate changes (e.g. switching views)
  useEffect(() => {
    setDeadline(defaultDate || '');
  }, [defaultDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newTask: Task = {
      id: generateId(),
      title,
      description,
      category,
      priority,
      estimatedMinutes,
      energyLevel,
      status: 'todo',
      tags: [],
      createdAt: Date.now(),
      deadline: deadline || undefined,
    };

    onAddTask(newTask);

    // Reset form
    setTitle('');
    setDescription('');
    // Keep other defaults or reset? Resetting usually better.
    setPriority(3);
    setEstimatedMinutes(60);
    setEnergyLevel('medium');
    setDeadline(defaultDate || '');
    setIsExpanded(false);
  };

  return (
    <div className="mb-8">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 pb-2 focus-within:border-gray-400 dark:focus-within:border-gray-600 transition-colors">
          <div className="text-gray-400">
             <Plus size={20} />
          </div>
          <input
            type="text"
            placeholder="Add new task..."
            className="flex-1 text-lg bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setIsExpanded(true)}
          />
          {title.trim() && (
             <button
                type="submit"
                className="text-sm font-semibold text-black dark:text-white hover:opacity-70"
             >
                Enter
             </button>
          )}
        </div>

        {isExpanded && (
          <div className="mt-3 pl-8 flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1">
             {/* Quick select priority */}
             <div className="flex bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
                 {([1, 2, 3] as TaskPriority[]).map(p => (
                   <button
                     key={p}
                     type="button"
                     onClick={() => setPriority(p)}
                     className={clsx(
                       "px-2 py-0.5 text-xs font-medium rounded transition-colors",
                       priority === p ? "bg-white dark:bg-black shadow-sm text-black dark:text-white" : "text-gray-500 hover:text-gray-800"
                     )}
                   >
                     P{p}
                   </button>
                 ))}
             </div>

             {/* Duration Input */}
             <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-md px-2 py-0.5">
                <span className="text-[10px] text-gray-400 uppercase font-bold">MINS</span>
                <input 
                  type="number"
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(parseInt(e.target.value)||0)}
                  className="w-12 bg-transparent text-xs outline-none border-none text-center font-medium"
                />
             </div>

             {/* Category Select - Simple */}
             <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory)}
                className="bg-gray-100 dark:bg-gray-800 text-xs font-medium rounded-md px-2 py-1 outline-none border-none"
             >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
             </select>

             {/* Date Picker Input */}
             <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-md px-2 py-0.5">
                <span className="text-[10px] text-gray-400 uppercase font-bold">DUE</span>
                <input 
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="bg-transparent text-xs outline-none border-none font-medium text-gray-600 dark:text-gray-300 w-24"
                />
             </div>

             {/* Cancel/Collapse */}
             <button 
                type="button" 
                onClick={() => setIsExpanded(false)}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600"
             >
                Close
             </button>
          </div>
        )}
      </form>
    </div>
  );
};
