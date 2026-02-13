/**
 * Subscription utilities for checking premium status and gating features
 */

import { supabase } from './supabase';

export interface UserSubscription {
  id: string;
  user_id: string;
  is_premium: boolean;
  subscription_id: string | null;
  subscription_status: string | null;
  plan_id: string | null;
  payment_provider: string;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Check if a user has an active premium subscription
 */
export async function checkPremiumStatus(userId: string): Promise<boolean> {
  if (!supabase) {
    console.warn('Supabase not configured, defaulting to free tier');
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('is_premium, subscription_status')
      .eq('user_id', userId)
      .single();

    if (error) {
      // If no subscription record exists, user is on free tier
      if (error.code === 'PGRST116') {
        return false;
      }
      console.error('Error checking premium status:', error);
      return false;
    }

    // User is premium if is_premium is true and status is ACTIVE
    return data?.is_premium === true && data?.subscription_status === 'ACTIVE';
  } catch (error) {
    console.error('Error checking premium status:', error);
    return false;
  }
}

/**
 * Get user subscription details
 */
export async function getUserSubscription(
  userId: string
): Promise<UserSubscription | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No subscription found
      }
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error getting user subscription:', error);
    return null;
  }
}

/**
 * Create or update user subscription
 */
export async function upsertUserSubscription(
  subscription: Partial<UserSubscription>
): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('user_subscriptions')
    .upsert(subscription);

  if (error) throw error;
}

/**
 * Premium feature gate - throws error if user doesn't have premium
 */
export async function requirePremium(userId: string): Promise<void> {
  const isPremium = await checkPremiumStatus(userId);
  if (!isPremium) {
    throw new Error('Premium subscription required for this feature');
  }
}

/**
 * Premium features list
 */
export const PREMIUM_FEATURES = {
  UNLIMITED_TASKS: 'unlimited_tasks',
  ADVANCED_FILTERS: 'advanced_filters',
  CUSTOM_THEMES: 'custom_themes',
  EXPORT_DATA: 'export_data',
  PRIORITY_SUPPORT: 'priority_support',
  FOCUS_ANALYTICS: 'focus_analytics',
  UNLIMITED_PROJECTS: 'unlimited_projects',
} as const;

/**
 * Free tier limits
 */
export const FREE_TIER_LIMITS = {
  MAX_TASKS: 50,
  MAX_PROJECTS: 3,
  MAX_WEEKLY_PLANS: 4,
} as const;

/**
 * Check if user can perform action based on free tier limits
 */
export async function checkFreeTierLimit(
  userId: string,
  limitType: 'tasks' | 'projects' | 'weekly_plans',
  currentCount: number
): Promise<{ allowed: boolean; limit?: number; message?: string }> {
  const isPremium = await checkPremiumStatus(userId);

  if (isPremium) {
    return { allowed: true };
  }

  const limits = {
    tasks: FREE_TIER_LIMITS.MAX_TASKS,
    projects: FREE_TIER_LIMITS.MAX_PROJECTS,
    weekly_plans: FREE_TIER_LIMITS.MAX_WEEKLY_PLANS,
  };

  const limit = limits[limitType];

  if (currentCount >= limit) {
    return {
      allowed: false,
      limit,
      message: `Free tier limit reached. Upgrade to premium for unlimited ${limitType}.`,
    };
  }

  return { allowed: true };
}
