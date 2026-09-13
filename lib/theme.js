'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
  isDark: false,
});

const STORAGE_KEY = 'onfile-theme';

function applyTheme(value) {
  const root = document.documentElement;
  root.classList.add('theme-instant');
  root.classList.toggle('dark', value === 'dark');
  root.dataset.theme = value;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => root.classList.remove('theme-instant'));
  });
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initial = 'light';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') initial = stored;
      else if (window.matchMedia('(prefers-color-scheme: dark)').matches) initial = 'dark';
    } catch (_) {}
    setThemeState(initial);
    applyTheme(initial);
    setReady(true);
  }, []);

  const setTheme = useCallback((next) => {
    const value = next === 'dark' ? 'dark' : 'light';
    setThemeState(value);
    applyTheme(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (_) {}
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, isDark: theme === 'dark', ready }),
    [theme, setTheme, toggleTheme, ready]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
