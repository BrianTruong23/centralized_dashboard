'use client';

import { useState, useEffect } from 'react';
import { Task } from '@/types/task';
import { Loader2, Sparkles, X, Check, Archive, Edit, Calendar, Flag, Tag, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import clsx from 'clsx';

interface CleanupSuggestion {
  task_ids: string[];
  issue_type: 'duplicate' | 'stale' | 'vague' | 'missing_metadata';
  explanation: string;
  recommended_action: 'merge' | 'archive' | 'rewrite' | 'add_metadata' | 'defer';
  confidence: number;
  details?: {
    merge_with?: string;
    suggested_title?: string;
    suggested_metadata?: {
      deadline?: string;
      priority?: number;
      project_id?: string;
    };
  };
}

interface CleanupReview {
  duplicates: CleanupSuggestion[];
  stale: CleanupSuggestion[];
  vague: CleanupSuggestion[];
  missing_metadata: CleanupSuggestion[];
}

interface InboxCleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  onUpdateTask: (task: Task) => void | Promise<void>;
  onDeleteTask: (id: string) => void | Promise<void>;
}

export function InboxCleanupModal({
  isOpen,
  onClose,
  tasks,
  onUpdateTask,
  onDeleteTask,
}: InboxCleanupModalProps) {
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<CleanupReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(new Set());
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [isApplyingSelected, setIsApplyingSelected] = useState(false);

  useEffect(() => {
    if (isOpen && !review) {
      handleAnalyze();
    }
    if (!isOpen) {
      setReview(null);
      setError(null);
      setAppliedSuggestions(new Set());
      setSelectedSuggestions(new Set());
    }
  }, [isOpen]);

  const getSuggestionKey = (suggestion: CleanupSuggestion) =>
    `${suggestion.issue_type}-${suggestion.task_ids.join('-')}`;

  useEffect(() => {
    if (!review) return;
    const all = [
      ...review.duplicates,
      ...review.stale,
      ...review.vague,
      ...review.missing_metadata,
    ];
    setSelectedSuggestions(new Set(all.map(getSuggestionKey)));
  }, [review]);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);

    try {
      if (!supabase) throw new Error('Supabase not configured');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please sign in');

      const res = await fetch('/api/inbox/cleanup-review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tasks }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || 'Failed to analyze inbox');
      }

      const data = await res.json();
      setReview(data.review);
    } catch (err: any) {
      setError(err?.message || 'Failed to analyze inbox');
    } finally {
      setLoading(false);
    }
  };

  const handleApplySuggestion = async (suggestion: CleanupSuggestion) => {
    const suggestionKey = getSuggestionKey(suggestion);
    if (appliedSuggestions.has(suggestionKey)) return;

    try {
      if (suggestion.recommended_action === 'merge' && suggestion.details?.merge_with) {
        // Merge: Keep the merge_with task, delete others
        const keepId = suggestion.details.merge_with;
        const toDelete = suggestion.task_ids.filter(id => id !== keepId);
        for (const id of toDelete) {
          await onDeleteTask(id);
        }
      } else if (suggestion.recommended_action === 'archive') {
        // Archive: Mark tasks as done (since we don't have an archived field)
        for (const id of suggestion.task_ids) {
          const task = tasks.find(t => t.id === id);
          if (task) {
            await onUpdateTask({ ...task, status: 'done' });
          }
        }
      } else if (suggestion.recommended_action === 'rewrite' && suggestion.details?.suggested_title) {
        // Rewrite: Update task titles
        for (const id of suggestion.task_ids) {
          const task = tasks.find(t => t.id === id);
          if (task) {
            await onUpdateTask({ ...task, title: suggestion.details.suggested_title! });
          }
        }
      } else if (suggestion.recommended_action === 'add_metadata' && suggestion.details?.suggested_metadata) {
        // Add metadata: Update tasks with suggested metadata
        for (const id of suggestion.task_ids) {
          const task = tasks.find(t => t.id === id);
          if (task) {
            const suggestedPriority = suggestion.details.suggested_metadata?.priority;
            await onUpdateTask({
              ...task,
              deadline: suggestion.details.suggested_metadata?.deadline || task.deadline,
              priority: (suggestedPriority && suggestedPriority >= 1 && suggestedPriority <= 5) 
                ? (suggestedPriority as 1 | 2 | 3 | 4 | 5)
                : task.priority,
              project_id: suggestion.details.suggested_metadata?.project_id || task.project_id,
            });
          }
        }
      } else if (suggestion.recommended_action === 'defer') {
        // Defer: Set deadline to next week
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const deadline = nextWeek.toISOString().split('T')[0];
        for (const id of suggestion.task_ids) {
          const task = tasks.find(t => t.id === id);
          if (task) {
            await onUpdateTask({ ...task, deadline });
          }
        }
      }

      setAppliedSuggestions(prev => new Set([...prev, suggestionKey]));
    } catch (err) {
      console.error('Failed to apply suggestion:', err);
    }
  };

  const toggleSuggestionSelection = (suggestion: CleanupSuggestion) => {
    const key = getSuggestionKey(suggestion);
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getActionIcon = (action: CleanupSuggestion['recommended_action']) => {
    switch (action) {
      case 'merge':
        return <Check size={14} />;
      case 'archive':
        return <Archive size={14} />;
      case 'rewrite':
        return <Edit size={14} />;
      case 'add_metadata':
        return <Tag size={14} />;
      case 'defer':
        return <ArrowRight size={14} />;
      default:
        return <AlertCircle size={14} />;
    }
  };

  const getActionLabel = (action: CleanupSuggestion['recommended_action']) => {
    switch (action) {
      case 'merge':
        return 'Merge';
      case 'archive':
        return 'Archive';
      case 'rewrite':
        return 'Rewrite';
      case 'add_metadata':
        return 'Add metadata';
      case 'defer':
        return 'Defer';
      default:
        return 'Review';
    }
  };

  const getIssueTypeLabel = (type: CleanupSuggestion['issue_type']) => {
    switch (type) {
      case 'duplicate':
        return 'Duplicates';
      case 'stale':
        return 'Stale tasks';
      case 'vague':
        return 'Vague titles';
      case 'missing_metadata':
        return 'Missing metadata';
      default:
        return type;
    }
  };

  if (!isOpen) return null;

  const allSuggestions = [
    ...(review?.duplicates || []),
    ...(review?.stale || []),
    ...(review?.vague || []),
    ...(review?.missing_metadata || []),
  ];
  const selectedPendingSuggestions = allSuggestions.filter((s) => {
    const key = getSuggestionKey(s);
    return selectedSuggestions.has(key) && !appliedSuggestions.has(key);
  });

  const handleApplySelected = async () => {
    if (selectedPendingSuggestions.length === 0) return;
    setIsApplyingSelected(true);
    try {
      for (const suggestion of selectedPendingSuggestions) {
        await handleApplySuggestion(suggestion);
      }
    } finally {
      setIsApplyingSelected(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-gray-700 dark:text-gray-300" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Inbox Cleanup Review</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-gray-400 mb-4" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Analyzing inbox tasks...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
              <button
                onClick={handleAnalyze}
                className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Try again
              </button>
            </div>
          ) : allSuggestions.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" />
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Inbox looks clean!</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">No cleanup suggestions at this time.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {review && (
                <>
                  {review.duplicates.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        Duplicates ({review.duplicates.length})
                      </h3>
                      <div className="space-y-2">
                        {review.duplicates.map((suggestion, idx) => {
                          const key = `duplicate-${idx}`;
                          const isApplied = appliedSuggestions.has(`duplicate-${suggestion.task_ids.join('-')}`);
                          return (
                            <div
                              key={key}
                              className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                            >
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex-1">
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                    {suggestion.explanation}
                                  </p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {suggestion.task_ids.map(id => {
                                      const task = tasks.find(t => t.id === id);
                                      return (
                                        <span
                                          key={id}
                                          className="text-xs px-2 py-0.5 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                                        >
                                          {task?.title || id.slice(0, 8)}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {Math.round(suggestion.confidence * 100)}%
                                  </span>
                                  <button
                                    onClick={() => toggleSuggestionSelection(suggestion)}
                                    disabled={isApplied}
                                    className={clsx(
                                      "px-2.5 py-1 text-xs font-medium rounded border flex items-center gap-1 transition-colors disabled:opacity-50",
                                      selectedSuggestions.has(getSuggestionKey(suggestion))
                                        ? "bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] border-[var(--accent-border)]"
                                        : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                                    )}
                                  >
                                    <Check size={12} />
                                    {selectedSuggestions.has(getSuggestionKey(suggestion)) ? 'Selected' : 'Select'}
                                  </button>
                                  {isApplied && (
                                    <span className="px-2.5 py-1 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                      <Check size={12} />
                                      Applied
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {review.stale.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        Stale Tasks ({review.stale.length})
                      </h3>
                      <div className="space-y-2">
                        {review.stale.map((suggestion, idx) => {
                          const key = `stale-${idx}`;
                          const isApplied = appliedSuggestions.has(`stale-${suggestion.task_ids.join('-')}`);
                          return (
                            <div
                              key={key}
                              className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                    {suggestion.explanation}
                                  </p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {suggestion.task_ids.map(id => {
                                      const task = tasks.find(t => t.id === id);
                                      return (
                                        <span
                                          key={id}
                                          className="text-xs px-2 py-0.5 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                                        >
                                          {task?.title || id.slice(0, 8)}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {Math.round(suggestion.confidence * 100)}%
                                  </span>
                                  <button
                                    onClick={() => toggleSuggestionSelection(suggestion)}
                                    disabled={isApplied}
                                    className={clsx(
                                      "px-2.5 py-1 text-xs font-medium rounded border flex items-center gap-1 transition-colors disabled:opacity-50",
                                      selectedSuggestions.has(getSuggestionKey(suggestion))
                                        ? "bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] border-[var(--accent-border)]"
                                        : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                                    )}
                                  >
                                    <Check size={12} />
                                    {selectedSuggestions.has(getSuggestionKey(suggestion)) ? 'Selected' : 'Select'}
                                  </button>
                                  {isApplied && (
                                    <span className="px-2.5 py-1 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                      <Check size={12} />
                                      Applied
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {review.vague.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        Vague Titles ({review.vague.length})
                      </h3>
                      <div className="space-y-2">
                        {review.vague.map((suggestion, idx) => {
                          const key = `vague-${idx}`;
                          const isApplied = appliedSuggestions.has(`vague-${suggestion.task_ids.join('-')}`);
                          return (
                            <div
                              key={key}
                              className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                    {suggestion.explanation}
                                  </p>
                                  {suggestion.details?.suggested_title && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
                                      Suggested: &quot;{suggestion.details.suggested_title}&quot;
                                    </p>
                                  )}
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {suggestion.task_ids.map(id => {
                                      const task = tasks.find(t => t.id === id);
                                      return (
                                        <span
                                          key={id}
                                          className="text-xs px-2 py-0.5 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                                        >
                                          {task?.title || id.slice(0, 8)}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {Math.round(suggestion.confidence * 100)}%
                                  </span>
                                  <button
                                    onClick={() => toggleSuggestionSelection(suggestion)}
                                    disabled={isApplied}
                                    className={clsx(
                                      "px-2.5 py-1 text-xs font-medium rounded border flex items-center gap-1 transition-colors disabled:opacity-50",
                                      selectedSuggestions.has(getSuggestionKey(suggestion))
                                        ? "bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] border-[var(--accent-border)]"
                                        : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                                    )}
                                  >
                                    <Check size={12} />
                                    {selectedSuggestions.has(getSuggestionKey(suggestion)) ? 'Selected' : 'Select'}
                                  </button>
                                  {isApplied && (
                                    <span className="px-2.5 py-1 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                      <Check size={12} />
                                      Applied
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {review.missing_metadata.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        Missing Metadata ({review.missing_metadata.length})
                      </h3>
                      <div className="space-y-2">
                        {review.missing_metadata.map((suggestion, idx) => {
                          const key = `metadata-${idx}`;
                          const isApplied = appliedSuggestions.has(`missing_metadata-${suggestion.task_ids.join('-')}`);
                          return (
                            <div
                              key={key}
                              className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                    {suggestion.explanation}
                                  </p>
                                  {suggestion.details?.suggested_metadata && (
                                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                      {suggestion.details.suggested_metadata.deadline && (
                                        <span className="flex items-center gap-1">
                                          <Calendar size={12} />
                                          {suggestion.details.suggested_metadata.deadline}
                                        </span>
                                      )}
                                      {suggestion.details.suggested_metadata.priority && (
                                        <span className="flex items-center gap-1">
                                          <Flag size={12} />
                                          P{suggestion.details.suggested_metadata.priority}
                                        </span>
                                      )}
                                      {suggestion.details.suggested_metadata.project_id && (
                                        <span className="flex items-center gap-1">
                                          <Tag size={12} />
                                          Project
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {suggestion.task_ids.map(id => {
                                      const task = tasks.find(t => t.id === id);
                                      return (
                                        <span
                                          key={id}
                                          className="text-xs px-2 py-0.5 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                                        >
                                          {task?.title || id.slice(0, 8)}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {Math.round(suggestion.confidence * 100)}%
                                  </span>
                                  <button
                                    onClick={() => toggleSuggestionSelection(suggestion)}
                                    disabled={isApplied}
                                    className={clsx(
                                      "px-2.5 py-1 text-xs font-medium rounded border flex items-center gap-1 transition-colors disabled:opacity-50",
                                      selectedSuggestions.has(getSuggestionKey(suggestion))
                                        ? "bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] border-[var(--accent-border)]"
                                        : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                                    )}
                                  >
                                    <Check size={12} />
                                    {selectedSuggestions.has(getSuggestionKey(suggestion)) ? 'Selected' : 'Select'}
                                  </button>
                                  {isApplied && (
                                    <span className="px-2.5 py-1 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                      <Check size={12} />
                                      Applied
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Review suggestions carefully. Actions are safe and can be undone.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleApplySelected}
              disabled={isApplyingSelected || selectedPendingSuggestions.length === 0}
              className="px-4 py-2 text-sm font-medium rounded-lg accent-solid-btn disabled:opacity-50 transition-opacity"
            >
              {isApplyingSelected ? 'Applying...' : `Apply all (${selectedPendingSuggestions.length})`}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
