'use client';

import { useRef, useState } from 'react';
import { X, UploadCloud, ExternalLink, Check, Loader2, Sparkles, Search, MousePointerClick, AlertTriangle } from 'lucide-react';
import { useStore } from '@/lib/store';
import Button from '@/components/ui/Button';
import {
  uploadResumeForAutoSearch,
  startAutoSearchDiscovery,
  pollAutoSearchStatus,
  getDiscoveredJobs,
  prepareApplicationDraft,
  fillApplicationDraft,
  resolveBackendUrl,
  CareersaversApiError,
} from '@/lib/careersaversApi';

// Steps: 'search' -> 'searching' -> 'results' | 'error'
export default function AutoSearchModal({ onClose }) {
  const { addApplication } = useStore();
  const [step, setStep] = useState('search');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [file, setFile] = useState(null);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState([]);
  const [addedIds, setAddedIds] = useState(() => new Set());
  const [applyState, setApplyState] = useState({});
  const fileInputRef = useRef(null);

  function pickFile(f) {
    if (!f) return;
    setFile(f);
  }

  async function runSearch() {
    if (!role.trim()) return;
    setError('');
    setStep('searching');
    try {
      if (file) {
        setProgressLabel('Reading your resume…');
        await uploadResumeForAutoSearch(file);
      }

      setProgressLabel('Searching…');
      await startAutoSearchDiscovery({ query: role, location, remote: remoteOnly });

      await pollAutoSearchStatus({
        onTick: (status) => {
          const found = status.jobs_found || 0;
          setProgressLabel(
            found > 0 ? `Searching… ${found} job${found === 1 ? '' : 's'} found so far` : 'Searching for matching roles…'
          );
        },
      });

      setProgressLabel('Loading results…');
      const found = await getDiscoveredJobs();
      setJobs(found);
      setStep('results');
    } catch (err) {
      setError(
        err instanceof CareersaversApiError
          ? err.message
          : 'Something went wrong while running the search.'
      );
      setStep('error');
    }
  }

  function addJob(job) {
    addApplication({
      company: job.company,
      role: job.title,
      location: job.location || '',
      notes: [job.description, job.source_url].filter(Boolean).join('\n\n'),
    });
    setAddedIds((prev) => new Set(prev).add(job.id));
  }

  function addAll() {
    jobs.forEach((job) => {
      if (!addedIds.has(job.id)) addJob(job);
    });
  }

  function setJobApplyState(jobId, patch) {
    setApplyState((prev) => ({ ...prev, [jobId]: { ...prev[jobId], ...patch } }));
  }

  function startApply(job) {
    setJobApplyState(job.id, { phase: 'confirm', message: '' });
  }

  function cancelApply(job) {
    setJobApplyState(job.id, { phase: 'idle', message: '' });
  }

  async function confirmApply(job) {
    setJobApplyState(job.id, { phase: 'preparing', message: '' });
    try {
      const draft = await prepareApplicationDraft(job.id);
      setJobApplyState(job.id, { phase: 'filling', draftId: draft.id });
      const result = await fillApplicationDraft(draft.id);
      setJobApplyState(job.id, {
        phase: 'done',
        screenshotUrl: resolveBackendUrl(result.screenshot_url),
      });
    } catch (err) {
      const needsResume = err instanceof CareersaversApiError && err.needsResume;
      setJobApplyState(job.id, {
        phase: needsResume ? 'needsResume' : 'error',
        message: err instanceof CareersaversApiError ? err.message : 'Something went wrong while filling in the application.',
      });
    }
  }

  function pickApplyResume(job, resumeFile) {
    if (!resumeFile) return;
    setJobApplyState(job.id, { resumeFile });
  }

  async function uploadResumeAndRetryApply(job) {
    const resumeFile = (applyState[job.id] || {}).resumeFile;
    if (!resumeFile) return;
    setJobApplyState(job.id, { phase: 'preparing', message: '' });
    try {
      await uploadResumeForAutoSearch(resumeFile);
    } catch (err) {
      setJobApplyState(job.id, {
        phase: 'needsResume',
        message: err instanceof CareersaversApiError ? err.message : 'Could not upload that resume — try again.',
      });
      return;
    }
    await confirmApply(job);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/[.34] px-6 animate-[lsFade_.28s_ease_both]"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl border border-line w-full max-w-[560px] p-7 max-h-[88vh] overflow-y-auto overscroll-contain animate-[lsPop_.4s_cubic-bezier(.2,.8,.2,1)_both]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-semibold text-[23px] text-ink flex items-center gap-2">
            <Sparkles size={19} className="text-inkSoft" />
            Auto Search
          </h2>
          <button onClick={onClose} className="text-inkFaint hover:text-ink focus-ring rounded text-lg leading-none">
            <X size={18} />
          </button>
        </div>

        {step === 'search' && (
          <div className="space-y-4">
            <p className="text-[13.5px] text-inkSoft">
              Tell us what to search for and we'll look across public job boards for matching openings,
              powered by the careersavers discovery engine.
            </p>

            <Field label="Role or keywords">
              <input
                autoFocus
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Backend engineer intern"
                className="input"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Location">
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Remote, Edmonton AB, etc."
                  className="input"
                />
              </Field>
              <label className="flex items-center gap-2 mt-6 text-[13px] text-inkSoft cursor-pointer">
                <input
                  type="checkbox"
                  checked={remoteOnly}
                  onChange={(e) => setRemoteOnly(e.target.checked)}
                  className="accent-ink"
                />
                Remote only
              </label>
            </div>

            <details className="rounded-lg border border-line px-4 py-3 group">
              <summary className="text-[12.5px] text-inkSoft cursor-pointer select-none">
                Optionally add a resume to improve match scoring
              </summary>
              <label
                className="mt-3 flex flex-col items-center justify-center gap-2 border border-dashed border-line rounded-xl py-8 px-4 text-center cursor-pointer hover:border-ink/40 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  pickFile(e.dataTransfer.files?.[0]);
                }}
              >
                <UploadCloud size={20} className="text-inkFaint" />
                <span className="text-[13px] text-ink font-medium">
                  {file ? file.name : 'Click to choose a resume, or drag it here'}
                </span>
                <span className="text-[11px] text-inkFaint">PDF, DOCX, or TXT</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0])}
                />
              </label>
            </details>

            <p className="text-[11.5px] text-inkFaint">
              Requires the job-search backend running locally (uvicorn app.main:app --reload, from the
              backend/ folder).
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" disabled={!role.trim()} onClick={runSearch}>
                <Search size={15} /> Search
              </Button>
            </div>
          </div>
        )}

        {step === 'searching' && (
          <div className="flex flex-col items-center justify-center gap-4 py-14">
            <Loader2 size={26} className="animate-spin text-inkSoft" />
            <p className="text-[13.5px] text-inkSoft text-center">{progressLabel}</p>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-stageClosed/30 bg-stageClosedSoft px-4 py-3.5 text-[13px] text-stageClosed">
              {error}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button type="button" onClick={() => setStep('search')}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {step === 'results' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[13.5px] text-inkSoft">
                {jobs.length} match{jobs.length === 1 ? '' : 'es'} for "{role}"
              </p>
              {jobs.length > 0 && (
                <Button type="button" variant="secondary" onClick={addAll}>
                  Add all
                </Button>
              )}
            </div>

            {jobs.length === 0 && (
              <div className="px-4 py-10 text-center text-inkFaint text-sm border border-dashed border-line rounded-lg">
                No matching jobs were found. Try a different search term or location.
              </div>
            )}

            <div className="space-y-2.5 max-h-[420px] overflow-y-auto overscroll-contain pr-1">
              {jobs.map((job) => {
                const added = addedIds.has(job.id);
                const matchPct = Math.round((job.match_score || 0) * 100);
                const apply = applyState[job.id] || { phase: 'idle' };
                return (
                  <div key={job.id} className="rounded-lg border border-line overflow-hidden">
                    <div className="px-4 py-3.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-medium text-ink truncate">{job.title}</span>
                          {Number.isFinite(job.match_score) && (
                            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-mint/60 text-pine tracking-wide">
                              {matchPct}% match
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-inkSoft truncate">
                          {job.company}
                          {job.location ? ` · ${job.location}` : ''}
                        </p>
                        {job.source_url && (
                          <a
                            href={job.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11.5px] text-inkFaint hover:text-ink mt-1"
                          >
                            View posting <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Button
                          type="button"
                          variant={added ? 'secondary' : 'primary'}
                          onClick={() => !added && addJob(job)}
                          disabled={added}
                        >
                          {added ? (
                            <>
                              <Check size={14} /> Added
                            </>
                          ) : (
                            'Add'
                          )}
                        </Button>
                        {job.source_url && apply.phase === 'idle' && (
                          <Button type="button" variant="secondary" onClick={() => startApply(job)}>
                            <MousePointerClick size={14} /> Apply
                          </Button>
                        )}
                      </div>
                    </div>

                    {apply.phase === 'confirm' && (
                      <div className="border-t border-line bg-paper px-4 py-3.5 space-y-2.5">
                        <p className="text-[12.5px] text-inkSoft">
                          This connects to a Chrome window you already have open with remote debugging
                          enabled, navigates it to this job's application page, and fills in the form from
                          your resume. It never submits anything — you review and submit it yourself.
                        </p>
                        <p className="text-[11px] text-inkFaint">
                          Chrome not running with debugging yet? Launch it first, e.g. on macOS: <br />
                          <code className="text-[10.5px]">
                            open -a "Google Chrome" --args --remote-debugging-port=9222
                          </code>
                        </p>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="secondary" onClick={() => cancelApply(job)}>
                            Cancel
                          </Button>
                          <Button type="button" onClick={() => confirmApply(job)}>
                            Fill it in
                          </Button>
                        </div>
                      </div>
                    )}

                    {(apply.phase === 'preparing' || apply.phase === 'filling') && (
                      <div className="border-t border-line bg-paper px-4 py-3.5 flex items-center gap-2.5">
                        <Loader2 size={15} className="animate-spin text-inkSoft shrink-0" />
                        <p className="text-[12.5px] text-inkSoft">
                          {apply.phase === 'preparing'
                            ? 'Reading the application form and drafting answers…'
                            : 'Filling in the form in your Chrome window — check it out.'}
                        </p>
                      </div>
                    )}

                    {apply.phase === 'needsResume' && (
                      <div className="border-t border-line bg-stageClosedSoft px-4 py-3.5 space-y-2.5">
                        <div className="flex items-start gap-2 text-[12.5px] text-stageClosed">
                          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                          <span>{apply.message}</span>
                        </div>
                        <label
                          className="flex flex-col items-center justify-center gap-1.5 border border-dashed border-line rounded-lg py-5 px-4 text-center cursor-pointer hover:border-ink/40 transition-colors bg-surface"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            pickApplyResume(job, e.dataTransfer.files?.[0]);
                          }}
                        >
                          <UploadCloud size={18} className="text-inkFaint" />
                          <span className="text-[12.5px] text-ink font-medium">
                            {apply.resumeFile ? apply.resumeFile.name : 'Click to choose your resume, or drag it here'}
                          </span>
                          <span className="text-[10.5px] text-inkFaint">PDF, DOCX, or TXT</span>
                          <input
                            type="file"
                            accept=".pdf,.docx,.doc,.txt"
                            className="hidden"
                            onChange={(e) => pickApplyResume(job, e.target.files?.[0])}
                          />
                        </label>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="secondary" onClick={() => cancelApply(job)}>
                            Close
                          </Button>
                          <Button type="button" disabled={!apply.resumeFile} onClick={() => uploadResumeAndRetryApply(job)}>
                            Upload & fill
                          </Button>
                        </div>
                      </div>
                    )}

                    {apply.phase === 'error' && (
                      <div className="border-t border-line bg-stageClosedSoft px-4 py-3.5 space-y-2.5">
                        <div className="flex items-start gap-2 text-[12.5px] text-stageClosed">
                          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                          <span>{apply.message}</span>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="secondary" onClick={() => cancelApply(job)}>
                            Close
                          </Button>
                          <Button type="button" onClick={() => confirmApply(job)}>
                            Try again
                          </Button>
                        </div>
                      </div>
                    )}

                    {apply.phase === 'done' && (
                      <div className="border-t border-line bg-mint/30 px-4 py-3.5 space-y-2.5">
                        <div className="flex items-center gap-2 text-[12.5px] text-pine">
                          <Check size={15} className="shrink-0" />
                          Filled in your Chrome window — review it there and submit whenever you're ready.
                        </div>
                        {apply.screenshotUrl && (
                          <a href={apply.screenshotUrl} target="_blank" rel="noreferrer">
                            <img
                              src={apply.screenshotUrl}
                              alt="Filled application preview"
                              className="rounded-md border border-line max-h-[220px] object-cover object-top"
                            />
                          </a>
                        )}
                        <div className="flex justify-end">
                          <Button type="button" variant="secondary" onClick={() => cancelApply(job)}>
                            Close
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between pt-2">
              <Button type="button" variant="secondary" onClick={() => setStep('search')}>
                New search
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-inkSoft mb-1">{label}</span>
      {children}
    </label>
  );
}
