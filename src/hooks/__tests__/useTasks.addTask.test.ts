/**
 * Tests for useTasks.addTask — verifying tasks are added to state and persisted to DB.
 *
 * Traces the full flow:
 *   TaskInput creates Task → useTasks.addTask → optimistic UI update → db.addTask → rawInsert → verify SELECT
 *
 * Known failure modes to test:
 * 1. Task appears in state (optimistic) but db.addTask throws → rollback removes it
 * 2. user_id mismatch between JWT and payload → RLS blocks insert
 * 3. Verification SELECT after rawInsert fails → task rolled back even though insert succeeded
 * 4. No auth session → db.addTask throws → rollback
 */

import { renderHook, act, waitFor } from '@testing-library/react';

// ── Mock data ──────────────────────────────────────────────────────────────

const mockUser = { id: 'user-123', email: 'test@test.com' };
const mockSession = { user: mockUser, access_token: 'test-token' };

const sampleTask = {
  id: 'task-abc-123',
  title: 'Buy groceries',
  description: 'Milk, eggs, bread',
  category: 'Life',
  priority: 3 as const,
  estimatedMinutes: 30,
  energyLevel: 'medium' as const,
  status: 'todo' as const,
  tags: [] as string[],
  createdAt: Date.now(),
  deadline: '2025-01-15',
  project_id: 'proj-1',
};

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetSession = jest.fn();
const mockGetUser = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUnsubscribe = jest.fn();

// db mocks
const mockDbAddTask = jest.fn();
const mockDbFetchTasks = jest.fn();
const mockDbUpdateTask = jest.fn();
const mockDbDeleteTask = jest.fn();
const mockDbAddTasksBatch = jest.fn();

// storage mocks
const mockLoadTasks = jest.fn();
const mockSaveTasks = jest.fn();

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
    SESSION_KEY: 'app_auth_session',
  };
});

jest.mock('@/lib/db', () => ({
  db: {
    fetchTasks: (...args: any[]) => mockDbFetchTasks(...args),
    addTask: (...args: any[]) => mockDbAddTask(...args),
    updateTask: (...args: any[]) => mockDbUpdateTask(...args),
    deleteTask: (...args: any[]) => mockDbDeleteTask(...args),
    addTasksBatch: (...args: any[]) => mockDbAddTasksBatch(...args),
  },
}));

jest.mock('@/lib/storage', () => ({
  loadTasks: (...args: any[]) => mockLoadTasks(...args),
  saveTasks: (...args: any[]) => mockSaveTasks(...args),
}));

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Default: authenticated user with valid session
  mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
  mockGetUser.mockResolvedValue({ data: { user: mockUser } });

  // onAuthStateChange: capture callback, fire INITIAL_SESSION with user
  mockOnAuthStateChange.mockImplementation((cb: any) => {
    // Fire INITIAL_SESSION synchronously (like Supabase replays it)
    setTimeout(() => cb('INITIAL_SESSION', mockSession), 0);
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  });

  // Default: no existing tasks
  mockDbFetchTasks.mockResolvedValue([]);
  mockLoadTasks.mockReturnValue([]);

  // Default: db.addTask succeeds
  mockDbAddTask.mockResolvedValue(undefined);
});

// ── Import hook after mocks ────────────────────────────────────────────────

let useTasks: typeof import('../useTasks').useTasks;

beforeAll(async () => {
  const mod = await import('../useTasks');
  useTasks = mod.useTasks;
});

// ── Helper: wait for hook to finish initial load ───────────────────────────

