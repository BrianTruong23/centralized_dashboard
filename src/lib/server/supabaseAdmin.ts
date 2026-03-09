import { createClient, SupabaseClient } from '@supabase/supabase-js';

const clientsByToken = new Map<string, SupabaseClient>();

export function getSupabaseServerClient(accessToken: string): SupabaseClient {
  const cached = clientsByToken.get(accessToken);
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase anon client is not configured');
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  clientsByToken.set(accessToken, client);
  return client;
}
