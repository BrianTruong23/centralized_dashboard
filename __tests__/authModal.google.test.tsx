import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthModal } from '@/components/AuthModal';

const mockSignInWithOAuth = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
    },
  },
  resolveAuthReady: jest.fn(),
}));

describe('AuthModal Google sign-in', () => {
  beforeEach(() => {
    mockSignInWithOAuth.mockReset();
    mockSignInWithOAuth.mockResolvedValue({ error: null });
  });

  it('shows a Sign in with Google button when modal is open', () => {
    render(<AuthModal isOpen={true} onAuthSuccess={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });

  it('calls Supabase OAuth with the Google provider', async () => {
    render(<AuthModal isOpen={true} onAuthSuccess={jest.fn()} />);

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
