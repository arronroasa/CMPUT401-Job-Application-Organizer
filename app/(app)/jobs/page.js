'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { OnFileMark, OnFileWordmark } from '@/components/OnFileLogo';
import ThemeToggle from '@/components/ThemeToggle';
import LandingPager from '@/components/LandingPager';
import AppEntryLinkGuard from '@/components/AppEntryLinkGuard';
import { useTheme } from '@/lib/theme';

const RADIUS = 380;

export default function Landing() {
  const { isDark } = useTheme();
  const rootRef = useRef(null);
  const pagerRef = useRef(null);
  const heroRef = useRef(null);
  const glowRef = useRef(null);
  const gridRef = useRef(null);
  const navGlowRef = useRef(null);
  const navGridRef = useRef(null);

  const goPage = (n) => (e) => {
    e.preventDefault();
    pagerRef.current?.goTo(n);
  };

  useEffect(() => {
    const root = rootRef.current;
    const hero = heroRef.current;
    if (!root || !hero) return;

    const tint = getComputedStyle(document.documentElement).getPropertyValue('--hero-tint').trim() || '#cfe9d4';

    const paint = (x, y, on) => {
      const g = glowRef.current;
      const grid = gridRef.current;
      const nav = navGlowRef.current;
      const r = RADIUS;
      if (nav) {
        const hb = hero.getBoundingClientRect();
        const nb = nav.getBoundingClientRect();
        const nx = x + (hb.left - nb.left);
        const ny = y + (hb.top - nb.top);
        nav.style.background = `radial-gradient(${r}px circle at ${nx}px ${ny}px, ${tint}99, ${tint}40 42%, rgba(255,255,255,0) 72%)`;
        nav.style.opacity = on ? '1' : '0';
        nav.style.transition = 'opacity .45s ease';
        const ng = navGridRef.current;
        if (ng) {
          ng.style.maskImage = ng.style.webkitMaskImage = `radial-gradient(${r * 0.9}px circle at ${nx}px ${ny}px, rgba(0,0,0,.95) 0%, rgba(0,0,0,.35) 45%, rgba(0,0,0,0) 72%)`;
          ng.style.opacity = on ? '1' : '0';
          ng.style.transition = 'opacity .45s ease';
        }
      }
      if (g) {
        g.style.background = `radial-gradient(${r}px circle at ${x}px ${y}px, ${tint}99, ${tint}40 42%, rgba(255,255,255,0) 72%)`;
        g.style.opacity = on ? '1' : '0';
        g.style.transition = 'opacity .45s ease';
      }
      if (grid) {
        grid.style.maskImage = grid.style.webkitMaskImage = `radial-gradient(${r * 0.9}px circle at ${x}px ${y}px, rgba(0,0,0,.95) 0%, rgba(0,0,0,.35) 45%, rgba(0,0,0,0) 72%)`;
        grid.style.opacity = on ? '1' : '0';
        grid.style.transition = 'opacity .45s ease';
      }
    };
    const move = (e) => {
      const b = hero.getBoundingClientRect();
      paint(e.clientX - b.left, e.clientY - b.top, true);
    };
    const leave = () => {
      const b = hero.getBoundingClientRect();
      paint(b.width * 0.42, b.height * 0.45, false);
    };
    const hr = hero.getBoundingClientRect();
    paint(hr.width * 0.42, hr.height * 0.45, false);
    hero.addEventListener('pointermove', move);
    hero.addEventListener('pointerleave', leave);
    const header = navGlowRef.current && navGlowRef.current.parentElement;
    if (header) {
      header.addEventListener('pointermove', move);
      header.addEventListener('pointerleave', leave);
    }

    const cardCleanups = [];
    root.querySelectorAll('[data-card]').forEach((card) => {
      const onMove = (e) => {
        const b = card.getBoundingClientRect();
        const px = (e.clientX - b.left) / b.width;
        const py = (e.clientY - b.top) / b.height;
        card.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 4}deg) rotateY(${(px - 0.5) * 5}deg) translateY(-6px) scale(1.02)`;
        card.style.boxShadow = 'var(--shadow-lift)';
        card.style.backgroundImage = `radial-gradient(420px circle at ${px * 100}% ${py * 100}%, color-mix(in srgb, var(--hero-tint) 35%, transparent), transparent 70%)`;
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

    root.querySelectorAll('[data-loop]').forEach((cell) => {
      const dot = cell.querySelector('[data-dot]');
      const num = cell.querySelector('[data-num]');
      if (dot) dot.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1)';
      if (num) num.style.transition = 'color .3s ease';
      const enter = () => {
        if (dot) dot.style.transform = 'scale(1.75)';
        if (num) num.style.color = 'var(--ink)';
      };
      const out = () => {
        if (dot) dot.style.transform = 'none';
        if (num) num.style.color = 'var(--ink-faint)';
      };
      cell.addEventListener('pointerenter', enter);
      cell.addEventListener('pointerleave', out);
      cardCleanups.push(() => {
        cell.removeEventListener('pointerenter', enter);
        cell.removeEventListener('pointerleave', out);
      });
    });

    return () => {
      hero.removeEventListener('pointermove', move);
      hero.removeEventListener('pointerleave', leave);
      if (header) {
        header.removeEventListener('pointermove', move);
        header.removeEventListener('pointerleave', leave);
      }
      cardCleanups.forEach((fn) => fn());
    };
  }, [isDark]);

  const gridBg = {
    backgroundImage:
      'linear-gradient(color-mix(in srgb, var(--ink) 10%, transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb, var(--ink) 10%, transparent) 1px,transparent 1px)',
    backgroundSize: '56px 56px',
  };

  return (
    <div ref={rootRef} className="bg-paper text-ink transition-colors duration-300" style={{ maxWidth: 1440, margin: '0 auto' }}>
      <AppEntryLinkGuard />
      <header
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
          maxWidth: 1440,
          margin: '0 auto',
          backgroundColor: 'var(--nav-blur)',
          backdropFilter: 'blur(14px)',
          zIndex: 50,
          overflow: 'hidden',
        }}
      >
        <div ref={navGridRef} style={{ position: 'absolute', inset: 0, ...gridBg, pointerEvents: 'none', zIndex: 0 }} />
        <div ref={navGlowRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 11, flex: 1 }}>
          <button type="button" onClick={goPage(0)} style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }}>
            <OnFileMark size={32} animated />
            <OnFileWordmark size={21} animated />
          </button>
        </div>

        <nav
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: 6,
            borderRadius: 999,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-card)',
            fontSize: 14,
          }}
        >
          <a href="#loop" onClick={goPage(1)} className="lp-navlink" style={{ padding: '9px 17px', borderRadius: 999, color: 'var(--ink-soft)' }}>The loop</a>
          <a href="#why" onClick={goPage(2)} className="lp-navlink" style={{ padding: '9px 17px', borderRadius: 999, color: 'var(--ink-soft)' }}>Why</a>
          <a href="#sources" onClick={goPage(0)} className="lp-navlink" style={{ padding: '9px 17px', borderRadius: 999, color: 'var(--ink-soft)' }}>Sources</a>
          <Link href="/dashboard" className="lp-dark" style={{ padding: '9px 18px', borderRadius: 999, background: 'var(--ink)', color: 'var(--paper)', fontWeight: 500 }}>Take the tour</Link>
        </nav>

        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
          <ThemeToggle />
          <Link
            href="/dashboard"
            className="lp-login"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '11px 22px', borderRadius: 999, fontSize: 13.5, fontWeight: 500, transition: 'background .2s ease, color .2s ease, border-color .2s ease' }}
          >
            Let&apos;s get started
          </Link>
        </div>
      </header>

      <LandingPager ref={pagerRef} labels={['Hero', 'The loop', 'Why']}>
        {/* Page 0 — Hero */}
        <section className="ls-land-page">
          <div className="ls-land-inner">
            <div ref={heroRef} style={{ position: 'relative', overflow: 'hidden', padding: '8px 12px 0' }}>
              <div ref={gridRef} style={{ position: 'absolute', inset: 0, ...gridBg, pointerEvents: 'none' }} />
              <div ref={glowRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
              <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,.95fr)', gap: 56, alignItems: 'center' }} className="of-hero-grid">
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 22 }}>
                    <span style={{ width: 28, height: 1, background: 'var(--accent)' }} />A to Z job hunt
                  </div>
                  <h1 style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 'clamp(38px,5.2vw,70px)', lineHeight: 1.04, letterSpacing: '-.015em', margin: '0 0 26px', textWrap: 'pretty' }}>
                    Every{' '}
                    <span style={{ position: 'relative', display: 'inline-block', isolation: 'isolate' }}>
                      <span style={{ position: 'absolute', left: -6, right: -8, top: '16%', bottom: '8%', background: 'var(--mint)', borderRadius: '12px 16px 14px 10px', zIndex: 0 }} />
                      <span style={{ position: 'relative', zIndex: 1, color: 'var(--ink)' }}>application</span>
                    </span>
                    , from listing{' '}
                    <span style={{ position: 'relative', display: 'inline-block' }}>
                      to offer.
                      <span style={{ position: 'absolute', left: 0, right: -4, bottom: -2, height: 8, background: 'var(--honey)', borderRadius: 999, transform: 'rotate(-.6deg)' }} />
                    </span>
                  </h1>
                  <p style={{ maxWidth: 520, margin: '0 0 34px', fontSize: 17, lineHeight: 1.62, color: 'var(--ink-soft)' }}>
                    OnFile scrapes the listings, tailors your resume to each one, tracks every reply, and rehearses the interview with you. One place, one thread, no spreadsheet.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 38 }}>
                    <Link href="/resumes" className="lp-dark" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'var(--ink)', color: 'var(--paper)', padding: '15px 28px', borderRadius: 999, fontSize: 14.5, fontWeight: 500, boxShadow: isDark ? 'var(--shadow-glow)' : undefined }}>✦ Start with my resume</Link>
                    <Link href="/dashboard" className="lp-login" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', padding: '15px 28px', borderRadius: 999, fontSize: 14.5, fontWeight: 500 }}>See a live account</Link>
                  </div>
                  <div id="sources" style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-faint)' }}>
                    <span>4 job sources</span>
                    <span>Your data stays local</span>
                    <span>Works on the bus</span>
                  </div>
                </div>

                <div className="ls-hero-stage" style={{ position: 'relative', minHeight: 420, minWidth: 0 }}>
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: '8% 4% 12% 0',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle at 42% 48%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 62%)',
                      filter: 'blur(22px)',
                      animation: 'lsHalo 6s ease-in-out infinite',
                      pointerEvents: 'none',
                    }}
                  />
                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 8 }}>
                    <HeroCard float="7s" delay="0s" align="flex-start" width={400} accent="var(--mint)" iconText="NF" badge="94% fit" title="Software Engineer Intern" sub="Neo Financial · Calgary" href="/pipeline" cta="Open →" />
                    <HeroCard float="8.5s" delay=".6s" align="flex-end" width={420} accent="var(--honey)" iconText="▤" title="resume — neo-financial.pdf" sub="6 bullets rewritten · 9 keywords matched" href="/resumes" cta="View resume →" />
                    <HeroCard float="9.5s" delay="1.2s" align="center" width={390} accent="var(--blush)" iconText="◉" title="Mock interview · 78/100" sub="Structure up 14 points since Tuesday" href="/prep" cta="Rehearse →" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Page 1 — The loop + metrics */}
        <section className="ls-land-page" id="loop">
          <div className="ls-land-inner" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(28px,4vw,40px)' }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 18 }}>The loop</div>
              <h2 style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 'clamp(30px,3.8vw,50px)', lineHeight: 1.08, letterSpacing: '-.01em', margin: '0 0 40px', maxWidth: 820 }}>
                Four moves, repeated until{' '}
                <span style={{ position: 'relative', display: 'inline-block', isolation: 'isolate' }}>
                  <span style={{ position: 'absolute', left: 0, right: 0, bottom: -3, height: 7, background: 'var(--honey)', borderRadius: 999, transform: 'rotate(-.4deg)', zIndex: 0 }} />
                  <span style={{ position: 'relative', zIndex: 1 }}>someone says yes.</span>
                </span>
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', borderTop: '1px solid var(--line)' }}>
                <LoopCell n="01" dot="var(--mint)" title="Find" body="Four boards scraped hourly, each listing scored against your real bullets. You see six roles, not six hundred." />
                <LoopCell n="02" dot="var(--honey)" title="Tailor" body="The master resume rewrites itself for the posting, and shows you every changed line with a reason attached." />
                <LoopCell n="03" dot="var(--blush)" title="Track" body="Replies are read, classified and stapled to the application. Cards move stages on their own." />
                <LoopCell n="04" dot="var(--panel)" title="Rehearse" body="Mock interviews built from the posting you applied to, scored live, with one thing to fix each time." />
              </div>
            </div>
            <div style={{ background: 'var(--sage)', borderRadius: 26, padding: '36px 36px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 28, boxShadow: isDark ? 'var(--shadow-card)' : undefined }}>
              <Stat n="41" label="applications tracked this term" />
              <Stat n="38" label="resumes tailored automatically" />
              <Stat n="31%" label="reply rate on tailored sends" />
              <Stat n="6.4d" label="average time to first response" />
            </div>
          </div>
        </section>

        {/* Page 2 — Why + tour + footer */}
        <section className="ls-land-page" id="why">
          <div className="ls-land-inner" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(28px,4vw,44px)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 22 }}>
              <WhyCard eyebrow="Not a spreadsheet" title="The thread, not the row" body={'An application is a conversation: what you sent, what they replied, what is owed on Monday. OnFile keeps all of it in one place instead of a cell that says "waiting".'} />
              <WhyCard eyebrow="Honest scoring" title="It will tell you not to apply" body="Fit is computed from your bullets against their requirements. When a role is a reach, OnFile says so and tells you which single gap to close first." />
              <WhyCard eyebrow="Built for momentum" title="Two a day beats twenty on Sunday" body="A streak, a daily three, and drafted follow-ups. The hard part of a job hunt is not writing — it is coming back tomorrow." />
            </div>

            <div data-card className="ls-hero-card" style={{ borderRadius: 26, padding: '40px 36px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 28 }}>
              <div style={{ minWidth: 260 }}>
                <h3 style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 'clamp(26px,3vw,38px)', margin: '0 0 12px' }}>Vega will walk you through it.</h3>
                <p style={{ margin: 0, fontSize: 15.5, color: 'var(--ink-soft)' }}>A two-minute guided tour of the whole system, narrated as you click.</p>
              </div>
              <Link href="/dashboard" className="lp-dark" style={{ display: 'inline-flex', alignItems: 'center', gap: 11, background: 'var(--ink)', color: 'var(--paper)', padding: '16px 30px', borderRadius: 999, fontSize: 14.5, fontWeight: 500, boxShadow: isDark ? 'var(--shadow-glow)' : undefined }}>▷ Take the tour</Link>
            </div>

            <footer style={{ background: 'var(--sage)', borderRadius: 22, padding: '40px 36px 28px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 32, paddingBottom: 28, borderBottom: '1px solid var(--line)' }}>
                <div style={{ maxWidth: 360 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <OnFileMark size={26} />
                    <span style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 19, color: 'var(--logo)' }}>
                      <span style={{ fontStyle: 'italic' }}>On</span>File
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)' }}>For 2nd-year CS, hunting 2027 internships.</p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 56, fontSize: 13.5 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontWeight: 600, marginBottom: 2 }}>Product</span>
                    <a href="#loop" onClick={goPage(1)}>The loop</a>
                    <a href="#why" onClick={goPage(2)}>Why OnFile</a>
                    <a href="#tour" onClick={goPage(2)}>Guided tour</a>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontWeight: 600, marginBottom: 2 }}>Your data</span>
                    <a href="#sources" onClick={goPage(0)}>Job sources</a>
                    <a href="#sources" onClick={goPage(0)}>Stays local</a>
                    <a href="#sources" onClick={goPage(0)}>Export</a>
                  </div>
                </div>
              </div>
              <div style={{ paddingTop: 18, fontSize: 12.5, color: 'var(--ink-faint)' }}>OnFile · built at the Fall 2026 hackathon</div>
            </footer>
          </div>
        </section>
      </LandingPager>

      <style>{`
        @media (max-width: 860px) {
          .of-hero-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function HeroCard({ float, delay, align, width, accent, iconText, badge, title, sub, href, cta }) {
  return (
    <div
      data-card
      className="ls-hero-card"
      style={{
        alignSelf: align === 'flex-end' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        marginLeft: align === 'flex-end' ? 'auto' : align === 'center' ? 24 : 0,
        width: `min(100%,${width}px)`,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        animation: `lsOrbit ${float} ease-in-out ${delay} infinite`,
      }}
    >
      <div
        style={{
          flex: 'none',
          width: 46,
          height: 46,
          borderRadius: 14,
          background: accent,
          display: 'grid',
          placeItems: 'center',
          fontSize: 14,
          fontFamily: 'var(--font-quicksand), sans-serif',
          fontWeight: 600,
          border: '1px solid var(--line)',
        }}
      >
        {iconText}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 15.5 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 3 }}>{sub}</div>
      </div>
      {badge ? (
        <span
          style={{
            flex: 'none',
            fontSize: 12,
            padding: '6px 10px',
            borderRadius: 999,
            background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            boxShadow: '0 0 18px color-mix(in srgb, var(--accent) 18%, transparent)',
            whiteSpace: 'nowrap',
          }}
        >
          {badge}
        </span>
      ) : (
        <Link href={href} className="lp-cardcta" style={{ flex: 'none', background: accent, borderRadius: 999, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', transition: 'background .25s ease, color .25s ease' }}>
          {cta}
        </Link>
      )}
    </div>
  );
}

function LoopCell({ n, dot, title, body }) {
  return (
    <div data-loop className="lp-loop" style={{ background: 'transparent', padding: '24px 22px 28px', borderBottom: '1px solid var(--line)', boxShadow: '1px 0 0 var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <span data-num style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{n}</span>
        <span data-dot style={{ width: 30, height: 30, borderRadius: '50%', background: dot }} />
      </div>
      <h3 style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 21, margin: '0 0 10px' }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{body}</p>
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 'clamp(34px,4vw,52px)', lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 8 }}>{label}</div>
    </div>
  );
}

function WhyCard({ eyebrow, title, body }) {
  return (
    <div data-card className="lp-why ls-hero-card" style={{ borderRadius: 22, padding: '30px 28px 34px', willChange: 'transform' }}>
      <div style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 16 }}>{eyebrow}</div>
      <h3 style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 25, lineHeight: 1.18, margin: '0 0 14px' }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.62, color: 'var(--ink-soft)' }}>{body}</p>
    </div>
  );
}