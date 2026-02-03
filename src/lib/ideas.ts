
import { supabase } from './supabase';
import { Idea, IdeaStatus } from '@/types/idea';

export const ideasDb = {
  async fetchIdeas(): Promise<Idea[]> {
    if (!supabase) throw new Error('Supabase not configured');
    
    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Map DB fields if necessary (assuming DB uses snake_case and we want match)
    // For now assuming 1:1 mapping mostly, except created_at might be string
    return data.map((d: any) => ({
      ...d,
      created_at: new Date(d.created_at).getTime(),
    }));
  },

  async addIdea(idea: Omit<Idea, 'id' | 'created_at' | 'user_id'> & { user_id: string }): Promise<Idea> {
    if (!supabase) throw new Error('Supabase not configured');
    
    const { data, error } = await supabase
      .from('ideas')
      .insert({
        title: idea.title,
        description: idea.description,
        status: idea.status,
        user_id: idea.user_id,
      })
      .select()
      .single();

    if (error) throw error;
    return {
      ...data,
      created_at: new Date(data.created_at).getTime(),
    };
  },

  async updateIdeaStatus(id: string, status: IdeaStatus): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    
    const { error } = await supabase
      .from('ideas')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
  },

  async deleteIdea(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    
    const { error } = await supabase
      .from('ideas')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};
