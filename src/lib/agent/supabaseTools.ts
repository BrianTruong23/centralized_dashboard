import { AgentTools, ActivityEvent, TaskFilter } from './tools';
import { AgentPreference, AgentTask, ProposedPlanDay } from './types';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function headers(token: string): Record<string, string> {
  return {
    apikey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function supabaseUrl(): string {
  return requireEnv('NEXT_PUBLIC_SUPABASE_URL');
}

type TaskRow = {
  id: string;
  user_id: string;
  text: string;
  status: 'todo' | 'doing' | 'done';
  deadline?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  priority?: number | null;
  project_id?: string | null;
  tags?: string[] | null;
  estimated_minutes?: number | null;
  inbox?: boolean | null;
  archived?: boolean | null;
};

function mapTaskRow(row: TaskRow): AgentTask {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.text,
    status: row.status,
    due_at: row.deadline ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    completed_at: row.completed_at ?? null,
    priority: row.priority ?? null,
    project_id: row.project_id ?? null,
    labels: row.tags ?? [],
    estimate_minutes: row.estimated_minutes ?? 60,
    inbox: row.inbox ?? null,
    archived: row.archived ?? false,
  };
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Request failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

async function requestOk(url: string, init: RequestInit): Promise<void> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Request failed (${res.status}): ${body}`);
  }
}

export function createSupabaseAgentTools(userToken: string): AgentTools {
  return {
    async listTasks(filter: TaskFilter): Promise<AgentTask[]> {
      const url = new URL(`${supabaseUrl()}/rest/v1/tasks`);
      url.searchParams.set('select', 'id,user_id,text,status,deadline,created_at,updated_at,completed_at,priority,project_id,tags,estimated_minutes,inbox,archived');
      url.searchParams.set('user_id', `eq.${filter.user_id}`);
      if (typeof filter.archived === 'boolean') url.searchParams.set('archived', `eq.${filter.archived}`);
      if (typeof filter.inbox === 'boolean') url.searchParams.set('inbox', `eq.${filter.inbox}`);
      url.searchParams.set('order', 'created_at.desc');
      const rows = await fetchJson<TaskRow[]>(url.toString(), { method: 'GET', headers: headers(userToken) });
      return rows.map(mapTaskRow);
    },

    async createTask(payload): Promise<AgentTask> {
      const row = {
        user_id: payload.user_id,
        text: payload.title,
        status: payload.status ?? 'todo',
        priority: payload.priority ?? 3,
        estimated_minutes: payload.estimate_minutes ?? 60,
        deadline: payload.due_at ?? null,
        project_id: payload.project_id ?? null,
      };
      const rows = await fetchJson<TaskRow[]>(
        `${supabaseUrl()}/rest/v1/tasks?select=id,user_id,text,status,deadline,created_at,updated_at,completed_at,priority,project_id,tags,estimated_minutes,inbox,archived`,
        {
          method: 'POST',
          headers: { ...headers(userToken), Prefer: 'return=representation' },
          body: JSON.stringify(row),
        }
      );
      return mapTaskRow(rows[0]);
    },

    async updateTask(id, patch): Promise<void> {
      const body: Record<string, unknown> = {};
      if (typeof patch.title === 'string') body.text = patch.title;
      if (typeof patch.status === 'string') body.status = patch.status;
      if (typeof patch.priority === 'number') body.priority = patch.priority;
      if (typeof patch.estimate_minutes === 'number') body.estimated_minutes = patch.estimate_minutes;
      if (typeof patch.due_at === 'string') body.deadline = patch.due_at;
      if (typeof patch.project_id === 'string') body.project_id = patch.project_id;
      if (typeof patch.archived === 'boolean') body.archived = patch.archived;
      const url = `${supabaseUrl()}/rest/v1/tasks?id=eq.${id}`;
      await requestOk(url, {
        method: 'PATCH',
        headers: { ...headers(userToken), Prefer: 'return=minimal' },
        body: JSON.stringify(body),
      });
    },

    async archiveTask(id): Promise<void> {
      await requestOk(`${supabaseUrl()}/rest/v1/tasks?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...headers(userToken), Prefer: 'return=minimal' },
        body: JSON.stringify({ archived: true }),
      });
    },

    async deleteTask(id): Promise<void> {
      await requestOk(`${supabaseUrl()}/rest/v1/tasks?id=eq.${id}`, {
        method: 'DELETE',
        headers: headers(userToken),
      });
    },

    async createPlan(weekRange: string, plan: ProposedPlanDay[]): Promise<void> {
      // Weekly plan persistence can be mapped to weekly_plans later; for now
      // plan execution is tracked in agent_runs + task_activity.
      void weekRange;
      void plan;
    },

    async logActivity(event: ActivityEvent): Promise<void> {
      await requestOk(`${supabaseUrl()}/rest/v1/task_activity`, {
        method: 'POST',
        headers: { ...headers(userToken), Prefer: 'return=minimal' },
        body: JSON.stringify({
          task_id: event.task_id,
          actor: event.actor,
          action_type: event.action_type,
          before_json: event.before_json,
          after_json: event.after_json,
          reason: event.reason,
        }),
      });
    },

    async getPreferences(userId: string): Promise<AgentPreference | null> {
      const url = new URL(`${supabaseUrl()}/rest/v1/user_preferences`);
      url.searchParams.set('select', '*');
      url.searchParams.set('user_id', `eq.${userId}`);
      url.searchParams.set('limit', '1');
      const rows = await fetchJson<AgentPreference[]>(url.toString(), { method: 'GET', headers: headers(userToken) });
      return rows[0] ?? null;
    },

    async updatePreferences(userId: string, patch: Partial<AgentPreference>): Promise<AgentPreference> {
      const upsertBody = { user_id: userId, ...patch };
      const rows = await fetchJson<AgentPreference[]>(
        `${supabaseUrl()}/rest/v1/user_preferences?on_conflict=user_id&select=*`,
        {
          method: 'POST',
          headers: { ...headers(userToken), Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(upsertBody),
        }
      );
      return rows[0];
    },
  };
}
