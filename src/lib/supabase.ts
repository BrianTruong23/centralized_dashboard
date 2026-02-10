import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured) {
  console.warn('Missing Supabase environment variables. Storage will not persist to cloud.');
}

// We disable Supabase's built-in session persistence because its internal
// _recoverAndRefresh() silently fails in the Next.js SSR environment.
// Instead, we persist the tokens ourselves in localStorage and recover
// them manually on page load via setSession().
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        persistSession: false, // WE handle persistence ourselves
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

const SESSION_KEY = 'app_auth_session';

// Persist auth tokens on every auth state change (login, token refresh, logout).
if (typeof window !== 'undefined' && supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      window.localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        })
      );
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
  });
}

// Recover the session from our own localStorage on page load.
// setSession() handles expired access tokens by using the refresh token.
// All components should await this before reading auth state.
export const authReady: Promise<void> = (async () => {
  if (typeof window === 'undefined' || !supabase) return;

  const stored = window.localStorage.getItem(SESSION_KEY);
  if (!stored) return;

  try {
    const { access_token, refresh_token } = JSON.parse(stored);
    if (!access_token || !refresh_token) return;

    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) {
      // Tokens are invalid or revoked — clean up
      window.localStorage.removeItem(SESSION_KEY);
    }
  } catch (e) {
    console.error('Session recovery failed:', e);
    window.localStorage.removeItem(SESSION_KEY);
  }
})();
