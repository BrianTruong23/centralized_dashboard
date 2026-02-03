import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, useTheme } from './theme';
import { ThemeToggle } from '@/components/ThemeToggle';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: query === '(prefers-color-scheme: dark)',
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorageMock.clear();
    document.documentElement.classList.remove('dark');
  });

  it('should default to system theme', () => {
    // Mock matchMedia to return false (light mode) for this test
    const mockMatchMedia = jest.fn().mockImplementation(query => ({
      matches: false, // System prefers light
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia,
    });

    render(
      <ThemeProvider>
        <div>Test</div>
      </ThemeProvider>
    );
    // System theme with light preference should not have dark class
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should load theme from localStorage', () => {
    localStorageMock.setItem('theme', 'dark');
    render(
      <ThemeProvider>
        <div>Test</div>
      </ThemeProvider>
    );
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should apply dark class when theme is dark', () => {
    localStorageMock.setItem('theme', 'dark');
    render(
      <ThemeProvider>
        <div>Test</div>
      </ThemeProvider>
    );
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should remove dark class when theme is light', () => {
    localStorageMock.setItem('theme', 'dark');
    
    // Component that can change theme via button
    const TestComponent = () => {
      const { setTheme } = useTheme();
      return (
        <button onClick={() => setTheme('light')} data-testid="change-theme">
          Change to Light
        </button>
      );
    };
    
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    
    // Initially should be dark
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    
    // Click button to change to light
    const button = screen.getByTestId('change-theme');
    fireEvent.click(button);
    
    // Should remove dark class
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('useTheme', () => {
  it('should throw error when used outside ThemeProvider', () => {
    const TestComponent = () => {
      useTheme();
      return null;
    };
    expect(() => render(<TestComponent />)).toThrow('useTheme must be used within a ThemeProvider');
  });

  it('should provide theme state', () => {
    const TestComponent = () => {
      const { theme, resolvedTheme } = useTheme();
      return <div>{theme} - {resolvedTheme}</div>;
    };
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    expect(screen.getByText(/system|light|dark/)).toBeInTheDocument();
  });
});

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should cycle through themes', () => {
    // Start with system theme (default)
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    
    // Click to cycle: system -> light -> dark -> system
    fireEvent.click(button);
    expect(localStorageMock.getItem('theme')).toBe('light');
    
    fireEvent.click(button);
    expect(localStorageMock.getItem('theme')).toBe('dark');
    
    fireEvent.click(button);
    expect(localStorageMock.getItem('theme')).toBe('system');
  });
});
