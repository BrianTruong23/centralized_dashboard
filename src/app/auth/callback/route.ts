import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  // Handle OAuth errors (user cancelled, popup blocked, etc.)
  if (error) {
    console.error('OAuth error:', error, errorDescription);
    return NextResponse.redirect(
      `${requestUrl.origin}?auth_error=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${requestUrl.origin}?auth_error=${encodeURIComponent('No authorization code provided')}`
    );
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase configuration missing');
    return NextResponse.redirect(
      `${requestUrl.origin}?auth_error=${encodeURIComponent('Authentication not configured')}`
    );
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Exchange the OAuth code for a session
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('Code exchange error:', exchangeError);
      return NextResponse.redirect(
        `${requestUrl.origin}?auth_error=${encodeURIComponent(exchangeError.message)}`
      );
    }

    if (!data.session) {
      return NextResponse.redirect(
        `${requestUrl.origin}?auth_error=${encodeURIComponent('Failed to create session')}`
      );
    }

    // Upsert profile with Google user data
    const user = data.session.user;
    const userMetadata = user.user_metadata;

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            email: user.email,
            full_name: userMetadata?.full_name || userMetadata?.name || null,
            avatar_url: userMetadata?.avatar_url || userMetadata?.picture || null,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'id',
          }
        );

      if (profileError) {
        console.error('Profile upsert error:', profileError);
        // Don't fail the auth flow if profile update fails
      }
    } catch (profileErr) {
      console.error('Profile update failed:', profileErr);
      // Continue anyway - auth succeeded
    }

    // Redirect to home with session tokens in URL (client will store them)
    const response = NextResponse.redirect(requestUrl.origin);

    // Set session cookies for immediate auth state
    response.cookies.set('sb-access-token', data.session.access_token, {
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    response.cookies.set('sb-refresh-token', data.session.refresh_token, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (err: any) {
    console.error('Callback error:', err);
    return NextResponse.redirect(
      `${requestUrl.origin}?auth_error=${encodeURIComponent(err.message || 'Authentication failed')}`
    );
  }
}
