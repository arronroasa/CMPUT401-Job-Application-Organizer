'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnFileMark, OnFileWordmark } from './OnFileLogo';
import { APP_SECTIONS } from '@/lib/nav';

const Ctx = createContext(null);

// Timings tuned against the ofIcon/ofDoc/ofSpark/ofLetter keyframes in
// globals.css: by ~2.3s the mark, doc and wordmark have all settled and the
// sparks are in their steady (non-flickering) state, so that's where we cut.
const FADE_IN = 200;
const LOGO_HOLD = 2300;
const FADE_OUT = 380;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function AppEntryTransitionProvider({ children }) {
  const router = useRouter();
  const [phase, setPhase] = useState('idle'); // idle | in | hold | out
  const [logoKey, setLogoKey] = useState(0);
  const busy = useRef(false);
  const timers = useRef([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const enter = useCallback(
    (href) => {
      if (busy.current) return;
      busy.current = true;
      clearTimers();
      setLogoKey((k) => k + 1);
      setPhase('in');

      const reduced = prefersReducedMotion();
      const fadeIn = reduced ? 0 : FADE_IN;
      const hold = reduced ? 0 : LOGO_HOLD;
      const fadeOut = reduced ? 0 : FADE_OUT;

      timers.current.push(
        setTimeout(() => {
          router.push(href);
          setPhase('hold');

          timers.current.push(
            setTimeout(() => {
              setPhase('out');

              timers.current.push(
                setTimeout(() => {
                  setPhase('idle');
                  busy.current = false;
                }, fadeOut)
              );
            }, hold)
          );
        }, fadeIn)
      );
    },
    [clearTimers, router]
  );

  const visible = phase !== 'idle';
  const opaque = phase === 'in' || phase === 'hold';
  const duration = phase === 'out' ? FADE_OUT : FADE_IN;

  return (
    <Ctx.Provider value={enter}>
      {children}
      <div
        aria-hidden={!visible}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          background: 'var(--paper)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: opaque ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transition: `opacity ${duration}ms ease`,
        }}
      >
        {visible && (
          <div key={logoKey} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <OnFileMark size={72} animated />
            <OnFileWordmark size={38} animated />
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export function useAppEntryTransition() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppEntryTransition must be used within AppEntryTransitionProvider');
  return ctx;
}

export function isAppRoute(href) {
  if (!href || typeof href !== 'string') return false;
  const path = href.split('#')[0].split('?')[0];
  return APP_SECTIONS.some((s) => path === s.href || path.startsWith(`${s.href}/`));
}