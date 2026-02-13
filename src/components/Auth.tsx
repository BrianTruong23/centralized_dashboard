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
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    // Check for OAuth errors in URL params
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    if (authError) {
      const errorMsg = decodeURIComponent(authError);
      if (errorMsg === 'access_denied') {
        setError('You cancelled Google sign-in. Please try again or use email/password.');
      } else {
        setError('Sign-in failed. Please try again or contact support.');
      }
      setIsOpen(true);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }

    // No Supabase → resolve immediately so other hooks proceed
    if (!supabase) {
      setIsCheckingSession(false);
      if (!authReadyFired.current) { authReadyFired.current = true; resolveAuthReady(); }
      return;
    }

    const client = supabase;

    // 1. Instant restore from localStorage (synchronous, no network)
    const cached = readSession();
    if (cached?.user) {
      setUser(cached.user);
      setIsCheckingSession(false); // show email immediately
    }

    // 2. Validate / refresh tokens in the background
    (async () => {
      try {
        if (cached?.access_token && cached?.refresh_token) {
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

    // 3. Keep localStorage in sync for token refreshes / sign-outs
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

    setIsGoogleLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes('popup')) {
          setError('Pop-ups are blocked. Please enable them and try again.');
        } else if (error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('fetch')) {
          setError('Unable to connect. Check your internet and try again.');
        } else {
          setError('Google sign-in is temporarily unavailable. Please use email/password.');
        }
        setIsGoogleLoading(false);
      }
      // If no error, browser will redirect; don't reset loading state
    } catch (err: any) {
      setError('Something went wrong. Please try again or contact support.');
      setIsGoogleLoading(false);
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

        {/* Google Sign-In Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading || isAuthProcessing}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGoogleLoading ? (
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              <path fill="none" d="M0 0h48v48H0z"/>
            </svg>
          )}
          <span>{isGoogleLoading ? 'Signing in with Google...' : 'Continue with Google'}</span>
        </button>

        {/* Divider */}
        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

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
