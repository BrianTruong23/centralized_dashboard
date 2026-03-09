import { useState, useEffect, useRef } from 'react';
import { Project, CreateProjectInput } from '@/types/project';
import { awaitAuthenticatedSession, awaitAuthBootstrap, supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { generateId } from '@/lib/utils';

export const useProjects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const userRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    let loadId = 0; // Monotonic counter to discard stale results

    const loadProjects = async (userId: string) => {
      const thisLoad = ++loadId;
      try {
        console.log('[useProjects] Loading projects for user:', userId, '(load #' + thisLoad + ')');
        await db.ensureDefaultProjects(userId).catch((err: any) => {
          console.warn('[useProjects] ensureDefaultProjects failed (non-fatal):', err?.message);
        });
        const dbProjects = await db.fetchProjects(userId);
        if (mounted && thisLoad === loadId) {
          setProjects(dbProjects);
          setIsLoading(false);
          console.log('[useProjects] Projects set:', dbProjects.length, dbProjects.map((p: any) => p.name));
        }
      } catch (e) {
        console.error('[useProjects] Failed to fetch projects:', e);
        if (mounted) setIsLoading(false);
      }
    };

    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const eagerLoad = async () => {
      try {
        const bootstrap = await awaitAuthBootstrap();
        if (!mounted) return;

        const session = await awaitAuthenticatedSession(10_000);
        const user = session?.user || bootstrap.user || null;
        userRef.current = user;

        if (user) {
          console.log('[useProjects] Eager load — user:', user.id);
          await loadProjects(user.id);
        } else {
          console.log('[useProjects] Eager load — no session');
          if (mounted) setIsLoading(false);
        }
      } catch (e) {
        console.error('[useProjects] Eager load error:', e);
        if (mounted) setIsLoading(false);
      }
    };

    eagerLoad();

    // Also listen for auth changes (SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT)
    // to handle login/logout/token refresh after the initial eager load.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Skip INITIAL_SESSION — already handled by eagerLoad above
      if (event === 'INITIAL_SESSION') return;

      console.log('[useProjects] onAuthStateChange:', event, session?.user?.id);
      userRef.current = session?.user || null;

      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        await loadProjects(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        loadId++; // Cancel any in-flight loads
        setProjects([]);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const addProject = async (input: CreateProjectInput) => {
    let currentUser = userRef.current;

    // Auth recovery: if userRef is null, try to get user from Supabase directly
    if (!currentUser && supabase) {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                console.log('[useProjects.addProject] Recovered user from auth:', user.id);
                currentUser = user;
                userRef.current = user;
            }
        } catch (e) {
            console.error('[useProjects.addProject] Auth recovery failed:', e);
        }
    }

    if (!currentUser) {
        console.error('[useProjects.addProject] No user — cannot create project. Input:', input.name);
        return;
    }

    console.log('[useProjects.addProject] Creating project:', input.name, '| user:', currentUser.id);

    // temporary ID for optimistic UI
    const tempId = generateId();
    const tempProject: Project = {
        id: tempId,
        user_id: currentUser.id,
        name: input.name,
        color: input.color,
        created_at: new Date().toISOString(),
    };

    // Optimistic update
    setProjects(prev => [...prev, tempProject]);

    try {
        const newProject = await db.addProject({
            user_id: currentUser.id,
            name: input.name,
            color: input.color
        });
        
        console.log('[useProjects.addProject] ✓ Project created in DB:', newProject.id, newProject.name);
        
        // Replace temp project with real one
        setProjects(prev => prev.map(p => p.id === tempId ? newProject : p));
        return newProject;
    } catch (e) {
        console.error('[useProjects.addProject] ✗ Failed to add project:', input.name, e);
        // Rollback
        setProjects(prev => prev.filter(p => p.id !== tempId));
        throw e;
    }
  };

  const deleteProject = async (projectId: string) => {
    const projectToDelete = projects.find(p => p.id === projectId);
    if (!projectToDelete) return;

    // Optimistic remove
    setProjects(prev => prev.filter(p => p.id !== projectId));

    try {
        await db.deleteProject(projectId);
        console.log('[useProjects.deleteProject] ✓ Project deleted:', projectId);
    } catch (e: any) {
        console.error('[useProjects.deleteProject] ✗ Failed to delete:', projectId, e);
        // Rollback
        setProjects(prev => [...prev, projectToDelete]);
        throw e;
    }
  };

  const updateProject = async (projectId: string, updates: { name?: string; color?: string }) => {
    const previous = projects.find((p) => p.id === projectId);
    if (!previous) return;

    const optimistic = { ...previous, ...updates };
    setProjects((prev) => prev.map((p) => (p.id === projectId ? optimistic : p)));

    try {
      await db.updateProject(projectId, updates);
      console.log('[useProjects.updateProject] ✓ Project updated:', projectId);
    } catch (e) {
      console.error('[useProjects.updateProject] ✗ Failed to update:', projectId, e);
      setProjects((prev) => prev.map((p) => (p.id === projectId ? previous : p)));
      throw e;
    }
  };

  return {
    projects,
    addProject,
    deleteProject,
    updateProject,
    isLoading
  };
};
