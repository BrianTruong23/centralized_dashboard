import { useState } from 'react';
import { Task, TaskPriority, TaskEnergyLevel, TaskCategory } from '@/types/task';
import { generateId } from '@/lib/utils';
import clsx from 'clsx';

interface TaskInputProps {
  onAddTask: (task: Task) => void;
}

const CATEGORIES: TaskCategory[] = ['Research', 'Coding', 'Admin', 'Health', 'Life', 'Finance', 'Social', 'Content', 'UX'];

export const TaskInput = ({ onAddTask }: TaskInputProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('Life');
  const [priority, setPriority] = useState<TaskPriority>(3);
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [energyLevel, setEnergyLevel] = useState<TaskEnergyLevel>('medium');
  const [deadline, setDeadline] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

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
    setDeadline('');
    setIsExpanded(false);
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="What needs to be done?"
            className="flex-1 text-lg font-medium p-2 border-none focus:ring-0 placeholder-gray-400 outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setIsExpanded(true)}
          />
          <button
            type="submit"
            disabled={!title.trim()}
            className="bg-black text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 hover:bg-gray-800 transition-colors"
          >
            Add
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               {/* Category */}
               <div>
                 <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Category</label>
                 <select
                   value={category}
                   onChange={(e) => setCategory(e.target.value as TaskCategory)}
                   className="w-full p-2 bg-gray-50 rounded-md text-sm border-none focus:ring-2 focus:ring-gray-200"
                 >
                   {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
               </div>

               {/* Priority */}
               <div>
                 <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Priority (1-5)</label>
                 <div className="flex gap-1">
                   {([1, 2, 3, 4, 5] as TaskPriority[]).map((p) => (
                     <button
                       key={p}
                       type="button"
                       onClick={() => setPriority(p)}
                       className={clsx(
                         "flex-1 py-1 rounded-md text-sm font-medium transition-colors",
                         priority === p ? 
                           (p >= 4 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700") 
                           : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                       )}
                     >
                       {p}
                     </button>
                   ))}
                 </div>
               </div>

               {/* Energy */}
               <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Energy</label>
                  <div className="flex gap-1">
                    {(['low', 'medium', 'high'] as TaskEnergyLevel[]).map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setEnergyLevel(l)}
                        className={clsx(
                          "flex-1 py-1 rounded-md text-sm font-medium capitalize transition-colors",
                          energyLevel === l ? "bg-green-100 text-green-700" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
               </div>

               {/* Duration */}
               <div>
                 <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Est. Minutes</label>
                 <input
                   type="number"
                   value={estimatedMinutes}
                   onChange={(e) => setEstimatedMinutes(parseInt(e.target.value) || 0)}
                   className="w-full p-2 bg-gray-50 rounded-md text-sm border-none focus:ring-2 focus:ring-gray-200"
                   min="5"
                   step="5"
                 />
               </div>
             </div>
             
             {/* Optional Details */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <textarea
                  placeholder="Notes / Description..."
                  className="w-full p-3 bg-gray-50 rounded-md text-sm border-none focus:ring-2 focus:ring-gray-200 min-h-[80px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Deadline (Optional)</label>
                  <input
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full p-2 bg-gray-50 rounded-md text-sm border-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
             </div>
          </div>
        )}
      </form>
    </div>
  );
};
