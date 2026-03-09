import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

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

type StoredSession = {
  access_token: string;
  refresh_token: string;
  user?: User;
  expires_at?: number;
};

// ── Cached access token ────────────────────────────────────────────────────
// Updated by onAuthStateChange below. DB functions read this synchronously
// instead of calling supabase.auth.getSession() which can deadlock.
let _cachedAccessToken: string | null = null;

/** Get the current access token (synchronous, never deadlocks). */
export function getAccessToken(): string | null {
  if (_cachedAccessToken) return _cachedAccessToken;
  const stored = readStoredSession();
  if (stored?.access_token) {
    _cachedAccessToken = stored.access_token;
    return stored.access_token;
  }
  return null;
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

export async function ensureSupabaseSession(): Promise<string | null> {
  if (!supabase) return null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await supabase.auth.getSession();
    const currentAccessToken = current.data.session?.access_token ?? null;
    if (currentAccessToken) {
      _cachedAccessToken = currentAccessToken;
      return currentAccessToken;
    }

    const stored = readStoredSession();
    if (stored) {
      const restored = await supabase.auth.setSession({
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
      });

      const restoredAccessToken = restored.data.session?.access_token ?? null;
      if (restoredAccessToken) {
        _cachedAccessToken = restoredAccessToken;
        return restoredAccessToken;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return null;
}

// ── Auth-ready promise ─────────────────────────────────────────────────────
let _resolveAuthReady: (() => void) | null = null;
export const authReady = new Promise<void>((resolve) => {
  _resolveAuthReady = resolve;
});
export function resolveAuthReady() {
  _resolveAuthReady?.();
}

// Single onAuthStateChange listener that:
// 1. Caches the access token for synchronous reads
// 2. Resolves authReady so hooks can start loading
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    _cachedAccessToken = session?.access_token ?? null;

    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      resolveAuthReady();
    }
  });
}
