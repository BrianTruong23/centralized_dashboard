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
  }
};
