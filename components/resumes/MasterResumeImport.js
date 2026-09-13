'use client';

// Fills the master resume in from whichever resume is on file for Auto
// Search & Apply (components/resumes/ImportedResumeCard.js, above the tabs
// on this page). There is exactly one resume upload in the app — this reads
// the same backend profile instead of asking for a second upload, and relies
// on the backend's own parser (with an AI pass when a Gemini key is set
// server-side) rather than parsing anything itself.
//
// Nothing is written straight into the form: the fields come back as a
// review panel and the user accepts each one, the same way AI tailoring
// works on the Tailored tab. Accepting only fills the editor — the master
// resume is not saved until the user clicks Save changes.

import { useEffect, useState } from 'react';
import { Loader2, Check, X, FileText, UploadCloud } from 'lucide-react';
import { getActiveProfile } from '@/lib/careersaversApi';
import { profileToMasterResumeFields } from '@/lib/resumeProfile';
import Button from '@/components/ui/Button';

const SECTION_LABELS = {
  summary: 'Summary',
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
};
const EMPTY_FIELDS = { summary: '', experience: '', projects: '', skills: [] };

export default function MasterResumeImport({ currentSkills, onAcceptSection, onAddSkill }) {
  const [status, setStatus] = useState('loading'); // loading | empty | ready
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
          setFields(profileToMasterResumeFields(active));
          setStatus('ready');
        } else {
          setStatus('empty');
        }
      } catch {
        // Backend not running, most likely — same fallback ImportedResumeCard
        // uses, so this doesn't compete with that card's own error message.
        if (!cancelled) setStatus('empty');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function acceptSection(field) {
    if (!fields[field]) return;
    onAcceptSection(field, fields[field]);
    setFields((f) => ({ ...f, [field]: '' }));
  }

  function dismissSection(field) {
    setFields((f) => ({ ...f, [field]: field === 'skills' ? [] : '' }));
  }

  function addSkill(skill) {
    onAddSkill(skill);
    setFields((f) => ({ ...f, skills: f.skills.filter((s) => s !== skill) }));
  }

  function addAllSkills() {
    fields.skills.forEach(onAddSkill);
    setFields((f) => ({ ...f, skills: [] }));
  }

  function acceptAll() {
    ['summary', 'experience', 'projects'].forEach((field) => {
      if (fields[field]) onAcceptSection(field, fields[field]);
    });
    fields.skills.forEach(onAddSkill);
    setFields(EMPTY_FIELDS);
  }

  if (status === 'loading') {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-lg border border-line bg-panel/40 px-4 py-3.5 text-[12.5px] text-inkFaint">
        <Loader2 size={14} className="animate-spin" /> Checking for a resume on file…
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-dashed border-line bg-panel/40 px-4 py-3.5">
        <UploadCloud size={16} className="text-inkFaint mt-0.5 shrink-0" />
        <p className="text-[12.5px] text-inkSoft">
          Upload a resume under &ldquo;Resume for Auto Search &amp; Apply&rdquo; above and its sections
          will show up here to fill in the fields below.
        </p>
      </div>
    );
  }

  const newSkills = fields.skills.filter(
    (skill) => !(currentSkills || []).some((s) => s.toLowerCase() === skill.toLowerCase())
  );
  const hasAnything = Boolean(fields.summary || fields.experience || fields.projects) || newSkills.length > 0;

  // Everything on offer has been accepted or dismissed — nothing left to show.
  if (!hasAnything) return null;

  return (
    <div className="mb-6 rounded-lg border border-line bg-panel/40 p-4">
      <div className="flex items-center gap-2 text-[12px] text-inkSoft mb-3">
        <FileText size={13} className="shrink-0" />
        <span className="truncate">From {profile.resume_file_name}</span>
      </div>

      <div className="space-y-2.5">
        {['summary', 'experience', 'projects'].map((field) => (
          <SectionCard
            key={field}
            label={SECTION_LABELS[field]}
            text={fields[field]}
            onAccept={() => acceptSection(field)}
            onDismiss={() => dismissSection(field)}
          />
        ))}

        {newSkills.length > 0 && (
          <div className="rounded-md border border-pine/40 bg-mint/50 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11.5px] text-pine font-medium">Skills found ({newSkills.length})</span>
              <button
                onClick={() => dismissSection('skills')}
                className="text-inkFaint hover:text-ink focus-ring rounded"
                aria-label="Dismiss skills"
              >
                <X size={12} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {newSkills.map((skill) => (
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
            <Button variant="secondary" onClick={addAllSkills} className="py-1 px-2.5 text-xs">
              Add all skills
            </Button>
          </div>
        )}

        <Button onClick={acceptAll} className="py-1.5 px-3 text-xs">
          <Check size={13} /> Use everything
        </Button>
      </div>
    </div>
  );
}

function SectionCard({ label, text, onAccept, onDismiss }) {
  if (!text) return null;
  return (
    <div className="rounded-md border border-pine/40 bg-mint/50 p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11.5px] text-pine font-medium">{label} found</span>
        <button
          onClick={onDismiss}
          className="text-inkFaint hover:text-ink focus-ring rounded"
          aria-label={`Dismiss ${label.toLowerCase()}`}
        >
          <X size={12} />
        </button>
      </div>
      <p className="text-[13px] text-ink whitespace-pre-line max-h-44 overflow-y-auto mb-2">{text}</p>
      <Button variant="secondary" onClick={onAccept} className="py-1 px-2.5 text-xs">
        <Check size={12} /> Use this {label.toLowerCase()}
      </Button>
    </div>
  );
}
