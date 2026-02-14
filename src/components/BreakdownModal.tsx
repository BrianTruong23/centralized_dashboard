'use client';

import { useState, useEffect } from 'react';
import { Task, TaskPriority, TaskEnergyLevel } from '@/types/task';
import { generateId } from '@/lib/utils';
import clsx from 'clsx';
import { X, Sparkles, Clock, Loader2, Check, Plus, Trash2 } from 'lucide-react';

interface SubtaskProposal {
  id: string;
  title: string;
  estimatedMinutes: number;
  selected: boolean;
}

interface BreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSubtasks: (subtasks: Task[]) => void;
  task: Task;
  userId?: string;
}

export function BreakdownModal({ isOpen, onClose, onCreateSubtasks, task, userId }: BreakdownModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [proposals, setProposals] = useState<SubtaskProposal[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      setProposals([]);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGenerateSubtasks = async () => {
    setIsGenerating(true);
    setError('');

    try {
      const response = await fetch('/api/agent/breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: {
            title: task.title,
            description: task.description,
            estimatedMinutes: task.estimatedMinutes,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate subtasks');
      }

      const data = await response.json();

      // Convert API response to proposals
      const generatedProposals: SubtaskProposal[] = data.subtasks.map((st: any) => ({
        id: generateId(),
        title: st.title,
        estimatedMinutes: st.estimatedMinutes || 30,
        selected: true, // All selected by default
      }));

      setProposals(generatedProposals);
    } catch (err) {
      setError('Failed to generate subtasks. Please try again.');
      console.error('Breakdown error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddProposal = () => {
    setProposals([
      ...proposals,
      {
        id: generateId(),
        title: '',
        estimatedMinutes: 30,
        selected: true,
      },
    ]);
  };

  const handleRemoveProposal = (id: string) => {
    setProposals(proposals.filter(p => p.id !== id));
  };

  const handleUpdateProposal = (id: string, updates: Partial<SubtaskProposal>) => {
    setProposals(proposals.map(p => (p.id === id ? { ...p, ...updates } : p)));
  };

  const handleToggleSelection = (id: string) => {
    setProposals(proposals.map(p => (p.id === id ? { ...p, selected: !p.selected } : p)));
  };

  const handleSelectAll = () => {
    const allSelected = proposals.every(p => p.selected);
    setProposals(proposals.map(p => ({ ...p, selected: !allSelected })));
  };

  const handleCreateSubtasks = () => {
    const selectedProposals = proposals.filter(p => p.selected && p.title.trim());

    if (selectedProposals.length === 0) {
      setError('Please select at least one subtask to create');
      return;
    }

    const subtasks: Task[] = selectedProposals.map(proposal => ({
      id: generateId(),
      user_id: userId,
      title: proposal.title.trim(),
      description: '',
      category: task.category,
      priority: task.priority,
      estimatedMinutes: proposal.estimatedMinutes,
      energyLevel: task.energyLevel,
      status: 'todo' as const,
      tags: [],
      createdAt: Date.now(),
      project_id: task.project_id,
      parent_task_id: task.id, // Link to parent
      is_subtask: true,
    }));

    onCreateSubtasks(subtasks);
    onClose();
  };

  const selectedCount = proposals.filter(p => p.selected).length;
  const hasProposals = proposals.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Break Down Task</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {task.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* AI Generate Section */}
          {!hasProposals && (
            <div className="text-center py-8 space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-2">
                <Sparkles className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  AI-Powered Task Breakdown
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                  Let AI analyze your task and suggest 3-7 actionable subtasks with time estimates
                </p>
              </div>
              <button
                onClick={handleGenerateSubtasks}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Subtasks
                  </>
                )}
              </button>

              <div className="pt-4">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-gray-900 px-2 text-gray-500">or</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleAddProposal}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add subtasks manually
              </button>
            </div>
          )}

          {/* Proposals List */}
          {hasProposals && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSelectAll}
                    className="text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
                  >
                    {proposals.every(p => p.selected) ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-sm text-gray-500">
                    {selectedCount} of {proposals.length} selected
                  </span>
                </div>
                <button
                  onClick={handleAddProposal}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>

              <div className="space-y-3">
                {proposals.map((proposal, index) => (
                  <div
                    key={proposal.id}
                    className={clsx(
                      "flex items-start gap-3 p-4 rounded-lg border-2 transition-all",
                      proposal.selected
                        ? "border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10"
                        : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                    )}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggleSelection(proposal.id)}
                      className="mt-1 flex-shrink-0"
                    >
                      <div
                        className={clsx(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                          proposal.selected
                            ? "bg-purple-600 border-purple-600"
                            : "border-gray-300 dark:border-gray-600"
                        )}
                      >
                        {proposal.selected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </button>

                    {/* Content */}
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={proposal.title}
                        onChange={(e) => handleUpdateProposal(proposal.id, { title: e.target.value })}
                        placeholder={`Subtask ${index + 1}`}
                        className="w-full text-sm font-medium bg-transparent border-none outline-none placeholder-gray-400 text-gray-900 dark:text-gray-100"
                      />
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <input
                          type="number"
                          value={proposal.estimatedMinutes}
                          onChange={(e) =>
                            handleUpdateProposal(proposal.id, {
                              estimatedMinutes: parseInt(e.target.value) || 0,
                            })
                          }
                          min="5"
                          step="5"
                          className="w-20 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 outline-none focus:border-purple-500 transition-colors"
                        />
                        <span className="text-xs text-gray-500">minutes</span>
                      </div>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => handleRemoveProposal(proposal.id)}
                      className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {hasProposals && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateSubtasks}
              disabled={selectedCount === 0}
              className="px-6 py-2 text-sm font-bold bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
            >
              Create {selectedCount} Subtask{selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
