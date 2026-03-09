import { createClient } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email?: string;
}

export async function getUserFromAccessToken(accessToken: string): Promise<AuthUser> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase auth is not configured');
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data?.user) throw new Error('Unauthorized');

  return {
    id: data.user.id,
    email: data.user.email ?? undefined,
  };
}
