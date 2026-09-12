'use client';

import Sidebar from './Sidebar';
import { useStore } from '@/lib/store';

export default function AppShell({ children }) {
  const { data } = useStore();

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-inkFaint text-sm">
        Loading TrackWise…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <Sidebar />
      <main className="flex-1 min-w-0 pb-20 md:pb-0">{children}</main>
    </div>
  );
}
