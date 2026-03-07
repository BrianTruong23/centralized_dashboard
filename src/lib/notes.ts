
import { supabase } from './supabase';

export interface Note {
  id: string;
  user_id: string;
  content: string;
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

const mapRowToNote = (row: any): Note => ({
  id: row.id,
  user_id: row.user_id,
  content: row.content,
  summary: row.summary,
  createdAt: new Date(row.created_at).getTime(),
  updatedAt: new Date(row.updated_at).getTime(),
});

export const notesDb = {
  async fetchNotes(userId?: string) {
    if (!supabase) throw new Error('Supabase not configured');
    let query = supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false });
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;

    if (error) {
       // If table doesn't exist yet, return empty array gracefully or throw specific error
       if (error.code === '42P01') {
         console.warn('Notes table missing.');
         return [];
       }
       throw new Error(error.message);
    }
    return data.map(mapRowToNote);
  },

  async addNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: note.user_id,
        content: note.content,
        summary: note.summary,
      })
      .select()
      .single();

    if (error) throw error;
    return mapRowToNote(data);
  },

  async updateNote(id: string, updates: Partial<Pick<Note, 'content' | 'summary'>>) {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('notes')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapRowToNote(data);
  },

  async deleteNote(id: string) {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};
