'use client';

import { Task } from '@/types/task';
import { Project } from '@/types/project';
import { TaskItem } from './TaskItem';

interface UpcomingTaskListProps {
  tasks: Task[];
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  projects?: Project[];
}

export const UpcomingTaskList = ({
  tasks,
  onUpdateTask,
  onDeleteTask,
  projects = [],
}: UpcomingTaskListProps) => {
  const getSortDate = (task: Task): number | null => {
    const value = task.scheduled_on || task.scheduled_date || task.scheduled_start || task.start_time || task.deadline;
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  };

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-gray-500">
        <p className="text-sm">No upcoming tasks</p>
      </div>
    );
  }

  const sortedTasks = [...tasks].sort((a, b) => {
    const dateA = getSortDate(a);
    const dateB = getSortDate(b);
    if (dateA !== null && dateB !== null && dateA !== dateB) return dateA - dateB;
    if (dateA !== null && dateB === null) return -1;
    if (dateA === null && dateB !== null) return 1;
    return b.priority - a.priority;
  });

  return (
    <div className="space-y-1">
      {sortedTasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          onUpdate={onUpdateTask}
          onDelete={onDeleteTask}
          projects={projects}
        />
      ))}
    </div>
  );
};
