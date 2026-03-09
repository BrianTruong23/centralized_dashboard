import { useState, useEffect, useRef } from 'react';
import { Task } from '@/types/task';
import { loadTasks, saveTasks } from '@/lib/storage';
import { awaitAuthenticatedSession, awaitAuthBootstrap, supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

export const useTasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<any>(null);
  // Ref keeps the latest user for async CRUD functions (avoids stale closures)
  const userRef = useRef<any>(null);
  const setUserAndRef = (u: any) => { userRef.current = u; setUser(u); };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;

    const checkUser = async () => {
      try {
        if (!supabase) {
          const stored = loadTasks();
          setTasks(stored);
          setIsLoaded(true);
          return;
        }

        timeoutId = setTimeout(() => {
          console.warn('[useTasks] Auth check timeout, using local storage');
          const stored = loadTasks();
          setTasks(stored);
          setIsLoaded(true);
        }, 8000);

        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        const bootstrap = await awaitAuthBootstrap();
        const session = await awaitAuthenticatedSession(10_000);
        const resolvedUser = session?.user ?? bootstrap.user ?? null;

        setUserAndRef(resolvedUser);
        console.log('[useTasks] Auth resolved. user:', resolvedUser?.id ?? 'NULL');

        if (resolvedUser) {
          try {
            const dbTasks = await db.fetchTasks();
            setTasks(dbTasks);
            saveTasks(dbTasks);
          } catch (e: any) {
            console.warn('[useTasks] DB fetch failed, using local storage:', e?.message || e?.code || 'Unknown error');
            const stored = loadTasks();
            setTasks(stored);
          }
        } else {
          const stored = loadTasks();
          setTasks(stored);
        }
        setIsLoaded(true);
      } catch (error) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        console.error('[useTasks] Error in checkUser:', error);
        const stored = loadTasks();
        setTasks(stored);
        setIsLoaded(true);
      }
    };

    checkUser();

    if (!supabase) {
      return () => {
        if (timeoutId) clearTimeout(timeoutId);
      };
    }

    // Listen for auth changes (ignore INITIAL_SESSION(null) from persistSession:false)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION' && !session) {
        console.log('[useTasks] Ignoring INITIAL_SESSION(null)');
        return;
      }

      const newUser = session?.user ?? null;
      console.log('[useTasks] onAuthStateChange:', event, '| user:', newUser?.id ?? 'NULL');
      setUserAndRef(newUser);

      if (newUser) {
        try {
          const dbTasks = await db.fetchTasks();
          setTasks(dbTasks);
          saveTasks(dbTasks);
        } catch (e: any) {
          console.warn('[useTasks] DB fetch failed on auth change:', e?.message || e?.code || 'Unknown error');
          const stored = loadTasks();
          setTasks(stored);
        }
      } else if (event === 'SIGNED_OUT') {
        const stored = loadTasks();
        setTasks(stored);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Always keep localStorage in sync — acts as backup for both
  // logged-in users (in case auth fails on next reload) and
  // anonymous users (localStorage is their only persistence).
  useEffect(() => {
    if (isLoaded) {
      saveTasks(tasks);
    }
  }, [tasks, isLoaded]);

  const addTask = async (task: Task) => {
    let currentUser = userRef.current;
    
    // Double-check auth if userRef is missing (race condition protection)
    if (!currentUser && supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            console.log('[useTasks.addTask] Recovered user from strict auth check:', user.id);
            currentUser = user;
            // Update ref for future calls
            userRef.current = user; 
        }
    }

    console.log('[useTasks.addTask] taskId:', task.id, '| user:', currentUser?.id ?? 'NULL');
    const taskWithUser = { ...task, user_id: currentUser?.id };

    // Update state AND save to localStorage immediately (synchronous,
    // survives page close / tab kill before the useEffect fires)
    setTasks((prev) => {
      const next = [taskWithUser, ...prev];
      saveTasks(next);
      return next;
    });

    if (currentUser) {
      try {
        console.log('[useTasks.addTask] Calling db.addTask...');
        await db.addTask(taskWithUser);
        console.log('[useTasks.addTask] DB insert succeeded');
      } catch (e: any) {
        console.error('[useTasks.addTask] DB insert FAILED:', e?.message || e?.code || e);
        // Roll back optimistic update so user doesn't see phantom tasks
        setTasks((prev) => {
          const next = prev.filter((t) => t.id !== taskWithUser.id);
          saveTasks(next);
          return next;
        });
      }
    } else {
      console.warn('[useTasks.addTask] No auth — task saved to localStorage only.');
    }
  };

  const updateTask = async (updatedTask: Task) => {
    const currentUser = userRef.current;
    console.log('[useTasks.updateTask] taskId:', updatedTask.id, '| user:', currentUser?.id ?? 'NULL');

    setTasks((prev) => {
      const next = prev.map((t) => (t.id === updatedTask.id ? updatedTask : t));
      saveTasks(next);
      return next;
    });

    if (currentUser) {
      try {
        console.log('[useTasks.updateTask] Calling db.updateTask...');
        await db.updateTask(updatedTask);
        console.log('[useTasks.updateTask] DB update succeeded');
      } catch (e: any) {
        console.error('[useTasks.updateTask] DB update FAILED:', e?.message || e?.code || e);
      }
    } else {
      console.warn('[useTasks.updateTask] No auth — update saved to localStorage only.');
    }
  };

  const deleteTask = async (taskId: string) => {
    let currentUser = userRef.current;

    // Double-check auth if userRef is missing
    if (!currentUser && supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            console.log('[useTasks.deleteTask] Recovered user from strict auth check:', user.id);
            currentUser = user; 
            userRef.current = user;
        }
    }

    console.log('[useTasks.deleteTask] taskId:', taskId, '| user:', currentUser?.id ?? 'NULL');

    setTasks((prev) => {
      const next = prev.filter((t) => t.id !== taskId);
      saveTasks(next);
      return next;
    });

    if (currentUser) {
      try {
        console.log('[useTasks.deleteTask] Calling db.deleteTask...');
        await db.deleteTask(taskId);
        console.log('[useTasks.deleteTask] DB delete succeeded');
      } catch (e: any) {
        console.error('[useTasks.deleteTask] DB delete FAILED:', e?.message || e?.code || e);
      }
    } else {
      console.warn('[useTasks.deleteTask] No auth — delete saved to localStorage only.');
    }
  };

  /** Batch-add multiple tasks in a single DB call. Used by AutoPlan. */
  const addTasksBatch = async (newTasks: Task[]) => {
    let currentUser = userRef.current;
    if (!currentUser && supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) { currentUser = user; userRef.current = user; }
    }

    console.log(`[useTasks.addTasksBatch] ${newTasks.length} tasks | user: ${currentUser?.id ?? 'NULL'}`);
    const tasksWithUser = newTasks.map(t => ({ ...t, user_id: currentUser?.id }));

    // Optimistic UI update
    setTasks((prev) => {
      const next = [...tasksWithUser, ...prev];
      saveTasks(next);
      return next;
    });

    if (currentUser) {
      try {
        await db.addTasksBatch(tasksWithUser as Task[]);
        console.log('[useTasks.addTasksBatch] DB batch insert succeeded');
      } catch (e: any) {
        console.error('[useTasks.addTasksBatch] DB batch insert FAILED:', e?.message || e?.code || e);
        // Roll back all optimistic tasks
        const idsToRemove = new Set(tasksWithUser.map(t => t.id));
        setTasks((prev) => {
          const next = prev.filter((t) => !idsToRemove.has(t.id));
          saveTasks(next);
          return next;
        });
      }
    }
  };

  return {
    tasks,
    setTasks,
    addTask,
    addTasksBatch,
    updateTask,
    deleteTask,
    isLoaded,
  };
};
