
import { supabase } from './supabase';
import { Idea, IdeaStatus } from '@/types/idea';
import { logActivity } from './activity';

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

    const result = {
      ...data,
      created_at: new Date(data.created_at).getTime(),
    };

    // Log activity (non-blocking)
    logActivity({
      userId: idea.user_id,
      actor: 'user',
      actionType: 'PROJECT_CREATED',
      entityType: 'project',
      entityId: data.id,
      summary: `Created project: ${idea.title}`,
      metadata: {
        status: idea.status,
      },
    });

    return result;
  },

  async updateIdeaStatus(id: string, status: IdeaStatus, userId?: string, title?: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('ideas')
      .update({ status })
      .eq('id', id);

    if (error) throw error;

    // Log activity (non-blocking)
    if (userId) {
      logActivity({
        userId,
        actor: 'user',
        actionType: 'PROJECT_UPDATED',
        entityType: 'project',
        entityId: id,
        summary: `Updated project status${title ? ` for "${title}"` : ''}: ${status}`,
        metadata: {
          newStatus: status,
        },
      });
    }
  },

  async deleteIdea(id: string, userId?: string, title?: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
      .from('ideas')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Log activity (non-blocking)
    if (userId) {
      logActivity({
        userId,
        actor: 'user',
        actionType: 'PROJECT_DELETED',
        entityType: 'project',
        entityId: id,
        summary: `Deleted project${title ? `: ${title}` : ''}`,
      });
    }
  }
};
