'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { LayoutGrid, KanbanSquare } from 'lucide-react';
import { OnFileMark, OnFileWordmark } from '@/components/OnFileLogo';
import ThemeToggle from '@/components/ThemeToggle';
import LandingPager from '@/components/LandingPager';
import AppEntryLinkGuard from '@/components/AppEntryLinkGuard';
import { useTheme } from '@/lib/theme';

const Hyperspeed = dynamic(() => import('@/components/Hyperspeed'), { ssr: false });
const Carousel = dynamic(() => import('@/components/Carousel'), { ssr: false });

const WHY_ITEMS = [
  {
    id: 1,
    eyebrow: 'Why not a spreadsheet',
    title: 'Everything for one job, together',
    description:
      "A spreadsheet row can't hold the job description, the resume you sent, and their reply. Here it all lives on one card, so you're not digging through tabs.",
  },
  {
    id: 2,
    eyebrow: 'Fit score',
    title: 'See where you stand',
    description:
      'Each role gets a rough fit score from your bullets against theirs. Enough to tell a real match from a long shot before you sink an hour in.',
  },
  {
    id: 3,
    eyebrow: 'A small daily habit',
    title: 'A little each day',
    description:
      'A streak, a short daily list, and follow-ups drafted for you. The point is showing up for a few minutes a day, not one giant Sunday session.',
  },
];

const LOGO_MARQUEE = [
  'Atlassian',
  'Dropbox',
  'Duolingo',
  'GitHub',
  'Mercado Libre',
  'Microsoft',
  'Netflix',
  'Shopify',
  'Stripe',
  'Neo Financial',
];

// Module-level constant on purpose: Hyperspeed tears down and rebuilds its
// whole WebGL scene whenever this object's identity changes.
const HYPERSPEED_OPTIONS = {
  distortion: 'turbulentDistortion',
  length: 400,
  roadWidth: 10,
  islandWidth: 2,
  lanesPerRoad: 3,
  fov: 90,
  fovSpeedUp: 150,
  speedUp: 2,
  carLightsFade: 0.4,
  totalSideLightSticks: 20,
  lightPairsPerRoadWay: 40,
  shoulderLinesWidthPercentage: 0.05,
  brokenLinesWidthPercentage: 0.1,
  brokenLinesLengthPercentage: 0.5,
  lightStickWidth: [0.12, 0.5],
  lightStickHeight: [1.3, 1.7],
  movingAwaySpeed: [60, 80],
  movingCloserSpeed: [-120, -160],
  carLightsLength: [400 * 0.03, 400 * 0.2],
  carLightsRadius: [0.05, 0.14],
  carWidthPercentage: [0.3, 0.5],
  carShiftX: [-0.8, 0.8],
  carFloorSeparation: [0, 5],
  colors: {
    roadColor: 0x080808,
    islandColor: 0x0a0a0a,
    background: 0x000000,
    shoulderLines: 0x131318,
    brokenLines: 0x131318,
    leftCars: [0xd856bf, 0x6750a2, 0xc247ac],
    rightCars: [0x03b3c3, 0x0e5ea5, 0x324555],
    sticks: 0x03b3c3,
  },
};

const HERO_CARDS = [
  {
    href: '/prep',
    eyebrow: 'Interview prep',
    title: 'LeetCode, by company',
    sub: 'Questions companies asked in the last 6 months',
    cta: 'Open prep',
    image: '/hero/leetcode.png',
    backdrop: '#1a1a1a',
  },
  {
    href: '/resumes',
    eyebrow: 'Tailored resume',
    title: 'neo-financial.pdf',
    sub: 'Tailor your resume to the posting',
    cta: 'View resume',
    image: '/hero/resume.png',
    backdrop: '#ffffff',
  },
  {
    href: '/prep',
    eyebrow: 'Mock interview',
    title: 'Practice out loud',
    sub: 'Rehearse your answers before the real call',
    cta: 'Start a mock',
    image: '/hero/mock-interview.png',
    backdrop: '#e2f1f6',
  },
];

const LOOP_LINKS = [
  {
    href: '/dashboard',
    Icon: LayoutGrid,
    title: 'See what is due today',
    sub: 'Follow-ups, stage changes, and anything waiting on a reply.',
    cta: 'Open the dashboard',
  },
  {
    href: '/pipeline',
    Icon: KanbanSquare,
    title: 'Move jobs as they progress',
    sub: 'Drag a card from applied to interview to offer.',
    cta: 'Open the pipeline',
  },
];

