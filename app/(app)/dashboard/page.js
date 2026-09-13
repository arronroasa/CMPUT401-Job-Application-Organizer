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
import MonthCalendar from '@/components/calendar/MonthCalendar';
import ApplicationDetail from '@/components/applications/ApplicationDetail';

export default function TodayPage() {
  const { data } = useStore();
  const { applications } = data;

  // One cursor drives both the week strip and the month grid. The header line
  // deliberately ignores it and stays on the real today.
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

  // The page is sized to the shell's viewport slot (its md:pb-8) so Today lands
  // whole on one screen. Anything that outgrows its row — a busy week, a long
  // activity list — scrolls inside that row rather than pushing the page down.
  return (
    <div className="px-6 md:px-10 py-7 md:py-8 xl:h-[calc(100dvh-2rem)] xl:min-h-[620px]">
      <div className="mx-auto max-w-[1400px] h-full min-h-0 flex flex-col">
        <header className="shrink-0 flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <h1
              className="font-display font-semibold leading-[1.02] tracking-tight text-ink"
              style={{ fontSize: 'clamp(30px, 4vw, 44px)' }}
            >
              {greeting}.
            </h1>
            <p className="text-inkSoft text-[14.5px] mt-2">
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

        <Reveal className="shrink-0 mb-4">
          <WeekStrip applications={applications} cursor={cursor} onOpen={setSelected} />
        </Reveal>

        <Reveal className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4" delay={60}>
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-[16px] px-5 py-3.5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
              style={{ background: tile.fill }}
            >
              <div
                className="font-display font-semibold text-ink leading-[0.95]"
                style={{ fontSize: 'clamp(24px, 2.4vw, 32px)' }}
              >
                {tile.value}
              </div>
              <div className="text-[12.5px] text-inkSoft mt-1">{tile.label}</div>
            </div>
          ))}
        </Reveal>

        <div className="grid grid-cols-1 items-start xl:grid-cols-[minmax(0,1fr)_300px] xl:items-stretch gap-5 xl:flex-1 xl:min-h-0">
          <Reveal as="section" className="flex flex-col min-h-0" delay={120}>
            <div className="shrink-0 flex items-baseline justify-between mb-3">
              <h2 className="font-display font-semibold text-[20px] text-ink">Recent activity</h2>
              <Link href="/applications" className="text-[13.5px] text-inkSoft underline hover:text-ink">
                View all
              </Link>
            </div>
            <div className="bg-surface rounded-[22px] shadow-card overflow-hidden xl:flex-1 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain">
              {activity.map((ev) => {
                const stage = STAGES.find((st) => ev.label.toLowerCase().includes(st.id));
                return (
                  <div
                    key={ev.id}
                    className="flex flex-wrap gap-2.5 items-baseline justify-between px-5 py-[13px] border-b border-ink/[.06] last:border-b-0 transition-colors hover:bg-paper"
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
              {activity.length === 0 && <div className="px-5 py-8 text-sm text-inkFaint">No activity yet.</div>}
            </div>
          </Reveal>

          <Reveal className="w-full self-start" delay={180}>
            <MonthCalendar applications={applications} cursor={cursor} onCursorChange={setCursor} />
          </Reveal>
        </div>
      </div>

      {selected && <ApplicationDetail app={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
