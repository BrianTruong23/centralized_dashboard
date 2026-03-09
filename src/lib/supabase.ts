import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Session, User } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured) {
  console.warn('Missing Supabase environment variables. Storage will not persist to cloud.');
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseKey;
export const SESSION_KEY = 'app_auth_session';

export type AuthBootstrapState =
  | 'booting'
  | 'restoring_session'
  | 'authenticated'
  | 'signed_out'
  | 'restore_failed';

type StoredSession = {
  access_token: string;
  refresh_token: string;
  user?: User;
  expires_at?: number;
};

export type AuthBootstrapSnapshot = {
  state: AuthBootstrapState;
  user: User | null;
  accessToken: string | null;
  error: string | null;
  lastEvent: string | null;
  updatedAt: number;
};

const DEBUG_PREFIX = '[auth-bootstrap]';

let _cachedAccessToken: string | null = null;
let _bootstrapStarted = false;
let _bootstrapPromise: Promise<void> | null = null;

let _snapshot: AuthBootstrapSnapshot = {
  state: isSupabaseConfigured ? 'booting' : 'signed_out',
  user: null,
  accessToken: null,
  error: null,
  lastEvent: null,
  updatedAt: Date.now(),
};

const listeners = new Set<(snapshot: AuthBootstrapSnapshot) => void>();
let logSequence = 0;

function postDebugLog(message: string, extra?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;

  const body = JSON.stringify({
    seq: ++logSequence,
    at: new Date().toISOString(),
    message,
    extra: extra ?? null,
    href: window.location.href,
  });

  try {
    fetch('/api/debug/auth-bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // ignore debug transport failures
  }
}

function log(message: string, extra?: Record<string, unknown>) {
  if (extra) {
    console.log(DEBUG_PREFIX, message, extra);
    postDebugLog(message, extra);
    return;
  }
  console.log(DEBUG_PREFIX, message);
  postDebugLog(message);
}

function emit(snapshot: Partial<AuthBootstrapSnapshot>) {
  _snapshot = {
    ..._snapshot,
    ...snapshot,
    updatedAt: Date.now(),
  };
  listeners.forEach((listener) => listener(_snapshot));
}

function setSnapshot(
  state: AuthBootstrapState,
  details?: {
    user?: User | null;
    accessToken?: string | null;
    error?: string | null;
    lastEvent?: string | null;
    reason?: string;
  }
) {
  const nextUser = details?.user === undefined ? _snapshot.user : details.user;
  const nextAccessToken = details?.accessToken === undefined ? _snapshot.accessToken : details.accessToken;

  _cachedAccessToken = nextAccessToken ?? null;
  emit({
    state,
    user: nextUser ?? null,
    accessToken: nextAccessToken ?? null,
    error: details?.error === undefined ? _snapshot.error : details.error,
    lastEvent: details?.lastEvent === undefined ? _snapshot.lastEvent : details.lastEvent,
  });

  log(`state -> ${state}`, {
    reason: details?.reason ?? 'n/a',
    lastEvent: details?.lastEvent ?? _snapshot.lastEvent,
    hasUser: Boolean(nextUser),
    hasToken: Boolean(nextAccessToken),
    error: details?.error ?? _snapshot.error,
  });
}

export function persistStoredSession(session: Session) {
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user: session.user,
        expires_at: session.expires_at,
      })
    );
  } catch {
    // ignore quota / SSR failures
  }
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore SSR failures
  }
}

export function readStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.access_token || !parsed?.refresh_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isAuthApiError(error: unknown): error is { message: string; status?: number; code?: string } {
  return Boolean(error) && typeof error === 'object' && 'message' in error;
}

async function recoverSession(reason: string): Promise<Session | null> {
  if (!supabase) return null;

  log('session recovery start', { reason });

  const current = await supabase.auth.getSession();
  if (current.data.session) {
    persistStoredSession(current.data.session);
    setSnapshot('authenticated', {
      reason: `${reason}:getSession`,
      user: current.data.session.user,
      accessToken: current.data.session.access_token,
      error: null,
    });
    return current.data.session;
  }

  const stored = readStoredSession();
  if (!stored) {
    setSnapshot('signed_out', {
      reason: `${reason}:no_stored_session`,
      user: null,
      accessToken: null,
      error: null,
    });
    return null;
  }

  setSnapshot('restoring_session', {
    reason: `${reason}:setSession`,
    user: stored.user ?? null,
    accessToken: null,
    error: null,
  });

  const restored = await supabase.auth.setSession({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
  });

  if (restored.error) {
    const errorMessage = restored.error.message || 'Failed to restore session';
    const shouldClearStoredSession = restored.error.status === 400 || restored.error.status === 401 || restored.error.status === 403;
    log('session recovery failed', { reason, error: errorMessage });
    if (shouldClearStoredSession) {
      clearStoredSession();
    }
    setSnapshot('restore_failed', {
      reason: `${reason}:setSession_failed`,
      user: null,
      accessToken: null,
      error: errorMessage,
    });
    return null;
  }

  if (restored.data.session) {
    persistStoredSession(restored.data.session);
    setSnapshot('authenticated', {
      reason: `${reason}:setSession_success`,
      user: restored.data.session.user,
      accessToken: restored.data.session.access_token,
      error: null,
    });
    return restored.data.session;
  }

  setSnapshot('signed_out', {
    reason: `${reason}:setSession_empty`,
    user: null,
    accessToken: null,
    error: null,
  });
  return null;
}

