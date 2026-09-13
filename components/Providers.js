'use client';

import { StoreProvider } from '@/lib/store';
import AppShell from './AppShell';

export default function Providers({ children }) {
  return (
    <StoreProvider>
      <AppShell>{children}</AppShell>
    </StoreProvider>
  );
}
