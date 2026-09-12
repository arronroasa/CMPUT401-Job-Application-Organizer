import type { Job } from '@onfile/core';
import { JobCard } from './JobCard';

interface JobListProps {
  jobs: Job[];
  selectedJobId: string | null;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onToggleSelected: (id: string, checked: boolean) => void;
}

export function JobList({
  jobs,
  selectedJobId,
  selectedIds,
  onSelect,
  onToggleSelected,
}: JobListProps) {
  if (jobs.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No jobs found.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          isSelected={job.id === selectedJobId}
          isChecked={selectedIds.includes(job.id)}
          onClick={() => onSelect(job.id)}
          onToggleChecked={(checked) => onToggleSelected(job.id, checked)}
        />
      ))}
    </div>
  );
}
