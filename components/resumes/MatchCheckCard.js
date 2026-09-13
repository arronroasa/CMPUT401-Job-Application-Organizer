// Rail card: "Match against a job" — see CONTEXT.md's "Match check" and
// "Missing keyword". This is a static mock: the score, company, role and
// missing keywords below are hardcoded, and the paste box is a placeholder
// rather than a live input. The Gemini-backed path still lives in
// lib/matchCheck.js (docs/adr/0003) for when this card is wired back up.

import { Pencil } from 'lucide-react';
import Button from '@/components/ui/Button';

const MATCH = {
  score: 71,
  company: 'Google',
  role: 'Frontend Engineer',
  missingKeywords: ['Storybook', 'Web Vitals', 'design tokens'],
};

export default function MatchCheckCard() {
  return (
    <div className="bg-surface border border-line rounded-xl p-5">
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <h3 className="font-display font-semibold text-base text-ink">Match against a job</h3>
        {/* Decorative only — the card is a static mock, so this does nothing yet. */}
        <Button variant="ghost" className="text-[12.5px] px-2.5 py-1.5 gap-1.5">
          <Pencil size={13} /> Edit
        </Button>
      </div>

      <div className="border border-dashed border-line rounded-lg px-3.5 py-3 mb-4">
        <p className="text-[13px] leading-snug text-inkFaint">
          Paste a job post to see what this resume is missing.
        </p>
      </div>

      <div className="flex items-baseline gap-2.5 mb-2.5">
        <span className="font-display font-semibold text-[26px] leading-none text-ink">{MATCH.score}%</span>
        <span className="text-[13px] leading-snug text-inkSoft">
          against {MATCH.company} · {MATCH.role}
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-panel overflow-hidden mb-3.5">
        <div className="h-full bg-pine" style={{ width: `${MATCH.score}%` }} />
      </div>

      <p className="text-[11.5px] text-inkFaint mb-1.5">Missing keywords</p>
      <div className="flex flex-wrap gap-1.5">
        {MATCH.missingKeywords.map((keyword) => (
          <span key={keyword} className="text-[11.5px] px-2 py-0.5 rounded-full bg-stageClosedSoft text-ink">
            {keyword}
          </span>
        ))}
      </div>
    </div>
  );
}
