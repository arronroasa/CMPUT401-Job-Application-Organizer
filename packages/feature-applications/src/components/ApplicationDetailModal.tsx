import type { ApplicationAnswerValue, ApplicationDraft } from '@onfile/core';
import { StatusPill, MatchBadge } from '@onfile/ui';
import { X } from 'lucide-react';

// `draft.answers` values are usually plain strings, but `file` type form
// fields (e.g. resume upload) come back from the backend as structured
// objects instead — see ApplicationAnswerValue. Rendering one of those
// objects directly as a JSX child throws "Objects are not valid as a React
// child" (minified React error #31), so always route values through this
// before rendering.
function formatAnswerValue(value: ApplicationAnswerValue): string {
  if (typeof value === 'string') return value;
  if ('resume_file_name' in value) return `Attached: ${value.resume_file_name}`;
  if ('resume_upload_required' in value) return 'Resume upload required — no resume on file';
  return '';
}

interface ApplicationDetailModalProps {
  draft: ApplicationDraft;
  onEdit: (draftId: string) => void;
  onSubmitApplication: (draftId: string) => void;
  onMarkInterview: (draftId: string) => void;
  onClose: () => void;
}

export function ApplicationDetailModal({
  draft,
  onEdit,
  onSubmitApplication,
  onMarkInterview,
  onClose,
}: ApplicationDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[hsl(var(--foreground)/0.45)]" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">{draft.jobTitle}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{draft.company}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground/80 hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Status + Match */}
          <div className="flex items-center gap-3">
            <StatusPill status={draft.status} />
            <MatchBadge
              score={draft.matchScore}
              tier={draft.matchScore >= 80 ? 'high' : draft.matchScore >= 60 ? 'medium' : 'low'}
            />
          </div>

          {/* Resume Version */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Resume Version</p>
            <p className="text-sm text-foreground">{draft.resumeVersionId}</p>
          </div>

          {/* Missing Skills */}
          {draft.missingSkills.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Missing Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {draft.missingSkills.map((skill) => (
                  <span key={skill} className="text-xs px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Cover Letter preview */}
          {draft.coverLetter && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Cover Letter</p>
              <p className="text-sm text-foreground/80 leading-relaxed line-clamp-4">{draft.coverLetter}</p>
            </div>
          )}

          {/* Answers preview */}
          {Object.keys(draft.answers).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Screening Answers</p>
              <div className="space-y-3">
                {Object.entries(draft.answers).map(([q, a]) => (
                  <div key={q}>
                    <p className="text-xs text-muted-foreground mb-1">{q}</p>
                    <p className="text-sm text-foreground/80 line-clamp-3">{formatAnswerValue(a)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
            <p>Created: {new Date(draft.createdAt).toLocaleDateString()}</p>
            {draft.submittedAt && <p>Submitted: {new Date(draft.submittedAt).toLocaleDateString()}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              onClick={() => onEdit(draft.id)}
              className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground/80 text-xs font-medium transition-colors"
            >
              Edit
            </button>
            {draft.status === 'approved' && (
              <button
                onClick={() => onSubmitApplication(draft.id)}
                className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
              >
                Submit Application
              </button>
            )}
            {draft.status === 'submitted' && (
              <button
                onClick={() => onMarkInterview(draft.id)}
                className="px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors"
              >
                Mark as Interview
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