const LOOP_STEPS = [
  {
    n: '01',
    title: 'Add',
    body: 'Paste a job link, set the company and role, done.',
    tint: 'var(--mint)',
    image: '/section-2/add-1.png',
  },
  {
    n: '02',
    title: 'Tailor',
    body: 'Copy your resume for one job and edit it there, with AI suggestions you can take or leave.',
    tint: 'var(--honey)',
    image: '/section-2/tailor-2.png',
  },
  {
    n: '03',
    title: 'Track',
    body: 'Drag each job through applied, interview, and offer, and note what they said.',
    tint: 'var(--blush)',
    image: '/section-2/track-3.png',
  },
  {
    n: '04',
    title: 'Prep',
    body: 'Search a company and see the questions it actually asks, most common first.',
    tint: 'var(--panel)',
    image: '/section-2/prep-4.png',
  },
];

const NAV_SECTIONS = [
  { label: 'Home', hash: null, page: 0 },
  { label: 'About', hash: 'loop', page: 1 },
  { label: 'Tour', hash: 'why', page: 2 },
];

const RADIUS_MIN = 380;
const RADIUS_MAX = 560;

export default function Landing() {
  const { isDark } = useTheme();
  const [activePage, setActivePage] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(520);
  const rootRef = useRef(null);
  const pagerRef = useRef(null);
  const heroRef = useRef(null);
  const glowRef = useRef(null);
  const gridRef = useRef(null);

  const goPage = (n, hash) => (e) => {
    e.preventDefault();
    const pager = pagerRef.current;
    if (!pager) return;
    if (pager.page !== n) {
      pager.goTo(n);
      return;
    }
    // Already on that page: goTo() is a no-op, so honour the anchor ourselves.
    const target = hash ? document.getElementById(hash) : null;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else document.querySelector('.ls-land-page.is-active .ls-land-inner')?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  useEffect(() => {
    // Give the circle whatever height the rest of the Tour page leaves over,
    // measured from the real layout so it tracks the CSS at every screen size.
    const fit = () => {
      const page = document.getElementById('why');
      const inner = page?.querySelector('.ls-land-inner');
      const wrap = page?.querySelector('.of-why-carousel');
      let room = window.innerHeight - 390;
      if (page && inner && wrap) {
        const cs = getComputedStyle(page);
        const avail = page.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        room = avail - (inner.scrollHeight - wrap.offsetHeight) - 8;
      }
      // 258 was too tight for the longer Tour card descriptions to fit inside
      // a true circle (border-radius: 50% clips well before the padding
      // box's own edges) — 300 gives the text enough room even on short
      // laptop-height windows. Only raise the floor when the viewport is
      // actually wide enough for it, though — on a narrow phone, forcing
      // 300px would push the circle past the screen edges, which is its
      // own version of "cut off".
      const widthCap = Math.min(520, window.innerWidth - 72);
      // `room` is a real DOM measurement of what's actually left over on
      // THIS page (it already accounts for the footer/gaps/CTA that come
      // back at full size once the >820px-tall "compact" breakpoint stops
      // applying). Flooring the circle at 300px regardless of `room` meant
      // that on taller screens, where the returning footer/gaps eat into
      // the leftover space, the circle could be forced bigger than the
      // room actually available -- pushing its bottom (and the text inside
      // it) past the visible page into the ls-land-inner scroll area, which
      // has its scrollbar deliberately hidden, so it just reads as "cut
      // off". A too-small circle is a minor look; an overflowing one loses
      // content, so let `room` win below 300 too, with a lower hard floor
      // only to stop it collapsing to nothing.
      setCarouselWidth(widthCap < 300 ? widthCap : Math.min(widthCap, Math.max(220, room)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const tint = getComputedStyle(document.documentElement).getPropertyValue('--hero-tint').trim() || '#cfe9d4';

    const paint = (x, y, on) => {
      const g = glowRef.current;
      const grid = gridRef.current;
      const r = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, window.innerWidth * 0.34));
      const spot = (cx, cy) => `radial-gradient(${r}px circle at ${cx}px ${cy}px, ${tint}99, ${tint}40 42%, rgba(255,255,255,0) 72%)`;
      const mask = (cx, cy) =>
        `radial-gradient(${r * 0.9}px circle at ${cx}px ${cy}px, rgba(0,0,0,.95) 0%, rgba(0,0,0,.35) 45%, rgba(0,0,0,0) 72%)`;
      const show = on ? '1' : '0';

      if (g) {
        g.style.background = spot(x, y);
        g.style.opacity = show;
        g.style.transition = 'opacity .45s ease';
      }
      if (grid) {
        grid.style.maskImage = grid.style.webkitMaskImage = mask(x, y);
        grid.style.opacity = show;
        grid.style.transition = 'opacity .45s ease';
      }
    };

    const rest = () => paint(window.innerWidth * 0.42, window.innerHeight * 0.45, false);
    const move = (e) => paint(e.clientX, e.clientY, true);

    if (!isDark) {
      rest();
      window.addEventListener('pointermove', move);
      window.addEventListener('resize', rest);
      document.addEventListener('pointerleave', rest);
    }

    const cardCleanups = [];
    root.querySelectorAll('[data-card]').forEach((card) => {
      const onMove = (e) => {
        const b = card.getBoundingClientRect();
        const px = (e.clientX - b.left) / b.width;
        const py = (e.clientY - b.top) / b.height;
        card.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 4}deg) rotateY(${(px - 0.5) * 5}deg) translateY(-6px) scale(1.02)`;
        card.style.boxShadow = 'var(--shadow-lift)';
        card.style.backgroundImage = isDark
          ? 'none'
          : `radial-gradient(420px circle at ${px * 100}% ${py * 100}%, color-mix(in srgb, var(--hero-tint) 35%, transparent), transparent 70%)`;
        card.style.transition = 'box-shadow .3s ease, border-color .3s ease';
      };
      const onLeave = () => {
        card.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1), box-shadow .5s ease, background-image .5s ease';
        card.style.transform = '';
        card.style.boxShadow = '';
        card.style.backgroundImage = 'none';
      };
      card.addEventListener('pointermove', onMove);
      card.addEventListener('pointerleave', onLeave);
      cardCleanups.push(() => {
        card.removeEventListener('pointermove', onMove);
        card.removeEventListener('pointerleave', onLeave);
      });
    });

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('resize', rest);
      document.removeEventListener('pointerleave', rest);
      cardCleanups.forEach((fn) => fn());
    };
  }, [isDark]);

  const gridBg = {
    backgroundImage:
      'linear-gradient(var(--grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--grid-line) 1px,transparent 1px)',
    backgroundSize: '56px 56px',
  };

  return (
    <div ref={rootRef} className="bg-paper text-ink transition-colors duration-300" style={{ maxWidth: 1720, margin: '0 auto' }}>
      <AppEntryLinkGuard />

      {/* Dark mode gets the Hyperspeed road; light mode keeps the grid
          spotlight. Two full-screen ambient effects at once just fight. */}
      {isDark ? (
        <div className="of-hyperspeed" aria-hidden>
          <Hyperspeed effectOptions={HYPERSPEED_OPTIONS} />
        </div>
      ) : (
        <>
          <div aria-hidden ref={gridRef} style={{ position: 'fixed', inset: 0, ...gridBg, pointerEvents: 'none', zIndex: 0 }} />
          <div aria-hidden ref={glowRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }} />
        </>
      )}
      <header
        className="of-nav"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          padding: '16px 28px',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          maxWidth: 1720,
          margin: '0 auto',
          backgroundColor: 'transparent',
          zIndex: 50,
        }}
      >
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 11, flex: 1 }}>
          <button type="button" onClick={goPage(0)} style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }}>
            <OnFileMark size={32} animated />
            <OnFileWordmark size={21} animated />
          </button>
        </div>

        <nav
          className="of-nav-pills"
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: 6,
            borderRadius: 999,
            background: 'var(--card-bg)',
            boxShadow: 'var(--nav-shadow)',
            fontSize: 14,
          }}
        >
          {NAV_SECTIONS.map(({ label, hash, page }) => {
            const active = activePage === page;
            return (
              <a
                key={label}
                href={hash ? `#${hash}` : '#hero'}
                onClick={goPage(page, hash)}
                aria-current={active ? 'true' : undefined}
                className={active ? 'lp-dark' : 'lp-navlink of-nav-link'}
                style={
                  active
                    ? { padding: '9px 18px', borderRadius: 999, background: 'var(--ink)', color: 'var(--paper)', fontWeight: 500 }
                    : { padding: '9px 17px', borderRadius: 999, color: 'var(--ink)' }
                }
              >
                {label}
              </a>
            );
          })}
        </nav>

        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <ThemeToggle />
        </div>
      </header>

      <LandingPager ref={pagerRef} labels={['Hero', 'The loop', 'Why']} onPageChange={setActivePage}>
        {/* Page 0 — Hero */}
        <section className="ls-land-page">
          <div className="ls-land-inner">
            <div ref={heroRef} style={{ position: 'relative', overflow: 'hidden', padding: '8px 12px 0' }}>
              <div className="of-hero-grid">
                <div className="of-hero-title">
                  <h1>
                    Every application, from{' '}
                    <span style={{ position: 'relative', display: 'inline-block', isolation: 'isolate' }}>
                      <span style={{ position: 'absolute', left: -6, right: -8, top: '16%', bottom: '8%', background: 'var(--hl-mint)', borderRadius: '12px 16px 14px 10px', zIndex: 0 }} />
                      <span style={{ position: 'relative', zIndex: 1, color: 'var(--hl-ink)' }}>applied</span>
                    </span>{' '}
                    to{' '}
                    <span style={{ position: 'relative', display: 'inline-block' }}>
                      offer
                      <span style={{ position: 'absolute', left: 0, right: -4, bottom: -2, height: 8, background: 'var(--hl-honey)', borderRadius: 999, transform: 'rotate(-.6deg)' }} />
                    </span>
                  </h1>
                </div>

                <div className="of-hero-deck">
                  {HERO_CARDS.map((card, i) => (
                    <HeroCard key={card.href} {...card} index={i} />
                  ))}
                </div>

                <div className="of-hero-action">
                  <Link href="/dashboard" className="of-hero-cta">
                    <span>Get started</span>
                    <span className="of-hero-arrow" aria-hidden>
                      →
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Page 1 — The loop + metrics */}
        <section className="ls-land-page" id="loop">
          <div className="ls-land-inner" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(28px,4vw,40px)' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 'clamp(22px,2.1vw,33px)', lineHeight: 1.2, letterSpacing: '-.01em', margin: '0 0 30px', textAlign: 'center' }}>
                One place for your entire job hunt.
                <span style={{ display: 'block', color: 'var(--ink-soft)' }}>
                  Made so you go from applied to offer without losing the thread.
                </span>
              </h2>
              <LoopSteps running={activePage === 1} />
            </div>
          </div>
        </section>

        {/* Page 2 — Why + tour + footer */}
        <section className="ls-land-page" id="why">
          <div className="ls-land-inner of-why-stack">
            <div className="of-why-split">
              <div className="of-why-carousel">
                <Carousel items={WHY_ITEMS} baseWidth={carouselWidth} round autoplay autoplayDelay={4200} pauseOnHover loop />
              </div>
              <div className="of-why-side">
                <Link href="/dashboard" className="of-hero-cta">
                  <span>Take a tour</span>
                  <span className="of-hero-arrow" aria-hidden>
                    →
                  </span>
                </Link>
              </div>
            </div>

            <div className="of-logos" aria-hidden>
              <div className="of-logos-track">
                {[...LOGO_MARQUEE, ...LOGO_MARQUEE].map((name, i) => (
                  <span key={`${name}-${i}`} className="of-logo">
                    {name}
                  </span>
                ))}
              </div>
            </div>

            <footer className="of-footer" />
          </div>
        </section>
      </LandingPager>

    </div>
  );
}

