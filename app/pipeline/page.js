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
    <div className="px-5 py-8 md:px-10 md:py-10">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-serif text-3xl text-ink">Pipeline</h1>
          <p className="text-inkSoft text-sm mt-1">Drag a card to move it between stages.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company or role"
            className="input w-56"
          />
          <Button onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add application
          </Button>
        </div>
      </header>

      <KanbanBoard applications={filtered} onOpen={setSelected} />

      {showModal && <AddApplicationModal onClose={() => setShowModal(false)} />}
      {selected && <ApplicationDetail app={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
