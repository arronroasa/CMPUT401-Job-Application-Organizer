import { useDraggable } from '@dnd-kit/core';
import { useRef, useEffect } from 'react';
import type { ApplicationDraft } from '@onfile/core';
import { MatchBadge, cn } from '@onfile/ui';

interface ApplicationCardProps {
  draft: ApplicationDraft;
  onClick: () => void;
}

// Lodestar theme: white rounded card with a subtle lift on hover/drag,
// matching the "Pipeline" board mockup's application cards.
export function ApplicationCard({ draft, onClick }: ApplicationCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draft.id,
  });
  const hasDraggedRef = useRef(false);

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  useEffect(() => {
    if (transform && (Math.abs(transform.x) > 0 || Math.abs(transform.y) > 0)) {
      hasDraggedRef.current = true;
    }
  }, [transform]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onPointerDownCapture={() => {
        hasDraggedRef.current = false;
      }}
      className={cn(
        'bg-card border border-border rounded-2xl p-3.5 cursor-grab active:cursor-grabbing select-none transition-all',
        'hover:border-foreground/25 hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-24px_rgba(20,21,15,0.4)]',
        isDragging && 'opacity-60 shadow-xl border-foreground/30'
      )}
      onClick={(e) => {
        if (!isDragging && !hasDraggedRef.current) onClick();
        hasDraggedRef.current = false;
        e.stopPropagation();
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="truncate text-xs text-muted-foreground">{draft.company}</span>
        <MatchBadge score={draft.matchScore} tier={draft.matchScore >= 80 ? 'high' : draft.matchScore >= 60 ? 'medium' : 'low'} className="ml-auto shrink-0" />
      </div>
      <p className="truncate text-[15px] font-semibold text-foreground font-display">
        {draft.jobTitle}
      </p>
      {draft.missingSkills.length > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {draft.missingSkills.slice(0, 2).join(', ')}
          {draft.missingSkills.length > 2 ? ` +${draft.missingSkills.length - 2} more` : ''}
        </p>
      )}
    </div>
  );
}
