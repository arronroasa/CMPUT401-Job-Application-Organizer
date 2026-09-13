'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, Check } from 'lucide-react';
import { useStore } from '@/lib/store';
import { notifications, unreadNotifications } from '@/lib/derived';
import { stageMeta } from '@/lib/constants';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Reveal from '@/components/Reveal';

export default function NotificationsPage() {
  const { data, markNotificationsRead } = useStore();
  const items = notifications(data.applications);

  // What was unread the moment this page opened. Held locally so the rows keep
  // their highlight while you read them, even though the effect below has
  // already marked them read in the store and cleared the sidebar count.
  const [highlighted, setHighlighted] = useState(
    () => new Set(unreadNotifications(items, data.readNotifications).map((n) => n.id))
  );

  useEffect(() => {
    markNotificationsRead([...highlighted]);
    // Mount only: arriving on the page is what counts as reading it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="px-6 md:px-11 py-8 md:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display font-semibold text-[28px] sm:text-[38px] leading-none tracking-tight text-ink mb-1.5">
            Notifications
          </h1>
          <p className="text-inkSoft text-[14.5px]">
            {items.length === 0
              ? 'Nothing yet'
              : `${items.length} update${items.length === 1 ? '' : 's'}`}
            {highlighted.size > 0 && ` · ${highlighted.size} new`}
          </p>
        </div>
        {highlighted.size > 0 && (
          <Button variant="secondary" onClick={() => setHighlighted(new Set())}>
            <Check size={16} /> Mark all read
          </Button>
        )}
      </header>

      {items.length === 0 ? (
        <div className="border border-dashed border-ink/20 rounded-lg px-5 py-12 text-center">
          <Bell size={22} className="mx-auto text-inkFaint mb-3" strokeWidth={1.8} />
          <p className="text-sm text-inkSoft mb-4">No interview or offer news yet.</p>
          <Link href="/pipeline" className="text-[13.5px] text-accent hover:underline">
            Go to the pipeline
          </Link>
        </div>
      ) : (
        <Reveal className="flex flex-col gap-2.5">
          {items.map((n) => {
            const isNew = highlighted.has(n.id);
            return (
              <Link
                key={n.id}
                href={`/applications?app=${n.appId}`}
                className={`flex flex-wrap items-center gap-4 bg-surface border rounded-lg px-5 py-4 transition-all hover:border-ink/25 hover:translate-x-1 hover:shadow-card ${
                  isNew ? 'border-accent/40' : 'border-line'
                }`}
              >
                <span className="relative flex items-center">
                  <Bell size={17} strokeWidth={1.9} className="text-inkFaint" />
                  {isNew && (
                    <span className="absolute -top-0.5 -right-1 w-[7px] h-[7px] rounded-full bg-accent" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className={`block text-[14.5px] text-ink truncate ${isNew ? 'font-semibold' : 'font-medium'}`}>
                    Moved to {stageMeta(n.stage).label.toLowerCase()}
                  </span>
                  <span className="block text-[13.5px] text-inkSoft truncate">
                    {n.company} · {n.role}
                  </span>
                </span>

                <Badge stageId={n.stage} />
                <span className="text-[13px] text-inkFaint w-[92px] text-right">{n.date}</span>
              </Link>
            );
          })}
        </Reveal>
      )}
    </div>
  );
}
