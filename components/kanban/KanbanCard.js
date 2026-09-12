export default function KanbanCard({ app, onDragStart, onOpen }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, app.id)}
      onClick={() => onOpen(app)}
      className="bg-surface border border-line rounded-md px-3 py-3 cursor-grab active:cursor-grabbing hover:border-pine/40 transition-colors"
    >
      <p className="text-sm font-medium text-ink truncate">{app.role}</p>
      <p className="text-xs text-inkSoft truncate mt-0.5">{app.company}</p>
      <div className="flex items-center justify-between mt-2.5 gap-2">
        <span className="text-[11px] text-inkFaint shrink-0">{app.dateApplied}</span>
        {app.nextAction && !app.nextAction.done && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-sm bg-pineSoft text-pineDark truncate">
            {app.nextAction.label}
          </span>
        )}
      </div>
    </div>
  );
}
