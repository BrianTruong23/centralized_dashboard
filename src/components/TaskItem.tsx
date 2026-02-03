import { Task, TaskPriority, TaskStatus } from '@/types/task';
import clsx from 'clsx';
import { CheckCircle2, Circle, Trash2, Zap, Clock, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface TaskItemProps {
  task: Task;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
}

export const TaskItem = ({ task, onUpdate, onDelete }: TaskItemProps) => {
  const toggleStatus = () => {
    onUpdate({
      ...task,
      status: task.status === 'done' ? 'todo' : 'done'
    });
  };

  const priorityColor = (p: TaskPriority) => {
    if (p >= 5) return 'text-red-600 bg-red-50 border-red-200';
    if (p === 4) return 'text-orange-600 bg-orange-50 border-orange-200';
    if (p === 3) return 'text-blue-600 bg-blue-50 border-blue-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  return (
    <div className={clsx(
      "group flex items-center gap-3 p-3 bg-white rounded-xl border transition-all hover:shadow-sm",
      task.status === 'done' ? "border-gray-100 opacity-60 bg-gray-50/50" : "border-gray-200"
    )}>
      <button onClick={toggleStatus} className="flex-shrink-0 text-gray-400 hover:text-green-600 transition-colors">
        {task.status === 'done' ? <CheckCircle2 size={24} className="text-green-500" /> : <Circle size={24} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={clsx(
            "font-medium truncate transition-all",
            task.status === 'done' && "line-through text-gray-400"
          )}>
            {task.title}
          </span>
          <span className={clsx("text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase border", priorityColor(task.priority))}>
            P{task.priority}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium uppercase border border-gray-200">
            {task.category}
          </span>
        </div>
        
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Clock size={12} /> {task.estimatedMinutes}m
          </span>
          <span className={clsx("flex items-center gap-1 capitalize", 
            task.energyLevel === 'high' ? 'text-orange-500' : 'text-gray-400'
          )}>
            <Zap size={12} /> {task.energyLevel}
          </span>
          {task.deadline && (
            <span className="flex items-center gap-1 text-red-400">
              <Calendar size={12} /> {format(new Date(task.deadline), 'MMM d, h:mm a')}
            </span>
          )}
        </div>
      </div>

      <button 
        onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-red-500 transition-all"
        title="Delete task"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
};
