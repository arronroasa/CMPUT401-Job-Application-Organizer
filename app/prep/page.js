'use client';

import { useMemo, useState } from 'react';
import { Search, X, ExternalLink } from 'lucide-react';
import { getCompanies, getQuestionsForCompany, leetcodeUrl, datasetUpdated } from '@/lib/leetcode';

const POPULAR = ['Amazon', 'Google', 'Microsoft', 'Meta', 'Apple', 'Bloomberg'];

export default function PrepPage() {
  const companies = useMemo(() => getCompanies(), []);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies.slice(0, 8);
    return companies.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [query, companies]);

  const questions = selected ? getQuestionsForCompany(selected) : [];

  function pick(name) {
    setSelected(name);
    setQuery(name);
    setOpen(false);
  }

  function clear() {
    setSelected(null);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="px-5 py-8 md:px-10 md:py-10 max-w-3xl">
      <header className="mb-6">
        <h1 className="font-serif text-3xl text-ink">Interview Prep</h1>
        <p className="text-inkSoft text-sm mt-1">
          Search a company to see some of the LeetCode questions they asked in the last 6 months.
        </p>
      </header>

      {/* Company autocomplete */}
      <div className="relative mb-4">
        <div className="flex items-center gap-2 input">
          <Search size={16} className="text-inkFaint shrink-0" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setSelected(null);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) pick(matches[0]);
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="Search a company (e.g. Amazon)"
            className="flex-1 bg-transparent outline-none text-sm text-ink"
          />
          {query && (
            <button onClick={clear} className="text-inkFaint hover:text-ink shrink-0">
              <X size={15} />
            </button>
          )}
        </div>

        {open && matches.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-surface border border-line rounded-md shadow-sm">
            {matches.map((name) => (
              <li key={name}>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(name);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-pineSoft"
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Popular shortcuts */}
      {!selected && (
        <div className="flex flex-wrap items-center gap-1.5 mb-8 text-xs text-inkFaint">
          <span>Popular:</span>
          {POPULAR.filter((c) => companies.includes(c)).map((c) => (
            <button
              key={c}
              onClick={() => pick(c)}
              className="px-2 py-1 rounded-sm bg-surface border border-line text-inkSoft hover:text-ink hover:bg-paper"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {selected && (
        <section>
          <div className="mb-4">
            <h2 className="font-serif text-xl text-ink">{selected}</h2>
            <p className="text-xs text-inkFaint mt-0.5">
              Some of the questions asked in the last 6 months.
            </p>
          </div>

          <ul className="space-y-2">
            {questions.map((q) => (
              <li
                key={q.id}
                className="bg-surface border border-line rounded-lg px-4 py-3"
              >
                <a
                  href={leetcodeUrl(q.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:text-pineDark focus-ring rounded"
                >
                  {q.title}
                  <ExternalLink size={12} className="text-inkFaint shrink-0" />
                </a>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <DifficultyBadge difficulty={q.difficulty} />
                  {q.premium && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-sm bg-stageScreeningSoft text-stageScreening">
                      Premium
                    </span>
                  )}
                  {q.patterns.map((p) => (
                    <span key={p} className="text-[11px] px-1.5 py-0.5 rounded-sm bg-pineSoft text-pineDark">
                      {p}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <p className="text-[11px] text-inkFaint mt-6">
            Data from seanprashad.com/leetcode-patterns, updated {datasetUpdated.slice(0, 10)}. These are some of the
            questions reported at this company over the last 6 months, most common first.
          </p>
        </section>
      )}
    </div>
  );
}

// LeetCode-style difficulty colors.
const DIFF = {
  Easy: { color: '#1c9c8c', bg: 'rgba(28, 156, 140, 0.14)' },
  Medium: { color: '#c98a00', bg: 'rgba(255, 183, 0, 0.16)' },
  Hard: { color: '#e02f4a', bg: 'rgba(224, 47, 74, 0.12)' },
};

function DifficultyBadge({ difficulty }) {
  const s = DIFF[difficulty] || DIFF.Medium;
  return (
    <span className="text-[11px] px-1.5 py-0.5 rounded-sm font-medium" style={{ color: s.color, backgroundColor: s.bg }}>
      {difficulty}
    </span>
  );
}
