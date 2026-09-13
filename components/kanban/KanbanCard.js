import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';
import { stageMeta } from '@/lib/constants';

export default function KanbanCard({ app, onDragStart, onOpen, onShift, canBack, canFwd }) {
  const hasTooltipContent = app.notes || app.nextAction;
  const meta = stageMeta(app.stage);

  const tooltipContent = hasTooltipContent ? (
    <div className="flex flex-col gap-1">
      {app.notes && <p>{app.notes}</p>}
      {app.nextAction && (
        <p className="text-mint">
          Next: {app.nextAction.label}
          {app.nextAction.date ? ` (${app.nextAction.date})` : ''}
          {app.nextAction.done ? ' ✓' : ''}
        </p>
      )}
    </div>
  ) : null;

  return (
    <Tooltip content={tooltipContent}>
      <div
        draggable
        onDragStart={(e) => onDragStart(e, app.id)}
        className="group flex flex-col min-h-[136px] bg-surface rounded-2xl p-[18px] cursor-grab active:cursor-grabbing shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift"
        style={{ borderLeft: `3px solid var(--stage-${app.stage})` }}
      >
        <button onClick={() => onOpen(app)} className="block w-full text-left focus-ring rounded">
          <p className="font-display font-semibold text-[18px] leading-snug text-ink truncate">{app.role}</p>
          <p className="text-[13px] text-ink truncate mt-1">{app.company}</p>
        </button>

        {app.nextAction && !app.nextAction.done && (
          <span
            className={`inline-flex items-center gap-2 self-start max-w-full mt-3.5 px-3 py-1.5 rounded-full text-[12.5px] text-ink ${meta.bg}`}
          >
            <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            <span className="truncate">{app.nextAction.label}</span>
          </span>
        )}

        <div className="flex items-center justify-between gap-2 mt-auto pt-4">
          <span className="text-[12px] text-ink">{app.dateApplied}</span>
          <span className="flex gap-1 opacity-30 transition-opacity duration-300 group-hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={() => onShift(app, -1)}
              disabled={!canBack}
              aria-label="Move to previous stage"
              className="w-6 h-6 rounded-md border border-line bg-surface text-xs leading-none hover:border-ink disabled:opacity-30 disabled:hover:border-line focus-ring"
            >
              ←
            </button>
            <button
              onClick={() => onShift(app, 1)}
              disabled={!canFwd}
              aria-label="Move to next stage"
              className="w-6 h-6 rounded-md border border-line bg-surface text-xs leading-none hover:border-ink disabled:opacity-30 disabled:hover:border-line focus-ring"
            >
              →
            </button>
          </span>
        </div>
      </div>
    </Tooltip>
  );
}
