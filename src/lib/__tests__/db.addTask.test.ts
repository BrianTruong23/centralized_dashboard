/**
 * Tests for db.addTask — verifies the simplified architecture:
 *   requireToken() (sync) → rawInsert (single fetch) → logActivity (fire-and-forget)
 *
 * No supabase.auth.getSession() calls. No supabase.from() calls.
 * Token comes from the cached getAccessToken() in supabase.ts.
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

let mockToken: string | null = 'test-jwt-token';

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: {} },
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  getAccessToken: () => mockToken,
}));

let db: typeof import('../db').db;
beforeAll(async () => { db = (await import('../db')).db; });

beforeEach(() => {
  jest.clearAllMocks();
  mockToken = 'test-jwt-token';
  // Default: all fetches succeed
  mockFetch.mockResolvedValue({ 
    ok: true, 
    status: 201, 
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('{}') 
  });
});

const task = {
  id: 'task-1',
  user_id: 'user-1',
  title: 'Buy milk',
  description: '',
  category: 'Life',
  priority: 3 as const,
  estimatedMinutes: 30,
  energyLevel: 'medium' as const,
  status: 'todo' as const,
  tags: [] as string[],
  createdAt: Date.now(),
  project_id: 'proj-1',
};

describe('db.addTask', () => {
  test('sends one POST (task insert) and returns immediately', async () => {
    await db.addTask(task);

    // First call = task insert, second = logActivity (fire-and-forget)
    const insertCall = mockFetch.mock.calls[0];
    expect(insertCall[0]).toBe('https://test.supabase.co/rest/v1/tasks');
    expect(insertCall[1].method).toBe('POST');

    const body = JSON.parse(insertCall[1].body);
    expect(body.text).toBe('Buy milk');
    expect(body.user_id).toBe('user-1');
    expect(body.project_id).toBe('proj-1');
    expect(body.status).toBe('todo');
  });

  test('uses cached token (no getSession call)', async () => {
    await db.addTask(task);

    const authHeader = mockFetch.mock.calls[0][1].headers['Authorization'];
    expect(authHeader).toBe('Bearer test-jwt-token');
  });

  test('throws when no token cached', async () => {
    mockToken = null;
    await expect(db.addTask(task)).rejects.toThrow('session is still restoring');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('throws on insert error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 403,
      text: () => Promise.resolve(JSON.stringify({ code: '42501', message: 'RLS violation' })),
      json: () => Promise.resolve({ code: '42501', message: 'RLS violation' }),
    });
    await expect(db.addTask(task)).rejects.toMatchObject({ code: '42501' });
  });

  test('logActivity is fire-and-forget (does not block)', async () => {
    // logActivity fetch will be slow
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 201 }) // task insert
      .mockImplementationOnce(() => new Promise(() => {})); // logActivity hangs forever

    // addTask should resolve immediately after the task insert
    await db.addTask(task);
    // If we get here, logActivity didn't block
  });

  test('omits project_id when undefined', async () => {
    await db.addTask({ ...task, project_id: undefined });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect('project_id' in body).toBe(false);
  });
});

describe('db.addTasksBatch', () => {
  test('sends all tasks in one POST', async () => {
    const tasks = [
      { ...task, id: 't1', title: 'Task 1' },
      { ...task, id: 't2', title: 'Task 2' },
    ];
    const count = await db.addTasksBatch(tasks);

    expect(count).toBe(2);
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toHaveLength(2);
    expect(body[0].text).toBe('Task 1');
    expect(body[1].text).toBe('Task 2');
  });

  test('returns 0 for empty array without fetching', async () => {
    const count = await db.addTasksBatch([]);
    expect(count).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('db.updateTask', () => {
  test('sends PATCH with correct filters', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
    await db.updateTask(task);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/rest/v1/tasks');
    expect(url).toContain('id=eq.task-1');
    expect(opts.method).toBe('PATCH');
  });
});

describe('db.deleteTask', () => {
  test('sends DELETE with correct filter', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
    await db.deleteTask('task-1');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/rest/v1/tasks');
    expect(url).toContain('id=eq.task-1');
    expect(opts.method).toBe('DELETE');
  });
});

describe('db.fetchTasks', () => {
  test('fetches via raw GET and maps rows', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve([
        { id: 't1', user_id: 'u1', text: 'Hello', status: 'todo', category: 'Life',
          priority: 3, estimated_minutes: 60, energy_level: 'medium', tags: [],
          created_at: '2025-01-01T00:00:00Z', completed: false },
      ]),
    });

    const tasks = await db.fetchTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Hello');
    expect(tasks[0].id).toBe('t1');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe('GET');
    expect(url).toContain('order=created_at.desc');
  });
});
