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
    render(
      <ThemeProvider>
        <div>Test</div>
      </ThemeProvider>
    );
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
    const { rerender } = render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    
    // Change to light
    const TestComponent = () => {
      const { setTheme } = useTheme();
      setTheme('light');
      return null;
    };
    rerender(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
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
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    
    // Click to cycle
    fireEvent.click(button);
    expect(localStorageMock.getItem('theme')).toBe('dark');
    
    fireEvent.click(button);
    expect(localStorageMock.getItem('theme')).toBe('system');
    
    fireEvent.click(button);
    expect(localStorageMock.getItem('theme')).toBe('light');
  });
});
