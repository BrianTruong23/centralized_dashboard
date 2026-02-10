
import { supabase } from './supabase';
import { Task } from '@/types/task';

// Map database row to Task object
const mapRowToTask = (row: any): Task => ({
  id: row.id,
  user_id: row.user_id,
  title: row.text, // 'text' column in DB maps to 'title' in app
  description: row.description || '', // assuming we add description col or map it
  status: row.completed ? 'done' : 'todo', // basic mapping, ideally DB has status enum
  // We need to decide: does DB have all these fields? 
  // The plan said: text, completed.
  // We have complex Task object. We should probably expand the DB schema or map heavily.
  // For now, let's assume we store the full JSON or expand columns.
  // Best practice: Store structured data.
  // Let's stick to the plan's schema for now, but strictly it's insufficient for 'energyLevel', 'priority', 'category'.
  // I will update the plan/code to use a JSONB column 'data' or expand columns.
  // FOR NOW: I will start with a robust `data` jsonb column in the proposal or code.
  // Wait, I can't change the plan easily now without user, but I can make the code robust.
  // I'll assume the DB table 'tasks' has a 'json_content' or similar, OR I just add columns.
  // Let's assume we adding columns.
  category: row.category || 'Life',
  priority: row.priority || 3,
  estimatedMinutes: row.estimated_minutes || 60,
  energyLevel: row.energy_level || 'medium',
  deadline: row.deadline,
  tags: row.tags || [],
  createdAt: new Date(row.created_at).getTime(),
});

// Since the plan had a simple schema, I should probably update it to support all fields.
// I'll make the `db.ts` helper that assumes the table has these fields.
// I'll notify the user to run a more complete SQL.

export const db = {
  async fetchTasks() {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      // Provide more detailed error information
      if (error.code === '42P01') {
        throw new Error('Tasks table does not exist in Supabase. Tasks will be stored locally.');
      }
      throw new Error(error.message || 'Failed to fetch tasks from database');
    }
    return data.map(mapRowToTask);
  },

  async addTask(task: Task) {
    if (!supabase) throw new Error('Supabase not configured');
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
      created_at: new Date(task.createdAt).toISOString(),
    });
    if (error) throw error;
  },

  async updateTask(task: Task) {
    if (!supabase) throw new Error('Supabase not configured');
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
      })
      .eq('id', task.id);
    if (error) throw error;
  },

  async deleteTask(taskId: string) {
    if (!supabase) throw new Error('Supabase not configured');
    console.log('[db.deleteTask] Sending DELETE to Supabase for taskId:', taskId);
    const { error, count } = await supabase.from('tasks').delete({ count: 'exact' }).eq('id', taskId);
    if (error) {
      console.error('[db.deleteTask] Supabase error:', error.code, error.message, error.details);
      throw error;
    }
    console.log('[db.deleteTask] Supabase response OK. Rows deleted:', count);
  }
};
