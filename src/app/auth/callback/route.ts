import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');

  // User cancelled or Google rejected
  if (error) {
    return NextResponse.redirect(
      `${requestUrl.origin}/?auth_error=${encodeURIComponent(error_description || error)}`
    );
  }

  // Exchange code for session
  if (code) {
    try {
      const cookieStore = cookies();

      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name: string) {
              return cookieStore.get(name)?.value;
            },
            set(name: string, value: string, options: CookieOptions) {
              cookieStore.set({ name, value, ...options });
            },
            remove(name: string, options: CookieOptions) {
              cookieStore.set({ name, value: '', ...options });
            },
          },
        }
      );

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        console.error('[OAuth Callback] Session exchange failed:', exchangeError);
        return NextResponse.redirect(
          `${requestUrl.origin}/?auth_error=${encodeURIComponent('Failed to complete sign-in. Please try again.')}`
        );
      }
    } catch (err: any) {
      console.error('[OAuth Callback] Unexpected error:', err);
      return NextResponse.redirect(
        `${requestUrl.origin}/?auth_error=${encodeURIComponent('An unexpected error occurred. Please try again.')}`
      );
    }
  }

  // Redirect to home (session cookie is set by Supabase)
  return NextResponse.redirect(`${requestUrl.origin}/`);
}
