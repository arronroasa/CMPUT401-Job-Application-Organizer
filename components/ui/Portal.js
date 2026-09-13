'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Renders children into document.body instead of in place.
//
// Why this exists: the page wrapper (.page-motion, see globals.css) sets
// `will-change: transform`, which makes any `position: fixed` descendant
// position itself relative to that wrapper's box instead of the real
// viewport. That made fixed-overlay modals drift down the page on long
// pages instead of staying centered on screen. Portaling to <body> sidesteps
// the issue entirely, regardless of what styling wraps the page in the future.
export default function Portal({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
