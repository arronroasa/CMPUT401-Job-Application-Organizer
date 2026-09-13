'use client';

import { useState } from 'react';
import { stageMeta } from '@/lib/constants';
import { nextActionsByDay } from '@/lib/derived';
import { toKey, weekDays } from '@/lib/dates';

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// Beyond this a day collapses to a "+N more" toggle. Two chips is what a column
// holds while the whole page still lands inside one screen; expanding a day is
// the deliberate act that trades that away.
const VISIBLE = 2;

/**
 * The seven-day strip under the greeting.
 *
 * Shows next actions only. Past stage moves belong to Recent activity, further
 * down the page, so the strip reads purely forward.
 */
export default function WeekStrip({ applications, cursor, onOpen }) {
  const [expanded, setExpanded] = useState({});
  const byDay = nextActionsByDay(applications);
  const days = weekDays(cursor);
  const todayKey = toKey(new Date());

  function toggle(key) {
    setExpanded((e) => ({ ...e, [key]: !e[key] }));
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="grid grid-cols-7 min-w-[760px] rounded-[18px] border border-line bg-surface overflow-hidden">
        {days.map((day, i) => {
          const key = toKey(day);
          const isToday = key === todayKey;
          const items = byDay[key] || [];
          const isOpen = expanded[key];
          const shown = isOpen ? items : items.slice(0, VISIBLE);
          const hidden = items.length - shown.length;

          return (
            <div
              key={key}
              className={`flex flex-col gap-1.5 p-2.5 min-h-[112px] ${
                i > 0 ? 'border-l border-line' : ''
              } ${isToday ? 'bg-panel' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] tracking-[.14em] text-inkFaint">{DAY_LABELS[i]}</span>
                <span
                  className={
                    isToday
                      ? 'w-[22px] h-[22px] grid place-items-center rounded-full bg-ink text-paper text-[12px] font-semibold'
                      : 'text-[13.5px] font-semibold text-ink'
                  }
                >
                  {day.getDate()}
                </span>
              </div>

              {items.length === 0 && <span className="text-[13px] text-inkFaint">—</span>}

              {shown.map((app) => {
                const meta = stageMeta(app.stage);
                const done = app.nextAction.done;
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => onOpen(app)}
                    title={`${app.nextAction.label} · ${app.company}`}
                    className={`block w-full text-left rounded-[10px] px-2.5 py-1.5 transition-opacity focus-ring ${meta.bg} ${
                      done ? 'opacity-55' : 'hover:opacity-90'
                    }`}
                    style={{ borderLeft: `3px solid var(--stage-${app.stage})` }}
                  >
                    <span
                      className={`block text-[12.5px] font-semibold leading-tight text-ink ${
                        done ? 'line-through' : ''
                      }`}
                    >
                      {app.nextAction.label}
                    </span>
                    <span className="block text-[11.5px] text-inkSoft mt-0.5 truncate">{app.company}</span>
                  </button>
                );
              })}

              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="self-start text-[11.5px] text-inkSoft underline hover:text-ink focus-ring rounded"
                >
                  +{hidden} more
                </button>
              )}
              {isOpen && items.length > VISIBLE && (
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="self-start text-[11.5px] text-inkSoft underline hover:text-ink focus-ring rounded"
                >
                  Show less
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
