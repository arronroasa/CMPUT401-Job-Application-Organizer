'use client';

import { MapPin, Plus, Check, X } from 'lucide-react';
import Button from '@/components/ui/Button';

const TIER_STYLE = {
  high: 'bg-stageOfferSoft text-ink',
  medium: 'bg-stageScreeningSoft text-ink',
  low: 'bg-stageAppliedSoft text-inkSoft',
};

export function MatchBadge({ job }) {
  const tier = job.match_tier || 'low';
  const pct = Math.round((job.match_score || 0) * 100);
  return (
    <span className={`inline-flex items-center rounded-full px-[11px] py-[5px] text-xs font-medium ${TIER_STYLE[tier] || TIER_STYLE.low}`}>
      {pct}% match
    </span>
  );
}

export default function JobCard({ job, onOpen, onDismiss, onTrack, tracked }) {
  const skills = Array.isArray(job.skills_required_json) ? job.skills_required_json : [];

  return (
    <div className="bg-surface border border-line rounded-xl p-5 flex flex-col gap-3 transition-all duration-300 hover:-translate-y-1 hover:border-ink/25 hover:shadow-card animate-[lsPop_.4s_cubic-bezier(.2,.8,.2,1)_both]">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => onOpen(job)} className="text-left focus-ring rounded min-w-0">
          <h3 className="font-display font-semibold text-[17px] text-ink leading-snug truncate">{job.title}</h3>
          <p className="text-[13.5px] text-inkSoft truncate">{job.company}</p>
        </button>
        <button
          onClick={() => onDismiss(job)}
          title="Dismiss"
          className="text-inkFaint hover:text-ink focus-ring rounded shrink-0"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-[12.5px] text-inkFaint">
        <MatchBadge job={job} />
        {job.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin size={12} /> {job.location}
            {job.remote ? ' · Remote' : ''}
          </span>
        )}
      </div>

      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.slice(0, 6).map((s) => (
            <span
              key={s.name}
              className={`text-[12px] px-2.5 py-1 rounded-full ${
                s.userHas ? 'bg-stageOfferSoft text-ink' : s.required ? 'bg-stageClosedSoft text-ink' : 'bg-panel text-inkSoft'
              }`}
            >
              {s.name}
            </span>
          ))}
          {skills.length > 6 && <span className="text-[12px] text-inkFaint px-1 py-1">+{skills.length - 6} more</span>}
        </div>
      )}

      <p className="text-[13.5px] text-inkSoft line-clamp-3">{job.description || 'No description available.'}</p>

      <div className="flex items-center gap-2 pt-1 mt-auto flex-wrap">
        <Button
          variant={tracked ? 'ghost' : 'secondary'}
          onClick={() => !tracked && onTrack(job)}
          disabled={tracked}
          className="py-2 px-3 text-[13px]"
        >
          {tracked ? <Check size={14} /> : <Plus size={14} />}
          {tracked ? 'Tracked' : 'Track'}
        </Button>
      </div>
    </div>
  );
}
