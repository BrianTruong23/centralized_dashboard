import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');

  // Handle OAuth errors (user cancelled, network issues, etc.)
  if (error) {
    console.error('OAuth error:', error, error_description);
    return NextResponse.redirect(
      `${requestUrl.origin}?auth_error=${encodeURIComponent(error_description || error)}`
    );
  }

  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables');
      return NextResponse.redirect(
        `${requestUrl.origin}?auth_error=Configuration error`
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    try {
      // Exchange the code for a session
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        console.error('Code exchange error:', exchangeError);
        return NextResponse.redirect(
          `${requestUrl.origin}?auth_error=${encodeURIComponent(exchangeError.message)}`
        );
      }

      if (data.session) {
        // Session will be automatically stored by Supabase client
        // Redirect to home page on success
        return NextResponse.redirect(requestUrl.origin);
      }
    } catch (err: any) {
      console.error('Unexpected error during code exchange:', err);
      return NextResponse.redirect(
        `${requestUrl.origin}?auth_error=${encodeURIComponent(err.message || 'Authentication failed')}`
      );
    }
  }

  // No code or error present - shouldn't normally happen
  return NextResponse.redirect(
    `${requestUrl.origin}?auth_error=Invalid callback request`
  );
}
