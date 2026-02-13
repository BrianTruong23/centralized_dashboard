import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Auth } from '@/components/Auth';

const mockOnAuthStateChange = jest.fn();
const mockSignInWithOAuth = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      setSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
    },
  },
  isSupabaseConfigured: true,
  SESSION_KEY: 'app_auth_session',
  resolveAuthReady: jest.fn(),
}));

describe('Auth Google sign-in', () => {
  beforeEach(() => {
    localStorage.clear();
    mockSignInWithOAuth.mockReset();
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    mockOnAuthStateChange.mockReset();
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
  });

  it('shows Sign in with Google after opening auth modal', () => {
    render(<Auth />);
    fireEvent.click(screen.getByRole('button', { name: 'Log In / Sign Up' }));

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });

  it('calls Supabase OAuth with Google provider and redirect URL', async () => {
    render(<Auth />);
    fireEvent.click(screen.getByRole('button', { name: 'Log In / Sign Up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
    });
  });
});
