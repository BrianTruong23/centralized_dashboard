'use client';

import { useState, useEffect } from 'react';
import { Task } from '@/types/task';
import { X, Sparkles } from 'lucide-react';
import clsx from 'clsx';

interface DailyWinPromptProps {
  tasks: Task[];
  onSelectTask?: (taskId: string) => void;
  userId?: string;
}

export const DailyWinPrompt = ({ tasks, onSelectTask, userId }: DailyWinPromptProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [suggestedTask, setSuggestedTask] = useState<Task | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if user has already seen the prompt today
    const today = new Date().toDateString();
    const lastShown = localStorage.getItem('dailyWinPrompt_lastShown');
    const wasDismissed = localStorage.getItem('dailyWinPrompt_dismissed') === today;

    if (lastShown !== today && !wasDismissed && tasks.length > 0) {
      // Show prompt after a short delay
      const timer = setTimeout(() => {
        selectSuggestedTask();
        setIsVisible(true);
        localStorage.setItem('dailyWinPrompt_lastShown', today);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [tasks]);

  const selectSuggestedTask = () => {
    // AI-like logic to suggest 1 task for the day
    // Priority: High priority tasks, tasks with deadlines, or Deep/Quick tasks
    const incompleteTasks = tasks.filter(t => t.status !== 'done');

    if (incompleteTasks.length === 0) {
      return;
    }

    // Score tasks based on various factors
    const scoredTasks = incompleteTasks.map(task => {
      let score = 0;

      // Priority weight (higher priority = higher score)
      score += (6 - task.priority) * 20;

      // Deadline proximity
      if (task.deadline) {
        const daysUntilDeadline = Math.floor(
          (new Date(task.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntilDeadline <= 1) score += 50;
        else if (daysUntilDeadline <= 3) score += 30;
        else if (daysUntilDeadline <= 7) score += 15;
      }

      // Intent label preferences
      if (task.intentLabel === 'Deep') score += 25;
      if (task.intentLabel === 'Quick') score += 20;

      // Reasonable time commitment (30-120 min tasks are "winnable")
      if (task.estimatedMinutes >= 30 && task.estimatedMinutes <= 120) score += 15;

      // Avoid postponed tasks (they might need rethinking)
      if (task.postponeCount && task.postponeCount > 2) score -= 30;

      return { task, score };
    });

    // Sort by score and pick the highest
    scoredTasks.sort((a, b) => b.score - a.score);
    setSuggestedTask(scoredTasks[0].task);
  };

  const handleDismiss = () => {
    const today = new Date().toDateString();
    localStorage.setItem('dailyWinPrompt_dismissed', today);
    setIsVisible(false);
    setIsDismissed(true);
  };

  const handleAccept = () => {
    if (suggestedTask && onSelectTask) {
      onSelectTask(suggestedTask.id);
    }
    setIsVisible(false);
  };

  if (!isVisible || !suggestedTask || isDismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md animate-in slide-in-from-bottom-5 duration-500">
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800 rounded-2xl shadow-xl p-6">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
            <Sparkles className="text-purple-600 dark:text-purple-400" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">
              Pick 1 win today
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Here's a calm suggestion to make progress
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 mb-4 border border-purple-100 dark:border-purple-800/50">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {suggestedTask.title}
              </p>
              {suggestedTask.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {suggestedTask.description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                <span>{suggestedTask.estimatedMinutes}m</span>
                {suggestedTask.intentLabel && (
                  <>
                    <span>•</span>
                    <span>{suggestedTask.intentLabel}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleDismiss}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            Not today
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            Let's do this
          </button>
        </div>
      </div>
    </div>
  );
};
