'use client';

import { useState } from 'react';
import { X, ChevronRight, Check } from 'lucide-react';
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

  if (!isOpen) return null;

  const handleNext = () => {
    if (step < 3) {
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

  const totalSteps = 3;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl p-8 mx-4 animate-in fade-in zoom-in-95 duration-300">
        
        {/* Progress */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gray-100 dark:bg-gray-900 rounded-t-2xl overflow-hidden">
             <div 
               className="h-1 bg-black dark:bg-white transition-all duration-500 ease-out"
               style={{ width: `${(step / totalSteps) * 100}%` }}
             />
        </div>

        {/* Close */}
        <button
          onClick={onSkip}
          className="absolute top-4 right-4 text-gray-400 hover:text-black dark:hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="mt-4 min-h-[320px] flex flex-col justify-between">
            
            {/* Step 1: Welcome */}
            {step === 1 && (
              <div className="space-y-6 text-center animate-in slide-in-from-right-4 fade-in duration-300">
                <div className="w-20 h-20 mx-auto flex items-center justify-center mb-6">
                  <img src="/logo.svg" alt="Minima Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold tracking-tight mb-3">Minima</h2>
                  <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed">
                    A centralized dashboard for your life and work. <br />
                    Simple, focused, and distraction-free.
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Philosophy */}
            {step === 2 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold tracking-tight mb-2">Core Principles</h2>
                  <p className="text-gray-500 dark:text-gray-400">How Minima helps you stay on track</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-4 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold">1</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm mb-1">Capture Everything</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Use the Inbox to dump tasks quickly. Don't rely on your memory.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold">2</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm mb-1">Focus on Today</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Assign deadlines. Only see what you need to do today.
                      </p>
                    </div>
                  </div>

                   <div className="flex items-start gap-4 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold">3</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm mb-1">Deep Work</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Enter Focus Mode to block distractions and track your flow.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Setup */}
            {step === 3 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                <div className="text-center mb-6">
                   <h2 className="text-2xl font-bold tracking-tight mb-2">Configure</h2>
                   <p className="text-gray-500 dark:text-gray-400">Tailor the experience to you</p>
                </div>

                <div className="space-y-6">
                   {/* Week Start */}
                   <div className="space-y-3">
                      <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Week Starts On</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setPreferences({ ...preferences, weekStartsMonday: false })}
                          className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                            !preferences.weekStartsMonday
                              ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black shadow-lg'
                              : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                          }`}
                        >
                          Sunday
                        </button>
                        <button
                          onClick={() => setPreferences({ ...preferences, weekStartsMonday: true })}
                          className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                            preferences.weekStartsMonday
                              ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black shadow-lg'
                              : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                          }`}
                        >
                          Monday
                        </button>
                      </div>
                   </div>

                   {/* Max Tasks */}
                   <div className="space-y-3">
                      <div className="flex justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Daily Task Limit</label>
                        <span className="text-xs font-mono bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300">
                          {preferences.maxTasksPerDay} tasks
                        </span>
                      </div>
                      <input
                        type="range"
                        min="3"
                        max="15"
                        value={preferences.maxTasksPerDay}
                        onChange={(e) => setPreferences({ ...preferences, maxTasksPerDay: parseInt(e.target.value) })}
                        className="w-full accent-black dark:accent-white h-2 bg-gray-100 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer"
                      />
                      <p className="text-[10px] text-gray-400">
                        We recommend keeping this low (3-5) to avoid burnout.
                      </p>
                   </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="pt-6 mt-6 border-t border-gray-100 dark:border-gray-900 flex justify-between items-center">
               <div className="flex gap-1.5">
                  {Array.from({ length: totalSteps }).map((_, i) => (
                    <div 
                      key={i}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        step === i + 1 ? 'bg-black dark:bg-white' : 'bg-gray-200 dark:bg-gray-800'
                      }`}
                    />
                  ))}
               </div>

               <div className="flex gap-3">
                 {step > 1 && (
                   <button
                     onClick={handleBack}
                     className="px-5 py-2.5 text-gray-500 hover:text-black dark:hover:text-white font-medium text-sm transition-colors"
                   >
                     Back
                   </button>
                 )}
                 <button
                   onClick={handleNext}
                   className="group flex items-center gap-2 px-5 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-full font-medium text-sm hover:opacity-80 transition-opacity"
                 >
                   {step === totalSteps ? (
                     <>Get Started <Check size={16} /></>
                   ) : (
                     <>Next <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" /></>
                   )}
                 </button>
               </div>
            </div>
        </div>
      </div>
    </div>
  );
}
