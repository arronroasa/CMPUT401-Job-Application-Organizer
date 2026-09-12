'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { OnFileMark, OnFileWordmark } from '@/components/OnFileLogo';

const TINT = '#cfe9d4';
const RADIUS = 380;

export default function Landing() {
  const rootRef = useRef(null);
  const heroRef = useRef(null);
  const glowRef = useRef(null);
  const gridRef = useRef(null);
  const navGlowRef = useRef(null);
  const navGridRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    const hero = heroRef.current;
    if (!root || !hero) return;

    // ---- cursor spotlight + grid mask (hero + header) ----
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
        nav.style.background = `radial-gradient(${r}px circle at ${nx}px ${ny}px, ${TINT}cc, ${TINT}55 42%, rgba(255,255,255,0) 72%)`;
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
        g.style.background = `radial-gradient(${r}px circle at ${x}px ${y}px, ${TINT}cc, ${TINT}55 42%, rgba(255,255,255,0) 72%)`;
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

    // ---- card tilt + glow ----
    const cardCleanups = [];
    root.querySelectorAll('[data-card]').forEach((card) => {
      const base = card.style.background || '#fff';
      const onMove = (e) => {
        const b = card.getBoundingClientRect();
        const px = (e.clientX - b.left) / b.width;
        const py = (e.clientY - b.top) / b.height;
        card.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 4}deg) rotateY(${(px - 0.5) * 5}deg) translateY(-6px)`;
        card.style.boxShadow = '0 30px 60px -40px rgba(20,21,15,.55)';
        card.style.backgroundImage = `radial-gradient(420px circle at ${px * 100}% ${py * 100}%, ${TINT}66, rgba(255,255,255,0) 70%)`;
        card.style.transition = 'box-shadow .3s ease, border-color .3s ease';
      };
      const onLeave = () => {
        card.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1), box-shadow .5s ease, background-image .5s ease';
        card.style.transform = 'none';
        card.style.boxShadow = 'none';
        card.style.backgroundImage = 'none';
        card.style.background = base;
      };
      card.addEventListener('pointermove', onMove);
      card.addEventListener('pointerleave', onLeave);
      cardCleanups.push(() => {
        card.removeEventListener('pointermove', onMove);
        card.removeEventListener('pointerleave', onLeave);
      });
    });

    // ---- loop-cell dot pop ----
    root.querySelectorAll('[data-loop]').forEach((cell) => {
      const dot = cell.querySelector('[data-dot]');
      const num = cell.querySelector('[data-num]');
      if (dot) dot.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1)';
      if (num) num.style.transition = 'color .3s ease';
      const enter = () => {
        if (dot) dot.style.transform = 'scale(1.75)';
        if (num) num.style.color = '#14150f';
      };
      const out = () => {
        if (dot) dot.style.transform = 'none';
        if (num) num.style.color = 'rgba(20,21,15,.45)';
      };
      cell.addEventListener('pointerenter', enter);
      cell.addEventListener('pointerleave', out);
      cardCleanups.push(() => {
        cell.removeEventListener('pointerenter', enter);
        cell.removeEventListener('pointerleave', out);
      });
    });

    // ---- scroll reveal ----
    const items = [...root.querySelectorAll('[data-reveal]')];
    items.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(22px)';
      el.style.transition = 'opacity .7s ease, transform .7s cubic-bezier(.2,.8,.2,1)';
    });
    const show = (el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    };
    let pending = items.slice();
    const check = () => {
      const h = window.innerHeight || 900;
      pending = pending.filter((el) => {
        const b = el.getBoundingClientRect();
        if (b.top < h * 0.94 && b.bottom > -40) {
          show(el);
          return false;
        }
        return true;
      });
    };
    window.addEventListener('scroll', check, true);
    window.addEventListener('resize', check);
    requestAnimationFrame(check);
    const fallback = setTimeout(() => items.forEach(show), 1600);

    return () => {
      hero.removeEventListener('pointermove', move);
      hero.removeEventListener('pointerleave', leave);
      if (header) {
        header.removeEventListener('pointermove', move);
        header.removeEventListener('pointerleave', leave);
      }
      window.removeEventListener('scroll', check, true);
      window.removeEventListener('resize', check);
      clearTimeout(fallback);
      cardCleanups.forEach((fn) => fn());
    };
  }, []);

  const gridBg = {
    backgroundImage:
      'linear-gradient(rgba(20,21,15,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(20,21,15,.1) 1px,transparent 1px)',
    backgroundSize: '56px 56px',
  };

  return (
    <div ref={rootRef} style={{ maxWidth: 1440, margin: '0 auto' }}>
      {/* ---------- Header ---------- */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          padding: '16px 28px',
          position: 'sticky',
          top: 0,
          backgroundColor: 'rgba(250,246,236,.9)',
          backdropFilter: 'blur(14px)',
          zIndex: 20,
          overflow: 'hidden',
        }}
      >
        <div ref={navGridRef} style={{ position: 'absolute', inset: 0, ...gridBg, pointerEvents: 'none', zIndex: 0 }} />
        <div ref={navGlowRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 11, flex: 1 }}>
          <OnFileMark size={32} animated />
          <OnFileWordmark size={21} animated />
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
            background: '#fffdf7',
            border: '1px solid rgba(20,21,15,.08)',
            boxShadow: '0 10px 26px -20px rgba(20,21,15,.5)',
            fontSize: 14,
          }}
        >
          <a href="#loop" className="lp-navlink" style={{ padding: '9px 17px', borderRadius: 999, color: 'rgba(20,21,15,.72)' }}>The loop</a>
          <a href="#why" className="lp-navlink" style={{ padding: '9px 17px', borderRadius: 999, color: 'rgba(20,21,15,.72)' }}>Why</a>
          <a href="#sources" className="lp-navlink" style={{ padding: '9px 17px', borderRadius: 999, color: 'rgba(20,21,15,.72)' }}>Sources</a>
          <Link href="/dashboard" className="lp-dark" style={{ padding: '9px 18px', borderRadius: 999, background: '#14150f', color: '#fff', fontWeight: 500 }}>Take the tour</Link>
        </nav>

        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Link
            href="/dashboard"
            className="lp-login"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: '#fffdf7', color: '#14150f', border: '1px solid rgba(20,21,15,.1)', padding: '11px 22px', borderRadius: 999, fontSize: 13.5, fontWeight: 500, transition: 'background .2s ease, color .2s ease, border-color .2s ease' }}
          >
            Log in
          </Link>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section ref={heroRef} style={{ position: 'relative', overflow: 'hidden', padding: '72px 40px 88px' }}>
        <div ref={gridRef} style={{ position: 'absolute', inset: 0, ...gridBg, pointerEvents: 'none' }} />
        <div ref={glowRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,.95fr)', gap: 56, alignItems: 'center' }} className="of-hero-grid">
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 'clamp(38px,5.2vw,70px)', lineHeight: 1.04, letterSpacing: '-.015em', margin: '0 0 26px', textWrap: 'pretty' }}>
              Every{' '}
              <span style={{ position: 'relative', display: 'inline-block', isolation: 'isolate' }}>
                <span style={{ position: 'absolute', left: -6, right: -8, top: '16%', bottom: '8%', background: '#cfe9d4', borderRadius: '12px 16px 14px 10px', zIndex: 0 }} />
                <span style={{ position: 'relative', zIndex: 1, color: '#14150f' }}>application</span>
              </span>
              , from listing{' '}
              <span style={{ position: 'relative', display: 'inline-block' }}>
                to offer.
                <span style={{ position: 'absolute', left: 0, right: -4, bottom: -2, height: 8, background: '#ffe08a', borderRadius: 999, transform: 'rotate(-.6deg)' }} />
              </span>
            </h1>
            <p style={{ maxWidth: 520, margin: '0 0 34px', fontSize: 17, lineHeight: 1.62, color: 'rgba(20,21,15,.72)' }}>
              OnFile scrapes the listings, tailors your resume to each one, tracks every reply, and rehearses the interview with you. One place, one thread, no spreadsheet.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 38 }}>
              <Link href="/resumes" className="lp-dark" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#14150f', color: '#fff', padding: '15px 28px', borderRadius: 999, fontSize: 14.5, fontWeight: 500 }}>✦ Start with my resume</Link>
            </div>
            <div id="sources" />
          </div>

          <div style={{ position: 'relative', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <HeroCard float="7s" delay="0s" align="flex-end" width={400} accent="#eef1ea" iconText="LC" ctaBg="#cfe9d4" cta="Open prep →" href="/prep" title="LeetCode prep" sub="questions each company asked in the last 6 months" mono />
            <HeroCard float="8.5s" delay=".6s" width={420} accent="#fdf1cf" iconText="▤" ctaBg="#fdf1cf" cta="View resume →" href="/resumes" title="resume — neo-financial.pdf" sub="6 bullets rewritten · 9 keywords matched" />
            <HeroCard float="9.5s" delay="1.2s" align="flex-end" width={390} accent="#f9d9e7" iconText="◉" ctaBg="#f9d9e7" cta="Rehearse →" href="/prep" title="Mock interview · 78/100" sub="Structure up 14 points since Tuesday" />
          </div>
        </div>
      </section>

      {/* ---------- The loop ---------- */}
      <section id="loop" style={{ padding: '84px 40px 0' }}>
        <div style={{ fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(20,21,15,.6)', marginBottom: 18 }}>The loop</div>
        <h2 style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 'clamp(30px,3.8vw,50px)', lineHeight: 1.08, letterSpacing: '-.01em', margin: '0 0 56px', maxWidth: 820 }}>
          Four moves, repeated until{' '}
          <span style={{ position: 'relative', display: 'inline-block', isolation: 'isolate' }}>
            <span style={{ position: 'absolute', left: 0, right: 0, bottom: -3, height: 7, background: '#ffe08a', borderRadius: 999, transform: 'rotate(-.4deg)', zIndex: 0 }} />
            <span style={{ position: 'relative', zIndex: 1 }}>someone says yes.</span>
          </span>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', borderTop: '1px solid rgba(20,21,15,.12)' }}>
          <LoopCell n="01" dot="#cfe9d4" title="Find" body="Four boards scraped hourly, each listing scored against your real bullets. You see six roles, not six hundred." />
          <LoopCell n="02" dot="#ffe08a" title="Tailor" body="The master resume rewrites itself for the posting, and shows you every changed line with a reason attached." />
          <LoopCell n="03" dot="#f9d9e7" title="Track" body="Replies are read, classified and stapled to the application. Cards move stages on their own." />
          <LoopCell n="04" dot="#e7e9e1" title="Rehearse" body="Mock interviews built from the posting you applied to, scored live, with one thing to fix each time." />
        </div>
      </section>

      {/* ---------- Stats ---------- */}
      <section style={{ padding: '56px 40px 0' }}>
        <div data-reveal style={{ background: '#eaf3ec', borderRadius: 26, padding: '44px 40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 32 }}>
          <Stat n="41" label="applications tracked this term" />
          <Stat n="38" label="resumes tailored automatically" />
          <Stat n="31%" label="reply rate on tailored sends" />
          <Stat n="6.4d" label="average time to first response" />
        </div>
      </section>

      {/* ---------- Why ---------- */}
      <section id="why" style={{ padding: '84px 40px 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 22 }}>
        <WhyCard eyebrow="Not a spreadsheet" title="The thread, not the row" body={'An application is a conversation: what you sent, what they replied, what is owed on Monday. OnFile keeps all of it in one place instead of a cell that says "waiting".'} />
        <WhyCard eyebrow="Honest scoring" title="It will tell you not to apply" body="Fit is computed from your bullets against their requirements. When a role is a reach, OnFile says so and tells you which single gap to close first." />
        <WhyCard eyebrow="Built for momentum" title="Two a day beats twenty on Sunday" body="A streak, a daily three, and drafted follow-ups. The hard part of a job hunt is not writing — it is coming back tomorrow." />
      </section>

      {/* ---------- Tour CTA ---------- */}
      <section id="tour" style={{ padding: '56px 40px 90px' }}>
        <div data-card data-reveal style={{ border: '1px solid rgba(20,21,15,.14)', borderRadius: 26, padding: '46px 40px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 28 }}>
          <div style={{ minWidth: 260 }}>
            <h3 style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 'clamp(26px,3vw,38px)', margin: '0 0 12px' }}>Vega will walk you through it.</h3>
            <p style={{ margin: 0, fontSize: 15.5, color: 'rgba(20,21,15,.66)' }}>A two-minute guided tour of the whole system, narrated as you click.</p>
          </div>
          <Link href="/dashboard" className="lp-dark" style={{ display: 'inline-flex', alignItems: 'center', gap: 11, background: '#14150f', color: '#fff', padding: '16px 30px', borderRadius: 999, fontSize: 14.5, fontWeight: 500 }}>▷ Take the tour</Link>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer style={{ background: '#eaf3ec', padding: '64px 40px 34px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 32, paddingBottom: 40, borderBottom: '1px solid rgba(20,21,15,.12)' }}>
          <div style={{ maxWidth: 360 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <OnFileMark size={26} />
              <span style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 19, color: '#3c3d2c' }}>
                <span style={{ fontStyle: 'italic' }}>On</span>File
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'rgba(20,21,15,.66)' }}>For 2nd-year CS, hunting 2027 internships.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 56, fontSize: 13.5 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontWeight: 600, marginBottom: 2 }}>Product</span>
              <a href="#loop">The loop</a>
              <a href="#why">Why OnFile</a>
              <a href="#tour">Guided tour</a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontWeight: 600, marginBottom: 2 }}>Your data</span>
              <a href="#sources">Job sources</a>
              <a href="#sources">Stays local</a>
              <a href="#sources">Export</a>
            </div>
          </div>
        </div>
        <div style={{ paddingTop: 22, fontSize: 12.5, color: 'rgba(20,21,15,.55)' }}>OnFile · built at the Fall 2026 hackathon</div>
      </footer>

      <style>{`
        @media (max-width: 860px) {
          .of-hero-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function HeroCard({ float, delay, align, width, accent, iconText, ctaBg, cta, href, title, sub, mono }) {
  return (
    <div
      data-card
      style={{
        alignSelf: align || 'auto',
        width: `min(100%,${width}px)`,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: '#fff',
        color: '#14150f',
        border: '1px solid rgba(20,21,15,.1)',
        borderRadius: 20,
        padding: '18px 20px',
        boxShadow: '0 18px 40px -26px rgba(20,21,15,.35)',
        animation: `lsFloat ${float} ease-in-out ${delay} infinite`,
      }}
    >
      <div style={{ flex: 'none', width: 46, height: 46, borderRadius: 14, background: accent, display: 'grid', placeItems: 'center', fontSize: mono ? 14 : 18, fontFamily: mono ? 'var(--font-quicksand), sans-serif' : undefined, fontWeight: mono ? 600 : undefined }}>{iconText}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: mono ? 16.5 : 15.5 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'rgba(20,21,15,.6)', marginTop: 3 }}>{sub}</div>
      </div>
      <Link href={href} className="lp-cardcta" style={{ flex: 'none', background: ctaBg, borderRadius: 999, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: '#14150f', transition: 'background .25s ease, color .25s ease' }}>{cta}</Link>
    </div>
  );
}

function LoopCell({ n, dot, title, body }) {
  return (
    <div data-loop data-reveal className="lp-loop" style={{ background: 'transparent', padding: '28px 26px 34px', borderBottom: '1px solid rgba(20,21,15,.12)', boxShadow: '1px 0 0 rgba(20,21,15,.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 34 }}>
        <span data-num style={{ fontSize: 12, color: 'rgba(20,21,15,.45)' }}>{n}</span>
        <span data-dot style={{ width: 30, height: 30, borderRadius: '50%', background: dot }} />
      </div>
      <h3 style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 21, margin: '0 0 10px' }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'rgba(20,21,15,.68)' }}>{body}</p>
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 'clamp(34px,4vw,52px)', lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 13.5, color: 'rgba(20,21,15,.65)', marginTop: 8 }}>{label}</div>
    </div>
  );
}

function WhyCard({ eyebrow, title, body }) {
  return (
    <div data-card data-reveal className="lp-why" style={{ border: '1px solid rgba(20,21,15,.12)', borderRadius: 22, padding: '30px 28px 34px', background: '#fffdf7', transition: 'transform .5s cubic-bezier(.2,.8,.2,1), box-shadow .5s ease, border-color .3s ease', willChange: 'transform' }}>
      <div style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(20,21,15,.55)', marginBottom: 16 }}>{eyebrow}</div>
      <h3 style={{ fontFamily: 'var(--font-quicksand), sans-serif', fontWeight: 600, fontSize: 25, lineHeight: 1.18, margin: '0 0 14px' }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.62, color: 'rgba(20,21,15,.68)' }}>{body}</p>
    </div>
  );
}
