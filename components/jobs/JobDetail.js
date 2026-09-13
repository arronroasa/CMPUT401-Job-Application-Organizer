'use client';

import { X, ExternalLink, Sparkles, Plus, Check, Loader2, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Portal from '@/components/ui/Portal';
import { MatchBadge } from './JobCard';

export default function JobDetail({ job, onClose, onDismiss, onGenerateResume, onTrack, generating, tracked }) {
  const skills = Array.isArray(job.skills_required_json) ? job.skills_required_json : [];

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/[.34] animate-[lsFade_.3s_ease_both]" onClick={onClose}>
      <div
        className="w-full max-w-[520px] h-full bg-surface border-l border-line overflow-y-auto px-[30px] py-[30px] animate-[lsSlide_.42s_cubic-bezier(.2,.8,.2,1)_both]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-[25px] text-ink mb-1">{job.title}</h2>
            <p className="text-[13.5px] text-inkSoft truncate">
              {job.company}
              {job.location ? ` · ${job.location}` : ''}
              {job.remote ? ' · Remote' : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-inkFaint hover:text-ink focus-ring rounded text-lg leading-none shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 my-4 flex-wrap">
          <MatchBadge job={job} />
          {job.source && <span className="text-[12px] text-inkFaint">via {job.source}</span>}
          {job.source_url && (
            <a
              href={job.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-pine hover:underline"
            >
              Original listing <ExternalLink size={11} />
            </a>
          )}
        </div>

        <Section title="Skills">
          {skills.length === 0 ? (
            <p className="text-sm text-inkFaint">No specific skills extracted for this posting.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <span
                  key={s.name}
                  className={`text-[12.5px] px-3 py-1.5 rounded-full ${
                    s.userHas ? 'bg-stageOfferSoft text-ink' : s.required ? 'bg-stageClosedSoft text-ink' : 'bg-panel text-inkSoft'
                  }`}
                  title={s.userHas ? 'You have this skill' : s.required ? 'Required, not yet on your profile' : 'Nice to have'}
                >
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </Section>

        <Section title="Description">
          <p className="text-sm text-ink whitespace-pre-line">{job.description || 'No description available.'}</p>
        </Section>

        <div className="pt-4 border-t border-line mt-6 flex items-center gap-2 flex-wrap">
          <Button onClick={() => onGenerateResume(job)} disabled={generating}>
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {generating ? 'Generating…' : 'Generate tailored resume'}
          </Button>
          <Button variant={tracked ? 'ghost' : 'secondary'} onClick={() => !tracked && onTrack(job)} disabled={tracked}>
            {tracked ? <Check size={14} /> : <Plus size={14} />}
            {tracked ? 'Tracked' : 'Track application'}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onDismiss(job);
              onClose();
            }}
          >
            <Trash2 size={14} /> Dismiss
          </Button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

function Section({ title, children }) {
  return (
    <div className="py-4 border-t border-line first:border-t-0">
      <h3 className="text-[11px] tracking-[.18em] uppercase text-inkFaint mb-2.5">{title}</h3>
      {children}
    </div>
  );
}
