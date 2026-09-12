import type { RoleInterest } from '@onfile/core';
import { Wifi } from 'lucide-react';

interface RoleInterestsSectionProps {
  interests: RoleInterest[];
  onRecommend?: () => void;
  isRecommending?: boolean;
  recommendationStatus?: string;
}

function isAiRecommendedRole(role: RoleInterest): boolean {
  const roleId = String(role.id ?? '').toLowerCase();
  return roleId.startsWith('ri-ai-') || roleId.startsWith('ai-ri-');
}

function RoleCard({ role, badge }: { role: RoleInterest; badge?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{role.title}</span>
        <span className="text-xs text-muted-foreground capitalize">{role.seniority}</span>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-300 uppercase tracking-wide">
            {badge}
          </span>
        )}
        {role.remote && <Wifi className="w-3 h-3 text-muted-foreground" />}
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {role.domains.map((domain) => (
          <span key={domain} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {domain}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Locations: {role.locations.join(', ')}</p>
    </div>
  );
}

export function RoleInterestsSection({
  interests,
  onRecommend,
  isRecommending = false,
  recommendationStatus,
}: RoleInterestsSectionProps) {
  const aiRecommended = interests.filter(isAiRecommendedRole);
  const userSelected = interests.filter((role) => !isAiRecommendedRole(role));

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target Roles</h2>
        {onRecommend && (
          <button
            onClick={onRecommend}
            disabled={isRecommending}
            className="rounded-md border border-blue-500/30 bg-blue-600/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRecommending ? 'Recommending...' : 'Recommend with AI'}
          </button>
        )}
      </div>

      {recommendationStatus && <p className="mb-3 text-xs text-muted-foreground">{recommendationStatus}</p>}

      {userSelected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {userSelected.map((role) => (
            <RoleCard key={role.id} role={role} />
          ))}
        </div>
      )}

      {aiRecommended.length > 0 && (
        <>
          <p className="mt-2 mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">AI Recommended</p>
          <div className="flex flex-wrap gap-2">
            {aiRecommended.map((role) => (
              <RoleCard key={role.id} role={role} badge="AI" />
            ))}
          </div>
        </>
      )}

      {userSelected.length === 0 && aiRecommended.length === 0 && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          No target roles yet. Use <span className="text-foreground/80">Recommend with AI</span> to generate suggestions.
        </div>
      )}
    </section>
  );
}
