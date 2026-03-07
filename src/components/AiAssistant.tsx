'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Send, X, Maximize2, Minimize2, Check, History, Clock, ChevronDown, ChevronRight, Eye, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { supabase } from '@/lib/supabase';
import { AgentRunRecord, ProposedAction, ProposedPlanDay } from '@/lib/agent/types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface AiAssistantProps {
  userId?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  run?: AgentRunRecord;
  timestamp: Date;
}

function shortRunId(id: string): string {
  return id.slice(0, 8);
}

function SortableTask({ task, id }: { task: any; id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    cursor: 'grab',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex flex-col gap-1 p-2 rounded-md border border-gray-100 bg-gray-50 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="font-medium text-gray-900 line-clamp-2 leading-tight">{task.title}</div>
      <div className="flex flex-wrap gap-2 items-center text-[10px] mt-0.5">
        {task.project && (
          <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">{task.project}</span>
        )}
        {task.estimated_minutes && (
          <span className="font-medium text-gray-500 flex items-center gap-1">
            <Clock size={10} /> {task.estimated_minutes}m
          </span>
        )}
        <span className="font-bold text-gray-500 ml-auto">P{task.priority || 4}</span>
      </div>
    </div>
  );
}

function getPlainLanguageLabel(action: ProposedAction): string {
  const taskTitle = action.patch?.task_title;
  if (typeof taskTitle === 'string' && taskTitle.trim().length > 0) {
    return taskTitle;
  }
  
  switch (action.type) {
    case 'create_task':
      return 'Add new task';
    case 'update_task':
      return action.patch?.status ? `Mark as ${action.patch.status}` : 'Update task';
    case 'delete_task':
      return 'Delete task';
    case 'archive_task':
      return 'Archive task';
    case 'create_plan':
      return 'Create weekly schedule';
    case 'answer':
      return 'Recommended task';
    default:
      return String(action.type).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

function getActionDescription(action: ProposedAction): string {
  if (action.reason) return action.reason;
  return action.expected_outcome || 'Apply this change';
}

export function AiAssistant({ userId }: AiAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentRun, setCurrentRun] = useState<AgentRunRecord | null>(null);
  const [approvedActionIds, setApprovedActionIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<AgentRunRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});
  const [editableDays, setEditableDays] = useState<any[]>([]);

  const quickPrompts = [
    'Prioritize my inbox for today',
    'Schedule this week based on due dates',
    'What should I do next?',
  ];

  const panelClass = expanded
    ? 'fixed inset-4 z-[300] rounded-[18px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-[0_18px_40px_rgba(0,0,0,0.12)] overflow-hidden'
    : 'fixed left-1/2 top-1/2 z-[300] w-[min(94vw,720px)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-[0_18px_40px_rgba(0,0,0,0.12)] overflow-hidden';

  const getAccessToken = useCallback(async (): Promise<string> => {
    if (!supabase) throw new Error('Supabase is not configured');
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Please sign in first');
    return token;
  }, []);

  const loadHistory = useCallback(async () => {
    if (!userId || !isOpen) return;
    setHistoryLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/agent/history', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load history');
      setHistory((data.runs || []) as AgentRunRecord[]);
    } catch (err: any) {
      setError(err?.message || 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }, [getAccessToken, isOpen, userId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const executedActionIds = useMemo(
    () => new Set((currentRun?.executed_actions_json || []).map((a: any) => a.action_id)),
    [currentRun]
  );
  const actions = useMemo(
    () => (currentRun?.proposed_plan_json?.proposed_actions ?? []).filter((a) => !executedActionIds.has(a.action_id)),
    [currentRun, executedActionIds]
  );
  
  // Get top 3 suggested actions (non-destructive first)
  const suggestedActions = useMemo(() => {
    const safe = actions.filter(a => !a.destructive && !a.requires_approval);
    const destructive = actions.filter(a => a.destructive || a.requires_approval);
    return [...safe.slice(0, 3), ...destructive.slice(0, Math.max(0, 3 - safe.length))].slice(0, 3);
  }, [actions]);

  const handlePropose = async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    setError(null);
    setIsLoading(true);
    
    // Add user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      const token = await getAccessToken();
      const res = await fetch('/api/agent/propose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ request_text: userMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to run agent');
      const nextRun = data.run as AgentRunRecord;
      setCurrentRun(nextRun);
      
      if (nextRun.proposed_plan_json?.proposed_plan?.days) {
        setEditableDays(nextRun.proposed_plan_json.proposed_plan.days);
      } else {
        setEditableDays([]);
      }
      
      // Auto-approve safe actions
      const safeActionIds = (nextRun.proposed_plan_json?.proposed_actions || [])
        .filter((a: ProposedAction) => !a.destructive && !a.requires_approval)
        .map((a: ProposedAction) => a.action_id);
      setApprovedActionIds(new Set(safeActionIds));

      // Add assistant message
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: nextRun.proposed_plan_json.analysis_summary || 'I\'ve analyzed your request.',
        run: nextRun,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      await loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Failed to run agent');
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${err?.message || 'Failed to process your request'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleApproveAction = (action: ProposedAction) => {
    const next = new Set(approvedActionIds);
    if (next.has(action.action_id)) next.delete(action.action_id);
    else next.add(action.action_id);
    setApprovedActionIds(next);
  };

  const handleExecute = async (actionIds?: string[]) => {
    if (!currentRun) return;
    setError(null);
    setIsExecuting(true);
    try {
      const token = await getAccessToken();

      const approvedIdsArray = actionIds || Array.from(approvedActionIds);
      let payloadAction = null;
      
      const planAction = currentRun.proposed_plan_json.proposed_actions.find(a => a.type === 'create_plan');
      if (planAction && approvedIdsArray.includes(planAction.action_id)) {
          payloadAction = {
              action_id: planAction.action_id,
              patch: {
                  ...planAction.patch,
                  days: editableDays
              }
          }
      }

      const res = await fetch('/api/agent/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          run_id: currentRun.id,
          approved_action_ids: approvedIdsArray,
          modified_actions: payloadAction ? [payloadAction] : []
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Execution failed');
      setCurrentRun(data.run as AgentRunRecord);
      
      // Add success message
      const successMsg: Message = {
        id: `success-${Date.now()}`,
        role: 'assistant',
        content: `Done! I've applied ${approvedIdsArray.length} ${approvedIdsArray.length === 1 ? 'change' : 'changes'}.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, successMsg]);
      await loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Execution failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleQuickAction = async (action: ProposedAction) => {
    // For destructive actions, ask for confirmation
    if (action.destructive || action.requires_approval) {
      const confirmed = window.confirm(
        `${getPlainLanguageLabel(action)}\n\n${getActionDescription(action)}\n\nThis action cannot be undone. Continue?`
      );
      if (!confirmed) return;
    }
    
    // Execute single action
    await handleExecute([action.action_id]);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeStr = String(active.id);
    const overStr = String(over.id);

    const [ , activeDayStr, activeTaskStr ] = activeStr.split('_');
    const activeDayIdx = parseInt(activeDayStr, 10);
    const activeTaskIdx = parseInt(activeTaskStr, 10);

    let overDayIdx = -1;
    let overTaskIdx = -1;

    if (overStr.startsWith('day_')) {
      overDayIdx = parseInt(overStr.split('_')[1], 10);
    } else if (overStr.startsWith('task_')) {
      const parts = overStr.split('_');
      overDayIdx = parseInt(parts[1], 10);
      overTaskIdx = parseInt(parts[2], 10);
    }

    if (activeDayIdx === -1 || overDayIdx === -1) return;

    setEditableDays((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const sourceDay = next[activeDayIdx];
      const targetDay = next[overDayIdx];
      
      const [movedTask] = sourceDay.tasks.splice(activeTaskIdx, 1);

      if (activeDayIdx === overDayIdx) {
        const destIdx = overTaskIdx === -1 ? sourceDay.tasks.length : overTaskIdx;
        sourceDay.tasks.splice(destIdx, 0, movedTask);
      } else {
        movedTask.day = targetDay.day;
        movedTask.date = targetDay.date;
        const destIdx = overTaskIdx === -1 ? targetDay.tasks.length : overTaskIdx;
        targetDay.tasks.splice(destIdx, 0, movedTask);
      }
      return next;
    });
  };

  const onPromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handlePropose();
    }
  };

  const toggleDetails = (messageId: string) => {
    setShowDetails(prev => ({ ...prev, [messageId]: !prev[messageId] }));
  };

  return (
    <>
      {isOpen && (
        <div className={panelClass}>
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-neutral-50/70 dark:bg-gray-900 flex items-start justify-between">
            <div className="min-w-0">
              <h3 className="text-base font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <Sparkles size={16} />
                AI Assistant
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">Chat with your productivity assistant</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1"
                aria-label={expanded ? 'Shrink' : 'Expand'}
              >
                {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex flex-col h-[calc(85vh-120px)]">
            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  <Sparkles size={32} className="mx-auto mb-3 text-gray-400" />
                  <p className="text-sm">Start a conversation to get help with your tasks</p>
                  <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setInput(prompt)}
                        className="px-3 py-1.5 text-xs rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={clsx(
                    'flex gap-3',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] border border-[var(--accent-border)] flex items-center justify-center">
                      <Sparkles size={16} />
                    </div>
                  )}
                  <div
                    className={clsx(
                      'max-w-[80%] rounded-2xl px-4 py-3',
                      msg.role === 'user'
                        ? 'bg-[var(--accent-solid)] text-[var(--accent-solid-foreground)]'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    
                    {msg.role === 'assistant' && msg.run && (
                      <div className="mt-3 space-y-2">
                        {/* Suggested actions (max 3) */}
                        {suggestedActions.length > 0 && (
                          <div className="space-y-2">
                            {suggestedActions.map((action) => {
                              const isApproved = approvedActionIds.has(action.action_id);
                              return (
                                <button
                                  key={action.action_id}
                                  type="button"
                                  onClick={() => handleQuickAction(action)}
                                  disabled={isExecuting}
                                  className={clsx(
                                    'w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors',
                                    action.destructive || action.requires_approval
                                      ? 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900'
                                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100',
                                    isExecuting && 'opacity-50 cursor-not-allowed'
                                  )}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <div className="font-medium flex items-center gap-2">
                                        {getPlainLanguageLabel(action)}
                                        {(action.destructive || action.requires_approval) && (
                                          <AlertTriangle size={14} className="text-amber-600" />
                                        )}
                                      </div>
                                      <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                                        {getActionDescription(action)}
                                      </div>
                                    </div>
                                    {isApproved && (
                                      <Check size={16} className="text-emerald-600 ml-2" />
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Collapsible details */}
                        {(editableDays.length > 0 || actions.length > suggestedActions.length) && (
                          <button
                            type="button"
                            onClick={() => toggleDetails(msg.id)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-200 transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              <Eye size={14} />
                              {showDetails[msg.id] ? 'Hide details' : 'View preview'}
                            </span>
                            {showDetails[msg.id] ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronRight size={14} />
                            )}
                          </button>
                        )}

                        {/* Expanded details */}
                        {showDetails[msg.id] && (
                          <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                            {/* Schedule preview */}
                            {editableDays.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Weekly Schedule</p>
                                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                                    {editableDays.map((day: any, dayIdx: number) => {
                                      const taskIds = day.tasks.map((_: any, tIdx: number) => `task_${dayIdx}_${tIdx}`);
                                      return (
                                        <div key={dayIdx} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
                                          <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                            <span className="font-medium text-gray-900 dark:text-gray-100 text-xs">{day.day}</span>
                                            <span className="text-xs text-gray-500">{new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                          </div>
                                          <SortableContext
                                            id={`day_${dayIdx}`}
                                            items={taskIds}
                                            strategy={verticalListSortingStrategy}
                                          >
                                            <div className="p-1.5 space-y-1 min-h-[30px]">
                                              {day.tasks?.length === 0 ? (
                                                <div className="text-xs text-center text-gray-400 dark:text-gray-500 py-1 italic">Free day</div>
                                              ) : (
                                                day.tasks.map((task: any, tIdx: number) => (
                                                  <SortableTask
                                                    key={`task_${dayIdx}_${tIdx}`}
                                                    id={`task_${dayIdx}_${tIdx}`}
                                                    task={task}
                                                  />
                                                ))
                                              )}
                                            </div>
                                          </SortableContext>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </DndContext>
                              </div>
                            )}

                            {/* Additional actions */}
                            {actions.length > suggestedActions.length && (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                  All changes ({approvedActionIds.size}/{actions.length} selected)
                                </p>
                                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                  {actions.slice(suggestedActions.length).map((action) => {
                                    const isApproved = approvedActionIds.has(action.action_id);
                                    return (
                                      <div
                                        key={action.action_id}
                                        className="flex items-center justify-between p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                                      >
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{getPlainLanguageLabel(action)}</p>
                                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-1">{getActionDescription(action)}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => toggleApproveAction(action)}
                                          className={clsx(
                                            'ml-2 px-2 py-1 rounded text-xs border transition-colors',
                                            isApproved
                                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                                          )}
                                        >
                                          {isApproved ? 'Selected' : 'Select'}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                                {approvedActionIds.size > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleExecute()}
                                    disabled={isExecuting}
                                    className="w-full px-4 py-2 rounded-lg accent-solid-btn text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                                  >
                                    {isExecuting ? (
                                      <span className="flex items-center justify-center gap-2">
                                        <Loader2 size={14} className="animate-spin" />
                                        Applying...
                                      </span>
                                    ) : (
                                      `Apply ${approvedActionIds.size} ${approvedActionIds.size === 1 ? 'change' : 'changes'}`
                                    )}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-200">You</span>
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] border border-[var(--accent-border)] flex items-center justify-center">
                    <Sparkles size={16} />
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3">
                    <Loader2 size={16} className="animate-spin text-gray-400" />
                  </div>
                </div>
              )}

              {error && (
                <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                  {error}
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="border-t border-gray-100 dark:border-gray-800 p-4 bg-white dark:bg-gray-900">
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onPromptKeyDown}
                  placeholder="Ask me anything..."
                  className="flex-1 min-h-[44px] max-h-32 px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]/30 resize-none"
                  rows={1}
                />
                <button
                  type="button"
                  onClick={handlePropose}
                  disabled={!userId || isLoading || !input.trim()}
                  className="px-4 py-2 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] hover:bg-[var(--accent-solid)] hover:text-[var(--accent-solid-foreground)] disabled:opacity-50 transition-colors flex items-center justify-center"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Press Enter to send, Shift+Enter for new line</p>
            </div>

            {/* Activity history (collapsed) */}
            <div className="border-t border-gray-100 dark:border-gray-800">
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <History size={14} />
                  <span>View activity</span>
                </div>
                <ChevronDown size={14} className={clsx("transition-transform duration-200", showHistory && "rotate-180")} />
              </button>
              
              {showHistory && (
                <div className="px-4 pb-3 max-h-48 overflow-y-auto">
                  {historyLoading ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400 py-2">Loading...</p>
                  ) : history.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400 py-2">No activity yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {history.map((item) => (
                        <div key={item.id} className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 text-xs text-gray-700 dark:text-gray-200">
                          <span className="font-medium">#{shortRunId(item.id)}</span> · {item.intent} ·{' '}
                          {(item.executed_actions_json || []).length} executed
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-4 right-20 z-[300] p-3 rounded-full shadow-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] hover:bg-[var(--accent-solid)] hover:text-[var(--accent-solid-foreground)] transition-colors"
        title="AI assistant"
      >
        <Sparkles size={20} />
      </button>
    </>
  );
}
