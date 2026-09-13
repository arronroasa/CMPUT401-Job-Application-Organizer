'use client';

// Imports/re-imports the ONE resume the backend actually uses: Auto Search's
// match-score ranking and the Apply autofill (careersavers, lifted into
// backend/) both read straight off whichever profile is "active" there.
// This is deliberately separate from the Master/Tailored resume editor
// above — that's local content you write yourself; this is a real file
// that gets AI-parsed into structured profile data server-side.

import { useEffect, useRef, useState } from 'react';
import { UploadCloud, FileText, Check, Loader2, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import { getActiveProfile, uploadResume, CareersaversApiError } from '@/lib/careersaversApi';

function formatWhen(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ImportedResumeCard() {
  const [status, setStatus] = useState('loading'); // loading | empty | ready | uploading | error
  const [profile, setProfile] = useState(null);
  const [extracted, setExtracted] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const active = await getActiveProfile();
        if (cancelled) return;
        if (active && active.resume_file_name) {
          setProfile(active);
          setStatus('ready');
        } else {
          setStatus('empty');
        }
      } catch (err) {
        if (cancelled) return;
        // Backend not running yet, most likely — don't block the page on it,
        // just fall back to the upload prompt.
        setStatus('empty');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFile(file) {
    if (!file) return;
    setStatus('uploading');
    setError('');
    try {
      const result = await uploadResume(file);
      setProfile(result.profile);
      setExtracted(result.extracted);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof CareersaversApiError ? err.message : 'Something went wrong while parsing that resume.');
      setStatus('error');
    }
  }

  // skills_json entries are structured objects ({id, name, level,
  // confidenceScore, yearsOfExperience, tags}), not plain strings — pull out
  // just the display name.
  const skills = (Array.isArray(profile?.skills_json) ? profile.skills_json : [])
    .map((item) => (typeof item === 'string' ? item : item?.name))
    .filter(Boolean);

  return (
    <div className="rounded-xl border border-line bg-surface p-5 mb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[15px] font-medium text-ink flex items-center gap-1.5">
            <Sparkles size={16} className="text-inkSoft" />
            Resume for Auto Search &amp; Apply
          </h2>
          <p className="text-[12.5px] text-inkSoft mt-0.5">
            Upload once — it's parsed automatically and used to rank Auto Search matches and to fill in
            applications when you click Apply.
          </p>
        </div>
      </div>

      {status === 'loading' && (
        <div className="flex items-center gap-2 py-6 justify-center text-inkFaint text-[12.5px]">
          <Loader2 size={15} className="animate-spin" /> Checking for a resume on file…
        </div>
      )}

      {(status === 'empty' || status === 'error') && (
        <div className="space-y-2.5">
          {status === 'error' && (
            <div className="flex items-start gap-2 rounded-lg border border-stageClosed/30 bg-stageClosedSoft px-3.5 py-3 text-[12.5px] text-stageClosed">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <UploadDropzone onPick={handleFile} fileInputRef={fileInputRef} />
        </div>
      )}

      {status === 'uploading' && (
        <div className="flex items-center gap-2.5 py-6 justify-center text-inkSoft text-[13px]">
          <Loader2 size={16} className="animate-spin" /> Reading and parsing your resume…
        </div>
      )}

      {status === 'ready' && profile && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-line px-4 py-3.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint/60 text-pine">
              <FileText size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-ink truncate">{profile.resume_file_name}</p>
              <p className="text-[12px] text-inkSoft">
                {profile.name ? `${profile.name} · ` : ''}
                Parsed {formatWhen(profile.resume_uploaded_at) || 'just now'}
              </p>
              {(extracted || skills.length > 0) && (
                <p className="text-[11.5px] text-inkFaint mt-1">
                  {extracted
                    ? `${extracted.skills_extracted} skills · ${extracted.experiences_extracted} roles · ${extracted.education_extracted} education entr${extracted.education_extracted === 1 ? 'y' : 'ies'}${extracted.used_ai ? ' · AI-parsed' : ''}`
                    : `${skills.length} skill${skills.length === 1 ? '' : 's'} on file`}
                </p>
              )}
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {skills.slice(0, 10).map((skill, i) => (
                    <span key={`${skill}-${i}`} className="text-[11px] px-2 py-0.5 rounded-full bg-panel text-inkSoft">
                      {skill}
                    </span>
                  ))}
                  {skills.length > 10 && (
                    <span className="text-[11px] px-2 py-0.5 text-inkFaint">+{skills.length - 10} more</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 text-[11.5px] text-pine shrink-0 mt-0.5">
              <Check size={13} /> Active
            </div>
          </div>

          <label className="inline-flex items-center gap-1.5 text-[12.5px] text-inkSoft hover:text-ink cursor-pointer transition-colors">
            <RefreshCw size={13} />
            Replace with a different resume
            <input
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function UploadDropzone({ onPick, fileInputRef }) {
  return (
    <label
      className="flex flex-col items-center justify-center gap-2 border border-dashed border-line rounded-xl py-8 px-4 text-center cursor-pointer hover:border-ink/40 transition-colors"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onPick(e.dataTransfer.files?.[0]);
      }}
    >
      <UploadCloud size={20} className="text-inkFaint" />
      <span className="text-[13px] text-ink font-medium">Click to choose a resume, or drag it here</span>
      <span className="text-[11px] text-inkFaint">PDF, DOCX, or TXT</span>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
    </label>
  );
}
