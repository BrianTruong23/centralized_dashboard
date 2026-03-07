'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured, SESSION_KEY, resolveAuthReady } from '@/lib/supabase';
import { User, Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';

function GoogleMark() {
  return (
    <span aria-hidden="true" className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-[11px] font-bold border border-gray-200">
      <span className="text-[#4285F4]">G</span>
    </span>
  );
}

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
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const authReadyFired = useRef(false);

  useEffect(() => {
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

  const handleGoogleSignIn = async () => {
    if (!supabase) {
      setError('Authentication is not configured');
      return;
    }

    setError(null);
    setIsGoogleLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err?.message ?? 'Google sign-in failed');
      setIsGoogleLoading(false);
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
        className="text-xs font-bold accent-solid-btn px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
      >
        Log In / Sign Up
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6 relative animate-in fade-in zoom-in-95 duration-200">
        <button 
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          ✕
        </button>
        
        <h2 className="text-xl font-bold mb-1 text-gray-900 dark:text-gray-100">{isSignUp ? 'Create Account' : 'Welcome Back'}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {isSignUp ? 'Sign up to sync your tasks across devices.' : 'Log in to access your synchronized tasks.'}
        </p>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isAuthProcessing || isGoogleLoading}
          className="w-full mb-4 border border-gray-300 dark:border-gray-600 bg-white text-gray-800 dark:text-gray-100 font-semibold py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
        >
          {(isAuthProcessing || isGoogleLoading) ? <Loader2 size={16} className="animate-spin" /> : <GoogleMark />}
          <span className="text-[#1f1f1f] dark:text-gray-100">Sign in with Google</span>
        </button>

        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-200 dark:border-gray-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-gray-900 px-2 text-gray-500 dark:text-gray-400">or</span>
          </div>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-fixed-focus w-full text-sm px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus-visible:outline-none focus:ring-2 focus-visible:ring-2 focus:ring-black/30 focus-visible:ring-black/30 focus:border-black focus-visible:border-black"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-fixed-focus w-full text-sm px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus-visible:outline-none focus:ring-2 focus-visible:ring-2 focus:ring-black/30 focus-visible:ring-black/30 focus:border-black focus-visible:border-black"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-900/50">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isAuthProcessing || isGoogleLoading}
            className="w-full bg-gray-900 dark:bg-white text-white dark:text-black font-bold py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isAuthProcessing ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Log In')}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-black dark:text-white font-bold hover:underline"
          >
            {isSignUp ? 'Log In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
}
