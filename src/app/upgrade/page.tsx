'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { usePremium } from '@/hooks/usePremium';
import { CheckCircle2, Crown, Loader2, Sparkles, XCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

function UpgradePageContent() {
  const searchParams = useSearchParams();
  const { isPro, loading: isPremiumLoading, refresh } = usePremium();
  const [status, setStatus] = useState<'idle' | 'creating' | 'redirecting' | 'capturing' | 'success' | 'cancel' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const paypalState = searchParams.get('paypal');
  const orderId = searchParams.get('token');

  const reasons = useMemo(() => [
    'Unlock Auto Plan for AI-generated weekly scheduling.',
    'Get access to premium productivity features as they ship.',
    'Support ongoing improvements for Minismo.',
  ], []);

  const startPaypalCheckout = async () => {
    try {
      setStatus('creating');
      setMessage('Creating secure checkout...');

      const res = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType: 'one_time' }),
      });

      const json = await res.json();
      if (!res.ok || !json.approveUrl) {
        throw new Error(json?.error || 'Failed to start PayPal checkout');
      }

      setStatus('redirecting');
      window.location.href = json.approveUrl;
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Payment start failed');
    }
  };

  useEffect(() => {
    if (paypalState === 'cancel') {
      setStatus('cancel');
      setMessage('Payment canceled. No changes were made.');
      return;
    }

    if (paypalState !== 'success' || !orderId) return;

    let canceled = false;

    const capture = async () => {
      try {
        setStatus('capturing');
        setMessage('Finalizing your upgrade...');

        if (!supabase) throw new Error('Supabase is not configured');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Please sign in before upgrading');

        const res = await fetch('/api/paypal/capture-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ orderId }),
        });

        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json?.error || 'Could not confirm payment');
        }

        await refresh();
        if (!canceled) {
          setStatus('success');
          setMessage('You are now on Pro. Premium features are unlocked.');
        }
      } catch (err: any) {
        if (!canceled) {
          setStatus('error');
          setMessage(err?.message || 'Payment capture failed');
        }
      }
    };

    capture();

    return () => {
      canceled = true;
    };
  }, [orderId, paypalState, refresh]);

  return (
    <main className="min-h-screen bg-[#fafafa] dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-xs text-gray-500 hover:text-black dark:hover:text-white">Back to dashboard</Link>

        <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Crown size={20} className="text-amber-500" />
                Go Pro
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Upgrade your workflow with premium planning features.
              </p>
            </div>
            {isPro && (
              <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold">
                Pro Active
              </span>
            )}
          </div>

          <div className="space-y-2 mb-6">
            {reasons.map((item) => (
              <div key={item} className="text-sm flex items-start gap-2 text-gray-700 dark:text-gray-300">
                <CheckCircle2 size={16} className="text-emerald-500 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3">
            <p className="text-sm font-semibold">Pro (one-time): $9.99</p>
            <p className="text-xs text-gray-500 mt-1">Secure checkout by PayPal (card supported in PayPal checkout flow).</p>
          </div>

          {(status === 'cancel' || status === 'error' || status === 'success') && (
            <div className={`mb-4 p-3 rounded-lg border text-sm flex items-start gap-2 ${
              status === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : status === 'cancel'
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            }`}>
              {status === 'success' ? <CheckCircle2 size={16} className="mt-0.5" /> : <XCircle size={16} className="mt-0.5" />}
              <span>{message}</span>
            </div>
          )}

          <button
            onClick={startPaypalCheckout}
            disabled={isPro || isPremiumLoading || ['creating', 'redirecting', 'capturing'].includes(status)}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-black dark:bg-white text-white dark:text-black font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {['creating', 'redirecting', 'capturing'].includes(status) && <Loader2 size={16} className="animate-spin" />}
            <Sparkles size={16} />
            {isPro ? 'You are already Pro' : 'Upgrade with PayPal'}
          </button>
        </div>
      </div>
    </main>
  );
}

export default function UpgradePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#fafafa] dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-10">
          <div className="max-w-2xl mx-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              Loading upgrade page...
            </div>
          </div>
        </main>
      }
    >
      <UpgradePageContent />
    </Suspense>
  );
}
