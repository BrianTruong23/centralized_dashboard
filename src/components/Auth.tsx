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
        if (data.session) persistSession(data.session);
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
    dropSession();
    await supabase.auth.signOut();
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
