import { useCallback, useEffect, useState } from 'react';
import { awaitAuthenticatedSession, supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

interface PremiumState {
  isPro: boolean;
  tier: 'free' | 'pro';
  status: 'inactive' | 'active' | 'canceled' | 'past_due';
  loading: boolean;
}

const defaultState: PremiumState = {
  isPro: false,
  tier: 'free',
  status: 'inactive',
  loading: true,
};

export function usePremium() {
  const [state, setState] = useState<PremiumState>(defaultState);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setState({ ...defaultState, loading: false });
      return;
    }

    const session = await awaitAuthenticatedSession(10_000);
    if (!session?.user) {
      setState({ ...defaultState, loading: false });
      return;
    }

    try {
      const subscription = await db.getMySubscription();
      if (!subscription) {
        setState({ isPro: false, tier: 'free', status: 'inactive', loading: false });
        return;
      }
      setState({
        isPro: subscription.isPro,
        tier: subscription.tier as 'free' | 'pro',
        status: subscription.status as 'inactive' | 'active' | 'canceled' | 'past_due',
        loading: false,
      });
    } catch (err) {
      console.warn('[usePremium] failed to load subscription, defaulting to free:', err);
      setState({ ...defaultState, loading: false });
    }
  }, []);

  useEffect(() => {
    refresh();

    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });

    return () => subscription.unsubscribe();
  }, [refresh]);

  return { ...state, refresh };
}
