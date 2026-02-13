import { supabase } from './supabase';
import { Task } from '@/types/task';

// Map database row → Task object.
// Supports both old schema (completed boolean) and new schema (status text).
const mapRowToTask = (row: any): Task => ({
  id: row.id,
  user_id: row.user_id,
  title: row.text,
  description: row.description || '',
  status: row.status || (row.completed ? 'done' : 'todo'),
  category: row.category || 'Life',
  priority: row.priority || 3,
  estimatedMinutes: row.estimated_minutes || 60,
  energyLevel: row.energy_level || 'medium',
  deadline: row.deadline,
  tags: row.tags || [],
  createdAt: new Date(row.created_at).getTime(),
  project_id: row.project_id,
});

export const db = {
  async fetchTasks() {
    if (!supabase) throw new Error('Supabase not configured');
    console.log('[db.fetchTasks] Fetching tasks from Supabase...');
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[db.fetchTasks] Error:', error.code, error.message);
      if (error.code === '42P01') {
        throw new Error('Tasks table does not exist in Supabase. Tasks will be stored locally.');
      }
      throw new Error(error.message || 'Failed to fetch tasks from database');
    }
    console.log('[db.fetchTasks] Fetched', data.length, 'tasks');
    return data.map(mapRowToTask);
  },

  async logActivity(userId: string, action: string, entityId: string, details: any = null, entityType: string = 'task') {
      if (!supabase) return;
      try {
          await supabase.from('activity_logs').insert({
              user_id: userId,
              action,
              entity_id: entityId,
              entity_type: entityType,
              details
          });
      } catch (e) {
          console.error('[db.logActivity] Failed to log activity:', e);
          // Don't block main operation
      }
  },

  async addTask(task: Task) {
    if (!supabase) throw new Error('Supabase not configured');

    // --- DIAGNOSTIC: Log auth state at insert time ---
    const { data: { session } } = await supabase.auth.getSession();
    console.log('[db.addTask] 🔐 Auth session:', session ? `uid=${session.user.id}` : 'NO SESSION');
    console.log('[db.addTask] 🔐 task.user_id:', task.user_id);
    console.log('[db.addTask] 🔐 Match:', session?.user?.id === task.user_id);

    const payload: Record<string, any> = {
      id: task.id,
      user_id: task.user_id,
      text: task.title,
      description: task.description,
      category: task.category,
      priority: task.priority,
      estimated_minutes: task.estimatedMinutes,
      energy_level: task.energyLevel,
      deadline: task.deadline || null,
      tags: task.tags,
      completed: task.status === 'done',
      status: task.status,
      created_at: new Date(task.createdAt).toISOString(),
    };

    // Only include project_id if it's actually set (avoids FK violations)
    if (task.project_id) {
      payload.project_id = task.project_id;
    }

    console.log('[db.addTask] 📦 Full payload:', JSON.stringify(payload, null, 2));

    // Use .select() to get the inserted row back — if RLS blocks the insert,
    // Supabase returns NO error but data will be empty. This lets us detect it.
    const { error, data, status, statusText } = await supabase
      .from('tasks')
      .insert(payload)
      .select();

    console.log('[db.addTask] 📡 Response: status=', status, statusText, '| data=', data, '| error=', error);

    if (error) {
      console.error('[db.addTask] ❌ Supabase error:', error.code, error.message, error.details, error.hint);
      throw error;
    }

    if (!data || data.length === 0) {
      console.error('[db.addTask] ❌ Insert returned 0 rows — RLS blocked. user_id:', task.user_id);
      throw new Error('Insert blocked by RLS policy — no rows returned');
    }

    console.log('[db.addTask] ✅ Insert succeeded for:', task.id);
    
    // Fire-and-forget activity log — don't block on it
    if (task.user_id) {
        this.logActivity(task.user_id, 'created_task', task.id, { title: task.title }).catch(() => {});
    }
  },

  async updateTask(task: Task) {
    if (!supabase) throw new Error('Supabase not configured');
    console.log('[db.updateTask] Updating task:', task.id);
    const { error } = await supabase
      .from('tasks')
      .update({
        text: task.title,
        description: task.description,
        category: task.category,
        priority: task.priority,
        estimated_minutes: task.estimatedMinutes,
        energy_level: task.energyLevel,
        deadline: task.deadline,
        tags: task.tags,
        completed: task.status === 'done',
        status: task.status,
        project_id: task.project_id,
      })
      .eq('id', task.id);
    if (error) {
      console.error('[db.updateTask] Error:', error.code, error.message, error.details);
      throw error;
    }

    // Log activity logic
    if (task.status === 'done' && task.user_id) {
         await this.logActivity(task.user_id, 'completed_task', task.id, { title: task.title });
    }
    
    console.log('[db.updateTask] Update succeeded');
  },

  async deleteTask(taskId: string) {
    if (!supabase) throw new Error('Supabase not configured');
    console.log('[db.deleteTask] Deleting task:', taskId);
    
    // Fetch task for logging
    const { data: task } = await supabase.from('tasks').select('user_id, text').eq('id', taskId).single();

    const { error, count } = await supabase.from('tasks').delete({ count: 'exact' }).eq('id', taskId);
    if (error) {
      console.error('[db.deleteTask] Error:', error.code, error.message, error.details);
      throw error;
    }

    if (task && task.user_id) {
        await this.logActivity(task.user_id, 'deleted_task', taskId, { title: task.text });
    }
    
    console.log('[db.deleteTask] Rows deleted:', count);
  },

  async fetchProjects(userId?: string) {
    if (!supabase) throw new Error('Supabase not configured');
    console.log('[db.fetchProjects] Fetching projects for user:', userId ?? 'UNKNOWN');

    let query = supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true });
    
    // Explicitly filter by user_id if provided (belt-and-suspenders with RLS)
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[db.fetchProjects] Error:', error.code, error.message);
      throw error;
    }
    console.log('[db.fetchProjects] Found', data?.length ?? 0, 'projects');
    return data || [];
  },

  async addProject(project: { user_id: string; name: string; color: string }) {
    if (!supabase) throw new Error('Supabase not configured');
    console.log('[db.addProject] Inserting project:', project.name, '| user:', project.user_id);
    
    const insertPromise = supabase
      .from('projects')
      .insert({
        user_id: project.user_id,
        name: project.name,
        color: project.color,
      })
      .select()
      .single();
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`addProject timed out after 10s for "${project.name}"`)), 10000)
    );

    const { data, error } = await Promise.race([insertPromise, timeoutPromise]) as any;

    if (error) {
      console.error('[db.addProject] Error:', error.code, error.message);
      throw error;
    }
    console.log('[db.addProject] ✓ Project created:', data?.id, data?.name);
    return data;
  },

  async ensureDefaultProjects(userId: string) {
    if (!supabase) throw new Error('Supabase not configured');
    console.log('[db.ensureDefaultProjects] Checking for default projects...');

    // Check if Life and Work projects exist by name
    const { data: existingProjects } = await supabase
      .from('projects')
      .select('name')
      .eq('user_id', userId)
      .in('name', ['Life', 'Work']);

    const existingNames = new Set((existingProjects || []).map((p: any) => p.name));
    
    const defaults = [
      { user_id: userId, name: 'Life', color: '#22c55e' }, // Green
      { user_id: userId, name: 'Work', color: '#3b82f6' }, // Blue
    ];
    
    const toCreate = defaults.filter(d => !existingNames.has(d.name));

    if (toCreate.length === 0) {
      console.log('[db.ensureDefaultProjects] Life and Work already exist, skipping');
      return;
    }

    console.log('[db.ensureDefaultProjects] Creating missing defaults:', toCreate.map(p => p.name).join(', '));
    const { error } = await supabase
      .from('projects')
      .insert(toCreate);

    if (error) {
      console.error('[db.ensureDefaultProjects] Error:', error.code, error.message);
      // Don't throw — this is a convenience function, not critical
    } else {
      console.log('[db.ensureDefaultProjects] Default projects created');
    }
  }
};
