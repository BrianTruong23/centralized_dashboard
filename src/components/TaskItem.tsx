import { useState } from 'react';
import { Task, TaskPriority, TaskStatus, TaskCategory, TaskEnergyLevel } from '@/types/task';
import clsx from 'clsx';
import { CheckCircle2, Circle, Trash2, Zap, Clock, Calendar, Pencil, X, Check } from 'lucide-react';
import { format } from 'date-fns';

interface TaskItemProps {
  task: Task;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
}

const categories: TaskCategory[] = ['Research', 'Coding', 'Admin', 'Health', 'Life', 'Finance', 'Social', 'Content', 'UX'];
const energyLevels: TaskEnergyLevel[] = ['low', 'medium', 'high'];

export const TaskItem = ({ task, onUpdate, onDelete }: TaskItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Task>(task);

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
    if (p >= 5) return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    if (p === 4) return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800';
    if (p === 3) return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
  };

  if (isEditing) {
    return (
      <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-indigo-300 dark:border-indigo-700 space-y-3">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">Title</label>
          <input
            type="text"
            value={editForm.title}
            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
            className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">Description</label>
          <input
            type="text"
            value={editForm.description}
            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Category</label>
            <select
              value={editForm.category}
              onChange={(e) => setEditForm({ ...editForm, category: e.target.value as TaskCategory })}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Priority</label>
            <select
              value={editForm.priority}
              onChange={(e) => setEditForm({ ...editForm, priority: Number(e.target.value) as TaskPriority })}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={1}>P1 - Urgent</option>
              <option value={2}>P2 - High</option>
              <option value={3}>P3 - Normal</option>
              <option value={4}>P4 - Low</option>
              <option value={5}>P5 - Someday</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Est. Minutes</label>
            <input
              type="number"
              value={editForm.estimatedMinutes}
              onChange={(e) => setEditForm({ ...editForm, estimatedMinutes: Number(e.target.value) })}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Energy Level</label>
            <select
              value={editForm.energyLevel}
              onChange={(e) => setEditForm({ ...editForm, energyLevel: e.target.value as TaskEnergyLevel })}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {energyLevels.map(level => <option key={level} value={level}>{level}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">Deadline</label>
          <input
            type="datetime-local"
            value={editForm.deadline ? editForm.deadline.slice(0, 16) : ''}
            onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleEditCancel}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={14} /> Cancel
          </button>
          <button
            onClick={handleEditSave}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            <Check size={14} /> Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx(
      "group flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border transition-all hover:shadow-sm",
      task.status === 'done' ? "border-gray-100 dark:border-gray-700 opacity-60 bg-gray-50/50 dark:bg-gray-800/50" : "border-gray-200 dark:border-gray-700"
    )}>
      <button onClick={toggleStatus} className="flex-shrink-0 text-gray-400 dark:text-gray-500 hover:text-green-600 dark:hover:text-green-400 transition-colors">
        {task.status === 'done' ? <CheckCircle2 size={24} className="text-green-500 dark:text-green-400" /> : <Circle size={24} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={clsx(
            "font-medium truncate transition-all text-gray-900 dark:text-gray-100",
            task.status === 'done' && "line-through text-gray-400 dark:text-gray-500"
          )}>
            {task.title}
          </span>
          <span className={clsx("text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase border", priorityColor(task.priority))}>
            P{task.priority}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium uppercase border border-gray-200 dark:border-gray-600">
            {task.category}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
          <span className="flex items-center gap-1">
            <Clock size={12} /> {task.estimatedMinutes}m
          </span>
          <span className={clsx("flex items-center gap-1 capitalize",
            task.energyLevel === 'high' ? 'text-orange-500 dark:text-orange-400' : 'text-gray-400 dark:text-gray-500'
          )}>
            <Zap size={12} /> {task.energyLevel}
          </span>
          {task.deadline && (
            <span className="flex items-center gap-1 text-red-400 dark:text-red-500">
              <Calendar size={12} /> {format(new Date(task.deadline), 'MMM d, h:mm a')}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => setIsEditing(true)}
        className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 dark:text-gray-600 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all"
        title="Edit task"
      >
        <Pencil size={18} />
      </button>

      <button
        onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-all"
        title="Delete task"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
};
