'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '@/lib/store';
import { STAGES } from '@/lib/constants';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import ApplicationDetail from '@/components/applications/ApplicationDetail';
import AddApplicationModal from '@/components/kanban/AddApplicationModal';

export default function ApplicationsPage() {
  const { data } = useStore();
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const filtered = data.applications.filter((a) => {
    const matchesQuery = `${a.company} ${a.role}`.toLowerCase().includes(query.toLowerCase());
    const matchesStage = stageFilter === 'all' || a.stage === stageFilter;
    return matchesQuery && matchesStage;
  });

  return (
    <div className="px-5 py-8 md:px-10 md:py-10">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-serif text-3xl text-ink">Applications</h1>
          <p className="text-inkSoft text-sm mt-1">{data.applications.length} total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="input w-44" />
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="input w-auto">
            <option value="all">All stages</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <Button onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add
          </Button>
        </div>
      </header>

      <div className="border border-line rounded-lg overflow-hidden bg-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-inkSoft border-b border-line">
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Role</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Applied</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium hidden lg:table-cell">Next action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((app) => (
              <tr
                key={app.id}
                onClick={() => setSelected(app)}
                className="border-b border-line last:border-0 cursor-pointer hover:bg-paper transition-colors"
              >
                <td className="px-4 py-3 text-ink">
                  {app.company}
                  <p className="text-xs text-inkFaint sm:hidden">{app.role}</p>
                </td>
                <td className="px-4 py-3 text-inkSoft hidden sm:table-cell">{app.role}</td>
                <td className="px-4 py-3 text-inkSoft hidden md:table-cell">{app.dateApplied}</td>
                <td className="px-4 py-3">
                  <Badge stageId={app.stage} />
                </td>
                <td className="px-4 py-3 text-inkSoft hidden lg:table-cell">
                  {app.nextAction && !app.nextAction.done ? `${app.nextAction.label} · ${app.nextAction.date}` : '—'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-inkFaint text-sm">
                  No applications match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && <ApplicationDetail app={selected} onClose={() => setSelected(null)} />}
      {showModal && <AddApplicationModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
