import { supabase } from './supabase';
import { LogActivityParams, ActivityLog } from '@/types/activity';

/**
 * Log an activity entry to the activity_log table.
 * This function NEVER throws - it logs errors but allows the main action to proceed.
 *
 * @param params - Activity log parameters
 * @returns Promise that resolves with the created log entry or null if failed
 */
export async function logActivity(params: LogActivityParams): Promise<ActivityLog | null> {
  // Skip if Supabase is not configured
  if (!supabase) {
    console.warn('[activity] Supabase not configured, skipping activity log');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('activity_log')
      .insert({
        user_id: params.userId,
        actor: params.actor,
        action_type: params.actionType,
        entity_type: params.entityType || null,
        entity_id: params.entityId || null,
        summary: params.summary,
        metadata: params.metadata || null,
      })
      .select()
      .single();

    if (error) {
      console.warn('[activity] Failed to log activity:', error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.warn('[activity] Exception while logging activity:', err);
    return null;
  }
}

/**
 * Fetch activity logs for the current user with pagination and optional filters.
 *
 * @param options - Query options
 * @returns Promise with array of activity logs
 */
export async function fetchActivityLogs(options: {
  limit?: number;
  offset?: number;
  actor?: string;
  entityType?: string;
  actionType?: string;
}): Promise<ActivityLog[]> {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  let query = supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false });

  // Apply filters
  if (options.actor) {
    query = query.eq('actor', options.actor);
  }
  if (options.entityType) {
    query = query.eq('entity_type', options.entityType);
  }
  if (options.actionType) {
    query = query.eq('action_type', options.actionType);
  }

  // Apply pagination
  if (options.limit) {
    query = query.limit(options.limit);
  }
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[activity] Failed to fetch activity logs:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get the total count of activity logs for the current user.
 * Useful for pagination.
 */
export async function getActivityLogCount(filters?: {
  actor?: string;
  entityType?: string;
  actionType?: string;
}): Promise<number> {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  let query = supabase
    .from('activity_log')
    .select('id', { count: 'exact', head: true });

  if (filters?.actor) {
    query = query.eq('actor', filters.actor);
  }
  if (filters?.entityType) {
    query = query.eq('entity_type', filters.entityType);
  }
  if (filters?.actionType) {
    query = query.eq('action_type', filters.actionType);
  }

  const { count, error } = await query;

  if (error) {
    console.error('[activity] Failed to get activity log count:', error);
    throw error;
  }

  return count || 0;
}
