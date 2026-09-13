'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '@/lib/store';
import { stats, dueToday, recentActivity } from '@/lib/derived';
import { STAGES } from '@/lib/constants';
import { addDays, startOfDay, weekRangeLabel } from '@/lib/dates';
import Reveal from '@/components/Reveal';
import WeekStrip from '@/components/today/WeekStrip';
import DoTodayCard from '@/components/today/DoTodayCard';
import MonthCalendar from '@/components/calendar/MonthCalendar';
import ApplicationDetail from '@/components/applications/ApplicationDetail';

export default function TodayPage() {
  const { data, completeNextAction } = useStore();
  const { applications } = data;

  // One cursor drives both the week strip and the month grid. The header line
  // and the Do today card deliberately ignore it and stay on the real today.
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(null);

  const s = stats(applications);
  const due = dueToday(applications);
  const activity = recentActivity(applications, 6);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const tiles = [
    { label: 'Applied', value: s.total, fill: 'var(--tile-applied)' },
    { label: 'In progress', value: s.inProgress, fill: 'var(--tile-progress)' },
    { label: 'Awaiting reply', value: s.awaitingReply, fill: 'var(--tile-awaiting)' },
    { label: 'Offers', value: s.offers, fill: 'var(--tile-offers)' },
  ];

  return (
    <div className="px-6 md:px-11 py-10 md:py-12">
      <div className="mx-auto max-w-[1400px]">
        <header className="flex flex-wrap items-end justify-between gap-5 mb-7">
          <div>
            <h1
              className="font-display font-semibold leading-[1.02] tracking-tight text-ink"
              style={{ fontSize: 'clamp(38px, 5.4vw, 56px)' }}
            >
              {greeting}.
            </h1>
            <p className="text-inkSoft text-[15.5px] mt-3">
              {due.length} follow-up{due.length === 1 ? '' : 's'} due · {s.offers} offer
              {s.offers === 1 ? '' : 's'} on the table
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCursor(addDays(cursor, -7))}
              aria-label="Previous week"
              className="w-8 h-8 grid place-items-center rounded-full border border-line text-ink hover:bg-panel transition-colors focus-ring"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-[13.5px] text-ink min-w-[104px] text-center">{weekRangeLabel(cursor)}</span>
            <button
              type="button"
              onClick={() => setCursor(addDays(cursor, 7))}
              aria-label="Next week"
              className="w-8 h-8 grid place-items-center rounded-full border border-line text-ink hover:bg-panel transition-colors focus-ring"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </header>

        <Reveal className="mb-7">
          <WeekStrip applications={applications} cursor={cursor} onOpen={setSelected} />
        </Reveal>

        <Reveal className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7" delay={60}>
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-[18px] px-6 py-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
              style={{ background: tile.fill }}
            >
              <div
                className="font-display font-semibold text-ink leading-[0.95]"
                style={{ fontSize: 'clamp(30px, 3.2vw, 40px)' }}
              >
                {tile.value}
              </div>
              <div className="text-[13px] text-inkSoft mt-2">{tile.label}</div>
            </div>
          ))}
        </Reveal>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          <Reveal as="section" delay={120}>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-display font-semibold text-[22px] text-ink">Recent activity</h2>
              <Link href="/applications" className="text-[13.5px] text-inkSoft underline hover:text-ink">
                View all
              </Link>
            </div>
            <div className="bg-surface rounded-[22px] shadow-card overflow-hidden">
              {activity.map((ev) => {
                const stage = STAGES.find((st) => ev.label.toLowerCase().includes(st.id));
                return (
                  <div
                    key={ev.id}
                    className="flex flex-wrap gap-2.5 items-baseline justify-between px-6 py-[15px] border-b border-ink/[.06] last:border-b-0 transition-colors hover:bg-paper"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className={`shrink-0 w-2 h-2 rounded-full ${stage ? stage.dot : 'bg-line'}`} />
                      <span className="text-[15px] text-ink">
                        <b className="font-semibold">{ev.label}</b>{' '}
                        <span className="text-inkSoft">· {ev.company}</span>
                      </span>
                    </span>
                    <span className="text-[13px] text-inkFaint">{ev.date}</span>
                  </div>
                );
              })}
              {activity.length === 0 && <div className="px-6 py-8 text-sm text-inkFaint">No activity yet.</div>}
            </div>
          </Reveal>

          <Reveal className="w-full flex flex-col gap-4" delay={180}>
            <MonthCalendar applications={applications} cursor={cursor} onCursorChange={setCursor} />
            <DoTodayCard due={due} onComplete={completeNextAction} onOpen={setSelected} />
          </Reveal>
        </div>
      </div>

      {selected && <ApplicationDetail app={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
