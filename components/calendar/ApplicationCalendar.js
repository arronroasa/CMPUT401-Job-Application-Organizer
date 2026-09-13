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
    <div className="bg-surface border border-line rounded-lg p-4 w-full md:w-80 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="p-1 rounded hover:bg-black/5 focus-ring"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="font-medium text-ink text-sm">{monthLabel}</span>
        <button
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="p-1 rounded hover:bg-black/5 focus-ring"
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-inkFaint mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
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
                'relative aspect-square rounded text-xs flex items-center justify-center focus-ring',
                isSelected ? 'bg-ink text-white' : isToday ? 'bg-black/10' : 'hover:bg-black/5',
                count ? 'font-semibold cursor-pointer text-ink' : 'text-inkFaint cursor-default',
              ].join(' ')}
            >
              {day.getDate()}
              {count > 0 && (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-orange-500" />
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && selectedApps.length > 0 && (
        <div className="mt-3 border-t border-line pt-3 space-y-1">
          {selectedApps.map((app) => (
            <button
              key={app.id}
              onClick={() => onSelectApp?.(app)}
              className="block w-full text-left text-xs text-ink hover:underline"
            >
              {app.company} — {app.role}
              <span className="block text-inkFaint">{app.nextAction.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <div className="flex items-center gap-1.5 text-inkSoft text-xs mb-2">
          <CalendarClock size={13} />
          Upcoming
        </div>
        {upcoming.length === 0 && (
          <p className="text-xs text-inkFaint">Nothing coming up.</p>
        )}
        <ul className="space-y-1.5">
          {upcoming.map((app) => (
            <li key={app.id}>
              <button
                onClick={() => onSelectApp?.(app)}
                className="w-full flex items-center justify-between text-left text-xs hover:underline"
              >
                <span className="text-ink truncate mr-2">
                  {app.company} — {app.nextAction.label}
                </span>
                <span className="text-inkFaint shrink-0">
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