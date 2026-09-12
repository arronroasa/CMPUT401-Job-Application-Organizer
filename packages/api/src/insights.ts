import type { InsightsMetrics } from '@onfile/core';
import { delay, MOCK_DELAY_MS } from './types';
import { MOCK_INSIGHTS } from './mock-data/insights';
import type { ApiResponse } from './types';

function asNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function safeInsights(payload: any): InsightsMetrics {
  return {
    totalApplications: asNumber(payload?.totalApplications, 0),
    responseRate: asNumber(payload?.responseRate, 0),
    interviewRate: asNumber(payload?.interviewRate, 0),
    offerRate: asNumber(payload?.offerRate, 0),
    bestResumeVersionId: String(payload?.bestResumeVersionId ?? ''),
    bestResumeVersionLabel: String(payload?.bestResumeVersionLabel ?? ''),
    topMissingSkill: String(payload?.topMissingSkill ?? 'N/A'),
    applicationsOverTime: Array.isArray(payload?.applicationsOverTime) ? payload.applicationsOverTime : [],
    interviewRateOverTime: Array.isArray(payload?.interviewRateOverTime) ? payload.interviewRateOverTime : [],
    matchDistribution: Array.isArray(payload?.matchDistribution) ? payload.matchDistribution : [],
    windowDays: asNumber(payload?.windowDays, 30),
    mockSessionsCount: payload?.mockSessionsCount === undefined ? undefined : asNumber(payload?.mockSessionsCount, 0),
    averageMockScore: payload?.averageMockScore === undefined ? undefined : asNumber(payload?.averageMockScore, 0),
  };
}

export async function getInsights(): Promise<ApiResponse<InsightsMetrics>> {
  await delay(MOCK_DELAY_MS);
  try {
    const response = await fetch('/api/insights');
    if (response.ok) {
      const data = await response.json();
      return { data: safeInsights(data), status: response.status };
    }
  } catch {
    // Fallback to deterministic mock data.
  }
  return { data: safeInsights(MOCK_INSIGHTS), status: 200 };
}

export async function refreshInsights(): Promise<ApiResponse<InsightsMetrics | null>> {
  try {
    const response = await fetch('/api/insights/refresh', { method: 'POST' });
    if (!response.ok) {
      return { data: null, status: response.status };
    }
    const payload = await response.json();
    return { data: safeInsights(payload), status: response.status };
  } catch {
    return { data: null, status: 0 };
  }
}
