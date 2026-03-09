/**
 * Tests for db.addProject, db.fetchProjects, db.ensureDefaultProjects
 * All operations use cached token + raw fetch. Zero supabase client calls.
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
});

function ok(data: any, status = 200) {
  return { 
    ok: true, 
    status, 
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)) 
  } as Response;
}
function err(body: any, status: number) {
  return { 
    ok: false, 
    status, 
    statusText: 'Error', 
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  } as Response;
}

const project = { id: 'p1', user_id: 'u1', name: 'Side', color: '#f00', created_at: '2025-01-01' };

describe('db.addProject', () => {
  test('full create flow: check → insert → fetch', async () => {
    mockFetch
      .mockResolvedValueOnce(ok([]))          // existence check: empty
      .mockResolvedValueOnce(ok(null, 201))   // insert
      .mockResolvedValueOnce(ok([project]));  // fetch result

    const result = await db.addProject({ user_id: 'u1', name: 'Side', color: '#f00' });
    expect(result).toEqual(project);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test('returns existing without insert', async () => {
    mockFetch.mockResolvedValueOnce(ok([project]));

    const result = await db.addProject({ user_id: 'u1', name: 'Side', color: '#f00' });
    expect(result).toEqual(project);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('handles 23505 unique constraint gracefully', async () => {
    mockFetch
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(err({ code: '23505', message: 'dup' }, 409))
      .mockResolvedValueOnce(ok([project]));

    const result = await db.addProject({ user_id: 'u1', name: 'Side', color: '#f00' });
    expect(result).toEqual(project);
  });

  test('throws on RLS error', async () => {
    mockFetch
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(err({ code: '42501', message: 'forbidden' }, 403));

    await expect(db.addProject({ user_id: 'u1', name: 'X', color: '#000' }))
      .rejects.toMatchObject({ code: '42501' });
  });

  test('throws when no token', async () => {
    mockToken = null;
    await expect(db.addProject({ user_id: 'u1', name: 'X', color: '#000' }))
      .rejects.toThrow('session is still restoring');
  });
});

describe('db.fetchProjects', () => {
  test('fetches via raw GET', async () => {
    mockFetch.mockResolvedValueOnce(ok([project]));

    const result = await db.fetchProjects('u1');
    expect(result).toEqual([project]);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe('GET');
    expect(url).toContain('user_id=eq.u1');
    expect(url).toContain('order=created_at.asc');
  });
});

describe('db.ensureDefaultProjects', () => {
  test('creates missing defaults', async () => {
    const life = { id: 'p1', user_id: 'u1', name: 'Life', color: '#22c55e', created_at: '2025-01-01' };
    const work = { id: 'p2', user_id: 'u1', name: 'Work', color: '#3b82f6', created_at: '2025-01-01' };

    mockFetch
      .mockResolvedValueOnce(ok([life]))       // check: only Life exists
      .mockResolvedValueOnce(ok(null, 201))    // insert Work
      .mockResolvedValueOnce(ok([life, work])); // fetch all

    const result = await db.ensureDefaultProjects('u1');
    expect(result).toHaveLength(2);
  });

  test('skips insert when both exist', async () => {
    const both = [
      { id: 'p1', user_id: 'u1', name: 'Life', color: '#22c55e' },
      { id: 'p2', user_id: 'u1', name: 'Work', color: '#3b82f6' },
    ];
    mockFetch.mockResolvedValueOnce(ok(both));

    const result = await db.ensureDefaultProjects('u1');
    expect(result).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(1); // only the check, no insert
  });
});
