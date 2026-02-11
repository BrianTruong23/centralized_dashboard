import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured) {
  console.warn('Missing Supabase environment variables. Storage will not persist to cloud.');
}

// persistSession: false — we handle token persistence ourselves in React
// components (useEffect) to guarantee client-side execution.
// Module-level side effects are unreliable in Next.js SSR.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
      },
    })
  : null;

// Key used to store auth tokens in localStorage
export const SESSION_KEY = 'app_auth_session';

// Auth-ready promise: resolved by the Auth component once session recovery
// is complete. Other components (useTasks, page) await this before making
// authenticated DB calls.
let _resolveAuthReady: (() => void) | null = null;
export const authReady = new Promise<void>((resolve) => {
  _resolveAuthReady = resolve;
});
export function resolveAuthReady() {
  _resolveAuthReady?.();
}
