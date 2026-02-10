import { useState, useEffect } from 'react';
import { Task } from '@/types/task';
import { loadTasks, saveTasks } from '@/lib/storage';
import { supabase, authReady } from '@/lib/supabase';
import { db } from '@/lib/db';

export const useTasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Check auth state
    let timeoutId: NodeJS.Timeout | null = null;
    
    const checkUser = async () => {
      try {
        // If Supabase is not configured, just load from local storage
        if (!supabase) {
          const stored = loadTasks();
          setTasks(stored);
          setIsLoaded(true);
          return;
        }

        // Add timeout to prevent infinite loading
        timeoutId = setTimeout(() => {
          console.warn('Auth check timeout, using local storage');
          const stored = loadTasks();
          setTasks(stored);
          setIsLoaded(true);
        }, 8000); // 8 second timeout (allows for manual auth recovery)

        // Wait for auth recovery (including manual fallback) before checking session
        await authReady;

        const { data: { session }, error } = await supabase.auth.getSession();
        
        // Clear timeout on success or error response
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        if (error) {
          console.warn('Auth session error, using local storage:', error);
          const stored = loadTasks();
          setTasks(stored);
          setIsLoaded(true);
          return;
        }

        setUser(session?.user ?? null);

        // Load tasks based on auth
        if (session?.user) {
          try {
            const dbTasks = await db.fetchTasks();
            setTasks(dbTasks);
            // Keep localStorage in sync so it's not stale if auth fails later
            saveTasks(dbTasks);
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
      } catch (error) {
        // Clear timeout if async operation throws (prevents memory leak)
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        console.error('Error in checkUser:', error);
        // Fallback to local storage on any error
        const stored = loadTasks();
        setTasks(stored);
        setIsLoaded(true);
      }
    };

    checkUser();

    // Only set up auth listener if Supabase is configured
    if (!supabase) {
      // Cleanup function to clear timeout on unmount
      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };
    }

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);

      if (newUser) {
        // If logging in, fetch DB tasks and keep localStorage in sync
        try {
          const dbTasks = await db.fetchTasks();
          setTasks(dbTasks);
          saveTasks(dbTasks);
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

    // Cleanup function: unsubscribe from auth changes and clear timeout
    return () => {
      subscription.unsubscribe();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
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
