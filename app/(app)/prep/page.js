'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, X, ExternalLink } from 'lucide-react';
import { getCompanies, getQuestionsForCompany, leetcodeUrl, datasetUpdated } from '@/lib/leetcode';

const TABS = ['All', 'Easy', 'Medium', 'Hard'];
const PAGE_SIZE = 15;

// Recent searches live in the browser, like the rest of the local demo data.
const RECENT_KEY = 'onfile.prep.recent';
const RECENT_SEED = ['Amazon', 'Meta', 'Google'];
const RECENT_MAX = 3;

export default function PrepPage() {
  const companies = useMemo(() => getCompanies(), []);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('All');
  const [showAll, setShowAll] = useState(false);
  const [recent, setRecent] = useState(RECENT_SEED);

  // Read after mount so the server and client render the same first pass.
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_KEY));
      if (Array.isArray(stored) && stored.length) setRecent(stored.slice(0, RECENT_MAX));
    } catch {
      // No usable history; the seed stands.
    }
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies.slice(0, 8);
    return companies.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [query, companies]);

  const questions = useMemo(
    () => (selected ? getQuestionsForCompany(selected) : []),
    [selected]
  );

  // Difficulty tallies over the company's whole set, not the current filter.
  const counts = useMemo(() => {
    const tally = { All: questions.length, Easy: 0, Medium: 0, Hard: 0 };
    for (const q of questions) {
      if (tally[q.difficulty] !== undefined) tally[q.difficulty] += 1;
    }
    return tally;
  }, [questions]);

  const filtered = tab === 'All' ? questions : questions.filter((q) => q.difficulty === tab);
  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const hidden = filtered.length - visible.length;
  const chips = recent.filter((c) => companies.includes(c));

  function remember(name) {
    setRecent((prev) => {
      const next = [name, ...prev.filter((n) => n !== name)].slice(0, RECENT_MAX);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable; keep it in memory for this session.
      }
      return next;
    });
  }

  function pick(name) {
    setSelected(name);
    setQuery(name);
    setOpen(false);
    setTab('All');
    setShowAll(false);
    remember(name);
  }

  function clear() {
    setSelected(null);
    setQuery('');
    setOpen(false);
    setTab('All');
    setShowAll(false);
  }

  function switchTab(next) {
    setTab(next);
    setShowAll(false);
  }

  const searchBox = (
    <div className="relative w-full max-w-[760px] mx-auto">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-[15px]">
        <Search size={17} className="text-inkFaint shrink-0" />
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
          <button
            onClick={clear}
            aria-label="Clear search"
            className="text-inkFaint hover:text-ink shrink-0"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1.5 w-full max-h-64 overflow-y-auto text-left bg-surface border border-line rounded-xl shadow-card">
          {matches.map((name) => (
            <li key={name}>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(name);
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-mint first:rounded-t-xl last:rounded-b-xl"
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // Before a search: one centred column, vertically parked in the shell.
  if (!selected) {
    return (
      <div className="px-6 md:px-10 min-h-[calc(100dvh-7rem)] flex flex-col items-center justify-center text-center">
        <h1 className="font-display font-semibold text-[40px] md:text-[54px] leading-[1.06] tracking-tight text-ink max-w-[680px]">
          LeetCode questions, by company
        </h1>
        <p className="text-inkSoft text-[16px] md:text-[17px] leading-relaxed mt-5 max-w-[620px]">
          Search a company to see the LeetCode questions it asked in the last six months.
        </p>

        <div className="w-full mt-10">{searchBox}</div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-6 text-[13.5px] text-inkFaint">
            <span className="mr-0.5">Recent:</span>
            {chips.map((c) => (
              <button
                key={c}
                onClick={() => pick(c)}
                className="px-4 py-2 rounded-full bg-surface border border-line text-ink hover:border-ink hover:bg-panel transition-colors"
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-6 md:px-10 py-8 md:py-12">
      <div className="w-full max-w-[860px] mx-auto">
        {searchBox}

        <section className="mt-9">
          <header className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display font-semibold text-[26px] sm:text-[34px] leading-none tracking-tight text-ink">
                {selected}
              </h1>
              <p className="text-[14px] text-inkSoft mt-2">
                {counts.All} LeetCode question{counts.All === 1 ? '' : 's'} asked in the last 6 months
              </p>
            </div>
            <p className="text-[13px] text-inkFaint pb-1">Most asked first</p>
          </header>

          {/* Difficulty tabs */}
          <div className="flex flex-wrap gap-2.5 mt-6 pt-6 border-t border-line">
            {TABS.map((t) => {
              const active = t === tab;
              return (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  aria-pressed={active}
                  className={`px-4 py-[7px] rounded-full text-[13.5px] border transition-colors ${
                    active
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-surface text-ink border-line hover:border-ink'
                  }`}
                >
                  {t}
                  {active && <span className="ml-1.5 opacity-60">{counts[t]}</span>}
                </button>
              );
            })}
          </div>

          {/* Question table */}
          {visible.length === 0 ? (
            <p className="text-sm text-inkSoft mt-7">
              No {tab.toLowerCase()} questions for {selected}.
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-line">
              {visible.map((q) => (
                <li key={q.id}>
                  <a
                    href={leetcodeUrl(q.slug)}
                    target="_blank"
                    rel="noreferrer"
                    className="grid grid-cols-[1fr_4.25rem_1rem] sm:grid-cols-[3rem_1fr_8.5rem_4.25rem_1rem] items-center gap-3 px-2 py-3.5 rounded-lg hover:bg-panel focus-ring transition-colors"
                  >
                    <span className="hidden sm:block text-[13px] text-inkFaint tabular-nums">
                      {q.id}
                    </span>
                    <span className="font-display font-semibold text-[15px] text-ink break-words sm:truncate">
                      {q.title}
                    </span>
                    <span
                      className="hidden sm:block text-[13px] text-inkFaint truncate"
                      title={q.patterns.join(', ')}
                    >
                      {q.patterns[0] || ''}
                    </span>
                    <span className={`diff-chip diff-${q.difficulty} justify-self-start`}>
                      {q.difficulty}
                    </span>
                    <ExternalLink size={13} className="text-inkFaint shrink-0" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}

          {hidden > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-5 px-4 py-2 rounded-full text-[13px] bg-surface border border-line text-ink hover:border-ink hover:bg-panel transition-colors"
            >
              Show all {filtered.length}
            </button>
          )}

          <p className="text-[11.5px] text-inkFaint mt-8 pt-5 border-t border-line">
            Opens on leetcode.com · data from seanprashad.com/leetcode-patterns · updated{' '}
            {datasetUpdated.slice(0, 10)}
          </p>
        </section>
      </div>
    </div>
  );
}
