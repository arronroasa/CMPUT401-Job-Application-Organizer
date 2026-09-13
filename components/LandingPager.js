'use client';

import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

const LAND_COUNT = 3;
const LAND_EDGE = 72;
const TURN_MS = 780;
const COOLDOWN_MS = 820;

const HASH_TO_PAGE = {
  '': 0,
  hero: 0,
  loop: 1,
  why: 2,
  sources: 0,
  tour: 2,
};

const PAGE_TO_HASH = ['', 'loop', 'why'];

/**
 * Lodestar-style full-viewport page turns for the marketing landing.
 * Exposes goTo(page) via ref for nav links.
 */
const LandingPager = forwardRef(function LandingPager({ children, labels = ['Hero', 'The loop', 'Why'], onPageChange }, ref) {
  const [page, setPage] = useState(0);
  const [phase, setPhase] = useState(null); // { from, to, dir } while turning
  const pageRef = useRef(0);
  const busy = useRef(false);
  const acc = useRef(0);
  const accDir = useRef(0);
  const lastTurn = useRef(0);
  const touchY = useRef(null);
  const turnTimer = useRef(null);
  const notifyRef = useRef(onPageChange);
  notifyRef.current = onPageChange;

  const shownPage = phase ? phase.to : page;

  useEffect(() => {
    notifyRef.current?.(shownPage);
  }, [shownPage]);

  const syncHash = (to) => {
    const hash = PAGE_TO_HASH[to];
    const next = hash ? `#${hash}` : window.location.pathname;
    if (hash) {
      if (window.location.hash !== `#${hash}`) history.replaceState(null, '', `#${hash}`);
    } else if (window.location.hash) {
      history.replaceState(null, '', next);
    }
  };

  const goTo = useCallback((to) => {
    if (busy.current) return;
    const from = pageRef.current;
    if (to === from || to < 0 || to >= LAND_COUNT) return;

    const dir = to > from ? 1 : -1;
    busy.current = true;
    acc.current = 0;
    lastTurn.current = Date.now();
    setPhase({ from, to, dir });

    clearTimeout(turnTimer.current);
    turnTimer.current = setTimeout(() => {
      pageRef.current = to;
      setPage(to);
      setPhase(null);
      busy.current = false;
      syncHash(to);
    }, TURN_MS);
  }, []);

  useImperativeHandle(ref, () => ({ goTo, page }), [goTo, page]);

  const push = useCallback(
    (dir, amount) => {
      if (busy.current) return;
      const atStart = pageRef.current <= 0 && dir < 0;
      const atEnd = pageRef.current >= LAND_COUNT - 1 && dir > 0;
      if (atStart || atEnd) {
        acc.current = 0;
        return;
      }
      if (Date.now() - lastTurn.current < COOLDOWN_MS) return;
      if (accDir.current !== dir) acc.current = 0;
      accDir.current = dir;
      acc.current += amount;
      if (acc.current >= LAND_EDGE) {
        acc.current = 0;
        goTo(pageRef.current + dir);
      }
    },
    [goTo]
  );

  useEffect(() => {
    document.documentElement.classList.add('ls-land-lock');

    const hash = (window.location.hash || '').replace('#', '');
    if (hash in HASH_TO_PAGE) {
      const initial = HASH_TO_PAGE[hash];
      pageRef.current = initial;
      setPage(initial);
    }

    // A page taller than the viewport (phones, short windows) has to scroll
    // through its own content before a turn takes over.
    const canScroll = (target, dir) => {
      const inner = target && target.closest && target.closest('.ls-land-inner');
      if (!inner) return false;
      const max = inner.scrollHeight - inner.clientHeight;
      if (max <= 1) return false;
      return dir > 0 ? inner.scrollTop < max - 1 : inner.scrollTop > 1;
    };

    const onWheel = (e) => {
      if (Math.abs(e.deltaY) < 2) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      if (canScroll(e.target, dir)) return;
      e.preventDefault();
      push(dir, Math.min(70, Math.abs(e.deltaY)));
    };

    const onTouchStart = (e) => {
      touchY.current = e.touches[0].clientY;
      acc.current = 0;
    };
    const onTouchMove = (e) => {
      if (touchY.current == null) return;
      const y = e.touches[0].clientY;
      const d = touchY.current - y;
      touchY.current = y;
      if (Math.abs(d) < 1) return;
      const dir = d > 0 ? 1 : -1;
      if (canScroll(e.target, dir)) return;
      if (e.cancelable) e.preventDefault();
      push(dir, Math.abs(d) * 1.6);
    };
    const onTouchEnd = () => {
      touchY.current = null;
    };

    const onKey = (e) => {
      // Space activates a focused button/link — don't steal it for a page turn.
      if (e.key === ' ' && e.target?.closest?.('a,button,input,textarea,select')) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        goTo(pageRef.current + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goTo(pageRef.current - 1);
      }
    };

    const onHash = () => {
      const h = (window.location.hash || '').replace('#', '');
      if (h in HASH_TO_PAGE) goTo(HASH_TO_PAGE[h]);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onHash);

    return () => {
      document.documentElement.classList.remove('ls-land-lock');
      clearTimeout(turnTimer.current);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHash);
    };
  }, [goTo, push]);

  const pages = Children.map(children, (child, i) => {
    if (!isValidElement(child)) return child;
    let cls = 'ls-land-page';
    if (phase) {
      if (i === phase.from) cls += phase.dir > 0 ? ' is-leave-next' : ' is-leave-prev';
      else if (i === phase.to) cls += phase.dir > 0 ? ' is-enter-next' : ' is-enter-prev';
    } else if (i === page) {
      cls += ' is-active';
    }
    const prev = child.props.className || '';
    const merged = `${prev.replace(/\bls-land-page\b|\bis-active\b|\bis-leave-next\b|\bis-enter-next\b|\bis-leave-prev\b|\bis-enter-prev\b/g, '').trim()} ${cls}`.trim();
    return cloneElement(child, { className: merged, 'data-land-page': String(i) });
  });

  return (
    <div className="ls-landing-shell">
      <div className="ls-land-pages">{pages}</div>

      <div className="ls-land-dots" aria-label="Landing pages">
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`ls-land-dot${page === i && !phase ? ' is-on' : ''}${phase && phase.to === i ? ' is-on' : ''}`}
            title={label}
            aria-label={label}
            aria-current={page === i ? 'true' : undefined}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

    </div>
  );
});

export default LandingPager;
export { LAND_COUNT, HASH_TO_PAGE };
