import { useState, useEffect } from 'react';
import { Task } from '@/types/task';
import { loadTasks, saveTasks } from '@/lib/storage';
import { supabase, authReady, SESSION_KEY } from '@/lib/supabase';
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

        // If Supabase is down, getSession() returns null even though we have
        // cached tokens. Fall back to the cached user so DB ops are attempted.
        let resolvedUser = session?.user ?? null;
        if (!resolvedUser) {
          try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (raw) {
              const cached = JSON.parse(raw);
              if (cached?.user) {
                resolvedUser = cached.user;
                console.log('[useTasks] No in-memory session, using cached user:', cached.user.id);
              }
            }
          } catch { /* ignore */ }
        }

        setUser(resolvedUser);
        console.log('[useTasks] Auth resolved. user:', resolvedUser?.id ?? 'NULL');

        // Load tasks based on auth
        if (resolvedUser) {
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
    console.log('[useTasks.addTask] taskId:', task.id, '| user:', user?.id ?? 'NULL');
    const taskWithUser = { ...task, user_id: user?.id };
    setTasks((prev) => [taskWithUser, ...prev]);

    if (user) {
      try {
        console.log('[useTasks.addTask] Calling db.addTask...');
        await db.addTask(taskWithUser);
        console.log('[useTasks.addTask] DB insert succeeded');
      } catch (e: any) {
        console.error('[useTasks.addTask] DB insert FAILED:', e?.message || e?.code || e);
      }
    } else {
      console.warn('[useTasks.addTask] Skipped DB insert — no authenticated user.');
    }
  };

  const updateTask = async (updatedTask: Task) => {
    console.log('[useTasks.updateTask] taskId:', updatedTask.id, '| user:', user?.id ?? 'NULL');
    setTasks((prev) =>
      prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
    );

    if (user) {
      try {
        console.log('[useTasks.updateTask] Calling db.updateTask...');
        await db.updateTask(updatedTask);
        console.log('[useTasks.updateTask] DB update succeeded');
      } catch (e: any) {
        console.error('[useTasks.updateTask] DB update FAILED:', e?.message || e?.code || e);
      }
    } else {
      console.warn('[useTasks.updateTask] Skipped DB update — no authenticated user.');
    }
  };

  const deleteTask = async (taskId: string) => {
    console.log('[useTasks.deleteTask] taskId:', taskId, '| user:', user?.id ?? 'NULL (local-only mode)');
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    if (user) {
      try {
        console.log('[useTasks.deleteTask] Calling db.deleteTask...');
        await db.deleteTask(taskId);
        console.log('[useTasks.deleteTask] DB delete succeeded');
      } catch (e: any) {
        console.error('[useTasks.deleteTask] DB delete FAILED:', e?.message || e?.code || e);
      }
    } else {
      console.warn('[useTasks.deleteTask] Skipped DB delete — no authenticated user. Task only removed from local state.');
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
