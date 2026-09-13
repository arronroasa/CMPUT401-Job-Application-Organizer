'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { STAGES, stageMeta } from '@/lib/constants';
import ApplicationDetail from '@/components/applications/ApplicationDetail';
import AddApplicationModal from '@/components/kanban/AddApplicationModal';
import AddApplicationButton from '@/components/kanban/AddApplicationButton';
import AutoSearchModal from '@/components/kanban/AutoSearchModal';

// useSearchParams needs a Suspense boundary, same as /resumes.
export default function ApplicationsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <ApplicationsPage />
    </Suspense>
  );
}

function ApplicationsPage() {
  const { data } = useStore();
  const searchParams = useSearchParams();
  const preselectId = searchParams.get('app');
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  // Opened from a notification link. Lazy so it only applies on arrival.
  const [selected, setSelected] = useState(
    () => data.applications.find((a) => a.id === preselectId) || null
  );
  const [showModal, setShowModal] = useState(false);
  const [showAutoSearch, setShowAutoSearch] = useState(false);

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
          <AddApplicationButton onManual={() => setShowModal(true)} onAutoSearch={() => setShowAutoSearch(true)} />
        </div>
      </header>

      <div className="flex flex-col gap-3 animate-[lsRise_.45s_cubic-bezier(.22,.8,.2,1)_both]">
        {filtered.map((app) => {
          const meta = stageMeta(app.stage);
          const next =
            app.nextAction && !app.nextAction.done
              ? `${app.nextAction.label}${app.nextAction.date ? ` · ${app.nextAction.date}` : ''}`
              : null;

          return (
            <button
              key={app.id}
              onClick={() => setSelected(app)}
              className="w-full text-left bg-surface rounded-2xl p-[18px] shadow-card cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5"
              style={{ borderLeft: `3px solid var(--stage-${app.stage})` }}
            >
              <span className="flex-1 min-w-0">
                <span className="block font-display font-semibold text-[17px] text-ink truncate">{app.company}</span>
                <span className="block text-[13.5px] text-inkSoft truncate mt-0.5">{app.role}</span>
              </span>

              <span className="shrink-0 text-[12.5px] text-inkFaint sm:w-[96px]">{app.dateApplied}</span>

              <span
                className={`inline-flex items-center gap-2 self-start sm:self-auto shrink-0 rounded-full px-3 py-1.5 text-[12.5px] text-ink ${meta.bg}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>

              <span className="min-w-0 sm:w-[290px] sm:shrink-0 sm:text-right">
                {next ? (
                  <span className="inline-flex max-w-full items-center rounded-full bg-sage px-3.5 py-1.5 text-[12.5px] text-ink">
                    <span className="min-w-0 truncate">{next}</span>
                  </span>
                ) : (
                  <span className="text-[12.5px] text-inkFaint">Nothing due</span>
                )}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="bg-surface rounded-2xl shadow-card px-[22px] py-10 text-center text-inkFaint text-sm">
            No applications match.
          </div>
        )}
      </div>

      {selected && <ApplicationDetail app={selected} onClose={() => setSelected(null)} />}
      {showModal && <AddApplicationModal onClose={() => setShowModal(false)} />}
      {showAutoSearch && <AutoSearchModal onClose={() => setShowAutoSearch(false)} />}
    </div>
  );
}
