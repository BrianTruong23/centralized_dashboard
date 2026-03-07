import { routeIntent } from './router';
import { createProposal } from './planner';
import { policyGate } from './policy';
import { executeApprovedActions } from './executor';
import { createSupabaseAgentTools } from './supabaseTools';
import { AgentPreference, AgentProposal, AgentRunRecord, ProposedAction } from './types';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function baseHeaders(token: string): Record<string, string> {
  return {
    apikey: env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function getAuthUserId(userToken: string): Promise<string> {
  const res = await fetch(`${env('NEXT_PUBLIC_SUPABASE_URL')}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      Authorization: `Bearer ${userToken}`,
    },
  });
  if (!res.ok) throw new Error('Unauthorized');
  const body = await res.json();
  if (!body?.id || typeof body.id !== 'string') throw new Error('Unauthorized');
  return body.id;
}

async function fetchRuns(userToken: string, userId: string): Promise<AgentRunRecord[]> {
  const url = new URL(`${env('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/agent_runs`);
  url.searchParams.set('select', '*');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '10');
  const res = await fetch(url.toString(), { method: 'GET', headers: baseHeaders(userToken) });
  if (!res.ok) throw new Error('Failed to load run history');
  return (await res.json()) as AgentRunRecord[];
}

async function insertRun(
  userToken: string,
  row: Omit<AgentRunRecord, 'id' | 'created_at'>
): Promise<AgentRunRecord> {
  const res = await fetch(`${env('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/agent_runs?select=*`, {
    method: 'POST',
    headers: { ...baseHeaders(userToken), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error('Failed to save agent run');
  const data = (await res.json()) as AgentRunRecord[];
  return data[0];
}

async function updateRun(
  userToken: string,
  runId: string,
  patch: Partial<AgentRunRecord>
): Promise<AgentRunRecord> {
  const res = await fetch(`${env('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/agent_runs?id=eq.${runId}&select=*`, {
    method: 'PATCH',
    headers: { ...baseHeaders(userToken), Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to update agent run');
  const data = (await res.json()) as AgentRunRecord[];
  return data[0];
}

async function getRunById(userToken: string, runId: string, userId: string): Promise<AgentRunRecord | null> {
  const url = new URL(`${env('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/agent_runs`);
  url.searchParams.set('select', '*');
  url.searchParams.set('id', `eq.${runId}`);
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const res = await fetch(url.toString(), { method: 'GET', headers: baseHeaders(userToken) });
  if (!res.ok) throw new Error('Failed to load agent run');
  const rows = (await res.json()) as AgentRunRecord[];
  return rows[0] ?? null;
}

function mergeApprovals(
  proposed: ProposedAction[],
  approvedActionIds: string[]
): ProposedAction[] {
  const approvedSet = new Set(approvedActionIds);
  return proposed.map((action) => ({
    ...action,
    approved: approvedSet.has(action.action_id),
  }));
}

export async function proposeAgentRun(userToken: string, requestText: string): Promise<AgentRunRecord> {
  const userId = await getAuthUserId(userToken);
  const tools = createSupabaseAgentTools(userToken);
  const preferences =
    (await tools.getPreferences(userId)) ??
    ({
      user_id: userId,
      work_hours: { start: '09:00', end: '17:00' },
      max_tasks_per_day: 5,
      timezone: 'UTC',
      scheduling_style: 'balanced',
    } satisfies AgentPreference);
  const tasks = await tools.listTasks({ user_id: userId, archived: false });
  const intent = routeIntent(requestText);
  let rawProposal: AgentProposal;
  const cleanTasks = tasks.filter((t) => t.user_id === preferences.user_id && !t.archived && t.status !== 'done');

  if (intent === 'schedule') {
    // Make external call to LLM for scheduling
    const todayStr = new Date().toISOString().split('T')[0];
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY for scheduling');

    const prompt = `
      Current Context:
      - Today is ${todayStr}.
      - User Request: "${requestText}"
      - User Tasks (JSON array): ${JSON.stringify(cleanTasks.map(t => ({ title: t.title, estimate: t.estimate_minutes, priority: t.priority, due: t.due_at, project: t.project_id })))}
      - User Planning Preferences:
        - Max tasks per day: ${preferences.max_tasks_per_day || 5}
        - Work hours: ${preferences.work_hours?.start || '09:00'} to ${preferences.work_hours?.end || '17:00'}

      ROLE: Expert Project Manager & Scheduler.
      GOAL: Create a weekly plan (Mon-Sun) from the provided tasks to satisfy the user's request.
      RULES:
      1. Schedule tasks by deadline & urgency.
      2. Spread out high-effort tasks.
      3. Only use the tasks provided in the JSON array. Match their titles EXACTLY.

      OUTPUT JSON format only (no markdown):
      {
        "week_plan": [
          {
            "day": "Monday",
            "date": "YYYY-MM-DD",
            "tasks": [
              {
                "title": "Exact Task Title",
                "reason": "Why scheduled here",
                "estimated_minutes": 30,
                "project": "Project Name or null"
              }
            ]
          }
        ]
      }
    `;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Centralized Dashboard AutoPlan Tool',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        max_tokens: 4096,
        messages: [
          { role: 'system', content: 'You are an expert scheduler. Return valid JSON only.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
        throw new Error('Failed to generate schedule from AI');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanContent);

    rawProposal = {
      intent,
      analysis_summary: `AI generated weekly schedule for ${cleanTasks.length} tasks.`,
      questions: [],
      proposed_actions: [
        {
          action_id: 'action_1',
          type: 'create_plan',
          destructive: false,
          requires_approval: false,
          reason: 'AI analyzed your tasks and generated this weekly schedule.',
          expected_outcome: 'A balanced week plan mapping your tasks to specific days.',
          patch: {
            week_range: `${todayStr}..${new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0]}`,
            days: parsed.week_plan || [],
          },
        }
      ],
      proposed_plan: {
        week_range: `${todayStr}..${new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0]}`,
        days: parsed.week_plan || [],
      }
    };
  } else if (intent === 'declutter' || intent === 'cleanup') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY for decluttering');

    const prompt = `
      User Request: "${requestText}"
      User Tasks (JSON array): ${JSON.stringify(cleanTasks.map(t => ({ id: t.id, title: t.title, created_at: t.created_at })))}

      ROLE: Expert Productivity Assistant.
      GOAL: Identify "duplicate" tasks or explicitly "stale" tasks that the user wants to declutter.
      RULES:
      1. Analyze the semantic meaning of the task titles.
      2. If multiple tasks have the exact same meaning (e.g., "Select data for hiding" and "Select data for hiding \n 30m"), keep the oldest one (by created_at) and mark the others for deletion.
      3. If the user explicitly asks to remove stale tasks, identify tasks that seem out of place, but be conservative.
      4. Return ONLY a JSON array of objects representing the tasks to delete.

      OUTPUT JSON format only (no markdown):
      {
        "tasks_to_delete": [
          {
            "id": "task-uuid-here",
            "title": "Exact Task Title",
            "reason": "Why this is considered a duplicate or stale."
          }
        ]
      }
    `;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Centralized Dashboard AI Agent',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        max_tokens: 4096,
        messages: [
          { role: 'system', content: 'You are an expert cleaner. Return valid JSON only.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
        throw new Error('Failed to generate declutter plan from AI');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanContent);
    const toDelete = parsed.tasks_to_delete || [];

    rawProposal = {
      intent,
      analysis_summary: `AI analyzed ${cleanTasks.length} tasks and found ${toDelete.length} tasks to declutter.`,
      questions: toDelete.length === 0 ? ['I could not find any clear duplicates or stale tasks. Can you specify what you want to remove?'] : [],
      proposed_actions: toDelete.map((td: any, i: number) => ({
        action_id: `action_${i + 1}`,
        type: 'delete_task',
        destructive: true,
        requires_approval: true,
        reason: td.reason,
        expected_outcome: `Permanently delete task: "${td.title}"`,
        target_task_id: td.id,
        patch: {
          task_title: td.title
        }
      })),
    };
  } else {
    rawProposal = createProposal(requestText, intent, tasks, preferences);
  }
  const gatedProposal: AgentProposal = {
    ...rawProposal,
    proposed_actions: policyGate(rawProposal.proposed_actions),
  };

  return insertRun(userToken, {
    user_id: userId,
    request_text: requestText,
    intent,
    proposed_plan_json: gatedProposal,
    approved_actions_json: [],
    executed_actions_json: [],
  });
}

export async function executeAgentRun(
  userToken: string,
  runId: string,
  approvedActionIds: string[]
): Promise<AgentRunRecord> {
  const userId = await getAuthUserId(userToken);
  const run = await getRunById(userToken, runId, userId);
  if (!run) throw new Error('Run not found');

  const approved = mergeApprovals(run.proposed_plan_json.proposed_actions, approvedActionIds);
  const tools = createSupabaseAgentTools(userToken);
  const alreadyExecuted = new Set((run.executed_actions_json || []).map((a) => a.action_id));
  const executed = await executeApprovedActions(approved, tools, {
    userId,
    actor: userId,
    alreadyExecutedActionIds: alreadyExecuted,
  });

  const mergedExecuted = [...(run.executed_actions_json ?? []), ...executed];
  return updateRun(userToken, run.id, {
    approved_actions_json: approved.filter((a) => a.approved),
    executed_actions_json: mergedExecuted,
  });
}

export async function listAgentRuns(userToken: string): Promise<AgentRunRecord[]> {
  const userId = await getAuthUserId(userToken);
  return fetchRuns(userToken, userId);
}

export async function getAgentPreferences(userToken: string): Promise<AgentPreference | null> {
  const userId = await getAuthUserId(userToken);
  const tools = createSupabaseAgentTools(userToken);
  return tools.getPreferences(userId);
}

export async function patchAgentPreferences(
  userToken: string,
  patch: Partial<AgentPreference>
): Promise<AgentPreference> {
  const userId = await getAuthUserId(userToken);
  const tools = createSupabaseAgentTools(userToken);
  return tools.updatePreferences(userId, patch);
}
