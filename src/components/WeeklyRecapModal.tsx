'use client';

import { useState, useEffect } from 'react';
import { Task } from '@/types/task';
import { X, Trophy, Target, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';

interface WeeklyRecapModalProps {
  tasks: Task[];
  onDeleteTask?: (taskId: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export const WeeklyRecapModal = ({ tasks, onDeleteTask, onClose, isOpen }: WeeklyRecapModalProps) => {
  const [wins, setWins] = useState<Task[]>([]);
  const [taskToDrop, setTaskToDrop] = useState<Task | null>(null);

  useEffect(() => {
    if (isOpen) {
      calculateWeeklyWins();
    }
  }, [isOpen, tasks]);

  const calculateWeeklyWins = () => {
    // Get tasks completed this week
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const completedThisWeek = tasks.filter(task => {
      if (task.status !== 'done') return false;

      // Check if completed this week (we'd need a completedAt timestamp in real app)
      // For now, we'll use tasks marked as done
      const taskDate = new Date(task.createdAt);
      return isWithinInterval(taskDate, { start: weekStart, end: weekEnd });
    });

    // Sort by priority and estimated time to pick top 3 wins
    const topWins = completedThisWeek
      .sort((a, b) => {
        // Higher priority tasks first
        if (a.priority !== b.priority) return a.priority - b.priority;
        // Then longer tasks (more substantial wins)
        return b.estimatedMinutes - a.estimatedMinutes;
      })
      .slice(0, 3);

    setWins(topWins);

    // Suggest 1 task to drop (postponed multiple times)
    const postponedTasks = tasks
      .filter(t => t.status !== 'done' && (t.postponeCount || 0) >= 3)
      .sort((a, b) => (b.postponeCount || 0) - (a.postponeCount || 0));

    if (postponedTasks.length > 0) {
      setTaskToDrop(postponedTasks[0]);
    }
  };

  const handleDropTask = () => {
    if (taskToDrop && onDeleteTask) {
      onDeleteTask(taskToDrop.id);
      setTaskToDrop(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Trophy className="text-yellow-500" size={24} />
            Weekly Recap
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* 3 Wins Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Target className="text-green-500" size={20} />
              Your 3 Wins This Week
            </h3>

            {wins.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>No completed tasks this week yet.</p>
                <p className="text-sm mt-2">Keep going! Every win counts.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {wins.map((task, index) => (
                  <div
                    key={task.id}
                    className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {task.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                          <span>{task.estimatedMinutes}m</span>
                          {task.intentLabel && (
                            <>
                              <span>•</span>
                              <span>{task.intentLabel}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 1 Thing to Drop Section */}
          {taskToDrop && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <Trash2 className="text-orange-500" size={20} />
                Consider Letting Go
              </h3>

              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  This task has been postponed {taskToDrop.postponeCount} times. Maybe it's time to let it go?
                </p>

                <div className="bg-white dark:bg-gray-900 rounded-lg p-3 mb-4">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {taskToDrop.title}
                  </p>
                  {taskToDrop.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {taskToDrop.description}
                    </p>
                  )}
                </div>

                <button
                  onClick={handleDropTask}
                  className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors"
                >
                  Drop This Task
                </button>
                <p className="text-xs text-center text-gray-500 mt-2">
                  Not everything needs to be done. It's okay to let go.
                </p>
              </div>
            </div>
          )}

          {!taskToDrop && (
            <div className="text-center py-4 text-gray-400 text-sm">
              <p>No tasks to suggest dropping this week.</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-800 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
