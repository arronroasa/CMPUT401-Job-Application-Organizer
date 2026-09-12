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
    <div className="px-6 md:px-11 py-8 md:py-10">
      <header className="mb-5">
        <h1 className="font-display font-semibold text-[38px] leading-none tracking-tight text-ink mb-1.5">Resumes</h1>
        <p className="text-inkSoft text-[14.5px]">Keep one master resume, and a tailored copy for each application.</p>
      </header>

      <div className="flex items-center gap-2.5 mb-6 flex-wrap">
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
              className="input w-44 py-2"
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
      className={`rounded-full px-[18px] py-[9px] text-[13.5px] border transition-colors focus-ring ${
        active
          ? 'bg-ink text-[#fffdf7] border-ink font-medium'
          : 'bg-surface border-line text-ink hover:border-ink'
      }`}
    >
      {children}
    </button>
  );
}
