import { useState, useEffect } from 'react';
import { checkPremiumStatus, getUserSubscription, UserSubscription } from '@/lib/subscription';

export function useSubscription(userId: string | undefined) {
  const [isPremium, setIsPremium] = useState(false);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsPremium(false);
      setSubscription(null);
      setLoading(false);
      return;
    }

    const fetchSubscription = async () => {
      setLoading(true);
      try {
        const [premium, sub] = await Promise.all([
          checkPremiumStatus(userId),
          getUserSubscription(userId),
        ]);
        setIsPremium(premium);
        setSubscription(sub);
      } catch (error) {
        console.error('Error fetching subscription:', error);
        setIsPremium(false);
        setSubscription(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [userId]);

  return { isPremium, subscription, loading };
}
