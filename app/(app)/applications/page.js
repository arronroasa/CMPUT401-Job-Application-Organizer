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
    <div className="px-6 md:px-11 py-8 md:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display font-semibold text-[28px] sm:text-[38px] leading-none tracking-tight text-ink mb-1.5">Applications</h1>
          <p className="text-inkSoft text-[14.5px]">{filtered.length} total</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="input flex-1 min-w-[140px] sm:w-[190px] sm:flex-none" />
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="input w-auto cursor-pointer">
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

      <div className="bg-surface border border-line rounded-lg overflow-hidden animate-[lsRise_.45s_cubic-bezier(.22,.8,.2,1)_both]">
        <div className="sm:overflow-x-auto">
          <div className="sm:min-w-[720px]">
            <div className="hidden sm:grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_120px_120px_minmax(0,1.2fr)] gap-4 px-[22px] py-3.5 border-b border-line text-[11px] tracking-[.16em] uppercase text-inkFaint">
              <span>Company</span>
              <span>Role</span>
              <span>Applied</span>
              <span>Stage</span>
              <span>Next action</span>
            </div>
            {filtered.map((app) => (
              <button
                key={app.id}
                onClick={() => setSelected(app)}
                className="flex w-full flex-col gap-1 text-left px-4 py-3.5 sm:grid sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_120px_120px_minmax(0,1.2fr)] sm:gap-4 sm:items-center sm:px-[22px] sm:py-4 border-b border-ink/[.07] last:border-0 cursor-pointer transition-all hover:bg-paper sm:hover:pl-7"
              >
                {/* Below sm the five columns stack into a card, with the stage
                    badge pulled up next to the company name. */}
                <span className="flex items-center justify-between gap-3 min-w-0 sm:block">
                  <span className="text-[14.5px] font-medium text-ink truncate">{app.company}</span>
                  <span className="shrink-0 sm:hidden">
                    <Badge stageId={app.stage} />
                  </span>
                </span>
                <span className="text-[14px] text-inkSoft truncate">{app.role}</span>
                <span className="text-[13px] text-inkFaint">{app.dateApplied}</span>
                <span className="hidden sm:block">
                  <Badge stageId={app.stage} />
                </span>
                <span className="text-[13.5px] text-inkSoft truncate">
                  {app.nextAction && !app.nextAction.done ? `${app.nextAction.label}${app.nextAction.date ? ` · ${app.nextAction.date}` : ''}` : '—'}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-[22px] py-10 text-center text-inkFaint text-sm">No applications match.</div>
            )}
          </div>
        </div>
      </div>

      {selected && <ApplicationDetail app={selected} onClose={() => setSelected(null)} />}
      {showModal && <AddApplicationModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
