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
    <div className="px-6 md:px-11 py-8 md:py-10 max-w-3xl">
      <header className="mb-5">
        <h1 className="font-display font-semibold text-[38px] leading-none tracking-tight text-ink mb-1.5">Interview prep</h1>
        <p className="text-inkSoft text-[14.5px]">
          Search a company to see the LeetCode questions it asked in the last 6 months.
        </p>
      </header>

      {/* Company autocomplete */}
      <div className="relative mb-4">
        <div className="flex items-center gap-2.5 input rounded-lg px-[18px] py-[14px] text-[15px]">
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
            className="flex-1 bg-transparent outline-none text-[15px] text-ink"
          />
          {query && (
            <button onClick={clear} className="text-inkFaint hover:text-ink shrink-0">
              <X size={15} />
            </button>
          )}
        </div>

        {open && matches.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-surface border border-line rounded-md shadow-card">
            {matches.map((name) => (
              <li key={name}>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(name);
                  }}
                  className="w-full text-left px-3.5 py-2.5 text-sm text-ink hover:bg-mint"
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
        <div className="flex flex-wrap items-center gap-2 mb-8 text-[13px] text-inkFaint">
          <span className="mr-0.5">Popular:</span>
          {POPULAR.filter((c) => companies.includes(c)).map((c) => (
            <button
              key={c}
              onClick={() => pick(c)}
              className="px-3.5 py-[7px] rounded-full bg-surface border border-line text-ink hover:border-ink hover:bg-panel transition-colors"
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
            <h2 className="font-display font-semibold text-2xl text-ink">{selected}</h2>
            <p className="text-[13.5px] text-inkSoft mt-1">
              Some of the questions asked in the last 6 months.
            </p>
          </div>

          <ul className="flex flex-col gap-2.5">
            {questions.map((q) => (
              <li
                key={q.id}
                className="bg-surface border border-line rounded-lg px-5 py-4 transition-all hover:border-ink/30 hover:translate-x-1 hover:shadow-card"
              >
                <a
                  href={leetcodeUrl(q.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-display font-semibold text-base text-ink hover:text-pine focus-ring rounded"
                >
                  {q.title}
                  <ExternalLink size={13} className="text-inkFaint shrink-0" />
                </a>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <DifficultyBadge difficulty={q.difficulty} />
                  {q.premium && (
                    <span className="text-[11.5px] px-2.5 py-1 rounded-full bg-honey text-ink">Premium</span>
                  )}
                  {q.patterns.map((p) => (
                    <span key={p} className="text-[11.5px] px-2.5 py-1 rounded-full bg-panel text-inkSoft">
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

// Difficulty chips in the OnFile palette (Easy mint, Medium honey, Hard blush).
const DIFF = {
  Easy: '#cfe9d4',
  Medium: '#fdf1cf',
  Hard: '#f4ddd6',
};

function DifficultyBadge({ difficulty }) {
  const bg = DIFF[difficulty] || DIFF.Medium;
  return (
    <span className="text-[11.5px] px-2.5 py-1 rounded-full text-ink" style={{ backgroundColor: bg }}>
      {difficulty}
    </span>
  );
}