async function renderAndWaitForLoad() {
  const hook = renderHook(() => useTasks());
  await waitFor(() => {
    expect(hook.result.current.isLoaded).toBe(true);
  });
  return hook;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useTasks.addTask', () => {
  test('adds task to state optimistically (before DB call resolves)', async () => {
    // Make db.addTask hang so we can check state before it resolves
    let resolveDb: () => void;
    mockDbAddTask.mockImplementation(() => new Promise<void>((r) => { resolveDb = r; }));

    const { result } = await renderAndWaitForLoad();

    // Initially no tasks
    expect(result.current.tasks).toEqual([]);

    // Add task — should appear immediately
    act(() => {
      result.current.addTask(sampleTask);
    });

    // Task should be in state immediately (optimistic)
    await waitFor(() => {
      expect(result.current.tasks.length).toBe(1);
    });
    expect(result.current.tasks[0].title).toBe('Buy groceries');
    expect(result.current.tasks[0].user_id).toBe('user-123');

    // Resolve DB call
    await act(async () => { resolveDb!(); });

    // Task should still be there
    expect(result.current.tasks.length).toBe(1);
  });

  test('sets user_id from authenticated user on the task', async () => {
    const { result } = await renderAndWaitForLoad();

    await act(async () => {
      await result.current.addTask(sampleTask);
    });

    // The task in state should have user_id set
    expect(result.current.tasks[0].user_id).toBe('user-123');

    // db.addTask should have been called with user_id matching the auth user
    expect(mockDbAddTask).toHaveBeenCalledTimes(1);
    const taskSentToDb = mockDbAddTask.mock.calls[0][0];
    expect(taskSentToDb.user_id).toBe('user-123');
  });

  test('calls db.addTask with correctly shaped payload', async () => {
    const { result } = await renderAndWaitForLoad();

    await act(async () => {
      await result.current.addTask(sampleTask);
    });

    expect(mockDbAddTask).toHaveBeenCalledTimes(1);
    const taskSentToDb = mockDbAddTask.mock.calls[0][0];

    // Verify all required fields are present
    expect(taskSentToDb).toMatchObject({
      id: 'task-abc-123',
      user_id: 'user-123',
      title: 'Buy groceries',
      description: 'Milk, eggs, bread',
      category: 'Life',
      priority: 3,
      estimatedMinutes: 30,
      energyLevel: 'medium',
      status: 'todo',
      tags: [],
      project_id: 'proj-1',
    });
    expect(taskSentToDb.createdAt).toBeDefined();
    expect(typeof taskSentToDb.createdAt).toBe('number');
  });

  test('rolls back task from state when db.addTask throws', async () => {
    mockDbAddTask.mockRejectedValue(new Error('Insert blocked by RLS'));

    const { result } = await renderAndWaitForLoad();

    await act(async () => {
      await result.current.addTask(sampleTask);
    });

    // After DB failure, task should be rolled back
    await waitFor(() => {
      expect(result.current.tasks.length).toBe(0);
    });
  });

  test('saves to localStorage immediately on addTask', async () => {
    const { result } = await renderAndWaitForLoad();

    await act(async () => {
      await result.current.addTask(sampleTask);
    });

    // saveTasks should have been called with the new task
    const saveCalls = mockSaveTasks.mock.calls;
    // Find a call that includes our task
    const callWithTask = saveCalls.find((call: any[]) =>
      call[0].some((t: any) => t.id === 'task-abc-123')
    );
    expect(callWithTask).toBeDefined();
  });

  test('rolls back localStorage when db.addTask fails', async () => {
    mockDbAddTask.mockRejectedValue(new Error('DB error'));

    const { result } = await renderAndWaitForLoad();

    await act(async () => {
      await result.current.addTask(sampleTask);
    });

    // The last saveTasks call should NOT include the failed task
    await waitFor(() => {
      expect(result.current.tasks.length).toBe(0);
    });

    const lastSaveCall = mockSaveTasks.mock.calls[mockSaveTasks.mock.calls.length - 1];
    const hasFailedTask = lastSaveCall[0].some((t: any) => t.id === 'task-abc-123');
    expect(hasFailedTask).toBe(false);
  });

  test('recovers user from getUser() when userRef is null', async () => {
    // Simulate: INITIAL_SESSION fires with no session, so userRef stays null
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockOnAuthStateChange.mockImplementation((cb: any) => {
      setTimeout(() => cb('INITIAL_SESSION', null), 0);
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    // But getUser() returns a valid user (e.g., token was just refreshed)
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });

    const { result } = await renderAndWaitForLoad();

    await act(async () => {
      await result.current.addTask(sampleTask);
    });

    // Should have recovered user and called db.addTask
    expect(mockGetUser).toHaveBeenCalled();
    expect(mockDbAddTask).toHaveBeenCalledTimes(1);
    expect(mockDbAddTask.mock.calls[0][0].user_id).toBe('user-123');
  });

  test('skips db.addTask when no user (saves to localStorage only)', async () => {
    // No session, no cached user
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockOnAuthStateChange.mockImplementation((cb: any) => {
      setTimeout(() => cb('INITIAL_SESSION', null), 0);
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    const { result } = await renderAndWaitForLoad();

    await act(async () => {
      await result.current.addTask(sampleTask);
    });

    // Task should be in state (localStorage only)
    expect(result.current.tasks.length).toBe(1);
    // db.addTask should NOT have been called
    expect(mockDbAddTask).not.toHaveBeenCalled();
    // But saveTasks should have been called
    expect(mockSaveTasks).toHaveBeenCalled();
  });

  test('task without project_id should still be added successfully', async () => {
    const taskNoProject = { ...sampleTask, project_id: undefined };

    const { result } = await renderAndWaitForLoad();

    await act(async () => {
      await result.current.addTask(taskNoProject);
    });

    expect(result.current.tasks.length).toBe(1);
    expect(mockDbAddTask).toHaveBeenCalledTimes(1);
    expect(mockDbAddTask.mock.calls[0][0].project_id).toBeUndefined();
  });
});

describe('db.addTask payload validation (taskToPayload)', () => {
  // These tests verify the payload structure matches what the DB expects
  test('taskToPayload maps all fields correctly for Supabase', async () => {
    // Import the actual db module to test taskToPayload indirectly
    // Since taskToPayload is not exported, we test via db.addTask's call to rawInsert
    // But since db is mocked, we test the shape at the useTasks level

    const { result } = await renderAndWaitForLoad();

    await act(async () => {
      await result.current.addTask({
        ...sampleTask,
        deadline: undefined,  // no deadline
        project_id: undefined, // no project
      });
    });

    const taskSent = mockDbAddTask.mock.calls[0][0];

    // These fields must exist for the DB insert to succeed
    expect(taskSent.id).toBeDefined();
    expect(taskSent.user_id).toBe('user-123');
    expect(taskSent.title).toBe('Buy groceries');
    expect(taskSent.status).toBe('todo');
    expect(taskSent.priority).toBe(3);
    expect(taskSent.estimatedMinutes).toBe(30);
    expect(taskSent.energyLevel).toBe('medium');
    expect(taskSent.tags).toEqual([]);
    expect(typeof taskSent.createdAt).toBe('number');
  });
});
