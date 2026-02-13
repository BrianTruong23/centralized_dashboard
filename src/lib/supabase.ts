import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

// ── Cached access token ────────────────────────────────────────────────────
// Updated by onAuthStateChange below. DB functions read this synchronously
// instead of calling supabase.auth.getSession() which can deadlock.
let _cachedAccessToken: string | null = null;

/** Get the current access token (synchronous, never deadlocks). */
export function getAccessToken(): string | null {
  return _cachedAccessToken;
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
