'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '@/lib/store';
import KanbanBoard from '@/components/kanban/KanbanBoard';
import AddApplicationModal from '@/components/kanban/AddApplicationModal';
import ApplicationDetail from '@/components/applications/ApplicationDetail';
import Button from '@/components/ui/Button';

export default function PipelinePage() {
  const { data } = useStore();
  const [query, setQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState(null);

  const filtered = data.applications.filter((a) => `${a.company} ${a.role}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="px-6 md:px-11 py-8 md:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-7">
        <div>
          <h1 className="font-display font-semibold text-[38px] leading-none tracking-tight text-ink mb-1.5">Pipeline</h1>
          <p className="text-inkSoft text-[14.5px]">Drag a card, or use the arrows, to change its stage.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company or role"
            className="input w-[230px]"
          />
          <Button onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add application
          </Button>
        </div>
      </header>

      <div className="animate-[lsRise_.45s_cubic-bezier(.22,.8,.2,1)_both]">
        <KanbanBoard applications={filtered} onOpen={setSelected} />
      </div>

      {showModal && <AddApplicationModal onClose={() => setShowModal(false)} />}
      {selected && <ApplicationDetail app={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
