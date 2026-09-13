'use client';

// Fills the version being edited in from whichever resume is on file for
// Auto Search & Apply (components/resumes/ImportedResumeCard.js, on the
// Resumes page). There is exactly one resume upload in the app — this reads
// the same backend profile instead of asking for a second upload, and
// relies on the backend's own parser (with an AI pass when a Gemini key is
// set server-side) rather than parsing anything itself.
//
// Nothing is written straight into the form: each section comes back as a
// review the user accepts or dismisses (see CONTEXT.md's "Resume import").
// Accepting only fills the editor — the version is not saved until the
// user clicks Save changes.

import { useEffect, useState } from 'react';
import { Loader2, Check, X, FileText, UploadCloud, AlertTriangle } from 'lucide-react';
import { getActiveProfile, CareersaversApiError } from '@/lib/careersaversApi';
import { profileToResumeVersionFields } from '@/lib/resumeProfile';
import Button from '@/components/ui/Button';

const SECTION_LABELS = { education: 'Education', experience: 'Experience', projects: 'Projects' };
const EMPTY_FIELDS = { education: [], experience: [], projects: [], skills: { languages: [], frameworks: [], tools: [] } };

export default function ResumeImport({ onAcceptSection, onAddSkill }) {
  const [status, setStatus] = useState('loading'); // loading | empty | ready | error
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [fields, setFields] = useState(EMPTY_FIELDS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const active = await getActiveProfile();
        if (cancelled) return;
        if (active && active.resume_file_name) {
          setProfile(active);
          setFields(profileToResumeVersionFields(active));
          setStatus('ready');
        } else {
          setStatus('empty');
        }
      } catch (err) {
        if (cancelled) return;
        // Distinct from "empty" (checked fine, nothing on file) — this is
        // "couldn't check", so it shouldn't tell the user to go re-upload.
        setError(err instanceof CareersaversApiError ? err.message : 'Could not check for a resume on file.');
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function acceptSection(field) {
    if (!fields[field]?.length) return;
    onAcceptSection(field, fields[field]);
    setFields((f) => ({ ...f, [field]: [] }));
  }

  function dismissSection(field) {
    setFields((f) => ({ ...f, [field]: [] }));
  }

  function addSkill(skill) {
    onAddSkill(skill);
    setFields((f) => ({ ...f, skills: { ...f.skills, tools: f.skills.tools.filter((s) => s !== skill) } }));
  }

  function acceptAll() {
    ['education', 'experience', 'projects'].forEach((field) => {
      if (fields[field]?.length) onAcceptSection(field, fields[field]);
    });
    fields.skills.tools.forEach(onAddSkill);
    setFields(EMPTY_FIELDS);
  }

  if (status === 'loading') {
    return (
      <div className="mb-5 flex items-center gap-2 rounded-lg border border-line bg-panel/40 px-4 py-3.5 text-[12.5px] text-inkFaint">
        <Loader2 size={14} className="animate-spin" /> Checking for a resume on file…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mb-5 flex items-start gap-2 rounded-lg border border-stageClosed/30 bg-stageClosedSoft px-3.5 py-3 text-[12.5px] text-stageClosed">
        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-dashed border-line bg-panel/40 px-4 py-3.5">
        <UploadCloud size={16} className="text-inkFaint mt-0.5 shrink-0" />
        <p className="text-[12.5px] text-inkSoft">
          Upload a resume under &ldquo;Resume for Auto Search &amp; Apply&rdquo; above and its sections
          will show up here to fill in the fields below.
        </p>
      </div>
    );
  }

  const skills = fields.skills.tools;
  const hasAnything = fields.education.length > 0 || fields.experience.length > 0 || fields.projects.length > 0 || skills.length > 0;

  if (!hasAnything) return null;

  return (
    <div className="mb-5 rounded-lg border border-line bg-panel/40 p-4">
      <div className="flex items-center gap-2 text-[12px] text-inkSoft mb-3">
        <FileText size={13} className="shrink-0" />
        <span className="truncate">From {profile.resume_file_name}</span>
      </div>

      <div className="space-y-2.5">
        {['education', 'experience', 'projects'].map((field) =>
          fields[field].length > 0 ? (
            <SectionCard
              key={field}
              label={SECTION_LABELS[field]}
              count={fields[field].length}
              onAccept={() => acceptSection(field)}
              onDismiss={() => dismissSection(field)}
            />
          ) : null
        )}

        {skills.length > 0 && (
          <div className="rounded-md border border-pine/40 bg-mint/50 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11.5px] text-pine font-medium">Skills found ({skills.length})</span>
              <button
                onClick={() => dismissSection('skills')}
                className="text-inkFaint hover:text-ink focus-ring rounded"
                aria-label="Dismiss skills"
              >
                <X size={12} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <button
                  key={skill}
                  onClick={() => addSkill(skill)}
                  className="inline-flex items-center gap-1 text-[12.5px] px-2.5 py-1 rounded-full border border-dashed border-pine text-pine hover:bg-mint transition-colors focus-ring"
                  title="Click to add this skill"
                >
                  + {skill}
                </button>
              ))}
            </div>
          </div>
        )}

        <Button onClick={acceptAll} className="py-1.5 px-3 text-xs">
          <Check size={13} /> Use everything
        </Button>
      </div>
    </div>
  );
}

function SectionCard({ label, count, onAccept, onDismiss }) {
  return (
    <div className="rounded-md border border-pine/40 bg-mint/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-pine font-medium">
          {label} found ({count})
        </span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onAccept} className="py-1 px-2.5 text-xs">
            <Check size={12} /> Use this {label.toLowerCase()}
          </Button>
          <button onClick={onDismiss} className="text-inkFaint hover:text-ink focus-ring rounded" aria-label={`Dismiss ${label.toLowerCase()}`}>
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
