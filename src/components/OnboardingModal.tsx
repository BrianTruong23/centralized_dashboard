'use client';

import { useEffect, useState } from 'react';
import { X, ChevronRight, Check, ChevronLeft, Inbox, CalendarClock, Target, Zap } from 'lucide-react';
import { OnboardingPreferences, defaultOnboardingPreferences } from '@/types/onboarding';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (preferences: OnboardingPreferences) => void;
  onSkip: () => void;
  onStartTutorial?: () => void;
}

export default function OnboardingModal({ isOpen, onComplete, onSkip, onStartTutorial }: OnboardingModalProps) {
  const [step, setStep] = useState(1);
  const [preferences, setPreferences] = useState<OnboardingPreferences>(defaultOnboardingPreferences);
  const totalSteps = 5;

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setPreferences(defaultOnboardingPreferences);
    }
  }, [isOpen]);

  const progressPct = (step / totalSteps) * 100;
  const labels = ['Welcome', 'Philosophy', 'Flow', 'Focus habits', 'Setup'];
  const stepLabel = labels[step - 1] ?? 'Onboarding';

  if (!isOpen) return null;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      onComplete(preferences);
      if (onStartTutorial) {
        onStartTutorial();
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl p-8 mx-4 animate-in fade-in zoom-in-95 duration-300">
        
        <div className="absolute top-0 left-0 right-0 h-1 bg-gray-100 dark:bg-gray-900 rounded-t-2xl overflow-hidden">
             <div 
               className="h-1 bg-[var(--accent-solid)] transition-all duration-500 ease-out"
               style={{ width: `${progressPct}%` }}
             />
        </div>

        <button
          onClick={onSkip}
          className="absolute top-4 right-4 text-gray-400 hover:text-black dark:hover:text-white transition-colors"
          aria-label="Skip onboarding"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mt-2 mb-6">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-400">
            Step {step} of {totalSteps}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stepLabel}</p>
        </div>

        <div key={step} className="min-h-[380px] flex flex-col justify-between animate-in fade-in slide-in-from-right-2 duration-250">
          <div className="space-y-6">
            {step === 1 && (
              <section className="space-y-5">
                <div className="w-14 h-14 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] flex items-center justify-center">
                  <img src="/logo.svg" alt="Minismo Logo" className="w-9 h-9 object-contain" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold tracking-tight mb-3">Welcome to a calmer way to work.</h2>
                  <p className="text-gray-600 dark:text-gray-300 text-base leading-relaxed max-w-xl">
                    Minismo gives you one trusted system for life and work. Capture fast, plan intentionally, and execute
                    with less noise.
                  </p>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-4">
                <h2 className="text-2xl font-bold tracking-tight">Core philosophy</h2>
                <p className="text-gray-500 dark:text-gray-400">
                  The goal is not to do everything. It is to do the right things, clearly.
                </p>
                <div className="space-y-3">
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <p className="text-sm font-semibold mb-1">Capture first. Decide later.</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Get tasks out of your head and into Inbox instantly.
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <p className="text-sm font-semibold mb-1">Small daily commitments beat long lists.</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Plan fewer tasks, finish more, and avoid burnout.
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <p className="text-sm font-semibold mb-1">Protect focus like a resource.</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Use Focus Mode when it is time for deep work.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="space-y-5">
                <h2 className="text-2xl font-bold tracking-tight">How work flows here</h2>
                <p className="text-gray-500 dark:text-gray-400">
                  A simple loop: capture, organize, schedule, and execute.
                </p>
                <div className="grid gap-3">
                  <div className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <Inbox className="w-4 h-4 mt-0.5 text-[var(--accent-solid)]" />
                    <div>
                      <p className="text-sm font-semibold">1. Capture in Inbox</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Quickly add every commitment before it slips.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <CalendarClock className="w-4 h-4 mt-0.5 text-[var(--accent-solid)]" />
                    <div>
                      <p className="text-sm font-semibold">2. Organize and schedule</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Assign due dates and categories so your plan becomes visible.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <Target className="w-4 h-4 mt-0.5 text-[var(--accent-solid)]" />
                    <div>
                      <p className="text-sm font-semibold">3. Execute from Today</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Only see what matters now and complete with momentum.</p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {step === 4 && (
              <section className="space-y-5">
                <h2 className="text-2xl font-bold tracking-tight">Focus and planning habits</h2>
                <p className="text-gray-500 dark:text-gray-400">
                  Build a rhythm that supports deep work, not constant context switching.
                </p>
                <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)]/60 p-4">
                  <div className="flex items-start gap-3">
                    <Zap className="w-4 h-4 mt-0.5 text-[var(--accent-solid)]" />
                    <div>
                      <p className="text-sm font-semibold">Use Focus Mode for your highest-value task.</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                        Minismo tracks one clear target at a time so you can enter flow faster.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Morning</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Review Today and pick your first focus task.</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Evening</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Capture loose ends into Inbox for tomorrow.</p>
                  </div>
                </div>
              </section>
            )}

            {step === 5 && (
              <section className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight mb-2">Personalize your setup</h2>
                  <p className="text-gray-500 dark:text-gray-400">Final tuning before your first task.</p>
                </div>

                <div className="space-y-5">
                  <div className="space-y-3">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Week starts on</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setPreferences({ ...preferences, weekStartsMonday: false })}
                        className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                          !preferences.weekStartsMonday
                            ? 'accent-solid-btn'
                            : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                        }`}
                      >
                        Sunday
                      </button>
                      <button
                        onClick={() => setPreferences({ ...preferences, weekStartsMonday: true })}
                        className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                          preferences.weekStartsMonday
                            ? 'accent-solid-btn'
                            : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                        }`}
                      >
                        Monday
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Daily task limit</label>
                      <span className="text-xs font-mono bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300">
                        {preferences.maxTasksPerDay} tasks
                      </span>
                    </div>
                    <input
                      type="range"
                      min="3"
                      max="15"
                      value={preferences.maxTasksPerDay}
                      onChange={(e) => setPreferences({ ...preferences, maxTasksPerDay: parseInt(e.target.value, 10) })}
                      className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[var(--accent-solid)]"
                    />
                    <p className="text-[11px] text-gray-400">Recommended: 3-5 for a realistic, sustainable day.</p>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)]/60 p-4">
                  <p className="text-sm font-semibold text-[var(--accent-soft-foreground)]">Next step after onboarding</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    You will land in the app ready to capture your first task in Inbox.
                  </p>
                </div>
              </section>
            )}
          </div>

          <div className="pt-6 mt-6 border-t border-gray-100 dark:border-gray-900 flex items-center justify-between">
            <div className="flex gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i + 1 <= step ? 'w-7 bg-[var(--accent-solid)]' : 'w-3 bg-gray-200 dark:bg-gray-800'}`}
                />
              ))}
            </div>

            <div className="flex gap-2">
              {step > 1 && (
                <button
                  onClick={handleBack}
                  className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors inline-flex items-center gap-1.5"
                >
                  <ChevronLeft size={14} />
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                className="group flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium accent-solid-btn hover:opacity-90 transition-opacity"
              >
                {step === totalSteps ? (
                  <>
                    Finish and continue <Check size={14} />
                  </>
                ) : (
                  <>
                    Continue <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
