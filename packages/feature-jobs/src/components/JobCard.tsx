import type { Job } from '@onfile/core';
import { MatchBadge, StatusPill, cn } from '@onfile/ui';
import { Building2 } from 'lucide-react';

interface JobCardProps {
  job: Job;
  isSelected: boolean;
  isChecked: boolean;
  onClick: () => void;
  onToggleChecked: (checked: boolean) => void;
}

export function JobCard({ job, isSelected, isChecked, onClick, onToggleChecked }: JobCardProps) {
  const missingSkills = job.skills.filter((s) => s.required && !s.userHas);

  return (
    <div
      className={cn(
        'w-full border-b border-border hover:bg-muted transition-colors',
        isSelected && 'bg-muted border-l-2 border-l-blue-500'
      )}
    >
      <div className="flex items-stretch">
        <div className="flex items-start px-2 pt-3">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(event) => onToggleChecked(event.target.checked)}
            aria-label={`Select ${job.title}`}
            className="h-3.5 w-3.5 cursor-pointer rounded border-border bg-muted text-blue-500 focus:ring-blue-500"
          />
        </div>

        <button onClick={onClick} className="min-w-0 flex-1 px-2 py-3 text-left">
          <div className="mb-1 flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="truncate text-xs text-muted-foreground">{job.company}</span>
            </div>
            <MatchBadge score={job.matchScore.overall} tier={job.matchScore.tier} />
          </div>

          <p className="mb-1.5 truncate text-sm font-medium text-foreground">{job.title}</p>

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={job.status as any} />
            {missingSkills.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {missingSkills.length} missing skill{missingSkills.length > 1 ? 's' : ''}
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground/70">{job.remote ? 'Remote' : job.location}</span>
          </div>
        </button>
      </div>
    </div>
  );
}
