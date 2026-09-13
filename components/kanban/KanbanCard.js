import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';

export default function KanbanCard({ app, onDragStart, onOpen, onShift, canBack, canFwd }) {
  const hasTooltipContent = app.notes || app.nextAction;

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
        className="bg-paper border border-line rounded-lg px-3.5 pt-3.5 pb-3 cursor-grab active:cursor-grabbing transition-all hover:border-ink/30 hover:-translate-y-0.5 hover:shadow-card"
      >
        <button onClick={() => onOpen(app)} className="block w-full text-left focus-ring rounded">
          <p className="font-display font-semibold text-[15px] text-ink truncate">{app.role}</p>
          <p className="text-[13px] text-inkSoft truncate mt-0.5">{app.company}</p>
        </button>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-xs text-inkFaint">{app.dateApplied}</span>
          {app.nextAction && !app.nextAction.done && (
            <span className="text-[11.5px] px-2.5 py-1 rounded-full bg-mint text-ink truncate max-w-[130px]">
              {app.nextAction.label}
            </span>
          )}
          <span className="ml-auto flex gap-1">
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