
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured) {
  console.warn('Missing Supabase environment variables. Storage will not persist to cloud.');
}

// SSR-safe storage adapter that explicitly uses window.localStorage on the client
// and is a safe no-op on the server. This avoids issues with globalThis.localStorage
// being undefined during Next.js SSR and potentially breaking GoTrueClient internals.
const customStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  },
};

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: customStorage,
      },
    })
  : null;

// --- Manual session backup ---
// Supabase's built-in _recoverAndRefresh can fail silently in Next.js,
// so we keep a manual backup of the refresh token. On reload, if the
// built-in recovery returns no session, we attempt recovery ourselves.
const REFRESH_TOKEN_KEY = 'sb_manual_refresh_token';

// Keep the backup refresh token in sync with auth state changes.
// This listener lives for the lifetime of the page (no cleanup needed).
if (typeof window !== 'undefined' && supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.refresh_token) {
      window.localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
    } else if (_event === 'SIGNED_OUT') {
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  });
}

// authReady resolves once auth state is fully determined (including manual fallback).
// Components should await this before reading auth state to avoid race conditions.
export const authReady: Promise<void> = (async () => {
  if (typeof window === 'undefined' || !supabase) return;

  try {
    // Wait for Supabase's built-in session recovery (_initialize)
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return; // Built-in recovery worked

    // Fallback: attempt manual recovery from our backup refresh token
    const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (error || !data.session) {
        // Refresh token is invalid or expired — clean up
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
      // If successful, refreshSession() triggers onAuthStateChange internally,
      // so all listeners (Auth, useTasks, page) will be notified automatically.
    }
  } catch (e) {
    console.error('Auth recovery failed:', e);
  }
})();
