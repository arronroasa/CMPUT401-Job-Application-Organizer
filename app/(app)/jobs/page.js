'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Link2, AlertTriangle, Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { fetchJobs, importJobLink, archiveJob, runDiscovery, getDiscoveryStatus, generateResumesForJob, getResume } from '@/lib/api';
import { mapBackendResumeContent } from '@/lib/resumeMapping';
import Button from '@/components/ui/Button';
import JobCard from '@/components/jobs/JobCard';
import JobDetail from '@/components/jobs/JobDetail';
import ImportJobModal from '@/components/jobs/ImportJobModal';

export default function JobsPage() {
  const router = useRouter();
  const { data, addApplication, addResumeVersionFromFields } = useStore();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const pollRef = useRef(null);

  const [showImport, setShowImport] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await fetchJobs();
      setJobs(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message || 'Could not load jobs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  function startScan() {
    setScanning(true);
    setScanMessage('Scanning for new postings…');
    setError('');
    runDiscovery()
      .then(() => {
        pollRef.current = setInterval(async () => {
          try {
            const status = await getDiscoveryStatus();
            if (status.status !== 'running') {
              clearInterval(pollRef.current);
              pollRef.current = null;
              setScanning(false);
              const found = status.jobs_new ?? status.jobs_found ?? 0;
              setScanMessage(
                status.status === 'failed'
                  ? 'Scan finished with errors — showing what was already found.'
                  : `Scan complete — ${found} new job${found === 1 ? '' : 's'}.`
              );
              load();
              setTimeout(() => setScanMessage(''), 5000);
            }
          } catch (err) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setScanning(false);
            setError(err.message || 'Lost connection while scanning.');
          }
        }, 2000);
      })
      .catch((err) => {
        setScanning(false);
        setScanMessage('');
        setError(err.message || 'Could not start a scan.');
      });
  }

  async function handleImport(form) {
    const job = await importJobLink(form);
    setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
  }

  async function handleDismiss(job) {
    setJobs((prev) => prev.filter((j) => j.id !== job.id));
    try {
      await archiveJob(job.id);
    } catch (err) {
      setError(err.message || 'Could not dismiss that job.');
      load();
    }
  }

  function isTracked(job) {
    return data.applications.some((a) => job.source_url && a.notes && a.notes.includes(job.source_url));
  }

  function handleTrack(job) {
    const descriptionSnippet = (job.description || '').slice(0, 400);
    addApplication({
      company: job.company,
      role: job.title,
      location: job.location || '',
      notes: [job.source_url ? `Source: ${job.source_url}` : '', descriptionSnippet].filter(Boolean).join('\n\n'),
    });
    setFlash(`Added ${job.company} to your applications.`);
    setTimeout(() => setFlash(''), 4000);
  }

  async function handleGenerateResume(job) {
    setGeneratingId(job.id);
    setError('');
    try {
      const result = await generateResumesForJob(job.id);
      const versionId = result?.versions?.[0]?.id;
      if (!versionId) throw new Error('The backend did not return a resume.');
      const resume = await getResume(versionId);
      const fields = mapBackendResumeContent(resume.content_json);
      const id = addResumeVersionFromFields(`${job.company} — ${job.title}`, fields);
      router.push(`/resumes?version=${id}`);
    } catch (err) {
      setError(err.message || 'Could not generate a resume for that job.');
    } finally {
      setGeneratingId(null);
    }
  }

  const filtered = jobs.filter((j) => `${j.title} ${j.company}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="px-6 md:px-11 py-8 md:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display font-semibold text-[38px] leading-none tracking-tight text-ink mb-1.5">Jobs</h1>
          <p className="text-inkSoft text-[14.5px]">Scraped and imported postings, ranked against your profile.</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="input w-[190px]" />
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            <Link2 size={15} /> Import link
          </Button>
          <Button onClick={startScan} disabled={scanning}>
            {scanning ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {scanning ? 'Scanning…' : 'Scan for jobs'}
          </Button>
        </div>
      </header>

      {scanMessage && <p className="text-[13px] text-pine mb-4">{scanMessage}</p>}
      {flash && <p className="text-[13px] text-pine mb-4">{flash}</p>}

      {error && (
        <div className="flex items-start gap-2.5 bg-stageClosedSoft text-ink rounded-lg px-4 py-3 mb-6 text-[13.5px]">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p>{error}</p>
            <button onClick={load} className="underline hover:no-underline mt-1">
              Try again
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-inkFaint text-sm">Loading jobs…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-line rounded-lg px-[22px] py-10 text-center text-inkFaint text-sm">
          {jobs.length === 0
            ? 'No jobs yet — run a scan or import a link to get started.'
            : 'No jobs match your search.'}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onOpen={setSelectedJob}
              onDismiss={handleDismiss}
              onGenerateResume={handleGenerateResume}
              onTrack={handleTrack}
              generating={generatingId === job.id}
              tracked={isTracked(job)}
            />
          ))}
        </div>
      )}

      {selectedJob && (
        <JobDetail
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onDismiss={handleDismiss}
          onGenerateResume={handleGenerateResume}
          onTrack={handleTrack}
          generating={generatingId === selectedJob.id}
          tracked={isTracked(selectedJob)}
        />
      )}

      {showImport && <ImportJobModal onClose={() => setShowImport(false)} onImport={handleImport} />}
    </div>
  );
}