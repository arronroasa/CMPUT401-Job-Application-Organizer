import { useEffect } from 'react';
import { PageHeader, EmptyState } from '@onfile/ui';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { useInsightsStore } from '../state/useInsightsStore';
import { MetricCard } from './MetricCard';
import { Send, TrendingUp, MessageSquare, FileText, AlertCircle, BarChart3, Brain } from 'lucide-react';

const TOOLTIP_STYLE = {
  contentStyle: { background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' },
  labelStyle: { color: '#a1a1aa' },
};

/* ── Tooltip formatters ──────────────────────────────────────── */
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-01-22" → "Jan 22" */
function formatDateShort(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return `${MONTH_SHORT[month] ?? parts[1]} ${day}`;
}

export function InsightsPage() {
  const { metrics, isLoading, fetchInsights } = useInsightsStore();

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  if (isLoading || !metrics) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Loading…</div>
    );
  }

  /* ── Empty state when no applications ────────────────────── */
  if (metrics.totalApplications === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="px-6 pt-6 pb-8 space-y-6">
          <PageHeader title="Insights" description={`Last ${metrics.windowDays} days`} />
          <EmptyState
            icon={<BarChart3 className="w-5 h-5" />}
            title="No data yet"
            description="Start applying to jobs to see your insights."
          />
        </div>
      </div>
    );
  }

  /* ── Pie tooltip: "12 applications (43%)" ────────────────── */
  const totalPieCount = metrics.matchDistribution.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 pt-6 pb-8 space-y-6">
        <PageHeader
          title="Insights"
          description={`Last ${metrics.windowDays} days`}
        />

        {/* Metric Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
          <MetricCard label="Applications" value={metrics.totalApplications} icon={<Send className="w-5 h-5" />} trend="flat" />
          <MetricCard label="Response Rate" value={`${metrics.responseRate}%`} icon={<TrendingUp className="w-5 h-5" />} trend="up" />
          <MetricCard label="Interview Rate" value={`${metrics.interviewRate}%`} highlight icon={<MessageSquare className="w-5 h-5" />} trend="up" />
          <MetricCard label="Best Resume" value={metrics.bestResumeVersionLabel} sub="highest interview rate" icon={<FileText className="w-5 h-5" />} />
          <MetricCard label="Top Missing Skill" value={metrics.topMissingSkill} sub="in rejected applications" icon={<AlertCircle className="w-5 h-5" />} />
          <MetricCard
            label="Mock Avg Score"
            value={typeof metrics.averageMockScore === 'number' ? `${Math.round(metrics.averageMockScore)}%` : 'N/A'}
            sub={`${metrics.mockSessionsCount ?? 0} sessions`}
            icon={<Brain className="w-5 h-5" />}
            trend="flat"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Applications Over Time */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Applications Over Time</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.applicationsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatDateShort}
                  />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    labelFormatter={formatDateShort}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Applications" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Interview Rate Over Time */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Interview Rate (%)</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.interviewRateOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatDateShort}
                  />
                  <YAxis domain={[0, 30]} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    labelFormatter={formatDateShort}
                    formatter={(value: number) => [`${value}%`, 'Rate']}
                  />
                  <Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 3 }} name="Rate %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Match Distribution */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Match Score Distribution</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={metrics.matchDistribution} dataKey="count" nameKey="tier" cx="50%" cy="50%" outerRadius={70}>
                    {metrics.matchDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => {
                      const pct = totalPieCount > 0 ? Math.round((value / totalPieCount) * 100) : 0;
                      return [`${value} applications (${pct}%)`, name];
                    }}
                  />
                  <Legend
                    formatter={(value: string) => {
                      const entry = metrics.matchDistribution.find((d) => d.tier === value);
                      return <span style={{ color: entry?.color ?? '#a1a1aa', fontSize: '11px' }}>{value}</span>;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
