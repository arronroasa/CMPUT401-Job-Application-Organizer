'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { stageMeta } from '@/lib/constants';
import { nextActionsByDay } from '@/lib/derived';
import { addMonths, monthGridDays, monthLabel, sameMonth, toKey, weekDays } from '@/lib/dates';

// Three fits across a cell at this size; a fourth would touch the edges.
const MAX_DOTS = 3;

/**
 * The month grid in the Today rail.
 *
 * It shares one cursor with the week strip above it. Paging a month or
 * clicking a day moves that cursor, so the strip follows. The grid marks the
 * cursor's week, which is why it pads out to the neighbouring months: a week
 * like Sep 27 – Oct 3 needs every one of its days to have a cell.
 */
export default function MonthCalendar({ applications, cursor, onCursorChange }) {
  const byDay = nextActionsByDay(applications);
  const days = monthGridDays(cursor);
  const todayKey = toKey(new Date());
  const weekKeys = new Set(weekDays(cursor).map(toKey));

  return (
    <div className="bg-surface rounded-[22px] shadow-card p-6">
      <div className="flex items-center justify-between mb-5">
        <button
          type="button"
          onClick={() => onCursorChange(addMonths(cursor, -1))}
          className="w-8 h-8 grid place-items-center rounded-full text-ink hover:bg-panel transition-colors focus-ring"
          aria-label="Previous month"
        >
          <ChevronLeft size={17} />
        </button>
        <span className="font-display font-semibold text-ink text-[17px]">{monthLabel(cursor)}</span>
        <button
          type="button"
          onClick={() => onCursorChange(addMonths(cursor, 1))}
          className="w-8 h-8 grid place-items-center rounded-full text-ink hover:bg-panel transition-colors focus-ring"
          aria-label="Next month"
        >
          <ChevronRight size={17} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] tracking-[.12em] text-inkSoft mb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const key = toKey(day);
          const isToday = key === todayKey;
          const inWeek = weekKeys.has(key);
          const outside = !sameMonth(day, cursor);
          // A dot means work still outstanding, so completed actions drop out.
          const dots = (byDay[key] || []).filter((a) => !a.nextAction.done).slice(0, MAX_DOTS);

          return (
            <button
              key={key}
              type="button"
              onClick={() => onCursorChange(day)}
              aria-label={day.toDateString()}
              aria-current={isToday ? 'date' : undefined}
              className={[
                'relative aspect-square rounded-full text-[13.5px] flex items-center justify-center transition-colors focus-ring',
                isToday
                  ? 'bg-ink text-paper font-semibold'
                  : inWeek
                    ? 'bg-panel text-ink font-medium'
                    : 'text-ink hover:bg-panel',
                outside && !isToday ? 'text-inkFaint' : '',
              ].join(' ')}
            >
              {day.getDate()}
              {dots.length > 0 && (
                <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2 flex gap-[3px]">
                  {dots.map((a) => (
                    <span key={a.id} className={`w-1 h-1 rounded-full ${stageMeta(a.stage).dot}`} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
