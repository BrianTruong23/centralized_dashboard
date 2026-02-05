'use client';

import { useTheme } from '@/hooks/useTheme';
import { Moon, Sun, Monitor } from 'lucide-react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };

  const getIcon = () => {
    if (theme === 'light') return <Sun size={18} />;
    if (theme === 'dark') return <Moon size={18} />;
    return <Monitor size={18} />;
  };

  const getTooltip = () => {
    if (theme === 'light') return 'Light mode (click for dark)';
    if (theme === 'dark') return 'Dark mode (click for auto)';
    return 'Auto mode - follows your system theme';
  };

  return (
    <button
      onClick={cycleTheme}
      className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      aria-label={getTooltip()}
      title={getTooltip()}
    >
      {getIcon()}
    </button>
  );
}
