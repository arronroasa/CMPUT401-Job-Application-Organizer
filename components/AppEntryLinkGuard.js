'use client';

import { useEffect } from 'react';
import { isAppRoute, useAppEntryTransition } from './AppEntryTransition';

export default function AppEntryLinkGuard() {
  const enter = useAppEntryTransition();

  useEffect(() => {
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!isAppRoute(href)) return;

      e.preventDefault();
      e.stopPropagation();
      enter(href);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [enter]);

  return null;
}