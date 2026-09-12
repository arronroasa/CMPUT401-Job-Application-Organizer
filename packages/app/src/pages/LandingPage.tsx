import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

// Lodestar-themed landing page for OnFile, translated from the design
// source (theme.zip: "Lodestar Light.dc.html"). There is no auth system
// in this app, so every CTA here routes straight into the dashboard.

function OnFileMark({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 220 240" style={{ width: size, height: size * 1.09, flexShrink: 0, overflow: 'visible' }}>
      <path d="M18 90 L18 70 Q18 58 30 58 L70 58 L88 78 L172 78 Q184 78 184 90 L184 200 Q184 214 170 214 L32 214 Q18 214 18 200 Z" fill="#3c3d2c" />
      <path
        d="M42 40 L150 30 Q160 29 161 39 L170 130 L46 140 Z"
        fill="#fffdf7"
        stroke="#3c3d2c"
        strokeWidth="14"
        strokeLinejoin="round"
      />
      <path d="M10 120 Q10 108 24 108 L166 108 Q180 108 174 122 L146 208 Q140 220 126 220 L24 220 Q12 220 12 208 Z" fill="#3c3d2c" />
      <polygon points="118,30 128,0 134,4 122,34" fill="#c1902f" />
      <polygon points="140,42 168,26 172,32 144,50" fill="#c1902f" />
      <polygon points="132,58 160,66 158,73 128,66" fill="#c1902f" />
    </svg>
  );
}

function OnFileWordmark({ size = 21 }: { size?: number }) {
  return (
    <span
      className="flex text-[#3c3d2c]"
      style={{ fontFamily: 'Quicksand, sans-serif', fontWeight: 600, fontSize: size, letterSpacing: '0.01em' }}
    >
      <span style={{ fontStyle: 'italic' }}>On</span>File
    </span>
  );
}

const LOOP_STEPS = [
  { n: '01', dot: '#cfe9d4', title: 'Find', body: 'Four boards scraped hourly, each listing scored against your real bullets. You see six roles, not six hundred.' },
  { n: '02', dot: '#ffe08a', title: 'Tailor', body: 'The master resume rewrites itself for the posting, and shows you every changed line with a reason attached.' },
  { n: '03', dot: '#f9d9e7', title: 'Track', body: 'Replies are read, classified and stapled to the application. Cards move stages on their own.' },
  { n: '04', dot: '#e7e9e1', title: 'Rehearse', body: 'Mock interviews built from the posting you applied to, scored live, with one thing to fix each time.' },
];

const STATS = [
  { n: '41', label: 'applications tracked this term' },
  { n: '38', label: 'resumes tailored automatically' },
  { n: '31%', label: 'reply rate on tailored sends' },
  { n: '6.4d', label: 'average time to first response' },
];

const WHY_CARDS = [
  { eyebrow: 'Not a spreadsheet', title: 'The thread, not the row', body: 'An application is a conversation: what you sent, what they replied, what is owed on Monday. OnFile keeps all of it in one place instead of a cell that says "waiting".' },
  { eyebrow: 'Honest scoring', title: 'It will tell you not to apply', body: 'Fit is computed from your bullets against their requirements. When a role is a reach, OnFile says so and tells you which single gap to close first.' },
  { eyebrow: 'Built for momentum', title: 'Two a day beats twenty on Sunday', body: 'A streak, a daily three, and drafted follow-ups. The hard part of a job hunt is not writing — it is coming back tomorrow.' },
];

const HERO_CARDS = [
  { icon: 'LC', iconBg: '#eef1ea', title: 'LeetCode prep', body: 'questions each company asked in the last 6 months', cta: 'Open prep →', ctaBg: '#cfe9d4', align: 'flex-end' as const, delay: '0s' },
  { icon: '▤', iconBg: '#fdf1cf', title: 'resume — neo-financial.pdf', body: '6 bullets rewritten · 9 keywords matched', cta: 'View resume →', ctaBg: '#fdf1cf', align: 'flex-start' as const, delay: '.6s' },
  { icon: '◉', iconBg: '#f9d9e7', title: 'Mock interview · 78/100', body: 'Structure up 14 points since Tuesday', cta: 'Rehearse →', ctaBg: '#f9d9e7', align: 'flex-end' as const, delay: '1.2s' },
];

