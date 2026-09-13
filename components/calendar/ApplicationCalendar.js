'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarClock } from 'lucide-react';

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toKey(date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

export default function DeadlineCalendar({ applications, onSelectApp }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(null);

  // Group applications by their next-action date (only undone actions count as "upcoming")
  const actionsByDay = useMemo(() => {
    const map = {};
    for (const app of applications) {
      if (!app.nextAction?.date || app.nextAction.done) continue;
      const key = app.nextAction.date.slice(0, 10);
      (map[key] ||= []).push(app);
    }
    return map;
  }, [applications]);

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const days = useMemo(() => {
    const first = startOfMonth(cursor);
    const startWeekday = first.getDay(); // 0 = Sun
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }
    return cells;
  }, [cursor]);

  const today = toKey(new Date());
  const selectedApps = selectedDay ? actionsByDay[selectedDay] || [] : [];

  // Upcoming next-actions across all months, soonest first
  const upcoming = useMemo(() => {
    return applications
      .filter((a) => a.nextAction?.date && !a.nextAction.done && a.nextAction.date >= today)
      .sort((a, b) => a.nextAction.date.localeCompare(b.nextAction.date))
      .slice(0, 5);
  }, [applications, today]);

  return (
    <div className="w-full xl:w-[400px] shrink-0 flex flex-col gap-4">
      <div className="bg-surface rounded-[22px] shadow-card p-6">
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="w-8 h-8 grid place-items-center rounded-full text-ink hover:bg-panel transition-colors focus-ring"
            aria-label="Previous month"
          >
            <ChevronLeft size={17} />
          </button>
          <span className="font-display font-semibold text-ink text-[17px]">{monthLabel}</span>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="w-8 h-8 grid place-items-center rounded-full text-ink hover:bg-panel transition-colors focus-ring"
            aria-label="Next month"
          >
            <ChevronRight size={17} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] tracking-[.12em] text-ink mb-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day, i) => {
            if (!day) return <div key={i} />;
            const key = toKey(day);
            const count = actionsByDay[key]?.length || 0;
            const isToday = key === today;
            const isSelected = key === selectedDay;

            return (
              <button
                key={i}
                onClick={() => setSelectedDay(count ? key : null)}
                className={[
                  'relative aspect-square rounded-full text-[13.5px] flex items-center justify-center transition-colors focus-ring text-ink',
                  isSelected
                    ? 'bg-ink text-paper font-semibold'
                    : count
                      ? 'bg-mint font-semibold cursor-pointer hover:bg-honey'
                      : isToday
                        ? 'bg-panel font-semibold'
                        : 'hover:bg-panel cursor-default',
                ].join(' ')}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>

        {selectedDay && selectedApps.length > 0 && (
          <div className="mt-5 border-t border-line pt-4 space-y-2">
            {selectedApps.map((app) => (
              <button
                key={app.id}
                onClick={() => onSelectApp?.(app)}
                className="block w-full text-left text-[13px] text-ink hover:underline"
              >
                {app.company} · {app.role}
                <span className="block text-ink opacity-70">{app.nextAction.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface rounded-[22px] shadow-card p-6">
        <div className="flex items-center gap-2 text-ink text-[13px] font-medium mb-3.5">
          <CalendarClock size={15} />
          Upcoming
        </div>
        {upcoming.length === 0 && <p className="text-[13px] text-ink">Nothing coming up.</p>}
        <ul className="space-y-2.5">
          {upcoming.map((app) => (
            <li key={app.id}>
              <button
                onClick={() => onSelectApp?.(app)}
                className="w-full flex items-center justify-between gap-3 text-left text-[13px] hover:underline"
              >
                <span className="min-w-0 text-ink truncate">
                  {app.company} · {app.nextAction.label}
                </span>
                <span className="text-ink shrink-0">
                  {new Date(app.nextAction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
