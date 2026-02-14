'use client';

import { useState, useEffect } from 'react';
import { Task } from '@/types/task';
import { X, AlertCircle, Calendar, Trash2 } from 'lucide-react';
import clsx from 'clsx';

interface PostponePromptProps {
  task: Task;
  onDelete: (taskId: string) => void;
  onDefer: (task: Task, newDeadline: string) => void;
  onSchedule: (task: Task) => void;
  onDismiss: () => void;
}

export const PostponePrompt = ({
  task,
  onDelete,
  onDefer,
  onSchedule,
  onDismiss
}: PostponePromptProps) => {
  const [selectedAction, setSelectedAction] = useState<'delete' | 'defer' | 'schedule' | null>(null);
  const [deferDays, setDeferDays] = useState(7);

  const handleDelete = () => {
    onDelete(task.id);
  };

  const handleDefer = () => {
    const newDeadline = new Date();
    newDeadline.setDate(newDeadline.getDate() + deferDays);
    onDefer(task, newDeadline.toISOString().split('T')[0]);
  };

  const handleSchedule = () => {
    onSchedule(task);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full mx-4">
        <div className="bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/50 rounded-lg">
              <AlertCircle className="text-orange-600 dark:text-orange-400" size={20} />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              This task keeps getting postponed
            </h2>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
            <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">
              {task.title}
            </p>
            {task.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {task.description}
              </p>
            )}
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
              Postponed {task.postponeCount} times
            </p>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            This task has been pushed back repeatedly. What would you like to do?
          </p>

          <div className="space-y-3">
            {/* Delete Option */}
            <button
              onClick={() => setSelectedAction('delete')}
              className={clsx(
                'w-full text-left p-4 rounded-lg border-2 transition-all',
                selectedAction === 'delete'
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800'
              )}
            >
              <div className="flex items-start gap-3">
                <Trash2 className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Delete it</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Let it go. Not everything needs to be done.
                  </p>
                </div>
              </div>
            </button>

            {/* Defer Option */}
            <button
              onClick={() => setSelectedAction('defer')}
              className={clsx(
                'w-full text-left p-4 rounded-lg border-2 transition-all',
                selectedAction === 'defer'
                  ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-yellow-300 dark:hover:border-yellow-800'
              )}
            >
              <div className="flex items-start gap-3">
                <Calendar className="text-yellow-500 flex-shrink-0 mt-0.5" size={18} />
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-gray-100">Defer it</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Push it to the future (maybe never).
                  </p>
                  {selectedAction === 'defer' && (
                    <div className="mt-3">
                      <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">
                        Defer by:
                      </label>
                      <select
                        value={deferDays}
                        onChange={(e) => setDeferDays(Number(e.target.value))}
                        className="w-full text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-3 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value={7}>1 week</option>
                        <option value={14}>2 weeks</option>
                        <option value={30}>1 month</option>
                        <option value={90}>3 months</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </button>

            {/* Schedule Option */}
            <button
              onClick={() => setSelectedAction('schedule')}
              className={clsx(
                'w-full text-left p-4 rounded-lg border-2 transition-all',
                selectedAction === 'schedule'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-800'
              )}
            >
              <div className="flex items-start gap-3">
                <Calendar className="text-blue-500 flex-shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Schedule it properly</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Set a specific time to work on it.
                  </p>
                </div>
              </div>
            </button>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onDismiss}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (selectedAction === 'delete') handleDelete();
                else if (selectedAction === 'defer') handleDefer();
                else if (selectedAction === 'schedule') handleSchedule();
              }}
              disabled={!selectedAction}
              className={clsx(
                'flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                selectedAction
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-90'
                  : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
              )}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
