'use client';

// Rail card: "Match against a job" — see CONTEXT.md's "Match check" and
// "Missing keyword", and docs/adr/0003 for why the score comes from Gemini
// rather than local keyword overlap.

import { useState } from 'react';
import { Loader2, KeyRound } from 'lucide-react';
import { runMatchCheck, hasApiKey } from '@/lib/matchCheck';
import Button from '@/components/ui/Button';

export default function MatchCheckCard({ resume, onResult }) {
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!hasApiKey()) {
    return (
      <div className="bg-surface border border-line rounded-xl p-5">
        <h3 className="font-display font-semibold text-base text-ink mb-1.5 flex items-center gap-2">
          <KeyRound size={15} className="text-inkFaint" /> Match against a job
        </h3>
        <p className="text-[12.5px] text-inkSoft">
          Set <code className="text-[11.5px] bg-panel px-1 py-0.5 rounded">NEXT_PUBLIC_GEMINI_API_KEY</code> to check
          this resume against a job description.
        </p>
      </div>
    );
  }

  async function runCheck() {
    setLoading(true);
    setError('');
    try {
      const result = await runMatchCheck({ resume, jobDescription });
      onResult(result);
      setJobDescription('');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const match = resume.match;

  return (
    <div className="bg-surface border border-line rounded-xl p-5">
      <h3 className="font-display font-semibold text-base text-ink mb-1">Match against a job</h3>
      <p className="text-xs text-inkFaint mb-3">Paste a job description to see how this resume matches.</p>

      <textarea
        value={jobDescription}
        onChange={(e) => setJobDescription(e.target.value)}
        placeholder="Paste job description here"
        className="input min-h-[110px] mb-3"
      />
      <Button onClick={runCheck} disabled={loading || !jobDescription.trim()} className="w-full justify-center mb-3">
        {loading ? <Loader2 size={14} className="animate-spin" /> : null} {loading ? 'Checking…' : 'Run match check'}
      </Button>

      {error && <p className="text-xs text-stageClosed mb-3">{error}</p>}

      {match && (
        <div className="space-y-3 border-t border-line pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-inkSoft">
              {match.company || match.role ? `${match.company}${match.company && match.role ? ' · ' : ''}${match.role}` : 'Last check'}
            </span>
            <span className="text-[15px] font-semibold text-ink">{match.score}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-panel overflow-hidden">
            <div className="h-full bg-pine" style={{ width: `${match.score}%` }} />
          </div>
          {match.missingKeywords.length > 0 && (
            <div>
              <p className="text-[11.5px] text-inkFaint mb-1.5">Missing keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {match.missingKeywords.map((k) => (
                  <span key={k} className="text-[11.5px] px-2 py-0.5 rounded-full bg-stageClosedSoft text-ink">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
