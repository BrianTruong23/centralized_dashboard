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
    const init = async () => {
      await authReady;
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } };
      userRef.current = session?.user || null;

      if (userRef.current) {
        try {
          // Ensure default projects exist for new users
          await db.ensureDefaultProjects(userRef.current.id);
          const dbProjects = await db.fetchProjects();
          setProjects(dbProjects);
        } catch (e) {
          console.error('[useProjects] Failed to fetch projects:', e);
        }
      }
      setIsLoading(false);
    };

    init();

    const { data: { subscription } } = supabase?.auth.onAuthStateChange(async (event, session) => {
        userRef.current = session?.user || null;
        if (session?.user) {
            try {
                // Ensure default projects exist for new users
                await db.ensureDefaultProjects(session.user.id);
                const dbProjects = await db.fetchProjects();
                setProjects(dbProjects);
            } catch (e) {
                console.error('[useProjects] Failed to fetch projects on auth change:', e);
            }
        } else {
            setProjects([]);
        }
    }) || { data: { subscription: { unsubscribe: () => {} } } };

    return () => {
        subscription.unsubscribe();
    };
  }, []);

  const addProject = async (input: CreateProjectInput) => {
    if (!userRef.current) {
        console.warn('[useProjects] No user logged in, cannot create project');
        return;
    }

    // temporary ID for optimistic UI
    const tempId = generateId();
    const tempProject: Project = {
        id: tempId,
        user_id: userRef.current.id,
        name: input.name,
        color: input.color,
        created_at: new Date().toISOString(),
    };

    // Optimistic update
    setProjects(prev => [...prev, tempProject]);

    try {
        const newProject = await db.addProject({
            user_id: userRef.current.id,
            name: input.name,
            color: input.color
        });
        
        // Replace temp project with real one
        setProjects(prev => prev.map(p => p.id === tempId ? newProject : p));
    } catch (e) {
        console.error('[useProjects] Failed to add project:', e);
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
