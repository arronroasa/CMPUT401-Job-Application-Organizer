'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { APP_SECTIONS, neighborSection, sectionIndex } from '@/lib/nav';

const EDGE = 220;

function getScroller(root) {
  if (!root) return document.scrollingElement || document.documentElement;
  const style = getComputedStyle(root);
  if (/(auto|scroll)/.test(style.overflowY) && root.scrollHeight > root.clientHeight + 4) {
    return root;
  }
  return document.scrollingElement || document.documentElement;
}

function atBottom(el) {
  const vh = el === document.documentElement || el === document.body ? window.innerHeight : el.clientHeight;
  return el.scrollTop + vh >= el.scrollHeight - 16;
}

function atTop(el) {
  return el.scrollTop <= 4;
}

/**
 * Edge-swipe between app tabs + bottom "keep scrolling" progress + section dots.
 */
export default function SectionSwipe({ scrollRef }) {
  const pathname = usePathname();
  const router = useRouter();
  const [edge, setEdge] = useState(0);
  const acc = useRef(0);
  const busy = useRef(false);
  const lastNav = useRef(0);
  const touchY = useRef(null);

  const idx = sectionIndex(pathname);
  const next = neighborSection(pathname, 1);
  const prev = neighborSection(pathname, -1);

  const go = useCallback(
    (href) => {
      if (!href || busy.current) return;
      if (Date.now() - lastNav.current < 550) return;
      busy.current = true;
      lastNav.current = Date.now();
      acc.current = 0;
      setEdge(0);
      router.push(href);
      setTimeout(() => {
        busy.current = false;
      }, 520);
    },
    [router]
  );

  const pushEdge = useCallback(
    (dir, amount) => {
      if (busy.current || idx < 0) return;
      const root = scrollRef?.current || document.querySelector('[data-app-scroll]');
      const scroller = getScroller(root);
      if (dir > 0) {
        if (atBottom(scroller) || acc.current > 0) acc.current = Math.max(0, acc.current + amount);
        else {
          acc.current = 0;
          setEdge(0);
          return;
        }
      } else {
        if (atTop(scroller) || acc.current < 0) acc.current = Math.min(0, acc.current - amount);
        else {
          acc.current = 0;
          setEdge(0);
          return;
        }
      }
      const a = Math.abs(acc.current);
      setEdge(Math.min(1, a / EDGE));
      if (a >= EDGE) {
        const target = neighborSection(pathname, dir > 0 ? 1 : -1);
        if (target) go(target.href);
      }
    },
    [go, idx, pathname, scrollRef]
  );

  useEffect(() => {
    acc.current = 0;
    setEdge(0);
  }, [pathname]);

  useEffect(() => {
    if (idx < 0) return undefined;

    const onWheel = (e) => {
      if (Math.abs(e.deltaY) < 2) return;
      const root = scrollRef?.current || document.querySelector('[data-app-scroll]');
      const scroller = getScroller(root);
      const down = e.deltaY > 0;
      const pulling = acc.current !== 0 || edge > 0.02;
      const onEdge = (down && atBottom(scroller)) || (!down && atTop(scroller));
      if (onEdge || pulling) {
        e.preventDefault();
        pushEdge(down ? 1 : -1, Math.min(70, Math.abs(e.deltaY)));
      }
    };

    const onTouchStart = (e) => {
      touchY.current = e.touches[0].clientY;
    };
    const onTouchMove = (e) => {
      if (touchY.current == null) return;
      const y = e.touches[0].clientY;
      const d = touchY.current - y;
      touchY.current = y;
      if (Math.abs(d) < 1) return;
      const root = scrollRef?.current || document.querySelector('[data-app-scroll]');
      const scroller = getScroller(root);
      const down = d > 0;
      const pulling = acc.current !== 0 || edge > 0.02;
      const onEdge = (down && atBottom(scroller)) || (!down && atTop(scroller));
      if (onEdge || pulling) {
        if (e.cancelable) e.preventDefault();
        pushEdge(down ? 1 : -1, Math.abs(d) * 1.5);
      }
    };
    const onTouchEnd = () => {
      touchY.current = null;
      setTimeout(() => {
        if (!busy.current) {
          acc.current = 0;
          setEdge(0);
        }
      }, 500);
    };

    const onKey = (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        if (next) go(next.href);
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        if (prev) go(prev.href);
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKey);
    };
  }, [edge, go, idx, next, prev, pushEdge, scrollRef]);

  if (idx < 0 || !next) return null;

  return (
    <>
      {/* Keep scrolling cue */}
      <div className="flex flex-col items-center gap-2.5 pt-10 pb-6 px-4">
        <div className="h-px w-[min(420px,70%)] bg-gradient-to-r from-transparent via-line to-transparent" />
        <button
          type="button"
          onClick={() => go(next.href)}
          className="flex flex-col items-center gap-2 px-4 py-2 text-inkFaint hover:text-ink transition-colors"
        >
          <span className="text-[11.5px] tracking-[0.06em] uppercase">Keep scrolling for {next.label}</span>
          <ChevronDown size={16} className="text-accent animate-[lsNudge_2.4s_ease-in-out_infinite]" />
          <span className="block w-[86px] h-0.5 rounded-full bg-panel overflow-hidden">
            <span
              className="block h-full bg-accent transition-[width] duration-100 linear"
              style={{ width: `${Math.round(edge * 100)}%` }}
            />
          </span>
        </button>
      </div>

      {/* Section dots */}
      <div className="fixed left-4 bottom-20 md:bottom-4 z-40 flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-surface/90 backdrop-blur-md border border-line shadow-card">
        <button
          type="button"
          className="p-1 text-inkSoft hover:text-ink hidden sm:inline-flex"
          onClick={() => prev && go(prev.href)}
          title="Previous section"
          aria-label="Previous section"
        >
          <ChevronLeft size={14} />
        </button>
        <div className="flex items-center gap-1.5">
          {APP_SECTIONS.map((s, i) => {
            const on = i === idx;
            return (
              <button
                key={s.href}
                type="button"
                title={s.label}
                onClick={() => go(s.href)}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: on ? 22 : 6,
                  background: on ? 'var(--accent)' : 'var(--ink-faint)',
                }}
              />
            );
          })}
        </div>
        <button
          type="button"
          className="p-1 text-inkSoft hover:text-ink hidden sm:inline-flex"
          onClick={() => go(next.href)}
          title="Next section"
          aria-label="Next section"
        >
          <ChevronRight size={14} />
        </button>
        <span className="hidden sm:inline text-[11px] text-inkFaint border-l border-line pl-2.5 whitespace-nowrap">
          {APP_SECTIONS[idx]?.label}
        </span>
      </div>
    </>
  );
}
