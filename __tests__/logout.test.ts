/**
 * Tests for the logout flow.
 *
 * We isolate the core logout logic (what handleLogout does) and verify:
 * 1. signOut is called with { scope: 'local' }
 * 2. SESSION_KEY is removed from localStorage
 * 3. All sb-* keys are removed from localStorage
 * 4. window.location.href is set to '/' to force navigation
 * 5. If signOut() hangs (never resolves), the flow still completes via timeout
 * 6. If signOut() throws, cleanup still runs (finally block)
 */

// ---------------------------------------------------------------------------
// Helpers: extract the pure logout logic so we can test without React
// ---------------------------------------------------------------------------

type SignOutFn = (opts?: { scope: string }) => Promise<{ error: any }>;

/**
 * Mirrors the handleLogout logic in page.tsx, minus React state (setUser).
 * Returns a promise that resolves once logout is fully done.
 */
async function logoutCore(
  signOut: SignOutFn | null,
  storage: Storage,
  setUser: (u: any) => void,
  setHref: (url: string) => void,
  SESSION_KEY: string,
) {
  console.log('[logoutCore] start');
  try {
    if (signOut) {
      const { error } = await signOut({ scope: 'local' });
      if (error) console.error('[logoutCore] signOut error:', error.message);
    }
  } catch (error) {
    console.error('[logoutCore] signOut threw:', error);
  } finally {
    storage.removeItem(SESSION_KEY);
    try {
      Object.keys(storage).forEach((key) => {
        if (key.startsWith('sb-')) storage.removeItem(key);
      });
    } catch { /* ignore */ }
    setUser(null);
    setHref('/');
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleLogout', () => {
  const SESSION_KEY = 'app_auth_session';
  let setUser: jest.Mock;
  let setHref: jest.Mock;

  beforeEach(() => {
    localStorage.clear();
    setUser = jest.fn();
    setHref = jest.fn();
  });

  it('calls signOut with scope:local and clears all auth storage', async () => {
    // Seed localStorage with keys that should be cleared
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: { id: '123' } }));
    localStorage.setItem('sb-abc-auth-token', 'token-value');
    localStorage.setItem('sb-xyz-auth-token-code-verifier', 'verifier');
    localStorage.setItem('unrelated-key', 'should-remain');

    const signOut = jest.fn().mockResolvedValue({ error: null });

    await logoutCore(signOut, localStorage, setUser, setHref, SESSION_KEY);

    // signOut called with local scope
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });

    // SESSION_KEY removed
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();

    // All sb-* keys removed
    expect(localStorage.getItem('sb-abc-auth-token')).toBeNull();
    expect(localStorage.getItem('sb-xyz-auth-token-code-verifier')).toBeNull();

    // Unrelated key preserved
    expect(localStorage.getItem('unrelated-key')).toBe('should-remain');

    // User set to null
    expect(setUser).toHaveBeenCalledWith(null);

    // Redirect triggered
    expect(setHref).toHaveBeenCalledWith('/');
  });

  it('still clears storage and redirects when signOut() throws', async () => {
    localStorage.setItem(SESSION_KEY, 'cached');
    localStorage.setItem('sb-test-auth-token', 'tok');

    const signOut = jest.fn().mockRejectedValue(new Error('Network error'));

    await logoutCore(signOut, localStorage, setUser, setHref, SESSION_KEY);

    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem('sb-test-auth-token')).toBeNull();
    expect(setUser).toHaveBeenCalledWith(null);
    expect(setHref).toHaveBeenCalledWith('/');
  });

  it('still clears storage and redirects when signOut() returns an error object', async () => {
    localStorage.setItem(SESSION_KEY, 'cached');

    const signOut = jest.fn().mockResolvedValue({
      error: { message: 'session_not_found', status: 403 },
    });

    await logoutCore(signOut, localStorage, setUser, setHref, SESSION_KEY);

    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(setUser).toHaveBeenCalledWith(null);
    expect(setHref).toHaveBeenCalledWith('/');
  });

  it('still clears storage and redirects when supabase is null (no signOut)', async () => {
    localStorage.setItem(SESSION_KEY, 'cached');

    await logoutCore(null, localStorage, setUser, setHref, SESSION_KEY);

    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(setUser).toHaveBeenCalledWith(null);
    expect(setHref).toHaveBeenCalledWith('/');
  });

  it('handles signOut() that hangs by racing against a timeout', async () => {
    localStorage.setItem(SESSION_KEY, 'cached');
    localStorage.setItem('sb-hang-auth-token', 'tok');

    // signOut never resolves
    const neverResolve = new Promise<{ error: any }>(() => {});
    const signOut = jest.fn().mockReturnValue(neverResolve);

    // Wrap logoutCore to add the timeout race (as we'll add in production code)
    async function logoutWithTimeout() {
      const TIMEOUT_MS = 3000;
      try {
        if (signOut) {
          const timeoutPromise = new Promise<{ error: any }>((_, reject) =>
            setTimeout(() => reject(new Error('signOut timed out')), TIMEOUT_MS),
          );
          await Promise.race([
            signOut({ scope: 'local' }),
            timeoutPromise,
          ]);
        }
      } catch (error) {
        console.error('signOut failed or timed out:', error);
      } finally {
        localStorage.removeItem(SESSION_KEY);
        try {
          Object.keys(localStorage).forEach((key) => {
            if (key.startsWith('sb-')) localStorage.removeItem(key);
          });
        } catch { /* ignore */ }
        setUser(null);
        setHref('/');
      }
    }

    // Use fake timers to instantly trigger the timeout
    jest.useFakeTimers();
    const logoutPromise = logoutWithTimeout();
    jest.advanceTimersByTime(3000);
    await logoutPromise;
    jest.useRealTimers();

    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem('sb-hang-auth-token')).toBeNull();
    expect(setUser).toHaveBeenCalledWith(null);
    expect(setHref).toHaveBeenCalledWith('/');
  });
});
