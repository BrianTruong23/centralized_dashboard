import { useState, useEffect, useRef } from 'react';
import { Project, CreateProjectInput } from '@/types/project';
import { supabase, authReady } from '@/lib/supabase';
import { db } from '@/lib/db';
import { generateId } from '@/lib/utils';

export const useProjects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const userRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;

    const loadProjects = async (userId: string) => {
      try {
        console.log('[useProjects] Loading projects for user:', userId);
        const dbProjects = await db.fetchProjects(userId);
        if (mounted) {
          setProjects(dbProjects);
          console.log('[useProjects] Projects set:', dbProjects.length);
        }
      } catch (e) {
        console.error('[useProjects] Failed to fetch projects:', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    const init = async () => {
      try {
        // Race authReady against a timeout — don't hang forever
        await Promise.race([
          authReady,
          new Promise(resolve => setTimeout(resolve, 3000))
        ]);

        if (!supabase || !mounted) {
          setIsLoading(false);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user || null;
        userRef.current = user;

        if (user) {
          // Fire-and-forget: ensure defaults exist (don't block rendering)
          db.ensureDefaultProjects(user.id).then(() => {
            // After defaults are ensured, refresh projects
            if (mounted) loadProjects(user.id);
          }).catch(e => console.warn('[useProjects] ensureDefaultProjects failed:', e));
          
          // Also load immediately (defaults may already exist)
          await loadProjects(user.id);
        } else {
          console.log('[useProjects] No user session found');
          if (mounted) setIsLoading(false);
        }
      } catch (e) {
        console.error('[useProjects] init error:', e);
        if (mounted) setIsLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase?.auth.onAuthStateChange(async (event, session) => {
        console.log('[useProjects] onAuthStateChange:', event);
        userRef.current = session?.user || null;
        if (session?.user) {
            // Don't block on ensureDefaults — just load projects
            loadProjects(session.user.id);
            // Ensure defaults in background
            db.ensureDefaultProjects(session.user.id).catch(() => {});
        } else if (event === 'SIGNED_OUT') {
            setProjects([]);
        }
    }) || { data: { subscription: { unsubscribe: () => {} } } };

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

  return {
    projects,
    addProject,
    isLoading
  };
};
