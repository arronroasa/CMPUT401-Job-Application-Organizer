'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useStore } from '@/lib/store';
import MasterResumeEditor from '@/components/resumes/MasterResumeEditor';
import TailoredResumeEditor from '@/components/resumes/TailoredResumeEditor';
import Button from '@/components/ui/Button';

export default function ResumesPageWrapper() {
  return (
    <Suspense fallback={null}>
      <ResumesPage />
    </Suspense>
  );
}

function ResumesPage() {
  const { data, addTailoredResume } = useStore();
  const searchParams = useSearchParams();
  const preselect = searchParams.get('tailored');
  const [activeId, setActiveId] = useState(preselect || 'master');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const active = activeId === 'master' ? null : data.tailoredResumes.find((r) => r.id === activeId);

  function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = addTailoredResume({
      name: newName,
      applicationId: null,
      summary: data.masterResume.summary,
      experience: data.masterResume.experience,
      projects: data.masterResume.projects,
      skills: [...data.masterResume.skills],
      jobDescription: '',
    });
    setActiveId(id);
    setNewName('');
    setCreating(false);
  }

  return (
    <div className="px-5 py-8 md:px-10 md:py-10">
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-ink">Resumes</h1>
        <p className="text-inkSoft text-sm mt-1">Keep one master resume, and a tailored copy for each application.</p>
      </header>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <TabButton active={activeId === 'master'} onClick={() => setActiveId('master')}>
          Master
        </TabButton>
        {data.tailoredResumes.map((r) => (
          <TabButton key={r.id} active={activeId === r.id} onClick={() => setActiveId(r.id)}>
            {r.name}
          </TabButton>
        ))}
        {creating ? (
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. v3 — Acme Corp"
              className="input w-44 py-1.5"
            />
            <Button type="submit" variant="secondary">
              Create
            </Button>
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 text-sm text-pineDark hover:underline px-2 py-1.5"
          >
            <Plus size={15} /> New tailored copy
          </button>
        )}
      </div>

      {activeId === 'master' ? (
        <MasterResumeEditor />
      ) : active ? (
        <TailoredResumeEditor resume={active} onDeleted={() => setActiveId('master')} />
      ) : (
        <p className="text-inkFaint text-sm">That resume no longer exists.</p>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm transition-colors focus-ring ${
        active ? 'bg-ink text-white' : 'bg-surface border border-line text-inkSoft hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
