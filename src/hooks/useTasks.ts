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
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      
      // Load tasks based on auth
      if (session?.user) {
        try {
          const dbTasks = await db.fetchTasks();
          setTasks(dbTasks);
        } catch (e) {
          console.error('Failed to fetch DB tasks:', e);
        }
      } else {
        const stored = loadTasks();
        setTasks(stored);
      }
      setIsLoaded(true);
    };

    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);
      
      if (newUser) {
        // If logging in, fetch DB tasks.
        // Optional: Merge local tasks? For now, just switch context.
        const dbTasks = await db.fetchTasks();
        setTasks(dbTasks);
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
