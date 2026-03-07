'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, Crown, Sparkles } from 'lucide-react';
import clsx from 'clsx';

type PlanId = 'one_time' | 'monthly';

export default function UpgradePage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('monthly');
  const currentPlanLabel = 'Free';

  const plans = useMemo(
    () => [
      {
        id: 'one_time' as const,
        name: 'Lifetime',
        price: '$399',
        cadence: 'one-time',
        description: 'Pay once and keep Pro access forever.',
        badge: 'Best long-term value',
        highlights: ['Single payment', 'No recurring charges', 'All current Pro features'],
      },
      {
        id: 'monthly' as const,
        name: 'Monthly',
        price: '$10',
        cadence: 'per month',
        description: 'Lower upfront cost with monthly billing.',
        badge: 'Most flexible',
        highlights: ['Cancel anytime', 'Low monthly commitment', 'All current Pro features'],
      },
    ],
    []
  );

  const proFeatures = useMemo(
    () => [
      'All AI features (AI assistant, AI planning, AI summaries).',
      'Calendar mode for time-based planning.',
      'Future premium productivity features as they ship.',
    ],
    []
  );

  const active = plans.find((p) => p.id === selectedPlan)!;

  return (
    <main className="min-h-screen bg-[#fafafa] dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-10">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="text-xs text-gray-500 hover:text-black dark:hover:text-white">
          Back to dashboard
        </Link>

        <section className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
          <div className="mb-6">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Crown size={20} className="text-amber-500" />
                Choose your plan
              </h1>
              <span className="text-xs px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                Current plan: {currentPlanLabel}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Front-end preview only. No payment is processed yet.
            </p>
          </div>

          <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4">
            <p className="text-sm font-semibold mb-2">Pro includes</p>
            <div className="space-y-1">
              {proFeatures.map((item) => (
                <div key={item} className="text-sm flex items-start gap-2 text-gray-700 dark:text-gray-300">
                  <CheckCircle2 size={14} className="text-emerald-500 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {plans.map((plan) => {
              const isActive = selectedPlan === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlan(plan.id)}
                  className={clsx(
                    'rounded-xl border p-4 text-left transition-all',
                    isActive
                      ? 'border-[var(--accent-border)] ring-2 bg-[var(--accent-soft)]'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                  )}
                  style={isActive ? { boxShadow: '0 0 0 2px var(--accent-border)' } : undefined}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-lg font-semibold">{plan.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{plan.badge}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                      {plan.cadence}
                    </span>
                  </div>
                  <div className="mb-2">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">{plan.cadence === 'one-time' ? '' : '/month'}</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{plan.description}</p>
                  <div className="space-y-1">
                    {plan.highlights.map((item) => (
                      <div key={item} className="text-sm flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <CheckCircle2 size={14} className="text-emerald-500" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4">
            <p className="text-sm font-semibold mb-1">Selected plan</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <span className="font-medium">{active.name}</span> · {active.price} {active.cadence === 'one-time' ? 'one-time' : '/ month'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              This is a UI-only checkout preview. Payment integration will be added later.
            </p>

            <button
              type="button"
              className="mt-4 w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg font-bold transition-opacity accent-solid-btn"
            >
              <CreditCard size={16} />
              <Sparkles size={16} />
              Continue (Preview)
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
