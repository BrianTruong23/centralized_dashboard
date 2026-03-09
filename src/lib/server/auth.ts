import { createClient } from '@supabase/supabase-js';
import { writeDebugLog } from './debugLog';

export interface AuthUser {
  id: string;
  email?: string;
}

export async function getUserFromAccessToken(accessToken: string): Promise<AuthUser> {
  await writeDebugLog('calendar-finalize.log', 'auth.getUserFromAccessToken.start', {
    hasAccessToken: Boolean(accessToken),
    tokenPreview: accessToken ? `${accessToken.slice(0, 12)}...` : null,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase auth is not configured');
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data?.user) {
    await writeDebugLog('calendar-finalize.log', 'auth.getUserFromAccessToken.error', {
      error: error?.message ?? 'Unauthorized',
    });
    throw new Error('Unauthorized');
  }

  await writeDebugLog('calendar-finalize.log', 'auth.getUserFromAccessToken.success', {
    userId: data.user.id,
    email: data.user.email ?? null,
  });

  return {
    id: data.user.id,
    email: data.user.email ?? undefined,
  };
}
