import type { Job } from '@onfile/core';
import { MatchBadge } from '@onfile/ui';
import { CheckCircle2, XCircle, MapPin, Wifi, FileText, Send, Star, ExternalLink } from 'lucide-react';

interface JobDetailProps {
  job: Job;
  onPrepareResume: (jobId: string) => void;
  onPrepareApplication: (jobId: string) => void;
  onMarkInterested: (jobId: string) => void;
}

function formatDescription(value: string): string {
  const decoded = value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  if (!/[<>]/.test(decoded)) {
    return decoded.trim();
  }

  const withBreaks = decoded
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '- ');

  return withBreaks
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function JobDetail({ job, onPrepareResume, onPrepareApplication, onMarkInterested }: JobDetailProps) {
  const requiredSkills = job.skills.filter((s) => s.required);
  const optionalSkills = job.skills.filter((s) => !s.required);
  const description = formatDescription(job.description);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{job.title}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{job.company}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {job.location}
              </span>
              {job.remote && (
                <span className="flex items-center gap-1">
                  <Wifi className="w-3 h-3" />
                  Remote OK
                </span>
              )}
            </div>
          </div>
          <MatchBadge score={job.matchScore.overall} tier={job.matchScore.tier} />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => onPrepareResume(job.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Prepare Resume
          </button>
          <button
            onClick={() => onPrepareApplication(job.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground text-xs font-medium transition-colors"
            title="AI-assisted, user-controlled two-step flow with explicit final confirmation"
          >
            <Send className="w-3.5 h-3.5" />
            AI Assisted Apply
          </button>
          <a
            href={job.sourceUrl || '#'}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              job.sourceUrl
                ? 'bg-muted hover:bg-muted text-foreground'
                : 'bg-muted text-muted-foreground pointer-events-none'
            }`}
            title="Open original job posting"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Job Page
          </a>
          <button
            onClick={() => onMarkInterested(job.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground/80 text-xs font-medium transition-colors"
          >
            <Star className="w-3.5 h-3.5" />
            Mark Interested
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Skills */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Required Skills
          </h3>
          <div className="space-y-1.5">
            {requiredSkills.map((skill) => (
              <div key={skill.name} className="flex items-center gap-2">
                {skill.userHas ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500/70 shrink-0" />
                )}
                <span className={`text-sm ${skill.userHas ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {skill.name}
                </span>
                {!skill.userHas && (
                  <span className="text-xs text-red-400/70 ml-auto">missing</span>
                )}
              </div>
            ))}
          </div>

          {optionalSkills.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 mt-4">
                Nice to Have
              </h3>
              <div className="flex flex-wrap gap-2">
                {optionalSkills.map((skill) => (
                  <span
                    key={skill.name}
                    className={`text-xs px-2 py-0.5 rounded-md border ${
                      skill.userHas
                        ? 'border-border text-foreground/80 bg-muted'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {skill.userHas ? '✓ ' : ''}{skill.name}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Description */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Description
          </h3>
          <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
            {description}
          </div>
        </section>

        {/* Score breakdown */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Match Breakdown
          </h3>
          <div className="space-y-2">
            {[
              { label: 'Skill Match', value: job.matchScore.skillMatch },
              { label: 'Experience Alignment', value: job.matchScore.experienceAlignment },
              { label: 'Role Alignment', value: job.matchScore.roleAlignment },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{label}</span>
                  <span>{value}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-amber-500' : 'bg-muted'}`}
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
