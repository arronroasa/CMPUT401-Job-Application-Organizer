'use client';

import { useEffect } from 'react';

export default function ScrollbarActivity() {
  useEffect(() => {
    let timeout;

    const onScroll = () => {
      document.documentElement.classList.add('is-scrolling');
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        document.documentElement.classList.remove('is-scrolling');
      }, 2000);
    };

    window.addEventListener('scroll', onScroll, { passive: true, capture: true });

    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      clearTimeout(timeout);
    };
  }, []);

  return null;
}