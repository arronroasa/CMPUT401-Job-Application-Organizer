import type { ApplicationStatus } from '@onfile/core';
import { cn } from '../utils/cn';

interface StatusPillProps {
  status: ApplicationStatus;
  className?: string;
}

// Lodestar theme: soft pastel fills (mint/gold/blue/pink) on light cream,
// matching the .dc.html mockup's stage chips.
const statusStyles: Record<ApplicationStatus, string> = {
  drafted: 'bg-muted text-muted-foreground',
  approved: 'bg-[hsl(var(--ls-blue-light))] text-[#2c4a68] border border-[hsl(var(--ls-blue)/0.3)]',
  submitted: 'bg-[hsl(var(--ls-blue-light2))] text-[#2c4a68] border border-[hsl(var(--ls-blue)/0.3)]',
  interview: 'bg-[hsl(var(--ls-pink))] text-[#7a3358] border border-[hsl(var(--ls-pink)/0.6)]',
  offer: 'bg-[hsl(var(--ls-mint))] text-[#1f3d28] border border-[hsl(var(--primary)/0.3)]',
  rejected: 'bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))] border border-[hsl(var(--destructive)/0.3)]',
  archived: 'bg-muted text-muted-foreground/70',
};

const statusLabel: Record<ApplicationStatus, string> = {
  drafted: 'Drafted',
  approved: 'Approved',
  submitted: 'Submitted',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  archived: 'Archived',
};

export function StatusPill({ status, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        statusStyles[status],
        className
      )}
    >
      {statusLabel[status]}
    </span>
  );
}
