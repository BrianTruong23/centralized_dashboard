/**
 * Tests for useProjects hook — project loading on mount/reload.
 *
 * Root cause of the "projects don't persist on reload" bug:
 * useTasks works because it eagerly calls authReady → getSession() → fetchTasks.
 * useProjects was relying ONLY on onAuthStateChange(INITIAL_SESSION) which can
 * miss the event if it fires before React's useEffect registers the listener.
 *
 * The fix: useProjects should eagerly load (like useTasks) via authReady + getSession().
 */

import { renderHook, act, waitFor } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockProjects = [
  { id: 'p1', user_id: 'user-1', name: 'Life', color: '#22c55e', created_at: '2024-01-01' },
  { id: 'p2', user_id: 'user-1', name: 'Work', color: '#3b82f6', created_at: '2024-01-01' },
  { id: 'p3', user_id: 'user-1', name: 'Side Project', color: '#f59e0b', created_at: '2024-01-02' },
];

const mockUser = { id: 'user-1', email: 'test@test.com' };

// Track onAuthStateChange callbacks so we can simulate events
let authChangeCallbacks: Array<(event: string, session: any) => void> = [];

const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUnsubscribe = jest.fn();

// Mock supabase module
jest.mock('@/lib/supabase', () => {
  // authReady resolves immediately in tests
  let _resolve: () => void;
  const authReady = new Promise<void>((r) => { _resolve = r; });
  // Resolve immediately
  _resolve!();

  return {
    supabase: {
      auth: {
        getSession: (...args: any[]) => mockGetSession(...args),
        onAuthStateChange: (...args: any[]) => mockOnAuthStateChange(...args),
        getUser: jest.fn().mockResolvedValue({ data: { user: mockUser } }),
      },
      from: jest.fn(),
    },
    authReady,
  };
});

// Mock db module
const mockFetchProjects = jest.fn();
const mockEnsureDefaultProjects = jest.fn();

jest.mock('@/lib/db', () => ({
  db: {
    fetchProjects: (...args: any[]) => mockFetchProjects(...args),
    ensureDefaultProjects: (...args: any[]) => mockEnsureDefaultProjects(...args),
    addProject: jest.fn(),
  },
}));

jest.mock('@/lib/utils', () => ({
  generateId: () => 'temp-id-123',
}));

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  authChangeCallbacks = [];

  // Default: getSession returns a valid user session
  mockGetSession.mockResolvedValue({
    data: { session: { user: mockUser, access_token: 'tok' } },
  });

  // Default: onAuthStateChange captures the callback but does NOT fire INITIAL_SESSION
  mockOnAuthStateChange.mockImplementation((cb: any) => {
    authChangeCallbacks.push(cb);
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  });

  // Default: fetchProjects returns mock data
  mockFetchProjects.mockResolvedValue(mockProjects);
  mockEnsureDefaultProjects.mockResolvedValue([]);
});

// ── Import hook AFTER mocks are set up ─────────────────────────────────────
// Must be a dynamic import because jest.mock is hoisted but the module
// captures mock references at import time.

let useProjects: typeof import('../useProjects').useProjects;

beforeAll(async () => {
  const mod = await import('../useProjects');
  useProjects = mod.useProjects;
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useProjects', () => {
  test('loads projects eagerly on mount via getSession (not waiting for onAuthStateChange)', async () => {
    // This is the KEY test: projects should load even if onAuthStateChange
    // never fires INITIAL_SESSION (which happens when the event is missed).
    // The hook must eagerly call getSession() like useTasks does.

    const { result } = renderHook(() => useProjects());

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.projects).toEqual([]);

    // Wait for projects to load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Projects should be loaded via eager getSession path
    expect(result.current.projects).toEqual(mockProjects);
    expect(mockFetchProjects).toHaveBeenCalledWith('user-1');
  });

  test('loads projects even when INITIAL_SESSION event fires with valid session', async () => {
    // Simulate INITIAL_SESSION firing after listener is registered
    mockOnAuthStateChange.mockImplementation((cb: any) => {
      authChangeCallbacks.push(cb);
      // Fire INITIAL_SESSION asynchronously (like Supabase does)
      setTimeout(() => cb('INITIAL_SESSION', { user: mockUser }), 10);
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    const { result } = renderHook(() => useProjects());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have projects regardless of whether eager load or INITIAL_SESSION won
    expect(result.current.projects).toEqual(mockProjects);
  });

  test('handles reload with expired token then TOKEN_REFRESHED', async () => {
    // Simulate: getSession returns expired/null session initially
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
    });

    const { result } = renderHook(() => useProjects());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // No user session → no projects initially
    expect(result.current.projects).toEqual([]);

    // Now simulate TOKEN_REFRESHED with a valid session
    await act(async () => {
      for (const cb of authChangeCallbacks) {
        await cb('TOKEN_REFRESHED', { user: mockUser });
      }
    });

    // Projects should now be loaded
    await waitFor(() => {
      expect(result.current.projects).toEqual(mockProjects);
    });
    expect(mockFetchProjects).toHaveBeenCalledWith('user-1');
  });

  test('handles SIGNED_IN after initial no-session', async () => {
    // Start with no session
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
    });

    const { result } = renderHook(() => useProjects());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.projects).toEqual([]);

    // User signs in
    await act(async () => {
      for (const cb of authChangeCallbacks) {
        await cb('SIGNED_IN', { user: mockUser });
      }
    });

    await waitFor(() => {
      expect(result.current.projects).toEqual(mockProjects);
    });
  });

  test('clears projects on SIGNED_OUT', async () => {
    const { result } = renderHook(() => useProjects());

    await waitFor(() => {
      expect(result.current.projects).toEqual(mockProjects);
    });

    // Sign out
    await act(async () => {
      for (const cb of authChangeCallbacks) {
        await cb('SIGNED_OUT', null);
      }
    });

    expect(result.current.projects).toEqual([]);
  });

  test('sets isLoading=false even when fetchProjects fails on eager load', async () => {
    mockEnsureDefaultProjects.mockReset().mockResolvedValue([]);
    mockFetchProjects.mockReset().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useProjects());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 3000 });

    // Projects empty after failed load
    expect(result.current.projects).toEqual([]);

    // Restore for subsequent tests
    mockFetchProjects.mockReset().mockResolvedValue(mockProjects);
  });

  test('unsubscribes on unmount', async () => {
    mockFetchProjects.mockReset().mockResolvedValue(mockProjects);
    mockEnsureDefaultProjects.mockReset().mockResolvedValue([]);

    const { result, unmount } = renderHook(() => useProjects());

    // Wait for eager load to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
