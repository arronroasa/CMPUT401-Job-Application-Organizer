'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Pencil, Download, Star, Trash2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { sentCount } from '@/lib/derived';
import ResumeDocument from '@/components/resumes/ResumeDocument';
import ResumeEditForm from '@/components/resumes/ResumeEditForm';
import MatchCheckCard from '@/components/resumes/MatchCheckCard';
import WhereItsBeenSent from '@/components/resumes/WhereItsBeenSent';
import VersionsStrip from '@/components/resumes/VersionsStrip';
import ImportedResumeCard from '@/components/resumes/ImportedResumeCard';
import Button from '@/components/ui/Button';

export default function ResumesPageWrapper() {
  return (
    <Suspense fallback={null}>
      <ResumesPage />
    </Suspense>
  );
}

function ResumesPage() {
  const { data, addResumeVersion, updateResumeVersion, saveMatchResult, deleteResumeVersion, setMasterResume, saveContactHeader } =
    useStore();
  const searchParams = useSearchParams();
  const preselect = searchParams.get('version');
  const [activeId, setActiveId] = useState(preselect || null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [downloading, setDownloading] = useState(false);

  if (!data) return null;

  const active = data.resumes.find((r) => r.id === (activeId || data.masterResumeId)) || data.resumes[0];

  function selectVersion(id) {
    setActiveId(id);
    setEditing(false);
  }

  function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = addResumeVersion(newName.trim());
    selectVersion(id);
    setNewName('');
    setCreating(false);
  }

  function handleSave(resumeFields, contactFields) {
    updateResumeVersion(active.id, resumeFields);
    saveContactHeader(contactFields);
    setEditing(false);
  }

  function handleSetMaster() {
    setMasterResume(active.id);
  }

  function handleDelete() {
    const count = sentCount(active.id, data.applications);
    const message =
      count > 0
        ? `Delete "${active.name}"? ${count} application${count === 1 ? '' : 's'} naming it will show no resume.`
        : `Delete "${active.name}"?`;
    if (!window.confirm(message)) return;
    deleteResumeVersion(active.id);
    selectVersion(data.masterResumeId === active.id ? null : data.masterResumeId);
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      // @react-pdf/renderer is sizeable — load it only when a download is
      // actually requested rather than shipping it in the page's bundle.
      const { downloadResumePdf } = await import('@/components/resumes/ResumeDocumentPdf');
      await downloadResumePdf(active, data.contactHeader);
    } finally {
      setDownloading(false);
    }
  }

  const isMaster = active.id === data.masterResumeId;

  return (
    <div className="px-6 md:px-11 py-8 md:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="font-display font-semibold text-[28px] sm:text-[38px] leading-none tracking-tight text-ink mb-1.5">
            Resumes
          </h1>
          <p className="text-inkSoft text-[14.5px]">See your resume the way a recruiter will, and keep several versions on hand.</p>
        </div>
        {!editing && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil size={14} /> Edit
          </Button>
        )}
      </header>

      <ImportedResumeCard />

      <div className="flex items-center gap-2 mb-5">
        <div className="flex items-center gap-1.5">
          <h2 className="font-display font-semibold text-xl text-ink">{active.name}</h2>
          {isMaster && <span className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-mint text-pine font-medium">Master</span>}
        </div>
      </div>
      <p className="text-[12.5px] text-inkFaint mb-5">
        Updated {active.updatedAt} · sent with {sentCount(active.id, data.applications)} application
        {sentCount(active.id, data.applications) === 1 ? '' : 's'}
      </p>

      {editing ? (
        <ResumeEditForm resume={active} contactHeader={data.contactHeader} onSave={handleSave} onCancel={() => setEditing(false)} />
      ) : (
        <div className="grid lg:grid-cols-[1fr,320px] gap-6 items-start mb-8">
          <ResumeDocument resume={active} contactHeader={data.contactHeader} />
          <div className="space-y-5">
            <div className="bg-surface border border-line rounded-xl p-5 space-y-2">
              <Button onClick={handleDownload} disabled={downloading} className="w-full justify-center">
                <Download size={14} /> {downloading ? 'Preparing…' : 'Download PDF'}
              </Button>
              {!isMaster && (
                <Button variant="secondary" onClick={handleSetMaster} className="w-full justify-center">
                  <Star size={14} /> Set as master
                </Button>
              )}
              <Button
                variant="danger"
                onClick={handleDelete}
                disabled={isMaster}
                title={isMaster ? 'Move the master designation to another version first' : undefined}
                className="w-full justify-center"
              >
                <Trash2 size={14} /> Delete
              </Button>
            </div>
            <MatchCheckCard resume={active} onResult={(result) => saveMatchResult(active.id, result)} />
            <WhereItsBeenSent resume={active} applications={data.applications} />
          </div>
        </div>
      )}

      {!editing && (
        <>
          <div className="flex items-center gap-2.5 mb-4">
            {creating ? (
              <form onSubmit={handleCreate} className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Design — 2026"
                  className="input w-full min-w-0 sm:w-56 py-2"
                />
                <Button type="submit" variant="secondary">
                  Create
                </Button>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 rounded-full border border-dashed border-ink/30 px-[18px] py-[9px] text-[13.5px] text-inkSoft hover:border-ink hover:text-ink transition-colors focus-ring"
              >
                <Plus size={15} /> New version
              </button>
            )}
          </div>

          <VersionsStrip
            resumes={data.resumes}
            applications={data.applications}
            masterResumeId={data.masterResumeId}
            activeId={active.id}
            onSelect={selectVersion}
          />
        </>
      )}
    </div>
  );
}
