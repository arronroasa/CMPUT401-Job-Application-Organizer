'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { APP_SECTIONS, sectionIndex } from '@/lib/nav';

/**
 * Animates tab/page changes with Lodestar-style slide-in (up/down by direction).
 */
export default function PageMotion({ children }) {
  const pathname = usePathname();
  const prevPath = useRef(pathname);
  const [dir, setDir] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const from = sectionIndex(prevPath.current);
    const to = sectionIndex(pathname);
    let nextDir = 0;
    if (from >= 0 && to >= 0 && from !== to) {
      // shortest direction on the ring
      const forward = (to - from + APP_SECTIONS.length) % APP_SECTIONS.length;
      const backward = (from - to + APP_SECTIONS.length) % APP_SECTIONS.length;
      nextDir = forward <= backward ? 1 : -1;
    } else if (prevPath.current !== pathname) {
      nextDir = 1;
    }
    setDir(nextDir);
    setTick((t) => t + 1);
    prevPath.current = pathname;
    // Scroll main content to top on tab change
    const main = document.querySelector('[data-app-scroll]');
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [pathname]);

  const anim =
    dir > 0 ? 'lsInUp' : dir < 0 ? 'lsInDown' : 'lsIn';

  return (
    <div
      key={`${pathname}-${tick}`}
      className="page-motion"
      style={{ animation: `${anim} .48s cubic-bezier(.22,.8,.2,1) both` }}
    >
      {children}
    </div>
  );
}
