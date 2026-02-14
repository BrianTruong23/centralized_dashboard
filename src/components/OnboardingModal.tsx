'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { OnboardingPreferences, defaultOnboardingPreferences } from '@/types/onboarding';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (preferences: OnboardingPreferences) => void;
  onSkip: () => void;
}

export default function OnboardingModal({ isOpen, onComplete, onSkip }: OnboardingModalProps) {
  const [step, setStep] = useState(1);
  const [preferences, setPreferences] = useState<OnboardingPreferences>(defaultOnboardingPreferences);

  if (!isOpen) return null;

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      onComplete(preferences);
    }
  };

  const handleSkip = () => {
    onSkip();
  };

  const totalSteps = 3;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-[#1a1a1a] rounded-xl shadow-2xl border border-gray-800 p-8 mx-4">
        {/* Close/Skip button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          aria-label="Skip onboarding"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Progress indicator */}
        <div className="flex gap-2 mb-8">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1 rounded-full transition-colors ${
                i + 1 <= step ? 'bg-blue-500' : 'bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Welcome & Projects */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">Welcome to Your Dashboard</h2>
              <p className="text-gray-400">Let's get you set up in just a few steps</p>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">Default Projects</h3>
                <p className="text-gray-400 mb-4">
                  We've created two default projects to help you organize your tasks:
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-4 bg-[#0f0f0f] rounded-lg border border-gray-800">
                    <div className="w-4 h-4 rounded-full bg-[#22c55e]"></div>
                    <div>
                      <p className="text-white font-medium">Life</p>
                      <p className="text-sm text-gray-500">Personal tasks, hobbies, and goals</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-[#0f0f0f] rounded-lg border border-gray-800">
                    <div className="w-4 h-4 rounded-full bg-[#3b82f6]"></div>
                    <div>
                      <p className="text-white font-medium">Work</p>
                      <p className="text-sm text-gray-500">Professional tasks and projects</p>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-3">
                  You can create more projects anytime from the sidebar.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Inbox & Focus Mode */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">Inbox & Focus Mode</h2>
              <p className="text-gray-400">Learn how to manage and focus on your tasks</p>
            </div>

            <div className="space-y-5">
              <div className="p-4 bg-[#0f0f0f] rounded-lg border border-gray-800">
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <span className="text-2xl">📥</span>
                  Inbox
                </h3>
                <p className="text-gray-400">
                  Your Inbox shows all active tasks. Use it as your central hub to capture and organize everything you need to do.
                </p>
              </div>

              <div className="p-4 bg-[#0f0f0f] rounded-lg border border-gray-800">
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <span className="text-2xl">🎯</span>
                  Today View
                </h3>
                <p className="text-gray-400">
                  Focus on what matters today. Tasks with today's deadline appear here automatically.
                </p>
              </div>

              <div className="p-4 bg-[#0f0f0f] rounded-lg border border-gray-800">
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <span className="text-2xl">⏱️</span>
                  Focus Mode
                </h3>
                <p className="text-gray-400">
                  Click the "Focus" button on any task to enter distraction-free mode. Track your time and watch your focus plant grow!
                </p>
              </div>

              <div className="p-4 bg-[#0f0f0f] rounded-lg border border-gray-800">
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <span className="text-2xl">📊</span>
                  Kanban Board
                </h3>
                <p className="text-gray-400">
                  Visualize your workflow with columns for To Do, Doing, and Done. Drag and drop tasks to update their status.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Preferences */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">Set Your Preferences</h2>
              <p className="text-gray-400">Customize your experience (you can change these anytime in Settings)</p>
            </div>

            <div className="space-y-5">
              <div className="p-4 bg-[#0f0f0f] rounded-lg border border-gray-800">
                <label className="block text-white font-medium mb-3">Week starts on</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setPreferences({ ...preferences, weekStartsMonday: false })}
                    className={`flex-1 px-4 py-3 rounded-lg border transition-colors ${
                      !preferences.weekStartsMonday
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    Sunday
                  </button>
                  <button
                    onClick={() => setPreferences({ ...preferences, weekStartsMonday: true })}
                    className={`flex-1 px-4 py-3 rounded-lg border transition-colors ${
                      preferences.weekStartsMonday
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    Monday
                  </button>
                </div>
              </div>

              <div className="p-4 bg-[#0f0f0f] rounded-lg border border-gray-800">
                <label className="block text-white font-medium mb-3">
                  Maximum tasks per day
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  Set a realistic limit to avoid overcommitting. This helps you stay focused and productive.
                </p>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="3"
                    max="15"
                    value={preferences.maxTasksPerDay}
                    onChange={(e) =>
                      setPreferences({ ...preferences, maxTasksPerDay: parseInt(e.target.value) })
                    }
                    className="flex-1 accent-blue-500"
                  />
                  <div className="w-12 text-center">
                    <span className="text-2xl font-bold text-white">{preferences.maxTasksPerDay}</span>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                  <span>Focused (3)</span>
                  <span>Moderate (8)</span>
                  <span>Busy (15)</span>
                </div>
              </div>

              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-sm text-blue-300">
                  💡 <strong>Pro tip:</strong> You can always adjust these settings and more (like energy peaks, deep work blocks, and break times) in the Settings menu.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-800">
          <button
            onClick={handleSkip}
            className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Skip
          </button>
          <div className="flex gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-8 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
            >
              {step === totalSteps ? 'Get Started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
