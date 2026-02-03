import { useState, useEffect } from 'react';
import { Task } from '@/types/task';
import { loadTasks, saveTasks } from '@/lib/storage';

export const useTasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load initial tasks
    const stored = loadTasks();
    setTasks(stored);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    // Save tasks whenever they change (after initial load)
    if (isLoaded) {
      saveTasks(tasks);
    }
  }, [tasks, isLoaded]);

  const addTask = (task: Task) => {
    setTasks((prev) => [task, ...prev]);
  };

  const updateTask = (updatedTask: Task) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
    );
  };

  const deleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  return {
    tasks,
    setTasks,
    addTask,
    updateTask,
    deleteTask,
    isLoaded,
  };
};
