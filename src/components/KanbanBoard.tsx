import React from 'react';
import { Task } from '@/types/task';
import { TaskItem } from './TaskItem';
import { Plus } from 'lucide-react';

interface KanbanBoardProps {
  tasks: Task[];
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onFocusTask: (task: Task) => void;
}

export const KanbanBoard = ({ tasks, onUpdateTask, onDeleteTask, onFocusTask }: KanbanBoardProps) => {
  const todoTasks = tasks.filter(t => t.status === 'todo');
  const doingTasks = tasks.filter(t => t.status === 'doing');
  const doneTasks = tasks.filter(t => t.status === 'done');

  const Column = ({ title, items, status, color }: { title: string, items: Task[], status: string, color: string }) => (
    <div className="flex-1 min-w-[300px] flex flex-col h-full rounded-xl bg-gray-50/30 dark:bg-gray-900/10">
      <div className="p-3 flex items-center justify-between sticky top-0 z-10">
         <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
            <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100">{title}</h3>
            <span className="text-gray-400 text-xs">{items.length}</span>
         </div>
         <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <Plus size={14} />
         </button>
      </div>
      
      <div className="px-2 pb-3 space-y-1 overflow-y-auto scrollbar-hide flex-1">
         {items.map(task => (
            <div key={task.id}>
                {/* We rely on TaskItem's new flat design, but maybe add a wrapper if we want 'card' look
                    For minimalism, a simple list item look in the column is often cleaner.
                    However, `TaskItem` has `-mx-2` layout shift. 
                    Let's just render it. The TaskItem handles its own hover state.
                */}
                <TaskItem 
                    task={task} 
                    onUpdate={onUpdateTask} 
                    onDelete={onDeleteTask} 
                    onFocus={onFocusTask}
                />
            </div>
         ))}
         {items.length === 0 && (
            <div className="py-8 text-center text-gray-300 dark:text-gray-700 text-xs text-center border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-lg mx-2">
                Empty
            </div>
         )}
      </div>
    </div>
  );

  return (
    <div className="flex gap-4 h-full overflow-x-auto pb-4">
        <Column title="To Do" items={todoTasks} status="todo" color="bg-gray-400" />
        <Column title="In Progress" items={doingTasks} status="doing" color="bg-blue-500" />
        <Column title="Done" items={doneTasks} status="done" color="bg-green-500" />
    </div>
  );
};