function useScrollReveal() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    items.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(22px)';
      el.style.transition = 'opacity .7s ease, transform .7s cubic-bezier(.2,.8,.2,1)';
    });
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.style.opacity = '1';
            el.style.transform = 'none';
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    items.forEach((el) => observer.observe(el));
    const fallback = window.setTimeout(() => {
      items.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
    }, 1600);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  return rootRef;
}

function useSpotlight(tint = '#cfe9d4', radius = 380) {
  const containerRef = useRef<HTMLElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const paint = (x: number, y: number, on: boolean) => {
    const g = glowRef.current;
    const grid = gridRef.current;
    if (g) {
      g.style.background = `radial-gradient(${radius}px circle at ${x}px ${y}px, ${tint}cc, ${tint}55 42%, rgba(255,255,255,0) 72%)`;
      g.style.opacity = on ? '1' : '0';
      g.style.transition = 'opacity .45s ease';
    }
    if (grid) {
      const mask = `radial-gradient(${radius * 0.9}px circle at ${x}px ${y}px, rgba(0,0,0,.95) 0%, rgba(0,0,0,.35) 45%, rgba(0,0,0,0) 72%)`;
      grid.style.maskImage = mask;
      grid.style.webkitMaskImage = mask;
      grid.style.opacity = on ? '1' : '0';
      grid.style.transition = 'opacity .45s ease';
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      paint(e.clientX - b.left, e.clientY - b.top, true);
    };
    const leave = () => {
      const b = el.getBoundingClientRect();
      paint(b.width * 0.42, b.height * 0.45, false);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { containerRef, glowRef, gridRef };
}

function TiltCard({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const card = ref.current;
    if (!card) return;
    const b = card.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width;
    const py = (e.clientY - b.top) / b.height;
    card.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 4}deg) rotateY(${(px - 0.5) * 5}deg) translateY(-6px)`;
    card.style.boxShadow = '0 30px 60px -40px rgba(20,21,15,.55)';
  };

  const onLeave = () => {
    const card = ref.current;
    if (!card) return;
    card.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1), box-shadow .5s ease';
    card.style.transform = 'none';
    card.style.boxShadow = 'none';
  };

  return (
    <div
      ref={ref}
      data-reveal="1"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={className}
      style={style}
    >
      {children}
    </div>
  );
}

const gridBackground =
  'linear-gradient(rgba(20,21,15,.1) 1px,transparent 1px), linear-gradient(90deg,rgba(20,21,15,.1) 1px,transparent 1px)';

export function LandingPage() {
  const revealRootRef = useScrollReveal();
  const { containerRef: heroRef, glowRef, gridRef } = useSpotlight('#cfe9d4');

  return (
    <div ref={revealRootRef} className="bg-background text-foreground" style={{ fontFamily: "'Work Sans', sans-serif" }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        {/* Header */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-6 px-7 py-4 overflow-hidden" style={{ backgroundColor: 'rgba(250,246,236,.9)', backdropFilter: 'blur(14px)' }}>
          <div className="relative z-10 flex flex-1 items-center gap-3">
            <OnFileMark size={32} />
            <OnFileWordmark size={21} />
          </div>
          <nav className="relative z-10 flex items-center gap-1 rounded-full p-1.5 text-sm" style={{ background: '#fffdf7', border: '1px solid rgba(20,21,15,.08)', boxShadow: '0 10px 26px -20px rgba(20,21,15,.5)' }}>
            <a href="#loop" className="rounded-full px-4 py-2 text-[#14150f]/70 transition-colors hover:bg-[#eef1ea] hover:text-[#14150f]">The loop</a>
            <a href="#why" className="rounded-full px-4 py-2 text-[#14150f]/70 transition-colors hover:bg-[#eef1ea] hover:text-[#14150f]">Why</a>
            <a href="#sources" className="rounded-full px-4 py-2 text-[#14150f]/70 transition-colors hover:bg-[#eef1ea] hover:text-[#14150f]">Sources</a>
            <Link to="/app" className="rounded-full px-[18px] py-2 font-medium text-white transition-colors" style={{ background: '#14150f' }}>
              Take the tour
            </Link>
          </nav>
          <div className="relative z-10 flex flex-1 justify-end">
            <Link
              to="/app"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
              style={{ background: '#fffdf7', color: '#14150f', border: '1px solid rgba(20,21,15,.1)' }}
            >
              Log in
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section ref={heroRef as React.RefObject<HTMLElement>} className="relative overflow-hidden px-10 pb-[88px] pt-[72px]">
          <div ref={gridRef} className="pointer-events-none absolute inset-0" style={{ backgroundImage: gridBackground, backgroundSize: '56px 56px' }} />
          <div ref={glowRef} className="pointer-events-none absolute inset-0" />
          <div className="relative grid gap-14 items-center" style={{ gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,.95fr)' }}>
            <div className="min-w-0">
              <h1
                className="mb-6"
                style={{ fontFamily: 'Quicksand, sans-serif', fontWeight: 600, fontSize: 'clamp(38px,5.2vw,70px)', lineHeight: 1.04, letterSpacing: '-.015em' }}
              >
                Every{' '}
                <span className="relative inline-block" style={{ isolation: 'isolate' }}>
                  <span className="absolute z-0 rounded-xl" style={{ left: -6, right: -8, top: '16%', bottom: '8%', background: '#cfe9d4' }} />
                  <span className="relative z-10">application</span>
                </span>
                , from listing{' '}
                <span className="relative inline-block">
                  to offer.
                  <span className="absolute rounded-full" style={{ left: 0, right: -4, bottom: -2, height: 8, background: '#ffe08a', transform: 'rotate(-.6deg)' }} />
                </span>
              </h1>
              <p className="mb-8 max-w-[520px] text-[17px] leading-[1.62] text-[#14150f]/72">
                OnFile scrapes the listings, tailors your resume to each one, tracks every reply, and rehearses the interview with you. One place, one thread, no spreadsheet.
              </p>
              <div className="mb-9 flex flex-wrap gap-3.5">
                <Link
                  to="/app"
                  className="inline-flex items-center gap-2.5 rounded-full px-7 py-4 text-[14.5px] font-medium text-white transition-colors"
                  style={{ background: '#14150f' }}
                >
                  ✦ Start with my resume
                </Link>
              </div>
              <div id="sources" />
            </div>

            <div className="relative flex min-w-0 flex-col gap-[18px]">
              {HERO_CARDS.map((card) => (
                <div
                  key={card.title}
                  className="flex items-center gap-4 rounded-[20px] px-5 py-[18px]"
                  style={{
                    alignSelf: card.align,
                    width: 'min(100%,400px)',
                    background: '#fff',
                    color: '#14150f',
                    border: '1px solid rgba(20,21,15,.1)',
                    boxShadow: '0 18px 40px -26px rgba(20,21,15,.35)',
                    animation: `lsFloat ${7 + Math.random()}s ease-in-out ${card.delay} infinite`,
                  }}
                >
                  <div
                    className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-2xl text-lg font-semibold"
                    style={{ background: card.iconBg, fontFamily: 'Quicksand, sans-serif' }}
                  >
                    {card.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15.5px] font-semibold" style={{ fontFamily: 'Quicksand, sans-serif' }}>{card.title}</div>
                    <div className="mt-0.5 text-[13px] text-[#14150f]/60">{card.body}</div>
                  </div>
                  <a
                    href="#loop"
                    className="flex-none rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors"
                    style={{ background: card.ctaBg, color: '#14150f' }}
                  >
                    {card.cta}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The loop */}
        <section id="loop" className="px-10 pt-[84px]">
          <div className="mb-[18px] text-[11px] uppercase tracking-[.22em] text-[#14150f]/60">The loop</div>
          <h2
            className="mb-14 max-w-[820px]"
            style={{ fontFamily: 'Quicksand, sans-serif', fontWeight: 600, fontSize: 'clamp(30px,3.8vw,50px)', lineHeight: 1.08, letterSpacing: '-.01em' }}
          >
            Four moves, repeated until{' '}
            <span className="relative inline-block" style={{ isolation: 'isolate' }}>
              <span className="absolute z-0 rounded-full" style={{ left: 0, right: 0, bottom: -3, height: 7, background: '#ffe08a', transform: 'rotate(-.4deg)' }} />
              <span className="relative z-10">someone says yes.</span>
            </span>
          </h2>
          <div className="grid border-t" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', borderColor: 'rgba(20,21,15,.12)' }}>
            {LOOP_STEPS.map((step) => (
              <div
                key={step.n}
                data-reveal="1"
                className="group border-b px-[26px] pb-[34px] pt-7 transition-colors hover:bg-[#fffdf7]"
                style={{ borderColor: 'rgba(20,21,15,.12)', boxShadow: '1px 0 0 rgba(20,21,15,.12)' }}
              >
                <div className="mb-[34px] flex items-center justify-between">
                  <span className="text-xs text-[#14150f]/45 transition-colors group-hover:text-[#14150f]">{step.n}</span>
                  <span className="h-[30px] w-[30px] rounded-full transition-transform group-hover:scale-[1.75]" style={{ background: step.dot }} />
                </div>
                <h3 className="mb-2.5 text-xl font-semibold" style={{ fontFamily: 'Quicksand, sans-serif' }}>{step.title}</h3>
                <p className="text-[14.5px] leading-[1.6] text-[#14150f]/68">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Stats */}
        <section className="px-10 pt-14">
          <div
            data-reveal="1"
            className="grid gap-8 rounded-[26px] px-10 py-[44px]"
            style={{ background: '#eaf3ec', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}
          >
            {STATS.map((stat) => (
              <div key={stat.label}>
                <div style={{ fontFamily: 'Quicksand, sans-serif', fontWeight: 600, fontSize: 'clamp(34px,4vw,52px)', lineHeight: 1 }}>{stat.n}</div>
                <div className="mt-2 text-[13.5px] text-[#14150f]/65">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Why */}
        <section id="why" className="grid gap-5 px-10 pt-[84px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
          {WHY_CARDS.map((card) => (
            <TiltCard
              key={card.title}
              className="rounded-[22px] px-7 pb-[34px] pt-[30px] transition-colors will-change-transform hover:border-[#14150f]/28"
              style={{ border: '1px solid rgba(20,21,15,.12)', background: '#fffdf7' }}
            >
              <div className="mb-4 text-[11px] uppercase tracking-[.2em] text-[#14150f]/55">{card.eyebrow}</div>
              <h3 className="mb-3.5 text-[25px] font-semibold leading-[1.18]" style={{ fontFamily: 'Quicksand, sans-serif' }}>{card.title}</h3>
              <p className="text-[14.5px] leading-[1.62] text-[#14150f]/68">{card.body}</p>
            </TiltCard>
          ))}
        </section>

        {/* Tour banner */}
        <section id="tour" className="px-10 pb-[90px] pt-14">
          <div
            data-reveal="1"
            className="flex flex-wrap items-center justify-between gap-7 rounded-[26px] px-10 py-[44px]"
            style={{ border: '1px solid rgba(20,21,15,.14)' }}
          >
            <div className="min-w-[260px]">
              <h3 className="mb-3" style={{ fontFamily: 'Quicksand, sans-serif', fontWeight: 600, fontSize: 'clamp(26px,3vw,38px)' }}>
                Vega will walk you through it.
              </h3>
              <p className="text-[15.5px] text-[#14150f]/66">A two-minute guided tour of the whole system, narrated as you click.</p>
            </div>
            <Link
              to="/app"
              className="inline-flex items-center gap-2.5 rounded-full px-[30px] py-4 text-[14.5px] font-medium text-white"
              style={{ background: '#14150f' }}
            >
              ▷ Take the tour
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-10 pb-[34px] pt-16" style={{ background: '#eaf3ec' }}>
          <div className="flex flex-wrap justify-between gap-8 border-b pb-10" style={{ borderColor: 'rgba(20,21,15,.12)' }}>
            <div className="max-w-[360px]">
              <div className="mb-3.5 flex items-center gap-2.5">
                <OnFileMark size={26} />
                <OnFileWordmark size={19} />
              </div>
              <p className="text-sm leading-[1.6] text-[#14150f]/66">For 2nd-year CS, hunting 2027 internships.</p>
            </div>
            <div className="flex flex-wrap gap-14 text-[13.5px]">
              <div className="flex flex-col gap-2.5">
                <span className="mb-0.5 font-semibold">Product</span>
                <a href="#loop" className="hover:text-[#3f6b4a]">The loop</a>
                <a href="#why" className="hover:text-[#3f6b4a]">Why OnFile</a>
                <a href="#tour" className="hover:text-[#3f6b4a]">Guided tour</a>
              </div>
              <div className="flex flex-col gap-2.5">
                <span className="mb-0.5 font-semibold">Your data</span>
                <a href="#sources" className="hover:text-[#3f6b4a]">Job sources</a>
                <a href="#sources" className="hover:text-[#3f6b4a]">Stays local</a>
                <a href="#sources" className="hover:text-[#3f6b4a]">Export</a>
              </div>
            </div>
          </div>
          <div className="pt-[22px] text-[12.5px] text-[#14150f]/55">OnFile · built at the Fall 2026 hackathon</div>
        </footer>
      </div>

      <style>{`
        @keyframes lsFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
      `}</style>
    </div>
  );
}
