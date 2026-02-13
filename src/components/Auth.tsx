'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured, SESSION_KEY, resolveAuthReady } from '@/lib/supabase';
import { User, Session } from '@supabase/supabase-js';

// ── localStorage helpers ────────────────────────────────────────────
function persistSession(session: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: session.user,
      expires_at: session.expires_at,
    }));
  } catch { /* quota / SSR */ }
}

function dropSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* SSR */ }
}

function readSession(): {
  access_token: string;
  refresh_token: string;
  user: User;
  expires_at?: number;
} | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p?.access_token && p?.refresh_token && p?.user) return p;
    return null;
  } catch { return null; }
}

// ── Component ───────────────────────────────────────────────────────
export function Auth() {
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const authReadyFired = useRef(false);

  useEffect(() => {
    // Check for OAuth callback errors in URL
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const authError = params.get('auth_error');
      if (authError) {
        setError(decodeURIComponent(authError));
        setIsOpen(true);
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    // No Supabase → resolve immediately so other hooks proceed
    if (!supabase) {
      setIsCheckingSession(false);
      if (!authReadyFired.current) { authReadyFired.current = true; resolveAuthReady(); }
      return;
    }

    const client = supabase;

    // 1. Check for cookie-based session (from OAuth callback)
    const getCookie = (name: string) => {
      if (typeof document === 'undefined') return null;
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return null;
    };

    const accessToken = getCookie('sb-access-token');
    const refreshToken = getCookie('sb-refresh-token');

    if (accessToken && refreshToken) {
      // Restore session from cookies
      (async () => {
        try {
          const { data, error: err } = await client.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (err) {
            console.warn('Cookie session restore failed:', err.message);
          } else if (data.session) {
            persistSession(data.session);
            setUser(data.session.user);

            // Clear cookies after storing in localStorage
            document.cookie = 'sb-access-token=; path=/; max-age=0';
            document.cookie = 'sb-refresh-token=; path=/; max-age=0';
          }
        } catch (err) {
          console.warn('Cookie session error:', err);
        }
      })();
    }

    // 2. Instant restore from localStorage (synchronous, no network)
    const cached = readSession();
    if (cached?.user) {
      setUser(cached.user);
      setIsCheckingSession(false); // show email immediately
    }

    // 3. Validate / refresh tokens in the background
    (async () => {
      try {
        // Only validate if we have cached tokens and haven't already restored from cookies
        if (cached?.access_token && cached?.refresh_token && !accessToken) {
          const { data, error: err } = await client.auth.setSession({
            access_token: cached.access_token,
            refresh_token: cached.refresh_token,
          });
          if (err) {
            // Server explicitly rejected tokens → clear everything
            console.warn('Session recovery failed (auth error):', err.message);
            dropSession();
            setUser(null);
          } else if (data.session) {
            // console.log('Session restored successfully:', data.session.user.email);
            persistSession(data.session);
            setUser(data.session.user);
          }
        }
      } catch (err: any) {
        // Network error (Supabase unreachable) vs auth error
        const isNetworkError = err?.message?.includes('Failed to fetch')
          || err?.message?.includes('NetworkError')
          || err?.message?.includes('ERR_CONNECTION');
        if (isNetworkError && cached?.user) {
          // Keep cached user — tokens may still be valid when network returns
          console.warn('Session validation skipped (network down). Using cached user.');
        } else {
          console.warn('Session recovery error:', err);
          dropSession();
          setUser(null);
        }
      } finally {
        setIsCheckingSession(false);
        if (!authReadyFired.current) { authReadyFired.current = true; resolveAuthReady(); }
      }
    })();

    // 4. Keep localStorage in sync for token refreshes / sign-outs
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      // console.log('Auth state change:', event);
      if (event === 'SIGNED_OUT') {
        dropSession();
        setUser(null);
      } else if (session) {
        // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED
        persistSession(session);
        setUser(session.user);
      }
      // Ignore INITIAL_SESSION(null) fired by persistSession:false
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError('Authentication is not configured');
      return;
    }

    const supabaseClient = supabase;
    setIsAuthProcessing(true);
    setError(null);

    try {
      if (isSignUp) {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
        });
        if (error) throw error;

        if (data.session) {
          persistSession(data.session);
          // setUser(data.session.user); // onAuthStateChange handles this usually, but safe to set
          setIsOpen(false);
          setEmail('');
          setPassword('');
        } else if (data.user) {
          setError('Account created. Please check your email to confirm your account, or disable email confirmation in Supabase settings.');
        } else {
          setError('Account created but could not log in. Please try logging in.');
        }
      } else {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // Persist tokens immediately so reload works
        if (data.session) {
            persistSession(data.session);
            // Force user update immediately for better UX
            setUser(data.session.user);
        }
        setIsOpen(false);
        setEmail('');
        setPassword('');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAuthProcessing(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!supabase) {
      setError('Authentication is not configured');
      return;
    }

    setIsAuthProcessing(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      // OAuth redirect happens automatically - no need to manually handle
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
      setIsAuthProcessing(false);
    }
  };

  const handleLogout = async () => {
    if (!supabase) return;

    // Optimistic logout: clear state immediately
    dropSession();
    setUser(null);

    try {
        await supabase.auth.signOut();
    } catch (err) {
        console.warn('Supabase signOut failed (likely network), but local session cleared.', err);
    }
  };

  if (isCheckingSession) return <div className="text-xs text-gray-400">Loading auth...</div>;

  // Don't show auth UI if Supabase is not configured
  if (!isSupabaseConfigured) {
    return null;
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 hidden sm:inline">{user.email}</span>
        <button
          onClick={handleLogout}
          className="text-xs text-red-500 hover:text-red-600 transition-colors font-medium border border-red-100 bg-red-50 px-3 py-1.5 rounded-lg"
        >
          Log Out
        </button>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="text-xs font-bold bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
      >
        Log In / Sign Up
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 relative animate-in fade-in zoom-in-95 duration-200">
        <button 
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
        
        <h2 className="text-xl font-bold mb-1">{isSignUp ? 'Create Account' : 'Welcome Back'}</h2>
        <p className="text-sm text-gray-500 mb-6">
          {isSignUp ? 'Sign up to sync your tasks across devices.' : 'Log in to access your synchronized tasks.'}
        </p>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="text-xs text-red-500 bg-red-50 p-2 rounded border border-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isAuthProcessing}
            className="w-full bg-black text-white font-bold py-2.5 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {isAuthProcessing ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Log In')}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-gray-500">Or continue with</span>
          </div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={isAuthProcessing}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <div className="mt-6 text-center text-xs text-gray-500">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-black font-bold hover:underline"
          >
            {isSignUp ? 'Log In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
}
