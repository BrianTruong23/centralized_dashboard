'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Send, X, Maximize2, Minimize2, Check, History } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AgentRunRecord, ProposedAction } from '@/lib/agent/types';

interface AiAssistantProps {
  userId?: string;
}

function shortRunId(id: string): string {
  return id.slice(0, 8);
}

export function AiAssistant({ userId }: AiAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [run, setRun] = useState<AgentRunRecord | null>(null);
  const [approvedActionIds, setApprovedActionIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<AgentRunRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const quickPrompts = [
    'Prioritize my inbox for today',
    'Schedule this week based on due dates',
    'Declutter duplicate or stale tasks',
    'What should I do next?',
  ];

  const panelClass = expanded
    ? 'fixed inset-4 z-[300] rounded-[18px] border border-gray-200 bg-white shadow-[0_18px_40px_rgba(0,0,0,0.12)] overflow-hidden'
    : 'fixed left-1/2 top-1/2 z-[300] w-[min(94vw,720px)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-gray-200 bg-white shadow-[0_18px_40px_rgba(0,0,0,0.12)] overflow-hidden';

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

  const actions = run?.proposed_plan_json?.proposed_actions ?? [];
  const approvedCount = useMemo(
    () => actions.filter((a) => approvedActionIds.has(a.action_id)).length,
    [actions, approvedActionIds]
  );

  const handlePropose = async () => {
    if (!input.trim()) return;
    setError(null);
    setIsLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/agent/propose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ request_text: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to run agent');
      const nextRun = data.run as AgentRunRecord;
      setRun(nextRun);
      setApprovedActionIds(
        new Set(
          (nextRun.proposed_plan_json?.proposed_actions || []).map((a) => a.action_id)
        )
      );
      await loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Failed to run agent');
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

  const approveAllSafeActions = () => {
    const next = new Set(approvedActionIds);
    for (const action of actions) {
      if (!action.destructive) next.add(action.action_id);
    }
    setApprovedActionIds(next);
  };

  const handleExecute = async () => {
    if (!run) return;
    setError(null);
    setIsExecuting(true);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/agent/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          run_id: run.id,
          approved_action_ids: Array.from(approvedActionIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Execution failed');
      setRun(data.run as AgentRunRecord);
      await loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Execution failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const onPromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handlePropose();
    }
  };

  const getActionDisplayTitle = (action: ProposedAction): string => {
    const taskTitle = action.patch?.task_title;
    if (typeof taskTitle === 'string' && taskTitle.trim().length > 0) {
      return taskTitle;
    }
    if (action.type === 'answer') {
      return 'Recommended task';
    }
    return action.type;
  };

  return (
    <>
      {isOpen && (
        <div className={panelClass}>
          <div className="px-5 py-4 border-b border-gray-100 bg-neutral-50/70 flex items-start justify-between">
            <div className="min-w-0">
              <h3 className="text-base font-semibold flex items-center gap-2 text-gray-900">
                <Sparkles size={16} />
                AI Agent
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">Conversational + action agent</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-gray-400 hover:text-gray-700 p-1"
                aria-label={expanded ? 'Shrink AI Agent' : 'Expand AI Agent'}
                title={expanded ? 'Shrink' : 'Expand'}
              >
                {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-700 p-1"
                aria-label="Close AI Agent"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(85vh-120px)]">
            <div className="space-y-2">
              <label htmlFor="ai-agent-prompt" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Prompt
              </label>
              <textarea
                id="ai-agent-prompt"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onPromptKeyDown}
                placeholder="Ask me to prioritize, schedule, declutter, answer what's next, or propose edits."
                aria-label="AI Agent prompt input"
                className="w-full min-h-[120px] text-sm p-3.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-black/20"
              />
              <p className="text-xs text-gray-500">Enter to run • Shift+Enter for new line</p>
              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="px-2.5 py-1.5 text-xs rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePropose}
                disabled={!userId || isLoading || !input.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-black text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={14} />}
                Run Agent
              </button>
            </div>

            {run && (
              <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                <div className="text-sm text-gray-700">{run.proposed_plan_json.analysis_summary}</div>
                {run.proposed_plan_json.questions?.length > 0 && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">
                    {run.proposed_plan_json.questions.join(' ')}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Proposed changes ({approvedCount}/{actions.length} approved)
                  </p>
                  <button
                    type="button"
                    onClick={approveAllSafeActions}
                    className="text-xs px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  >
                    Select all safe actions
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {actions.map((action) => {
                    const approved = approvedActionIds.has(action.action_id);
                    return (
                      <div
                        key={action.action_id}
                        className="rounded-lg border border-gray-200 bg-white p-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{getActionDisplayTitle(action)}</p>
                            <p className="text-xs text-gray-600 mt-0.5">{action.reason}</p>
                            <p className="text-xs text-gray-500 mt-0.5">Outcome: {action.expected_outcome}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleApproveAction(action)}
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs ${
                              approved
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-white text-gray-700 border-gray-200'
                            }`}
                          >
                            <Check size={12} />
                            {approved ? 'Selected' : 'Select'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleExecute}
                    disabled={isExecuting || actions.length === 0}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-black text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
                  >
                    {isExecuting ? <Loader2 size={16} className="animate-spin" /> : <Send size={14} />}
                    Run approved actions
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                <History size={13} /> Run history (last 10)
              </p>
              {historyLoading ? (
                <p className="text-xs text-gray-500">Loading history...</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-gray-500">No runs yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {history.map((item) => (
                    <div key={item.id} className="rounded-md border border-gray-200 bg-white p-2 text-xs text-gray-700">
                      <span className="font-semibold">#{shortRunId(item.id)}</span> · {item.intent} ·{' '}
                      {(item.executed_actions_json || []).length} executed
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-4 right-20 z-[300] p-3 rounded-full shadow-lg bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
        title="AI assistant"
      >
        <Sparkles size={20} />
      </button>
    </>
  );
}
