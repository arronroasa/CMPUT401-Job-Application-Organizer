import type { MatchTier } from '@onfile/core';
import { cn } from '../utils/cn';

interface MatchBadgeProps {
  score: number;
  tier: MatchTier;
  className?: string;
}

// Lodestar theme: soft mint/gold/neutral fills with dark text, matching
// the app's light cream/green design (see .dc.html `chipBg` tokens).
const tierStyles: Record<MatchTier, string> = {
  high: 'bg-[hsl(var(--ls-mint))] text-[#1f3d28] border border-[hsl(var(--primary)/0.25)]',
  medium: 'bg-[hsl(var(--ls-gold-lighter))] text-[#6b4f10] border border-[hsl(var(--ls-gold)/0.35)]',
  low: 'bg-muted text-muted-foreground border border-border',
};

export function MatchBadge({ score, tier, className }: MatchBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        tierStyles[tier],
        className
      )}
    >
      {score}% match
    </span>
  );
}
