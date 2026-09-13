// Date helpers for the week strip and the month calendar.
//
// Weeks start on Sunday, matching the calendar's S M T W T F S header.
// Keys are built from local date parts rather than toISOString(), which
// shifts to UTC and lands on the wrong day for anyone west of Greenwich.

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date, n) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function startOfWeek(date) {
  return addDays(date, -startOfDay(date).getDay());
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

export function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function weekDays(cursor) {
  const start = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * Six rows of seven, padded with the neighbouring months' days.
 *
 * The padding is what lets a week straddling a month boundary keep a
 * continuous highlight: Sep 27 – Oct 3 needs cells for Oct 1 – 3 even while
 * the grid is showing September.
 */
export function monthGridDays(cursor) {
  const gridStart = startOfWeek(startOfMonth(cursor));
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function monthLabel(cursor) {
  return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "Sep 13 – 19" within one month, "Sep 27 – Oct 3" across two. */
export function weekRangeLabel(cursor) {
  const days = weekDays(cursor);
  const start = days[0];
  const end = days[6];
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = sameMonth(start, end)
    ? String(end.getDate())
    : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

/** "Sep 15" from a YYYY-MM-DD string, parsed as a local date. */
export function shortDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
