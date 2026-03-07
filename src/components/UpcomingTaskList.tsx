'use client';

import { Task } from '@/types/task';
import { Project } from '@/types/project';
import { formatDateKey, formatDateDisplay } from '@/lib/dateKey';
import { Calendar, Zap, Trash2 } from 'lucide-react';

interface UpcomingTaskListProps {
  tasks: Task[];
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onFocusTask: (task: Task) => void;
  projects?: Project[];
}

export const UpcomingTaskList = ({ 
  tasks, 
  onUpdateTask, 
  onDeleteTask, 
  onFocusTask, 
  projects = [] 
}: UpcomingTaskListProps) => {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-gray-500">
        <p className="text-sm">No upcoming tasks</p>
      </div>
    );
  }

  // Sort by deadline (ascending), then by priority (desc)
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.deadline && b.deadline) {
      const dateA = new Date(a.deadline).getTime();
      const dateB = new Date(b.deadline).getTime();
      if (dateA !== dateB) return dateA - dateB;
    }
    if (a.deadline && !b.deadline) return -1;
    if (!a.deadline && b.deadline) return 1;
    return b.priority - a.priority;
  });

  return (
    <div className="space-y-1">
      {sortedTasks.map((task) => (
        <UpcomingTaskItem
          key={task.id}
          task={task}
          onUpdate={onUpdateTask}
          onDelete={onDeleteTask}
          onFocus={onFocusTask}
          projects={projects}
        />
      ))}
    </div>
  );
};

interface UpcomingTaskItemProps {
  task: Task;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
  onFocus: (task: Task) => void;
  projects?: Project[];
}

const UpcomingTaskItem = ({ task, onUpdate, onDelete, onFocus, projects = [] }: UpcomingTaskItemProps) => {
  const project = projects.find(p => p.id === task.project_id);
  
  const toggleStatus = () => {
    onUpdate({
      ...task,
      status: task.status === 'done' ? 'todo' : 'done'
    });
  };

  const priorityColor = (p: number) => {
    if (p >= 5) return 'text-red-500 dark:text-red-400';
    if (p === 4) return 'text-orange-500 dark:text-orange-400';
    if (p === 3) return 'text-blue-500 dark:text-blue-400';
    return 'text-gray-400 dark:text-gray-500';
  };

  return (
    <div className={`
      group flex items-center gap-3 py-2.5 px-2 
      border-b border-gray-50 dark:border-gray-900/50 
      hover:bg-gray-50/50 dark:hover:bg-gray-900/30 
      transition-colors
      ${task.status === 'done' ? 'opacity-50' : ''}
    `}>
      {/* Checkbox */}
      <button 
        onClick={toggleStatus} 
        className="flex-shrink-0 mt-0.5 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
      >
        {task.status === 'done' ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-gray-400">
            <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" fill="currentColor" opacity="0.2"/>
            <path d="M6 9L8 11L12 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-gray-300 dark:text-gray-600">
            <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 mb-0.5">
          <span className={`
            text-[15px] font-normal text-gray-900 dark:text-gray-100 
            leading-snug truncate
            ${task.status === 'done' ? 'line-through' : ''}
          `}>
            {task.title}
          </span>
        </div>
        
        {/* Minimal metadata: due date + one metadata field */}
        <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
          {/* Due date - always show if present */}
          {task.deadline && (
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {formatDateDisplay(task.deadline)}
            </span>
          )}
          
          {/* Show project OR priority (whichever is more relevant) */}
          {project && (
            <>
              {task.deadline && <span className="w-0.5 h-0.5 rounded-full bg-gray-300 dark:bg-gray-600" />}
              <span className="flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span>{project.name}</span>
              </span>
            </>
          )}
          
          {/* Only show priority if it's high (P1-P2) and no project shown */}
          {!project && task.priority <= 2 && (
            <>
              {task.deadline && <span className="w-0.5 h-0.5 rounded-full bg-gray-300 dark:bg-gray-600" />}
              <span className={priorityColor(task.priority)}>
                P{task.priority}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions - Minimal, only on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onFocus(task)}
          className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors"
          title="Focus"
        >
          <Zap size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          title="Delete"
        >
          <Trash2 size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
};
