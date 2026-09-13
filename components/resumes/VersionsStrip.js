// "All resumes" strip: one card per version with its name, application
// count, updated date, and the Master badge on the one holding it.

import { sentCount } from '@/lib/derived';

export default function VersionsStrip({ resumes, applications, masterResumeId, activeId, onSelect }) {
  return (
    <div>
      <h2 className="text-[13px] font-medium text-inkSoft mb-3">All resumes</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {resumes.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={`text-left rounded-lg border p-4 transition-colors focus-ring ${
              r.id === activeId ? 'border-ink bg-panel' : 'border-line bg-surface hover:border-ink/40'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[13.5px] font-medium text-ink truncate">{r.name}</span>
              {r.id === masterResumeId && (
                <span className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-mint text-pine font-medium shrink-0">Master</span>
              )}
            </div>
            <p className="text-[12px] text-inkFaint">
              Updated {r.updatedAt} · sent with {sentCount(r.id, applications)} application
              {sentCount(r.id, applications) === 1 ? '' : 's'}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
