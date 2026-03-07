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
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-gray-500">
        <p className="text-sm">No upcoming tasks</p>
      </div>
    );
  }

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
