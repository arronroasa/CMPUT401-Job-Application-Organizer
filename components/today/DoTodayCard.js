'use client';

/**
 * The "Do today" rail card.
 *
 * Pinned to the real today, never the week cursor — a card with this name
 * showing next Thursday's work would be lying about itself.
 */
export default function DoTodayCard({ due, onComplete, onOpen }) {
  return (
    <div className="bg-surface rounded-[22px] shadow-card p-6">
      <h2 className="font-display font-semibold text-[17px] text-ink mb-3.5">Do today</h2>

      {due.length === 0 ? (
        <p className="text-[13.5px] text-inkSoft leading-relaxed">
          Nothing due. Add two applications and come back tomorrow.
        </p>
      ) : (
        <ul className="flex flex-col">
          {due.map((app, i) => (
            <li
              key={app.id}
              className={`flex items-start gap-3 py-3 first:pt-0 last:pb-0 ${
                i < due.length - 1 ? 'border-b border-line' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => onComplete(app.id)}
                aria-label={`Mark "${app.nextAction.label}" done`}
                className="mt-[3px] shrink-0 w-[18px] h-[18px] rounded-full border-2 transition-colors hover:bg-mint focus-ring"
                style={{ borderColor: 'var(--pine)' }}
              />
              <button
                type="button"
                onClick={() => onOpen(app)}
                className="min-w-0 flex-1 text-left rounded focus-ring"
              >
                <span className="block text-[14px] font-medium leading-snug text-ink">
                  {app.nextAction.label}
                </span>
                <span className="block text-[12.5px] text-inkSoft mt-0.5 truncate">{app.company}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
