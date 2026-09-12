'use client';

import { ThemeProvider } from '@/lib/theme';

/** Wraps the public landing (and any route outside the app shell) with theme. */
export default function ThemeRoot({ children }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