function startBootstrap() {
  if (!supabase || _bootstrapStarted) return;
  _bootstrapStarted = true;

  log('bootstrap start');
  setSnapshot('booting', { reason: 'bootstrap:start', user: readStoredSession()?.user ?? null, accessToken: null, error: null });

  supabase.auth.onAuthStateChange((event, session) => {
    log('auth event', {
      event,
      hasSession: Boolean(session),
      hasUser: Boolean(session?.user),
      hasToken: Boolean(session?.access_token),
    });

    if (event === 'SIGNED_OUT') {
      clearStoredSession();
      setSnapshot('signed_out', {
        reason: 'event:SIGNED_OUT',
        lastEvent: event,
        user: null,
        accessToken: null,
        error: null,
      });
      return;
    }

    if (session) {
      persistStoredSession(session);
      setSnapshot('authenticated', {
        reason: `event:${event}`,
        lastEvent: event,
        user: session.user,
        accessToken: session.access_token,
        error: null,
      });
      return;
    }

    if (event === 'INITIAL_SESSION') {
      if (_snapshot.state === 'booting' || _snapshot.state === 'restoring_session') return;
      if (readStoredSession()) {
        setSnapshot('restoring_session', {
          reason: 'event:INITIAL_SESSION_null_with_stored_session',
          lastEvent: event,
          accessToken: null,
        });
      } else {
        setSnapshot('signed_out', {
          reason: 'event:INITIAL_SESSION_null',
          lastEvent: event,
          user: null,
          accessToken: null,
          error: null,
        });
      }
    }
  });

  _bootstrapPromise = (async () => {
    try {
      await recoverSession('bootstrap');
    } catch (error: unknown) {
      const message = isAuthApiError(error) ? error.message : 'Unexpected auth bootstrap failure';
      log('bootstrap error', { error: message });
      setSnapshot('restore_failed', {
        reason: 'bootstrap:error',
        user: readStoredSession()?.user ?? null,
        accessToken: null,
        error: message,
      });
    } finally {
      log('bootstrap end', {
        state: _snapshot.state,
        hasUser: Boolean(_snapshot.user),
        hasToken: Boolean(_snapshot.accessToken),
      });
    }
  })();
}

startBootstrap();

export function getAccessToken(): string | null {
  if (_cachedAccessToken) return _cachedAccessToken;
  const stored = readStoredSession();
  if (stored?.access_token) {
    _cachedAccessToken = stored.access_token;
    return stored.access_token;
  }
  return null;
}

export function getAuthBootstrapSnapshot(): AuthBootstrapSnapshot {
  return _snapshot;
}

export function subscribeAuthBootstrap(listener: (snapshot: AuthBootstrapSnapshot) => void): () => void {
  listeners.add(listener);
  listener(_snapshot);
  return () => listeners.delete(listener);
}

export async function awaitAuthBootstrap(timeoutMs = 10_000): Promise<AuthBootstrapSnapshot> {
  if (_bootstrapPromise) {
    await _bootstrapPromise.catch(() => undefined);
  }

  const current = getAuthBootstrapSnapshot();
  if (current.state !== 'booting' && current.state !== 'restoring_session') {
    return current;
  }

  return new Promise<AuthBootstrapSnapshot>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Auth bootstrap timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const unsubscribe = subscribeAuthBootstrap((snapshot) => {
      if (snapshot.state === 'booting' || snapshot.state === 'restoring_session') return;
      clearTimeout(timeoutId);
      unsubscribe();
      resolve(snapshot);
    });
  });
}

export async function awaitAuthenticatedSession(timeoutMs = 12_000): Promise<Session | null> {
  if (!supabase) return null;

  const start = Date.now();
  log('await authenticated session start', { timeoutMs });

  const bootstrapSnapshot = await awaitAuthBootstrap(timeoutMs);
  if (bootstrapSnapshot.state === 'authenticated') {
    const current = await supabase.auth.getSession();
    if (current.data.session) {
      log('await authenticated session success', { elapsedMs: Date.now() - start, source: 'post-bootstrap getSession' });
      return current.data.session;
    }
  }

  if (bootstrapSnapshot.state === 'signed_out' && readStoredSession()) {
    const recovered = await recoverSession('awaitAuthenticatedSession');
    if (recovered) {
      log('await authenticated session success', { elapsedMs: Date.now() - start, source: 'recovery' });
      return recovered;
    }
  }

  const latest = await new Promise<AuthBootstrapSnapshot>((resolve) => {
    const current = getAuthBootstrapSnapshot();
    if (current.state === 'authenticated' || current.state === 'signed_out' || current.state === 'restore_failed') {
      resolve(current);
      return;
    }

    const remainingMs = Math.max(timeoutMs - (Date.now() - start), 0);
    const timeoutId = setTimeout(() => {
      unsubscribe();
      resolve(getAuthBootstrapSnapshot());
    }, remainingMs);

    const unsubscribe = subscribeAuthBootstrap((snapshot) => {
      if (snapshot.state === 'booting' || snapshot.state === 'restoring_session') return;
      clearTimeout(timeoutId);
      unsubscribe();
      resolve(snapshot);
    });
  });

  if (latest.state === 'authenticated') {
    const current = await supabase.auth.getSession();
    if (current.data.session) {
      log('await authenticated session success', { elapsedMs: Date.now() - start, source: 'wait-for-authenticated' });
      return current.data.session;
    }
  }

  log('await authenticated session end without session', {
    elapsedMs: Date.now() - start,
    finalState: latest.state,
    error: latest.error,
  });
  return null;
}

export async function ensureSupabaseSession(): Promise<string | null> {
  const session = await awaitAuthenticatedSession();
  return session?.access_token ?? null;
}

export const authReady = awaitAuthBootstrap().then(() => undefined).catch(() => undefined);
export function resolveAuthReady() {
  // Compatibility no-op. Auth readiness is controlled by the bootstrap state machine.
}
