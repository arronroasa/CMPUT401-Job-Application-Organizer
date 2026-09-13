'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store';
import { stats, dueToday, recentActivity } from '@/lib/derived';
import { STAGES } from '@/lib/constants';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Reveal from '@/components/Reveal';

export default function TodayPage() {
  const { data, completeNextAction } = useStore();
  const { applications } = data;
  const s = stats(applications);
  const due = dueToday(applications);
  const activity = recentActivity(applications, 6);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const stageBreakdown = STAGES.map((st) => ({
    ...st,
    count: applications.filter((a) => a.stage === st.id).length,
  }));
  const maxCount = Math.max(1, ...stageBreakdown.map((st) => st.count));

  const tiles = [
    { n: '01', label: 'Applied', value: s.total, fill: 'var(--sage)' },
    { n: '02', label: 'In progress', value: s.inProgress, fill: 'color-mix(in srgb, var(--honey) 55%, transparent)' },
    { n: '03', label: 'Awaiting reply', value: s.awaitingReply, fill: 'var(--blush)' },
    { n: '04', label: 'Offers', value: s.offers, fill: 'var(--mint)' },
  ];

  return (
    <div className="px-6 md:px-11 py-10 md:py-14">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-14 md:mb-16">
          <h1
            className="font-display font-semibold leading-[1.02] tracking-tight text-ink"
            style={{ fontSize: 'clamp(40px, 6vw, 60px)' }}
          >
            {greeting}.
          </h1>
          <p className="text-inkSoft text-[15.5px] mt-3.5">
            {due.length} follow-up{due.length === 1 ? '' : 's'} due · {s.offers} offer{s.offers === 1 ? '' : 's'} on the table
          </p>
        </header>

        <Reveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-14 md:mb-[68px]">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="relative rounded-[24px] p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
              style={{ background: tile.fill }}
            >
              <span className="absolute top-5 right-6 text-[11px] tracking-[.18em] text-inkFaint">{tile.n}</span>
              <div
                className="font-display font-semibold text-ink leading-[0.95]"
                style={{ fontSize: 'clamp(44px, 5vw, 64px)' }}
              >
                {tile.value}
              </div>
              <div className="text-[13.5px] text-inkSoft mt-3">{tile.label}</div>
            </div>
          ))}
        </Reveal>

        <Reveal as="section" className="mb-14 md:mb-[68px]" delay={80}>
          <h2 className="font-display font-semibold text-[22px] text-ink mb-6">Do today</h2>
          {due.length === 0 ? (
            <div className="rounded-[22px] px-7 py-8 text-sm text-inkSoft bg-surface shadow-card">
              Nothing due. Add two applications and come back tomorrow.
            </div>
          ) : (
            <div className="bg-surface rounded-[22px] shadow-card p-2.5">
              {due.map((app, i) => (
                <div
                  key={app.id}
                  className={`flex flex-wrap items-center gap-4 rounded-[14px] px-5 py-5 ${
                    i < due.length - 1 ? 'border-b border-line' : ''
                  }`}
                  style={app.stage === 'offer' ? { borderLeft: '3px solid var(--pine)' } : undefined}
                >
                  <button
                    type="button"
                    aria-label="Mark done"
                    onClick={() => completeNextAction(app.id)}
                    className="shrink-0 w-[22px] h-[22px] rounded-full border-2 transition-colors focus-ring hover:bg-mint"
                    style={{ borderColor: 'var(--pine)' }}
                  />
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-display font-semibold text-[17px] text-ink">{app.nextAction.label}</p>
                    <p className="text-[13.5px] text-inkSoft mt-1">
                      {app.company} · {app.role}
                    </p>
                  </div>
                  <Badge stageId={app.stage} />
                  <Button pill onClick={() => completeNextAction(app.id)}>
                    Mark done
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Reveal>

        <Reveal as="section" className="mb-14 md:mb-[68px]" delay={140}>
          <h2 className="font-display font-semibold text-[22px] text-ink mb-6">Pipeline at a glance</h2>
          <div className="bg-surface rounded-[24px] px-6 sm:px-8 py-8 shadow-card">
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-0">
              {stageBreakdown.map((st, i) => (
                <div
                  key={st.id}
                  className="flex sm:flex-col items-center gap-3.5 sm:gap-0 sm:flex-1 min-w-0"
                >
                  <span className="order-2 sm:order-1 text-[13px] text-inkSoft truncate sm:mb-3.5">{st.label}</span>
                  <span className="order-1 sm:order-2 relative flex items-center justify-center h-4 shrink-0 sm:w-full">
                    {i > 0 && <span className="hidden sm:block absolute top-1/2 right-1/2 w-1/2 h-px bg-line" />}
                    {i < stageBreakdown.length - 1 && (
                      <span className="hidden sm:block absolute top-1/2 left-1/2 w-1/2 h-px bg-line" />
                    )}
                    <span className={`relative z-10 w-3.5 h-3.5 rounded-full ${st.dot}`} />
                  </span>
                  <span className="order-3 ml-auto sm:ml-0 sm:mt-3.5 font-display font-semibold text-[28px] leading-none text-ink">
                    {st.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal as="section" delay={200}>
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="font-display font-semibold text-[22px] text-ink">Recent activity</h2>
            <Link href="/applications" className="text-[13.5px] text-inkSoft underline hover:text-ink">
              View all
            </Link>
          </div>
          <div className="bg-surface rounded-[24px] shadow-card overflow-hidden">
            {activity.map((ev) => {
              const stage = STAGES.find((st) => ev.label.toLowerCase().includes(st.id));
              return (
                <div
                  key={ev.id}
                  className="flex flex-wrap gap-2.5 items-baseline justify-between px-6 sm:px-8 py-[18px] border-b border-ink/[.06] last:border-b-0 transition-colors hover:bg-paper"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={`shrink-0 w-2 h-2 rounded-full ${stage ? stage.dot : 'bg-line'}`} />
                    <span className="text-[15px] text-ink">
                      <b className="font-semibold">{ev.label}</b> <span className="text-inkSoft">· {ev.company}</span>
                    </span>
                  </span>
                  <span className="text-[13px] text-inkFaint">{ev.date}</span>
                </div>
              );
            })}
            {activity.length === 0 && <div className="px-8 py-8 text-sm text-inkFaint">No activity yet.</div>}
          </div>
        </Reveal>
      </div>
    </div>
  );
}
