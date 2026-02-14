import { SUPABASE_URL, SUPABASE_ANON_KEY, getAccessToken } from './supabase';
import { Task } from '@/types/task';

// ── Raw HTTP helpers ───────────────────────────────────────────────────────
// All DB operations use native fetch() against the PostgREST REST API.
// We NEVER use supabase.from() or supabase.auth.getSession() because the
// Supabase JS client's internal auth lock can deadlock any request during
// token refresh. The access token is cached in supabase.ts and read
// synchronously via getAccessToken().

function requireToken(): string {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  return token;
}

function headers(token: string): Record<string, string> {
  return {
    'apikey': SUPABASE_ANON_KEY!,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function rawInsert(
  table: string,
  payload: Record<string, any> | Record<string, any>[],
  token: string,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers(token), 'Prefer': 'return=minimal' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { code: body.code || String(res.status), message: body.message || res.statusText, details: body.details };
  }
}

async function rawSelect<T = any>(
  table: string,
  token: string,
  params?: Record<string, string>,
): Promise<T[]> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set('select', '*');
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: headers(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { code: body.code || String(res.status), message: body.message || res.statusText };
  }
  return res.json();
}

async function rawUpdate(
  table: string,
  updates: Record<string, any>,
  filters: Record<string, string>,
  token: string,
): Promise<void> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(filters)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: { ...headers(token), 'Prefer': 'return=minimal' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { code: body.code || String(res.status), message: body.message || res.statusText, details: body.details };
  }
}

async function rawDelete(
  table: string,
  filters: Record<string, string>,
  token: string,
): Promise<void> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(filters)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: 'DELETE',
    headers: headers(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { code: body.code || String(res.status), message: body.message || res.statusText, details: body.details };
  }
}

// ── Field mappers ──────────────────────────────────────────────────────────

const mapRowToTask = (row: any): Task => ({
  id: row.id,
  user_id: row.user_id,
  title: row.text,
  description: row.description || '',
  status: row.status || (row.completed ? 'done' : 'todo'),
  category: row.category || 'Life',
  priority: row.priority || 3,
  estimatedMinutes: row.estimated_minutes || 60,
  energyLevel: row.energy_level || 'medium',
  deadline: row.deadline,
  tags: row.tags || [],
  createdAt: new Date(row.created_at).getTime(),
  project_id: row.project_id,
  intentLabel: row.intent_label,
  postponeCount: row.postpone_count || 0,
  lastPostponedAt: row.last_postponed_at,
});

function taskToRow(task: Task): Record<string, any> {
  const row: Record<string, any> = {
    id: task.id,
    user_id: task.user_id,
    text: task.title,
    description: task.description,
    category: task.category,
    priority: task.priority,
    estimated_minutes: task.estimatedMinutes,
    energy_level: task.energyLevel,
    deadline: task.deadline || null,
    tags: task.tags,
    completed: task.status === 'done',
    status: task.status,
    created_at: new Date(task.createdAt).toISOString(),
    intent_label: task.intentLabel || null,
    postpone_count: task.postponeCount || 0,
    last_postponed_at: task.lastPostponedAt || null,
  };
  if (task.project_id) {
    row.project_id = task.project_id;
  }
  return row;
}

// ── Fire-and-forget activity log (never blocks the caller) ─────────────────

function logActivity(token: string, userId: string, action: string, entityId: string, details: any = null) {
  rawInsert('activity_logs', {
    user_id: userId,
    action,
    entity_id: entityId,
    entity_type: 'task',
    details,
  }, token).catch(() => {}); // never throws, never awaited
}

// ── Public API ─────────────────────────────────────────────────────────────

