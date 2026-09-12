'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store';
import { stats, dueToday, recentActivity } from '@/lib/derived';
import { STAGES } from '@/lib/constants';
import StatCard from '@/components/ui/StatCard';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';

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
    <div className="max-w-4xl mx-auto px-5 py-8 md:px-10 md:py-10">
      <header className="mb-8">
        <h1 className="font-serif text-3xl text-ink">{greeting}.</h1>
        <p className="text-inkSoft text-sm mt-1">
          {due.length} follow-up{due.length === 1 ? '' : 's'} due · {s.offers} offer{s.offers === 1 ? '' : 's'} on the table
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <StatCard label="Applied" value={s.total} />
        <StatCard label="In progress" value={s.inProgress} />
        <StatCard label="Awaiting reply" value={s.awaitingReply} />
        <StatCard label="Offers" value={s.offers} />
      </div>

      <section className="mb-10">
        <h2 className="font-serif text-lg text-ink mb-3">Do today</h2>
        {due.length === 0 ? (
          <div className="border border-dashed border-line rounded-lg px-5 py-6 text-sm text-inkFaint">
            Nothing due today — enjoy the quiet.
          </div>
        ) : (
          <ul className="border border-line rounded-lg divide-y divide-line bg-surface">
            {due.map((app) => (
              <li key={app.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{app.nextAction.label}</p>
                  <p className="text-xs text-inkFaint mt-0.5">
                    {app.company} · {app.role}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge stageId={app.stage} />
                  <Button variant="secondary" onClick={() => completeNextAction(app.id)}>
                    Mark done
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <h2 className="font-serif text-lg text-ink mb-3">Pipeline at a glance</h2>
        <div className="border border-line rounded-lg bg-surface px-5 py-5 space-y-3">
          {stageBreakdown.map((st) => (
            <div key={st.id} className="flex items-center gap-3">
              <span className="w-20 text-xs text-inkSoft shrink-0">{st.label}</span>
              <div className="flex-1 h-2 rounded-full bg-paper overflow-hidden">
                <div className={`h-full ${st.dot} rounded-full`} style={{ width: `${(st.count / maxCount) * 100}%` }} />
              </div>
              <span className="w-5 text-xs text-inkFaint text-right shrink-0">{st.count}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-lg text-ink">Recent activity</h2>
          <Link href="/applications" className="text-xs text-pineDark hover:underline">
            View all
          </Link>
        </div>
        <ul className="border border-line rounded-lg divide-y divide-line bg-surface">
          {activity.map((ev) => (
            <li key={ev.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="text-ink">
                {ev.label} <span className="text-inkFaint">— {ev.company}</span>
              </span>
              <span className="text-xs text-inkFaint shrink-0">{ev.date}</span>
            </li>
          ))}
          {activity.length === 0 && <li className="px-4 py-6 text-sm text-inkFaint">No activity yet.</li>}
        </ul>
      </section>
    </div>
  );
}
