import { Task } from '@/types/task';

const STORAGE_KEY = 'life_dashboard_tasks';

export const saveTasks = (tasks: Task[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.error('Failed to save tasks to localStorage:', error);
  }
};

export const loadTasks = (): Task[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Task[];
  } catch (error) {
    console.error('Failed to load tasks from localStorage:', error);
    return [];
  }
};
