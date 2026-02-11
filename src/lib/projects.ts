import { supabase } from './supabase';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  color?: string;
  createdAt: number;
}

export const projectsDb = {
  async fetchProjects(): Promise<Project[]> {
    if (!supabase) return [];
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching projects:', error);
      return [];
    }

    return data.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      color: row.color,
      createdAt: new Date(row.created_at).getTime(),
    }));
  },

  async addProject(name: string): Promise<Project | null> {
    if (!supabase) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('projects')
      .insert([{ 
        user_id: user.id, 
        name: name,
        color: '#000000' // Default color
      }])
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      user_id: data.user_id,
      name: data.name,
      color: data.color,
      createdAt: new Date(data.created_at).getTime(),
    };
  },

  async deleteProject(id: string): Promise<void> {
    if (!supabase) return;

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};
