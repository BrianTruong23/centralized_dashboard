import { supabase } from './supabase';
import { WeeklyPlan, WeeklyPlanItem, WeeklyPlanStatus } from '@/types/weeklyPlan';

const mapRowToPlan = (row: any): WeeklyPlan => ({
  id: row.id,
  user_id: row.user_id,
  title: row.title,
  goals: row.goals,
  constraints: row.constraints || {},
  start_date: row.start_date,
  end_date: row.end_date,
  status: row.status,
  items: [],
  createdAt: new Date(row.created_at).getTime(),
  updatedAt: new Date(row.updated_at).getTime(),
});

const mapRowToPlanItem = (row: any): WeeklyPlanItem => ({
  id: row.id,
  plan_id: row.plan_id,
  task_id: row.task_id,
  title: row.title,
  description: row.description || '',
  category: row.category || 'Life',
  priority: row.priority || 3,
  estimatedMinutes: row.estimated_minutes || 60,
  energyLevel: row.energy_level || 'medium',
  suggested_start: row.suggested_start,
  suggested_end: row.suggested_end,
  day_of_week: row.day_of_week,
  sequence_order: row.sequence_order,
  createdAt: new Date(row.created_at).getTime(),
});

export const weeklyPlanDb = {
  async fetchPlans() {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('weekly_plans')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        console.warn('Weekly plans table missing.');
        return [];
      }
      throw new Error(error.message);
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

    if (planError) throw planError;
    if (!planData) return null;

    const plan = mapRowToPlan(planData);

    // Fetch items for this plan
    const { data: itemsData, error: itemsError } = await supabase
      .from('weekly_plan_items')
      .select('*')
      .eq('plan_id', planId)
      .order('sequence_order', { ascending: true });

    if (itemsError) throw itemsError;

    plan.items = (itemsData || []).map(mapRowToPlanItem);
    return plan;
  },

  async createPlan(plan: Omit<WeeklyPlan, 'id' | 'createdAt' | 'updatedAt' | 'items'>) {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('weekly_plans')
      .insert({
        user_id: plan.user_id,
        title: plan.title,
        goals: plan.goals,
        constraints: plan.constraints,
        start_date: plan.start_date,
        end_date: plan.end_date,
        status: plan.status,
      })
      .select()
      .single();

    if (error) throw error;
    return mapRowToPlan(data);
  },

  async updatePlanStatus(planId: string, status: WeeklyPlanStatus) {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase
      .from('weekly_plans')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId);

    if (error) throw error;
  },

  async createPlanItem(item: Omit<WeeklyPlanItem, 'id' | 'createdAt'>) {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('weekly_plan_items')
      .insert({
        plan_id: item.plan_id,
        task_id: item.task_id,
        title: item.title,
        description: item.description,
        category: item.category,
        priority: item.priority,
        estimated_minutes: item.estimatedMinutes,
        energy_level: item.energyLevel,
        suggested_start: item.suggested_start,
        suggested_end: item.suggested_end,
        day_of_week: item.day_of_week,
        sequence_order: item.sequence_order,
      })
      .select()
      .single();

    if (error) throw error;
    return mapRowToPlanItem(data);
  },

  async createPlanItems(items: Omit<WeeklyPlanItem, 'id' | 'createdAt'>[]) {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('weekly_plan_items')
      .insert(
        items.map((item) => ({
          plan_id: item.plan_id,
          task_id: item.task_id,
          title: item.title,
          description: item.description,
          category: item.category,
          priority: item.priority,
          estimated_minutes: item.estimatedMinutes,
          energy_level: item.energyLevel,
          suggested_start: item.suggested_start,
          suggested_end: item.suggested_end,
          day_of_week: item.day_of_week,
          sequence_order: item.sequence_order,
        }))
      )
      .select();

    if (error) throw error;
    return (data || []).map(mapRowToPlanItem);
  },

  async updatePlanItem(itemId: string, updates: Partial<WeeklyPlanItem>) {
    if (!supabase) throw new Error('Supabase not configured');
    const dbUpdates: any = {};

    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.estimatedMinutes !== undefined) dbUpdates.estimated_minutes = updates.estimatedMinutes;
    if (updates.energyLevel !== undefined) dbUpdates.energy_level = updates.energyLevel;
    if (updates.suggested_start !== undefined) dbUpdates.suggested_start = updates.suggested_start;
    if (updates.suggested_end !== undefined) dbUpdates.suggested_end = updates.suggested_end;
    if (updates.day_of_week !== undefined) dbUpdates.day_of_week = updates.day_of_week;
    if (updates.sequence_order !== undefined) dbUpdates.sequence_order = updates.sequence_order;

    const { error } = await supabase
      .from('weekly_plan_items')
      .update(dbUpdates)
      .eq('id', itemId);

    if (error) throw error;
  },

  async deletePlan(planId: string) {
    if (!supabase) throw new Error('Supabase not configured');
    // Cascade delete will handle plan items
    const { error } = await supabase.from('weekly_plans').delete().eq('id', planId);
    if (error) throw error;
  },
};
