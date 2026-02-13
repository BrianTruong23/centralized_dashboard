'use client';

import { useState, useEffect } from 'react';
import { Task, TaskPriority, TaskEnergyLevel, TaskCategory } from '@/types/task';
import { generateId } from '@/lib/utils';
import clsx from 'clsx';
import { X, Calendar, Clock, Zap, Tag, Flag, FolderKanban } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTask: (task: Task) => void;
  userId?: string;
  defaultDate?: string;
}


const ENERGY_LEVELS: TaskEnergyLevel[] = ['low', 'medium', 'high'];

export function CreateTaskModal({ isOpen, onClose, onAddTask, userId, defaultDate }: CreateTaskModalProps) {
  const { projects, isLoading } = useProjects();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('Life');
  const [priority, setPriority] = useState<TaskPriority>(3);
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [energyLevel, setEnergyLevel] = useState<TaskEnergyLevel>('medium');
  const [deadline, setDeadline] = useState(defaultDate || '');
  const [projectId, setProjectId] = useState<string>('');

  useEffect(() => {
    if (isOpen && defaultDate) setDeadline(defaultDate);
  }, [isOpen, defaultDate]);

  // Auto-select first project (Life) when projects load
  useEffect(() => {
    if (projects.length > 0 && !projectId) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newTask: Task = {
      id: generateId(),
      user_id: userId,
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
      project_id: projectId || undefined,
    };

    onAddTask(newTask);
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCategory('Life');
    setPriority(3);
    setEstimatedMinutes(30);
    setEnergyLevel('medium');
    setDeadline(defaultDate || '');
    setProjectId(projects.length > 0 ? projects[0].id : '');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Create New Task</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
           {/* Title */}
           <div>
             <input
               type="text"
               placeholder="What needs to be done?"
               value={title}
               onChange={(e) => setTitle(e.target.value)}
               autoFocus
               className="w-full text-xl font-semibold bg-transparent border-none outline-none placeholder-gray-400 text-gray-900 dark:text-gray-100"
               required
             />
           </div>

           {/* Description */}
           <div>
             <textarea
               placeholder="Add details, context, or subtasks..."
               value={description}
               onChange={(e) => setDescription(e.target.value)}
               className="w-full h-24 text-sm bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border-none outline-none resize-none placeholder-gray-400 text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-black dark:focus:ring-gray-600 transition-all"
             />
           </div>

           {/* Properties Grid */}
           <div className="grid grid-cols-2 gap-4">
              {/* Project (Labeled as Category per requirement) */}
              <div className="space-y-1.5 col-span-2">
                <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
                  <Tag size={12} /> Category
                </label>
                <select
                  value={projectId}
                  onChange={(e) => {
                     setProjectId(e.target.value);
                     // Update internal category state for metadata
                     const p = projects.find(proj => proj.id === e.target.value);
                     if (p) setCategory(p.name);
                  }}
                  className={clsx(
                      "w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-2 outline-none focus:border-black dark:focus:border-gray-500 transition-colors",
                      isLoading && "opacity-50 cursor-wait"
                  )}
                  required
                >
                  {isLoading ? (
                    <option value="">Loading projects...</option>
                  ) : projects.length === 0 ? (
                    <option value="">No projects found</option>
                  ) : (
                    projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
                   <Flag size={12} /> Priority
                </label>
                <div className="flex bg-gray-50 dark:bg-gray-800 rounded-md p-1 border border-gray-200 dark:border-gray-700">
                   {[1, 2, 3, 4, 5].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p as TaskPriority)}
                        className={clsx(
                          "flex-1 text-xs font-medium py-1 rounded transition-colors",
                          priority === p 
                            ? "bg-white dark:bg-gray-700 shadow-sm text-black dark:text-white" 
                            : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        )}
                      >
                        {p}
                      </button>
                   ))}
                </div>
              </div>

               {/* Duration */}
               <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
                  <Clock size={12} /> Duration (min)
                </label>
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(parseInt(e.target.value) || 0)}
                  className="w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 outline-none focus:border-black dark:focus:border-gray-500 transition-colors"
                />
              </div>

              {/* Energy */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
                  <Zap size={12} /> Energy
                </label>
                <div className="flex bg-gray-50 dark:bg-gray-800 rounded-md p-1 border border-gray-200 dark:border-gray-700">
                    {ENERGY_LEVELS.map((level) => (
                        <button
                            key={level}
                            type="button"
                            onClick={() => setEnergyLevel(level)}
                            className={clsx(
                            "flex-1 text-xs font-medium py-1 rounded capitalize transition-colors",
                            energyLevel === level
                                ? "bg-white dark:bg-gray-700 shadow-sm text-black dark:text-white" 
                                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            )}
                        >
                            {level}
                        </button>
                    ))}
                </div>
              </div>

              {/* Deadline */}
              <div className="col-span-2 space-y-1.5">
                 <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
                   <Calendar size={12} /> Due Date
                 </label>
                 <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 outline-none focus:border-black dark:focus:border-gray-500 transition-colors text-gray-700 dark:text-gray-300"
                 />
              </div>
           </div>

           {/* Footer Action */}
           <div className="pt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="px-6 py-2 text-sm font-bold bg-black dark:bg-white text-white dark:text-black rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
              >
                Create Task
              </button>
           </div>
        </form>
      </div>
    </div>
  );
}
