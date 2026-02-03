import { Task } from '@/types/task';
import { TaskItem } from './TaskItem';

interface TaskListProps {
  tasks: Task[];
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
}

export const TaskList = ({ tasks, onUpdateTask, onDeleteTask }: TaskListProps) => {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>No tasks yet. Add one to get started!</p>
      </div>
    );
  }

  // Sort: Done at bottom, then by Priority (desc), then by timestamp (desc)
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.status === 'done' && b.status !== 'done') return 1;
    if (a.status !== 'done' && b.status === 'done') return -1;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.createdAt - a.createdAt;
  });

  return (
    <div className="space-y-2">
      {sortedTasks.map((task) => (
        <TaskItem 
          key={task.id} 
          task={task} 
          onUpdate={onUpdateTask} 
          onDelete={onDeleteTask} 
        />
      ))}
    </div>
  );
};
