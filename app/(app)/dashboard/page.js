'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store';
import { stats, dueToday, recentActivity } from '@/lib/derived';
import { STAGES } from '@/lib/constants';
import StatCard from '@/components/ui/StatCard';
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

  return (
    <div className="px-6 md:px-11 py-8 md:py-10">
      <header className="mb-8">
        <h1 className="font-display font-semibold text-[30px] sm:text-[40px] leading-none tracking-tight text-ink">{greeting}.</h1>
        <p className="text-inkSoft text-[15px] mt-2">
          {due.length} follow-up{due.length === 1 ? '' : 's'} due · {s.offers} offer{s.offers === 1 ? '' : 's'} on the table
        </p>
      </header>

      <Reveal className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard label="Applied" value={s.total} />
        <StatCard label="In progress" value={s.inProgress} />
        <StatCard label="Awaiting reply" value={s.awaitingReply} />
        <StatCard label="Offers" value={s.offers} />
      </Reveal>

      <Reveal as="section" className="mb-10" delay={80}>
        <h2 className="font-display font-semibold text-xl text-ink mb-3.5">Do today</h2>
        {due.length === 0 ? (
          <div className="border border-dashed border-ink/20 rounded-lg px-5 py-5 text-sm text-inkSoft">
            Nothing due. Add two applications and come back tomorrow.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {due.map((app) => (
              <div
                key={app.id}
                className="flex flex-wrap items-center gap-4 bg-surface border border-line rounded-lg px-5 py-4 transition-all hover:border-ink/25 hover:translate-x-1 hover:shadow-card"
              >
                <div className="flex-1 min-w-[180px]">
                  <p className="font-display font-semibold text-base text-ink">{app.nextAction.label}</p>
                  <p className="text-[13px] text-inkSoft mt-0.5">
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

      <Reveal as="section" className="mb-10" delay={140}>
        <h2 className="font-display font-semibold text-xl text-ink mb-3.5">Pipeline at a glance</h2>
        <div className="bg-surface border border-line rounded-lg px-4 sm:px-6 py-[22px] flex flex-col gap-3.5">
          {stageBreakdown.map((st, i) => (
            <div key={st.id} className="grid grid-cols-[72px_minmax(0,1fr)_28px] sm:grid-cols-[92px_minmax(0,1fr)_28px] items-center gap-2.5 sm:gap-4">
              <span className="text-[12.5px] sm:text-[13.5px] text-inkSoft truncate">{st.label}</span>
              <span className="h-[7px] rounded-full bg-ink/[.08] overflow-hidden block">
                <span
                  className={`block h-full rounded-full ${st.dot} origin-left`}
                  style={{
                    width: `${(st.count / maxCount) * 100}%`,
                    animation: `lsBar .7s cubic-bezier(.2,.7,.2,1) ${i * 80}ms both`,
                  }}
                />
              </span>
              <span className="text-[13px] text-inkFaint text-right">{st.count}</span>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal as="section" delay={200}>
        <div className="flex items-baseline justify-between mb-3.5">
          <h2 className="font-display font-semibold text-xl text-ink">Recent activity</h2>
          <Link href="/applications" className="text-[13px] text-inkSoft underline hover:text-ink">
            View all
          </Link>
        </div>
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          {activity.map((ev) => (
            <div
              key={ev.id}
              className="flex flex-wrap gap-2.5 items-baseline justify-between px-4 sm:px-6 py-[15px] border-b border-ink/[.07] last:border-b-0 transition-colors hover:bg-paper"
            >
              <span className="text-[14.5px] text-ink">
                <b className="font-semibold">{ev.label}</b> <span className="text-inkSoft">— {ev.company}</span>
              </span>
              <span className="text-[13px] text-inkFaint">{ev.date}</span>
            </div>
          ))}
          {activity.length === 0 && <div className="px-6 py-6 text-sm text-inkFaint">No activity yet.</div>}
        </div>
      </Reveal>
    </div>
  );
}
