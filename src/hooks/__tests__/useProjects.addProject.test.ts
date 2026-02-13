/**
 * Tests for useProjects.addProject — the hook layer that manages project state.
 *
 * Flow: useProjects.addProject → optimistic UI update → db.addProject → replace temp with real
 */

import { renderHook, act, waitFor } from '@testing-library/react';

const mockUser = { id: 'user-123', email: 'test@test.com' };
const mockSession = { user: mockUser, access_token: 'tok' };

const existingProjects = [
  { id: 'p1', user_id: 'user-123', name: 'Life', color: '#22c55e', created_at: '2025-01-01' },
  { id: 'p2', user_id: 'user-123', name: 'Work', color: '#3b82f6', created_at: '2025-01-01' },
];

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetSession = jest.fn();
const mockGetUser = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUnsubscribe = jest.fn();
const mockDbAddProject = jest.fn();
const mockDbFetchProjects = jest.fn();
const mockDbEnsureDefaultProjects = jest.fn();

jest.mock('@/lib/supabase', () => {
  let _resolve: () => void;
  const authReady = new Promise<void>((r) => { _resolve = r; });
  _resolve!();

  return {
    supabase: {
      auth: {
        getSession: (...args: any[]) => mockGetSession(...args),
        getUser: (...args: any[]) => mockGetUser(...args),
        onAuthStateChange: (...args: any[]) => mockOnAuthStateChange(...args),
      },
    },
    authReady,
  };
});

jest.mock('@/lib/db', () => ({
  db: {
    fetchProjects: (...args: any[]) => mockDbFetchProjects(...args),
    ensureDefaultProjects: (...args: any[]) => mockDbEnsureDefaultProjects(...args),
    addProject: (...args: any[]) => mockDbAddProject(...args),
  },
}));

jest.mock('@/lib/utils', () => ({
  generateId: () => 'temp-id-999',
}));

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
  mockGetUser.mockResolvedValue({ data: { user: mockUser } });
  mockOnAuthStateChange.mockImplementation((cb: any) => {
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  });
  mockDbFetchProjects.mockResolvedValue(existingProjects);
  mockDbEnsureDefaultProjects.mockResolvedValue([]);
  mockDbAddProject.mockResolvedValue({
    id: 'proj-real-1',
    user_id: 'user-123',
    name: 'Side Project',
    color: '#f59e0b',
    created_at: '2025-01-15T00:00:00Z',
  });
});

// ── Import after mocks ────────────────────────────────────────────────────

let useProjects: typeof import('../useProjects').useProjects;

beforeAll(async () => {
  const mod = await import('../useProjects');
  useProjects = mod.useProjects;
});

// ── Helper ─────────────────────────────────────────────────────────────────

async function renderAndWaitForLoad() {
  const hook = renderHook(() => useProjects());
  await waitFor(() => {
    expect(hook.result.current.isLoading).toBe(false);
  });
  return hook;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useProjects.addProject', () => {
  test('adds project optimistically then replaces with DB result', async () => {
    const { result } = await renderAndWaitForLoad();

    expect(result.current.projects).toHaveLength(2); // Life, Work

    await act(async () => {
      await result.current.addProject({ name: 'Side Project', color: '#f59e0b' });
    });

    // Should now have 3 projects
    expect(result.current.projects).toHaveLength(3);
    // The new project should have the real DB id, not the temp id
    const newProj = result.current.projects.find(p => p.name === 'Side Project');
    expect(newProj).toBeDefined();
    expect(newProj!.id).toBe('proj-real-1'); // replaced temp with real
  });

  test('optimistic project appears immediately before DB resolves', async () => {
    let resolveDb: (value: any) => void;
    mockDbAddProject.mockImplementation(() => new Promise((r) => { resolveDb = r; }));

    const { result } = await renderAndWaitForLoad();

    // Start addProject (don't await)
    let addPromise: Promise<any>;
    act(() => {
      addPromise = result.current.addProject({ name: 'New', color: '#000' });
    });

    // Project should appear immediately with temp ID
    await waitFor(() => {
      expect(result.current.projects).toHaveLength(3);
    });
    const tempProj = result.current.projects.find(p => p.name === 'New');
    expect(tempProj).toBeDefined();
    expect(tempProj!.id).toBe('temp-id-999');

    // Now resolve DB
    await act(async () => {
      resolveDb!({
        id: 'proj-real-2',
        user_id: 'user-123',
        name: 'New',
        color: '#000',
        created_at: '2025-01-15T00:00:00Z',
      });
      await addPromise!;
    });

    // Should still have 3 projects but temp replaced with real
    expect(result.current.projects).toHaveLength(3);
    const realProj = result.current.projects.find(p => p.name === 'New');
    expect(realProj!.id).toBe('proj-real-2');
  });

  test('rolls back project when db.addProject throws', async () => {
    mockDbAddProject.mockRejectedValue(new Error('Insert failed'));

    const { result } = await renderAndWaitForLoad();

    expect(result.current.projects).toHaveLength(2);

    try {
      await act(async () => {
        await result.current.addProject({ name: 'Bad Project', color: '#f00' });
      });
    } catch {
      // Expected
    }

    // Should be rolled back to 2 projects
    await waitFor(() => {
      expect(result.current.projects).toHaveLength(2);
    });
    expect(result.current.projects.find(p => p.name === 'Bad Project')).toBeUndefined();
  });

  test('passes correct user_id to db.addProject', async () => {
    const { result } = await renderAndWaitForLoad();

    await act(async () => {
      await result.current.addProject({ name: 'Test', color: '#000' });
    });

    expect(mockDbAddProject).toHaveBeenCalledWith({
      user_id: 'user-123',
      name: 'Test',
      color: '#000',
    });
  });

  test('recovers user from getUser() when userRef is null', async () => {
    // Start with no session so userRef stays null during eager load
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    mockDbFetchProjects.mockResolvedValue([]);
    mockDbEnsureDefaultProjects.mockResolvedValue([]);

    // But getUser() returns a user (auth just refreshed)
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });

    // Restore getSession for the db.addProject call
    mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

    const { result } = await renderAndWaitForLoad();

    await act(async () => {
      await result.current.addProject({ name: 'Recovered', color: '#000' });
    });

    // Should have recovered user and called db.addProject
    expect(mockGetUser).toHaveBeenCalled();
    expect(mockDbAddProject).toHaveBeenCalledWith({
      user_id: 'user-123',
      name: 'Recovered',
      color: '#000',
    });
  });

  test('does nothing when no user is available', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { result } = await renderAndWaitForLoad();

    await act(async () => {
      const returned = await result.current.addProject({ name: 'Ghost', color: '#000' });
      expect(returned).toBeUndefined();
    });

    expect(mockDbAddProject).not.toHaveBeenCalled();
    // No project added to state
    expect(result.current.projects.find(p => p.name === 'Ghost')).toBeUndefined();
  });

  test('returns the created project from db', async () => {
    const { result } = await renderAndWaitForLoad();

    let returned: any;
    await act(async () => {
      returned = await result.current.addProject({ name: 'Side Project', color: '#f59e0b' });
    });

    expect(returned).toEqual({
      id: 'proj-real-1',
      user_id: 'user-123',
      name: 'Side Project',
      color: '#f59e0b',
      created_at: '2025-01-15T00:00:00Z',
    });
  });
});
