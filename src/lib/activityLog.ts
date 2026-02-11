import { supabase } from './supabase';
import { PlanActivity, PlanActivityType } from '@/types/weeklyPlan';

/**
 * Activity log for tracking plan-related events
 * This helps with auditing and understanding how plans are used
 */

const mapRowToActivity = (row: any): PlanActivity => ({
  id: row.id,
  type: row.type,
  actor: row.actor,
  plan_id: row.plan_id,
  task_count: row.task_count,
  metadata: row.metadata,
  created_at: new Date(row.created_at).getTime(),
});

export const activityLog = {
  /**
   * Log a plan-related activity
   */
  async logActivity(activity: Omit<PlanActivity, 'id' | 'created_at'>) {
    if (!supabase) {
      console.warn('Supabase not configured, skipping activity log');
      return;
    }

    try {
      const { error } = await supabase.from('plan_activities').insert({
        type: activity.type,
        actor: activity.actor,
        plan_id: activity.plan_id,
        task_count: activity.task_count,
        metadata: activity.metadata,
      });

      if (error) {
        // Don't throw - activity logging is non-critical
        console.error('[activityLog] Failed to log activity:', error);
      }
    } catch (err) {
      console.error('[activityLog] Error logging activity:', err);
    }
  },

  /**
   * Fetch activities for a specific plan
   */
  async fetchActivitiesForPlan(planId: string): Promise<PlanActivity[]> {
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase
      .from('plan_activities')
      .select('*')
      .eq('plan_id', planId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapRowToActivity);
  },

  /**
   * Fetch recent activities for a user
   */
  async fetchRecentActivities(limit: number = 50): Promise<PlanActivity[]> {
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase
      .from('plan_activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).map(mapRowToActivity);
  },
};

/**
 * Helper functions for common activity logging patterns
 */
export const logPlanGenerated = (planId: string, metadata?: Record<string, any>) => {
  return activityLog.logActivity({
    type: 'PLAN_GENERATED',
    actor: 'agent',
    plan_id: planId,
    metadata,
  });
};

export const logPlanApproved = (planId: string, taskCount: number) => {
  return activityLog.logActivity({
    type: 'PLAN_APPROVED',
    actor: 'user',
    plan_id: planId,
    task_count: taskCount,
  });
};

export const logPlanDiscarded = (planId: string) => {
  return activityLog.logActivity({
    type: 'PLAN_DISCARDED',
    actor: 'user',
    plan_id: planId,
  });
};

export const logTasksCreatedFromPlan = (planId: string, taskCount: number) => {
  return activityLog.logActivity({
    type: 'TASKS_CREATED_FROM_PLAN',
    actor: 'agent',
    plan_id: planId,
    task_count: taskCount,
  });
};

export const logTaskUpdatedFromPlanEdit = (planId: string, metadata?: Record<string, any>) => {
  return activityLog.logActivity({
    type: 'TASK_UPDATED_FROM_PLAN_EDIT',
    actor: 'user',
    plan_id: planId,
    metadata,
  });
};
