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

  async addTask(task: Task) {
    if (!supabase) throw new Error('Supabase not configured');
    console.log('[db.addTask] Inserting task:', task.id);
    const { error } = await supabase.from('tasks').insert({
      id: task.id,
      user_id: task.user_id,
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
      created_at: new Date(task.createdAt).toISOString(),
    });
    if (error) {
      console.error('[db.addTask] Error:', error.code, error.message, error.details);
      throw error;
    }
    console.log('[db.addTask] Insert succeeded');
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
    console.log('[db.updateTask] Update succeeded');
  },

  async deleteTask(taskId: string) {
    if (!supabase) throw new Error('Supabase not configured');
    console.log('[db.deleteTask] Deleting task:', taskId);
    const { error, count } = await supabase.from('tasks').delete({ count: 'exact' }).eq('id', taskId);
    if (error) {
      console.error('[db.deleteTask] Error:', error.code, error.message, error.details);
      throw error;
    }
    console.log('[db.deleteTask] Rows deleted:', count);
  },

  async fetchProjects() {
    if (!supabase) throw new Error('Supabase not configured');
    console.log('[db.fetchProjects] Fetching projects...');
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[db.fetchProjects] Error:', error.code, error.message);
      throw error;
    }
    return data;
  },

  async addProject(project: { user_id: string; name: string; color: string }) {
    if (!supabase) throw new Error('Supabase not configured');
    console.log('[db.addProject] Inserting project:', project.name);
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: project.user_id,
        name: project.name,
        color: project.color,
      })
      .select()
      .single();

    if (error) {
      console.error('[db.addProject] Error:', error.code, error.message);
      throw error;
    }
    return data;
  },

  async ensureDefaultProjects(userId: string) {
    if (!supabase) throw new Error('Supabase not configured');
    console.log('[db.ensureDefaultProjects] Checking for default projects...');

    // Check if user already has projects
    const { data: existingProjects } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    // If user already has projects, don't create defaults
    if (existingProjects && existingProjects.length > 0) {
      console.log('[db.ensureDefaultProjects] User already has projects, skipping defaults');
      return;
    }

    // Create default Life and Work projects
    const defaultProjects = [
      { user_id: userId, name: 'Life', color: '#22c55e' }, // Green
      { user_id: userId, name: 'Work', color: '#3b82f6' }, // Blue
    ];

    console.log('[db.ensureDefaultProjects] Creating default projects...');
    const { error } = await supabase
      .from('projects')
      .insert(defaultProjects);

    if (error) {
      console.error('[db.ensureDefaultProjects] Error:', error.code, error.message);
      throw error;
    }
    console.log('[db.ensureDefaultProjects] Default projects created');
  }
};
