'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
export type AccentPalette = 'neutral' | 'yellow' | 'blue' | 'red';

type PaletteTokens = {
  solid: string;
  solidForeground: string;
  soft: string;
  softForeground: string;
  border: string;
  ring: string;
  link: string;
  tagBg: string;
  tagFg: string;
};

const PALETTES: Record<AccentPalette, { label: string; light: PaletteTokens; dark: PaletteTokens }> = {
  neutral: {
    label: 'Neutral',
    light: {
      solid: '#171717',
      solidForeground: '#ffffff',
      soft: '#f5f5f5',
      softForeground: '#1f2937',
      border: '#d4d4d8',
      ring: '#525252',
      link: '#111827',
      tagBg: '#f5f5f5',
      tagFg: '#374151',
    },
    dark: {
      solid: '#f3f4f6',
      solidForeground: '#111827',
      soft: '#1f2937',
      softForeground: '#e5e7eb',
      border: '#374151',
      ring: '#d1d5db',
      link: '#e5e7eb',
      tagBg: '#1f2937',
      tagFg: '#e5e7eb',
    },
  },
  yellow: {
    label: 'Yellow',
    light: {
      solid: '#b45309',
      solidForeground: '#fffdf7',
      soft: '#fef3c7',
      softForeground: '#78350f',
      border: '#fcd34d',
      ring: '#d97706',
      link: '#b45309',
      tagBg: '#fffbeb',
      tagFg: '#92400e',
    },
    dark: {
      solid: '#fbbf24',
      solidForeground: '#1f2937',
      soft: '#422006',
      softForeground: '#fde68a',
      border: '#92400e',
      ring: '#fbbf24',
      link: '#fcd34d',
      tagBg: '#3b2a0a',
      tagFg: '#fcd34d',
    },
  },
  blue: {
    label: 'Blue',
    light: {
      solid: '#1d4ed8',
      solidForeground: '#eff6ff',
      soft: '#dbeafe',
      softForeground: '#1e3a8a',
      border: '#93c5fd',
      ring: '#2563eb',
      link: '#1d4ed8',
      tagBg: '#eff6ff',
      tagFg: '#1e40af',
    },
    dark: {
      solid: '#60a5fa',
      solidForeground: '#0f172a',
      soft: '#172554',
      softForeground: '#bfdbfe',
      border: '#1d4ed8',
      ring: '#60a5fa',
      link: '#93c5fd',
      tagBg: '#1e3a8a',
      tagFg: '#bfdbfe',
    },
  },
  red: {
    label: 'Red',
    light: {
      solid: '#b91c1c',
      solidForeground: '#fef2f2',
      soft: '#fee2e2',
      softForeground: '#7f1d1d',
      border: '#fca5a5',
      ring: '#dc2626',
      link: '#b91c1c',
      tagBg: '#fef2f2',
      tagFg: '#991b1b',
    },
    dark: {
      solid: '#f87171',
      solidForeground: '#1f2937',
      soft: '#450a0a',
      softForeground: '#fecaca',
      border: '#991b1b',
      ring: '#f87171',
      link: '#fca5a5',
      tagBg: '#4c1111',
      tagFg: '#fecaca',
    },
  },
};

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  palette: AccentPalette;
  setPalette: (palette: AccentPalette) => void;
  paletteOptions: Array<{ id: AccentPalette; label: string }>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [palette, setPaletteState] = useState<AccentPalette>('neutral');
  const [mounted, setMounted] = useState(false);

  const applyPalette = (nextPalette: AccentPalette, nextResolvedTheme: 'light' | 'dark') => {
    const root = document.documentElement;
    const tokens = PALETTES[nextPalette][nextResolvedTheme];
    root.style.setProperty('--accent-solid', tokens.solid);
    root.style.setProperty('--accent-solid-foreground', tokens.solidForeground);
    root.style.setProperty('--accent-soft', tokens.soft);
    root.style.setProperty('--accent-soft-foreground', tokens.softForeground);
    root.style.setProperty('--accent-border', tokens.border);
    root.style.setProperty('--accent-ring', tokens.ring);
    root.style.setProperty('--accent-link', tokens.link);
    root.style.setProperty('--accent-tag-bg', tokens.tagBg);
    root.style.setProperty('--accent-tag-fg', tokens.tagFg);
  };

  // Initialize theme on mount
  useEffect(() => {
    // Safety check for browser environment
    if (typeof window === 'undefined') return;

    try {
      // Load theme from localStorage
      const savedTheme = localStorage.getItem('theme') as Theme | null;
      const initialTheme = (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) 
        ? savedTheme 
        : 'system';
      const savedPalette = localStorage.getItem('accent_palette') as AccentPalette | null;
      const initialPalette = savedPalette && Object.keys(PALETTES).includes(savedPalette) ? savedPalette : 'neutral';
      
      setThemeState(initialTheme);
      setPaletteState(initialPalette);
      setMounted(true);

      // Apply initial theme immediately to prevent flash
      const getResolvedTheme = (): 'light' | 'dark' => {
        if (initialTheme === 'system') {
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return initialTheme;
      };

      const resolved = getResolvedTheme();
      setResolvedTheme(resolved);
      
      const root = document.documentElement;
      if (resolved === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      applyPalette(initialPalette, resolved);
    } catch (error) {
      console.error('Error initializing theme:', error);
      setMounted(true); // Still mark as mounted to prevent blocking
    }
  }, []);

  // Update theme when it changes
  useEffect(() => {
    if (!mounted) return;

    const getResolvedTheme = (): 'light' | 'dark' => {
      if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return theme;
    };

    const resolved = getResolvedTheme();
    setResolvedTheme(resolved);

    // Apply theme to document
    const root = document.documentElement;
    if (resolved === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    applyPalette(palette, resolved);

    // Listen for system theme changes
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        const newResolved = mediaQuery.matches ? 'dark' : 'light';
        setResolvedTheme(newResolved);
        if (newResolved === 'dark') {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme, palette, mounted]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const setPalette = (newPalette: AccentPalette) => {
    setPaletteState(newPalette);
    localStorage.setItem('accent_palette', newPalette);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, palette, setPalette, paletteOptions: (Object.keys(PALETTES) as AccentPalette[]).map((id) => ({ id, label: PALETTES[id].label })) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
