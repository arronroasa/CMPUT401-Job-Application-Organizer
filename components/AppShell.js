'use client';

import { useRef } from 'react';
import Sidebar from './Sidebar';
import PageMotion from './PageMotion';
import SectionSwipe from './SectionSwipe';
import { useStore } from '@/lib/store';

export default function AppShell({ children }) {
  const { data } = useStore();
  const scrollRef = useRef(null);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-inkFaint text-sm">
        Loading OnFile…
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row items-stretch overflow-hidden bg-paper">
      <Sidebar />
      <div
        ref={scrollRef}
        data-app-scroll
        className="flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-y-contain pb-28 md:pb-8"
      >
        <PageMotion>
          <main className="min-w-0">{children}</main>
          <SectionSwipe scrollRef={scrollRef} />
        </PageMotion>
      </div>
    </div>
  );
}
