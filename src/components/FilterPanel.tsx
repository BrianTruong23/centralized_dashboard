import React from 'react';
import { Filter, X, Check } from 'lucide-react';
import clsx from 'clsx';
import { TaskStatus, TaskPriority, TaskCategory } from '@/types/task';
import { useProjects } from '@/hooks/useProjects';

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeFilters: {
    status: TaskStatus[];
    priority: TaskPriority[];
    category: TaskCategory[];
  };
  onFilterChange: (type: 'status' | 'priority' | 'category', value: any) => void;
  onClearFilters: () => void;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'doing', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 1, label: 'Priority 1' },
  { value: 2, label: 'Priority 2' },
  { value: 3, label: 'Priority 3' },
  { value: 4, label: 'Priority 4' },
  { value: 5, label: 'Priority 5' },
];

const CATEGORY_OPTIONS: TaskCategory[] = [
  'Research', 'Coding', 'Admin', 'Health', 'Life', 'Finance', 'Social', 'Content', 'UX'
];

export const FilterPanel = ({
  isOpen,
  onClose,
  activeFilters,
  onFilterChange,
  onClearFilters
}: FilterPanelProps) => {
  const { projects, isLoading } = useProjects();
  if (!isOpen) return null;

  const hasActiveFilters = 
    activeFilters.status.length > 0 || 
    activeFilters.priority.length > 0 || 
    activeFilters.category.length > 0;

  const toggleFilter = (type: 'status' | 'priority' | 'category', value: any) => {
    onFilterChange(type, value);
  };

  return (
    <div className="absolute top-12 right-0 z-50 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Filter size={16} /> Filters
        </h3>
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-6 max-h-[60vh] overflow-y-auto">
        {/* Status Section */}
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Status</h4>
          <div className="space-y-2">
            {STATUS_OPTIONS.map((option) => (
              <label 
                key={option.value} 
                className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300 cursor-pointer group hover:text-gray-900 dark:hover:text-white"
              >
                <div className={clsx(
                  "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                  activeFilters.status.includes(option.value) 
                    ? "bg-black dark:bg-white border-black dark:border-white text-white dark:text-black" 
                    : "border-gray-300 dark:border-gray-600 group-hover:border-gray-400"
                )}>
                  {activeFilters.status.includes(option.value) && <Check size={10} strokeWidth={3} />}
                </div>
                <input 
                  type="checkbox" 
                  className="hidden"
                  checked={activeFilters.status.includes(option.value)}
                  onChange={() => toggleFilter('status', option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {/* Priority Section */}
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Priority</h4>
          <div className="flex flex-wrap gap-2">
            {PRIORITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => toggleFilter('priority', option.value)}
                className={clsx(
                  "px-3 py-1.5 text-xs font-medium rounded-md border transition-all",
                  activeFilters.priority.includes(option.value)
                    ? "bg-black dark:bg-white text-white dark:text-black border-black dark:border-white"
                    : "bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Section */}
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Project / Category</h4>
          <div className="flex flex-wrap gap-2">
            {isLoading ? (
                <span className="text-xs text-gray-400 animate-pulse">Loading projects...</span>
            ) : projects.length === 0 ? (
                <span className="text-xs text-gray-400 italic">No projects found</span>
            ) : projects.map((project) => (
              <button
                key={project.id}
                onClick={() => toggleFilter('category', project.name)}
                className={clsx(
                  "px-3 py-1.5 text-xs font-medium rounded-full border transition-all",
                  activeFilters.category.includes(project.name as any)
                    ? "bg-black dark:bg-white text-white dark:text-black border-black dark:border-white"
                    : "bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
              >
                {project.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 flex justify-between items-center text-xs">
        <span className="text-gray-400">
            {Object.values(activeFilters).flat().length} active
        </span>
        {hasActiveFilters && (
          <button 
            onClick={onClearFilters}
            className="text-red-500 hover:text-red-700 font-medium"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
};