export const db = {
  // ── Tasks ──────────────────────────────────────────────────────────────

  async fetchTasks(): Promise<Task[]> {
    const token = requireToken();
    const rows = await rawSelect('tasks', token, {
      'order': 'created_at.desc',
    });
    return rows.map(mapRowToTask);
  },

  async addTask(task: Task): Promise<void> {
    const token = requireToken();
    await rawInsert('tasks', taskToRow(task), token);
    if (task.user_id) logActivity(token, task.user_id, 'created_task', task.id, { title: task.title });
  },

  async addTasksBatch(tasks: Task[]): Promise<number> {
    if (tasks.length === 0) return 0;
    const token = requireToken();
    await rawInsert('tasks', tasks.map(taskToRow), token);
    const userId = tasks[0]?.user_id;
    if (userId) {
      tasks.forEach(t => logActivity(token, userId, 'created_task', t.id, { title: t.title }));
    }
    return tasks.length;
  },

  async updateTask(task: Task): Promise<void> {
    const token = requireToken();
    await rawUpdate('tasks', {
      text: task.title,
      description: task.description,
      category: task.category,
      priority: task.priority,
      estimated_minutes: task.estimatedMinutes,
      energy_level: task.energyLevel,
      deadline: task.deadline,
      tags: task.tags,
      completed: task.status === 'done',
      status: task.status,
      project_id: task.project_id,
      intent_label: task.intentLabel || null,
      postpone_count: task.postponeCount || 0,
      last_postponed_at: task.lastPostponedAt || null,
    }, { 'id': `eq.${task.id}` }, token);
    if (task.status === 'done' && task.user_id) {
      logActivity(token, task.user_id, 'completed_task', task.id, { title: task.title });
    }
  },

  async deleteTask(taskId: string): Promise<void> {
    const token = requireToken();
    await rawDelete('tasks', { 'id': `eq.${taskId}` }, token);
  },

  // ── Projects ───────────────────────────────────────────────────────────

  async fetchProjects(userId?: string): Promise<any[]> {
    const token = requireToken();
    const params: Record<string, string> = { 'order': 'created_at.asc' };
    if (userId) params['user_id'] = `eq.${userId}`;
    return rawSelect('projects', token, params);
  },

  async addProject(project: { user_id: string; name: string; color: string }): Promise<any> {
    const token = requireToken();

    // Check if already exists
    const existing = await rawSelect('projects', token, {
      'user_id': `eq.${project.user_id}`,
      'name': `eq.${project.name}`,
    });
    if (existing.length > 0) return existing[0];

    // Insert
    try {
      await rawInsert('projects', project, token);
    } catch (e: any) {
      if (e.code !== '23505') throw e;
      // unique constraint — another request created it, fall through to fetch
    }

    // Fetch the inserted row
    const rows = await rawSelect('projects', token, {
      'user_id': `eq.${project.user_id}`,
      'name': `eq.${project.name}`,
    });
    if (rows.length === 0) throw new Error('Project created but fetch returned nothing');
    return rows[0];
  },

  async ensureDefaultProjects(userId: string): Promise<any[]> {
    const token = requireToken();

    const existing = await rawSelect('projects', token, {
      'user_id': `eq.${userId}`,
      'name': `in.("Life","Work")`,
    });

    const existingNames = new Set(existing.map((p: any) => p.name));
    const toCreate = [
      { user_id: userId, name: 'Life', color: '#22c55e' },
      { user_id: userId, name: 'Work', color: '#3b82f6' },
    ].filter(d => !existingNames.has(d.name));

    if (toCreate.length === 0) return existing;

    try {
      await rawInsert('projects', toCreate, token);
    } catch (e: any) {
      if (e.code !== '23505') return existing;
    }

    return rawSelect('projects', token, {
      'user_id': `eq.${userId}`,
      'name': `in.("Life","Work")`,
    });
  },

  // ── Subscription / Premium ─────────────────────────────────────────────

  async getMySubscription(): Promise<{ isPro: boolean; tier: string; status: string; planType: string } | null> {
    const token = requireToken();
    const rows = await rawSelect<any>('user_subscriptions', token, { limit: '1' });
    const row = rows[0];
    if (!row) return null;
    return {
      isPro: row.tier === 'pro' && row.status === 'active',
      tier: row.tier ?? 'free',
      status: row.status ?? 'inactive',
      planType: row.plan_type ?? 'one_time',
    };
  },

  // ── Onboarding ──────────────────────────────────────────────────────────

  async getOnboardingStatus(userId: string): Promise<any | null> {
    const token = requireToken();
    const rows = await rawSelect<any>('onboarding_status', token, {
      'user_id': `eq.${userId}`,
      limit: '1',
    });
    return rows[0] || null;
  },

  async createOnboardingStatus(userId: string, preferences: { weekStartsMonday: boolean; maxTasksPerDay: number }): Promise<void> {
    const token = requireToken();
    await rawInsert('onboarding_status', {
      user_id: userId,
      completed: true,
      completed_at: new Date().toISOString(),
      week_starts_monday: preferences.weekStartsMonday,
      max_tasks_per_day: preferences.maxTasksPerDay,
    }, token);
  },

  async skipOnboarding(userId: string): Promise<void> {
    const token = requireToken();
    await rawInsert('onboarding_status', {
      user_id: userId,
      completed: true,
      completed_at: new Date().toISOString(),
      week_starts_monday: true,
      max_tasks_per_day: 8,
    }, token);
  },
};
