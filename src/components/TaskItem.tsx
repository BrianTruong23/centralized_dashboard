import { useState } from 'react';
import { Task, TaskPriority, TaskStatus, TaskCategory, TaskEnergyLevel } from '@/types/task';
import { Project } from '@/types/project';
import clsx from 'clsx';
import { CheckCircle2, Circle, Trash2, Zap, Clock, Calendar, Pencil, X, Check, GitBranch } from 'lucide-react';
import { format } from 'date-fns';
import { parseDateKey } from '@/lib/dateKey';

interface TaskItemProps {
  task: Task;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
  onFocus: (task: Task) => void;
  onBreakdown?: (task: Task) => void;
  projects?: Project[];
  subtaskCount?: number;
}


const energyLevels: TaskEnergyLevel[] = ['low', 'medium', 'high'];

export const TaskItem = ({ task, onUpdate, onDelete, onFocus, onBreakdown, projects = [], subtaskCount = 0 }: TaskItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Task>(task);

  const project = projects.find(p => p.id === task.project_id);

  const toggleStatus = () => {
    onUpdate({
      ...task,
      status: task.status === 'done' ? 'todo' : 'done'
    });
  };

  const handleEditSave = () => {
    onUpdate(editForm);
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditForm(task);
    setIsEditing(false);
  };

  const priorityColor = (p: TaskPriority) => {
    // Very subtle priority indicators, text only or tiny dot
    if (p >= 5) return 'text-red-500';
    if (p === 4) return 'text-orange-500';
    if (p === 3) return 'text-blue-500';
    return 'text-gray-400';
  };

  if (isEditing) {
    return (
      <div className="p-4 bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-100 dark:border-gray-800 space-y-3">
        {/* Simplified Edit Form - kept mostly same structure but cleaner borders */}
        <div>
          <input
            type="text"
            value={editForm.title}
            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
            className="w-full text-base font-medium px-2 py-1 border-b border-gray-100 dark:border-gray-800 bg-transparent focus:outline-none focus:border-gray-400 transition-colors"
            placeholder="Task title"
          />
        </div>
        <div>
          <input
            type="text"
            value={editForm.description}
            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            className="w-full text-sm text-gray-500 px-2 py-1 bg-transparent focus:outline-none"
            placeholder="Description..."
          />
        </div>
        
        {/* ... (rest of edit fields tailored slightly if needed, but keeping functional) ... */}
        {/* For brevity, I'll keep the grid controls but style them cleaner */}
        <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Category (Project)</label>
              <select
                value={editForm.project_id || ''}
                onChange={(e) => {
                    const pId = e.target.value;
                    const p = projects.find(proj => proj.id === pId);
                    setEditForm({ 
                        ...editForm, 
                        project_id: pId,
                        category: p ? p.name : editForm.category 
                    });
                }}
                className="w-full text-xs bg-gray-50 dark:bg-gray-800 rounded px-2 py-1.5 border-none outline-none"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Status</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as TaskStatus })}
                className="w-full text-xs bg-gray-50 dark:bg-gray-800 rounded px-2 py-1.5 border-none outline-none"
              >
                <option value="todo">To Do</option>
                <option value="doing">Doing</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Deadline</label>
              <input
                type="date"
                value={editForm.deadline || ''}
                onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                className="w-full text-xs bg-gray-50 dark:bg-gray-800 rounded px-2 py-1.5 border-none outline-none text-gray-500"
              />
            </div>

            {/* Removed old Category dropdown */}

            <div>
               <label className="text-xs text-gray-500 block mb-1">Priority</label>
               <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm({ ...editForm, priority: Number(e.target.value) as TaskPriority })}
                  className="w-full text-xs bg-gray-50 dark:bg-gray-800 rounded px-2 py-1.5 border-none outline-none"
                >
                  <option value={1}>P1 - Urgent</option>
                  <option value={2}>P2 - High</option>
                  <option value={3}>P3 - Normal</option>
                  <option value={4}>P4 - Low</option>
                  <option value={5}>P5 - Someday</option>
                </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Est. Minutes</label>
              <input 
                type="number"
                value={editForm.estimatedMinutes}
                onChange={(e) => setEditForm({ ...editForm, estimatedMinutes: Number(e.target.value) })}
                className="w-full text-xs bg-gray-50 dark:bg-gray-800 rounded px-2 py-1.5 border-none outline-none"
                min={0}
                step={5}
              />
            </div>
        </div>

        <div className="flex justify-end gap-3 pt-3">
          <button onClick={handleEditCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          <button onClick={handleEditSave} className="text-xs font-medium text-black dark:text-white hover:opacity-70">Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx(
      "group flex items-start gap-3 py-3 px-2 border-b border-gray-50 dark:border-gray-900 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors rounded-lg -mx-2",
      task.status === 'done' ? "opacity-40" : ""
    )}>
      <button 
        onClick={toggleStatus} 
        className={clsx(
            "mt-0.5 flex-shrink-0 transition-colors",
            task.status === 'done' ? "text-gray-400" : "text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
        )}
      >
        {task.status === 'done' ? <CheckCircle2 size={20} /> : <Circle size={20} strokeWidth={1.5} />}
      </button>

      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2 mb-1">
          <span className={clsx(
            "text-[15px] font-normal text-gray-900 dark:text-gray-100 leading-snug truncate",
            task.status === 'done' && "line-through"
          )}>
            {task.title}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500 font-medium h-4">
           {/* Project indicator */}
           {project && (
             <>
               <span className="flex items-center gap-1.5">
                 <span
                   className="w-2 h-2 rounded-full"
                   style={{ backgroundColor: project.color }}
                 />
                 <span className="text-gray-600 dark:text-gray-400 font-medium">{project.name}</span>
               </span>
               <span className="w-0.5 h-0.5 rounded-full bg-gray-300" />
             </>
           )}

           {/* Metadata only shows if relevant */}
           <span className="flex items-center gap-1.5">
              {task.estimatedMinutes}m
           </span>
           {/* Only show category if it differs from project name (or no project) to avoid duplication */}
           {(!project || task.category !== project.name) && (
              <>
                 <span className="w-0.5 h-0.5 rounded-full bg-gray-300" />
                 <span>{task.category}</span>
              </>
           )}

           {task.priority < 4 && (
             <>
                <span className="w-0.5 h-0.5 rounded-full bg-gray-300" />
                <span className={priorityColor(task.priority)}>P{task.priority}</span>
             </>
           )}

           {task.deadline && (
             <>
               <span className="w-0.5 h-0.5 rounded-full bg-gray-300" />
               <span className="flex items-center gap-1 text-red-400">
                 {format(parseDateKey(task.deadline), 'MMM d')}
               </span>
             </>
           )}
        </div>
      </div>

      {/* Actions - Visible on group hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Show subtask count badge if parent has subtasks */}
        {subtaskCount > 0 && !task.is_subtask && (
          <span className="opacity-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 rounded">
            {subtaskCount}
          </span>
        )}
        {/* Only show breakdown for non-subtasks */}
        {!task.is_subtask && onBreakdown && (
          <button
            onClick={() => onBreakdown(task)}
            className="p-1.5 text-gray-300 hover:text-purple-600 transition-colors"
            title="Break down into subtasks"
          >
            <GitBranch size={14} strokeWidth={1.5} />
          </button>
        )}
        <button
          onClick={() => onFocus(task)}
          className="p-1.5 text-gray-300 hover:text-yellow-600 transition-colors"
          title="Focus"
        >
          <Zap size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => setIsEditing(true)}
          className="p-1.5 text-gray-300 hover:text-blue-600 transition-colors"
          title="Edit"
        >
          <Pencil size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="p-1.5 text-gray-300 hover:text-red-600 transition-colors"
          title="Delete"
        >
          <Trash2 size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
};
