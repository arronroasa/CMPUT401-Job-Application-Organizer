'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme, ready } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      suppressHydrationWarning
    >
      {!ready ? (
        <Sun size={16} strokeWidth={1.9} />
      ) : isDark ? (
        <Sun size={16} strokeWidth={1.9} />
      ) : (
        <Moon size={16} strokeWidth={1.9} />
      )}
    </button>
  );
}
