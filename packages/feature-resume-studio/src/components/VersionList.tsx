import type { ResumeVersion } from '@onfile/core';
import { cn } from '@onfile/ui';
import { FileText, Sparkles } from 'lucide-react';

interface VersionListProps {
  versions: ResumeVersion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  activeJobId?: string | null;
}

export function VersionList({ versions, selectedId, onSelect, activeJobId }: VersionListProps) {
  const base = versions
    .filter((v) => v.type === 'base')
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const tailored = versions
    .filter((v) => v.type === 'tailored')
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  const renderItem = (v: ResumeVersion) => {
    const isNew = !!(activeJobId && v.jobId === activeJobId);
    return (
      <button
        key={v.id}
        onClick={() => onSelect(v.id)}
        className={cn(
          'w-full text-left px-3 py-2.5 rounded-md flex items-start gap-2.5 transition-colors',
          selectedId === v.id ? 'bg-muted/80 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        {v.type === 'base' ? (
          <FileText className="w-4 h-4 mt-0.5 shrink-0" />
        ) : (
          <Sparkles className={cn('w-4 h-4 mt-0.5 shrink-0', isNew ? 'text-emerald-400' : 'text-blue-400')} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">
              {v.type === 'base' ? 'Base Resume' : (v.company ?? 'Tailored')}
            </p>
            {isNew && (
              <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wide">
                New
              </span>
            )}
          </div>
          {v.jobTitle && <p className="text-xs text-muted-foreground truncate">{v.jobTitle}</p>}
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-medium ${v.strengthScore >= 80 ? 'text-green-400' : v.strengthScore >= 65 ? 'text-amber-400' : 'text-muted-foreground'}`}>
              {v.strengthScore}% strength
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(v.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </button>
    );
  };

  return (
    <div className="p-3 space-y-4">
      {base.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1.5">Base</p>
          {base.map(renderItem)}
        </div>
      )}
      {tailored.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1.5">Tailored</p>
          {tailored.map(renderItem)}
        </div>
      )}
    </div>
  );
}
