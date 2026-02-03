import { useState, useEffect } from 'react';
import { Task } from '@/types/task';
import { loadTasks, saveTasks } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

export const useTasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Check auth state
    const checkUser = async () => {
      // If Supabase is not configured, just load from local storage
      if (!supabase) {
        const stored = loadTasks();
        setTasks(stored);
        setIsLoaded(true);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);

      // Load tasks based on auth
      if (session?.user) {
        try {
          const dbTasks = await db.fetchTasks();
          setTasks(dbTasks);
        } catch (e: any) {
          // If tasks table doesn't exist or other DB error, fall back to local storage
          console.warn('Tasks table not available, using local storage:', e?.message || e?.code || 'Unknown error');
          const stored = loadTasks();
          setTasks(stored);
        }
      } else {
        const stored = loadTasks();
        setTasks(stored);
      }
      setIsLoaded(true);
    };

    checkUser();

    // Only set up auth listener if Supabase is configured
    if (!supabase) return;

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);

      if (newUser) {
        // If logging in, fetch DB tasks.
        // Optional: Merge local tasks? For now, just switch context.
        try {
          const dbTasks = await db.fetchTasks();
          setTasks(dbTasks);
        } catch (e: any) {
          // If tasks table doesn't exist, fall back to local storage
          console.warn('Tasks table not available, using local storage:', e?.message || e?.code || 'Unknown error');
          const stored = loadTasks();
          setTasks(stored);
        }
      } else {
        // If logging out, revert to local tasks
        const stored = loadTasks();
        setTasks(stored);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sync to LocalStorage if not logged in
  useEffect(() => {
    if (isLoaded && !user) {
      saveTasks(tasks);
    }
  }, [tasks, isLoaded, user]);

  const addTask = async (task: Task) => {
    // Optimistic update
    const taskWithUser = { ...task, user_id: user?.id };
    setTasks((prev) => [taskWithUser, ...prev]);

    if (user) {
      try {
        await db.addTask(taskWithUser);
      } catch (e) {
        console.error('Failed to add task to DB:', e);
        // Revert? Or show error.
      }
    }
  };

  const updateTask = async (updatedTask: Task) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
    );

    if (user) {
      try {
        await db.updateTask(updatedTask);
      } catch (e) {
        console.error('Failed to update task in DB:', e);
      }
    }
  };

  const deleteTask = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    if (user) {
      try {
        await db.deleteTask(taskId);
      } catch (e) {
        console.error('Failed to delete task in DB:', e);
      }
    }
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
