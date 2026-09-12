import { cn } from '@onfile/ui';
import type { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: ReactNode;
  highlight?: boolean;
  trend?: 'up' | 'down' | 'flat';
  className?: string;
}

const trendConfig = {
  up: { symbol: '↑', color: 'text-green-400' },
  down: { symbol: '↓', color: 'text-red-400' },
  flat: { symbol: '→', color: 'text-muted-foreground' },
};

export function MetricCard({ label, value, sub, icon, highlight, trend, className }: MetricCardProps) {
  return (
    <div className={cn(
      'bg-card border rounded-xl p-5',
      highlight ? 'border-blue-500/30' : 'border-border',
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <p className={cn('text-2xl font-bold', highlight ? 'text-blue-400' : 'text-foreground')}>
              {value}
            </p>
            {trend && (
              <span className={cn('text-sm font-semibold', trendConfig[trend].color)}>
                {trendConfig[trend].symbol}
              </span>
            )}
          </div>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        {icon && <div className="text-muted-foreground/70">{icon}</div>}
      </div>
    </div>
  );
}
