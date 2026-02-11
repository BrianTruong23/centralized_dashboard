import { supabase } from './supabase';
import { WeeklyPlan, PlanItem, ActivityLogEntry } from '@/types/plan';

// Map database row to WeeklyPlan
const mapRowToPlan = (row: any): WeeklyPlan => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  dateRangeStart: row.date_range_start,
  dateRangeEnd: row.date_range_end,
  goals: row.goals,
  constraints: row.constraints || {},
  items: [], // Items loaded separately
  status: row.status || 'draft',
  createdAt: new Date(row.created_at).getTime(),
  approvedAt: row.approved_at ? new Date(row.approved_at).getTime() : undefined,
  discardedAt: row.discarded_at ? new Date(row.discarded_at).getTime() : undefined,
});

// Map database row to PlanItem
const mapRowToPlanItem = (row: any): PlanItem => ({
  id: row.id,
  taskId: row.task_id,
  title: row.title,
  description: row.description || '',
  category: row.category || 'Life',
  priority: row.priority || 3,
  estimatedMinutes: row.estimated_minutes || 60,
  energyLevel: row.energy_level || 'medium',
  deadline: row.deadline,
  suggestedStart: row.suggested_start,
  suggestedEnd: row.suggested_end,
  planningMetadata: row.planning_metadata || {},
});

export const plansDb = {
  async fetchPlans(userId?: string) {
    if (!supabase) throw new Error('Supabase not configured');

    let query = supabase
      .from('weekly_plans')
      .select('*')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message || 'Failed to fetch plans');
    }

    return data.map(mapRowToPlan);
  },

  async fetchPlanById(planId: string): Promise<WeeklyPlan | null> {
    if (!supabase) throw new Error('Supabase not configured');

    const { data: planData, error: planError } = await supabase
      .from('weekly_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planError) {
      throw new Error(planError.message || 'Failed to fetch plan');
    }

    if (!planData) return null;

    // Fetch plan items
    const { data: itemsData, error: itemsError } = await supabase
      .from('weekly_plan_items')
      .select('*')
      .eq('plan_id', planId)
      .order('suggested_start', { ascending: true });

    if (itemsError) {
      throw new Error(itemsError.message || 'Failed to fetch plan items');
    }

    const plan = mapRowToPlan(planData);
    plan.items = (itemsData || []).map(mapRowToPlanItem);

    return plan;
  },

  async createPlan(plan: WeeklyPlan) {
    if (!supabase) throw new Error('Supabase not configured');

    // Insert plan
    const { data: planData, error: planError } = await supabase
      .from('weekly_plans')
      .insert({
        id: plan.id,
        user_id: plan.userId,
        title: plan.title,
        date_range_start: plan.dateRangeStart,
        date_range_end: plan.dateRangeEnd,
        goals: plan.goals,
        constraints: plan.constraints,
        status: plan.status,
        created_at: new Date(plan.createdAt).toISOString(),
      })
      .select()
      .single();

    if (planError) {
      throw planError;
    }

    // Insert plan items
    if (plan.items.length > 0) {
      const itemsToInsert = plan.items.map((item) => ({
        id: item.id,
        plan_id: plan.id,
        task_id: item.taskId,
        title: item.title,
        description: item.description,
        category: item.category,
        priority: item.priority,
        estimated_minutes: item.estimatedMinutes,
        energy_level: item.energyLevel,
        deadline: item.deadline,
        suggested_start: item.suggestedStart,
        suggested_end: item.suggestedEnd,
        planning_metadata: item.planningMetadata || {},
      }));

      const { error: itemsError } = await supabase
        .from('weekly_plan_items')
        .insert(itemsToInsert);

      if (itemsError) {
        throw itemsError;
      }
    }

    return planData;
  },

  async updatePlanStatus(planId: string, status: 'approved' | 'discarded') {
    if (!supabase) throw new Error('Supabase not configured');

    const updates: any = { status };

    if (status === 'approved') {
      updates.approved_at = new Date().toISOString();
    } else if (status === 'discarded') {
      updates.discarded_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('weekly_plans')
      .update(updates)
      .eq('id', planId);

    if (error) {
      throw error;
    }
  },

  async updatePlanItem(itemId: string, updates: Partial<PlanItem>) {
    if (!supabase) throw new Error('Supabase not configured');

    const dbUpdates: any = {};

    if (updates.title) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.category) dbUpdates.category = updates.category;
    if (updates.priority) dbUpdates.priority = updates.priority;
    if (updates.estimatedMinutes) dbUpdates.estimated_minutes = updates.estimatedMinutes;
    if (updates.energyLevel) dbUpdates.energy_level = updates.energyLevel;
    if (updates.deadline !== undefined) dbUpdates.deadline = updates.deadline;
    if (updates.suggestedStart) dbUpdates.suggested_start = updates.suggestedStart;
    if (updates.suggestedEnd) dbUpdates.suggested_end = updates.suggestedEnd;
    if (updates.planningMetadata) dbUpdates.planning_metadata = updates.planningMetadata;

    const { error } = await supabase
      .from('weekly_plan_items')
      .update(dbUpdates)
      .eq('id', itemId);

    if (error) {
      throw error;
    }
  },

  async deletePlan(planId: string) {
    if (!supabase) throw new Error('Supabase not configured');

    // Items will be deleted via cascade
    const { error } = await supabase
      .from('weekly_plans')
      .delete()
      .eq('id', planId);

    if (error) {
      throw error;
    }
  },
};

export const activityLog = {
  async logActivity(entry: Omit<ActivityLogEntry, 'id' | 'createdAt'>) {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase.from('activity_log').insert({
      id: crypto.randomUUID(),
      user_id: entry.userId,
      actor: entry.actor,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      metadata: entry.metadata || {},
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[activityLog] Failed to log activity:', error);
      // Don't throw - logging failures shouldn't break the app
    }
  },

  async fetchRecentActivity(userId: string, limit: number = 50) {
    if (!supabase) throw new Error('Supabase not configured');

    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message || 'Failed to fetch activity log');
    }

    return data.map((row) => ({
      id: row.id,
      userId: row.user_id,
      actor: row.actor,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at).getTime(),
    }));
  },
};
