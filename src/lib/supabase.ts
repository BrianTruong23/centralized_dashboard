
import { createBrowserClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured) {
  console.warn('Missing Supabase environment variables. Storage will not persist to cloud.');
}

// Use createBrowserClient from @supabase/ssr for proper session persistence in Next.js.
// This handles the SSR/CSR boundary correctly using cookie-based storage,
// ensuring auth state survives page reloads.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createBrowserClient(supabaseUrl!, supabaseKey!)
  : null;
