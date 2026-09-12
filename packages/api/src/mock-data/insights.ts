import type { InsightsMetrics } from '@onfile/core';

export const MOCK_INSIGHTS: InsightsMetrics = {
  totalApplications: 28,
  responseRate: 21,
  interviewRate: 11,
  offerRate: 4,
  bestResumeVersionId: 'rv-002',
  bestResumeVersionLabel: 'Stripe — Backend Engineer (v2)',
  topMissingSkill: 'AWS',
  windowDays: 30,
  applicationsOverTime: [
    { date: '2026-01-22', count: 2 },
    { date: '2026-01-29', count: 4 },
    { date: '2026-02-05', count: 7 },
    { date: '2026-02-12', count: 9 },
    { date: '2026-02-19', count: 6 },
  ],
  interviewRateOverTime: [
    { date: '2026-01-22', rate: 0 },
    { date: '2026-01-29', rate: 8 },
    { date: '2026-02-05', rate: 12 },
    { date: '2026-02-12', rate: 18 },
    { date: '2026-02-19', rate: 21 },
  ],
  matchDistribution: [
    { tier: 'High (80%+)', count: 12, color: '#22c55e' },
    { tier: 'Medium (60–79%)', count: 11, color: '#f59e0b' },
    { tier: 'Low (<60%)', count: 5, color: '#6b7280' },
  ],
};