function HeroCard({ href, eyebrow, title, sub, cta, image, backdrop, index }) {
  return (
    <Link href={href} className="of-hero-card" style={{ '--i': index }}>
      <span
        className="of-hero-art"
        style={{ backgroundImage: `url(${image})`, backgroundColor: backdrop }}
        aria-hidden
      />
      <span className="of-hero-meta">
        <span className="of-hero-eyebrow">{eyebrow}</span>
        <span className="of-hero-name">{title}</span>
        <span className="of-hero-sub">{sub}</span>
        <span className="of-hero-btn">{cta}</span>
      </span>
    </Link>
  );
}

function LoopSteps({ running }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setActive((a) => (a + 1) % LOOP_STEPS.length), 2600);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div className="of-loop-split">
      <div className="of-loop-rail">
          {LOOP_STEPS.map((step, i) => (
            <button
              key={step.n}
              type="button"
              onClick={() => setActive(i)}
              aria-label={step.title}
              aria-current={i === active ? 'true' : undefined}
              className={`of-loop-dot${i === active ? ' is-on' : ''}`}
            />
          ))}
      </div>

      <div className="of-loop-cards">
          {LOOP_STEPS.map((step, i) => (
          <div key={step.n} className={`of-loop-card${i === active ? ' is-on' : ''}`}>
            <span
              className="of-loop-thumb"
              style={{ backgroundColor: step.tint, backgroundImage: `url(${step.image})` }}
              aria-hidden
            />
            <span className="of-loop-num">{step.n}</span>
            <h3 className="of-loop-title">{step.title}</h3>
            <p className="of-loop-body">{step.body}</p>
          </div>
        ))}
      </div>

      <div className="of-loop-links">
        {LOOP_LINKS.map(({ href, Icon, title, sub, cta }) => (
          <Link key={href} href={href} className="of-loop-link">
            <Icon size={24} strokeWidth={2.1} className="of-loop-link-icon" />
            <span className="of-loop-link-title">{title}</span>
            <span className="of-loop-link-sub">{sub}</span>
            <span className="of-loop-link-cta">
              {cta}
              <span className="of-loop-link-arrow" aria-hidden>
                →
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

