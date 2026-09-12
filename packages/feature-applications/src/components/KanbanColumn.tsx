import { useDroppable } from '@dnd-kit/core';
import { useEffect, useState } from 'react';
import type { ApplicationDraft, ApplicationStatus } from '@onfile/core';
import { cn } from '@onfile/ui';
import { ApplicationCard } from './ApplicationCard';

interface KanbanColumnProps {
  status: ApplicationStatus;
  label: string;
  drafts: ApplicationDraft[];
  onCardClick: (draft: ApplicationDraft) => void;
}

// Lodestar theme: each stage gets a soft dot color instead of a dark
// zinc border, matching the "Pipeline at a glance" / board mockups.
const columnDot: Record<string, string> = {
  drafted: 'bg-muted-foreground/40',
  approved: 'bg-[hsl(var(--ls-blue-light))]',
  submitted: 'bg-[hsl(var(--ls-blue-light))]',
  interview: 'bg-[hsl(var(--ls-pink))]',
  offer: 'bg-[hsl(var(--ls-mint))]',
};

export function KanbanColumn({ status, label, drafts, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [animateCount, setAnimateCount] = useState(false);

  useEffect(() => {
    setAnimateCount(true);
    const t = window.setTimeout(() => setAnimateCount(false), 180);
    return () => window.clearTimeout(t);
  }, [drafts.length]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col min-w-[240px] w-full rounded-2xl bg-transparent transition-colors',
        isOver && 'bg-muted/60'
      )}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between gap-2 px-2 pb-3 pt-0.5">
        <span className="flex items-center gap-2 text-[15px] font-semibold text-foreground font-display">
          <span className={cn('h-2.5 w-2.5 rounded-full', columnDot[status] ?? 'bg-muted-foreground/40')} />
          {label}
        </span>
        <span
          className={cn(
            'text-xs text-muted-foreground transition-transform duration-150',
            animateCount && 'scale-125'
          )}
        >
          {drafts.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2.5 overflow-y-auto min-h-[100px] pb-2">
        {drafts.map((draft) => (
          <ApplicationCard
            key={draft.id}
            draft={draft}
            onClick={() => onCardClick(draft)}
          />
        ))}
        {drafts.length === 0 && (
          <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-foreground/15 text-xs text-muted-foreground">
            Drop cards here
          </div>
        )}
      </div>
    </div>
  );
}
