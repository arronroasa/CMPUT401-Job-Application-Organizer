import type { ApplicationDraft, ApplicationStatus } from '@onfile/core';
import { delay, MOCK_DELAY_MS } from './types';
import { MOCK_APPLICATIONS } from './mock-data/applications';
import type { ApiResponse } from './types';
import { refreshInsights } from './insights';

// In-memory mutable store for mock drag-and-drop
let drafts = [...MOCK_APPLICATIONS];

function ensureString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

// The backend stores job match scores as a 0.0-1.0 fraction (see
// jobs.match_score / apply_ranking), same as packages/api/src/jobs.ts's
// mapBackendJob does. ApplicationDraft.matchScore is a 0-100 percentage
// (see MOCK_APPLICATIONS and MatchBadge/StatusPill usage), so the raw
// fraction from `application_drafts` -> jobs join must be converted here —
// without this, every application shows ~0%.
function toPercent(value: unknown): number {
  const raw = Number(value ?? 0);
  const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  return Math.round(clamped * 100);
}

function normalizeApplication(payload: any): ApplicationDraft {
  return {
    id: ensureString(payload?.id),
    jobId: ensureString(payload?.jobId ?? payload?.job_id),
    jobTitle: ensureString(payload?.jobTitle ?? payload?.job_title),
    company: ensureString(payload?.company),
    resumeVersionId: ensureString(payload?.resumeVersionId ?? payload?.resume_version_id),
    status: (payload?.status ?? 'drafted') as ApplicationStatus,
    matchScore: toPercent(payload?.matchScore ?? payload?.match_score),
    coverLetter: typeof payload?.coverLetter === 'string' ? payload.coverLetter : (typeof payload?.cover_letter === 'string' ? payload.cover_letter : undefined),
    formStructure: Array.isArray(payload?.formStructure ?? payload?.form_structure_json)
      ? (payload?.formStructure ?? payload?.form_structure_json)
      : [],
    answers: typeof payload?.answers === 'object' && payload?.answers
      ? payload.answers
      : (typeof payload?.filled_answers_json === 'object' && payload?.filled_answers_json ? payload.filled_answers_json : {}),
    missingSkills: Array.isArray(payload?.missingSkills) ? payload.missingSkills : [],
    createdAt: ensureString(payload?.createdAt ?? payload?.created_at, new Date().toISOString()),
    approvedAt: typeof payload?.approvedAt === 'string' ? payload.approvedAt : (typeof payload?.approved_at === 'string' ? payload.approved_at : undefined),
    submittedAt: typeof payload?.submittedAt === 'string' ? payload.submittedAt : (typeof payload?.submitted_at === 'string' ? payload.submitted_at : undefined),
    responseTimeDays: Number.isFinite(Number(payload?.responseTimeDays ?? payload?.response_time_days))
      ? Number(payload?.responseTimeDays ?? payload?.response_time_days)
      : undefined,
    notes: typeof payload?.notes === 'string' ? payload.notes : undefined,
  };
}

export async function getApplicationDrafts(): Promise<ApiResponse<ApplicationDraft[]>> {
  await delay(MOCK_DELAY_MS / 2);
  try {
    const response = await fetch('/api/applications');
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        return { data: data.map(normalizeApplication), status: 200 };
      }
    }
  } catch {
    // fallback to mock store
  }
  return { data: drafts, status: 200 };
}

export async function getApplicationDraft(id: string): Promise<ApiResponse<ApplicationDraft | null>> {
  await delay(MOCK_DELAY_MS / 2);
  try {
    const response = await fetch(`/api/applications/${encodeURIComponent(id)}`);
    if (response.ok) {
      const payload = await response.json();
      void refreshInsights();
      return { data: normalizeApplication(payload), status: 200 };
    }
    if (response.status === 404) {
      return { data: null, status: 404 };
    }
  } catch {
    // fallback to mock store
  }
  const draft = drafts.find((d) => d.id === id) ?? null;
  return { data: draft, status: draft ? 200 : 404 };
}

export async function updateDraftStatus(
  id: string,
  status: ApplicationStatus
): Promise<ApiResponse<ApplicationDraft | null>> {
  await delay(MOCK_DELAY_MS / 2);
  try {
    const response = await fetch(`/api/applications/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      const payload = await response.json();
      return { data: normalizeApplication(payload), status: 200 };
    }
    if (response.status === 404) {
      return { data: null, status: 404 };
    }
  } catch {
    // fallback to mock store
  }
  drafts = drafts.map((d) => (d.id === id ? { ...d, status } : d));
  const updated = drafts.find((d) => d.id === id) ?? null;
  return { data: updated, status: updated ? 200 : 404 };
}
