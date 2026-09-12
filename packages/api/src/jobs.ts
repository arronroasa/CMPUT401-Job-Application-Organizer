import type { Job } from '@onfile/core';
import type { UserProfile } from '@onfile/core';
import { delay, MOCK_DELAY_MS } from './types';
import { MOCK_JOBS } from './mock-data/jobs';
import type { ApiResponse } from './types';
import { getProfile } from './profile';

type BackendJobSkill = {
  name?: string;
  required?: boolean;
  userHas?: boolean;
};

type BackendJob = {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  remote?: number | boolean | null;
  description?: string | null;
  skills_required_json?: BackendJobSkill[] | string[] | null;
  source?: string | null;
  source_url?: string | null;
  match_score?: number | null;
  match_tier?: string | null;
  skill_match?: number | null;
  experience_match?: number | null;
  role_match?: number | null;
  posted_date?: string | null;
  discovered_at?: string | null;
};

export interface ImportJobInput {
  sourceUrl: string;
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  remote?: boolean;
}

const NON_WORD_SKILL_CHARS_RE = /[^a-z0-9+#]+/g;

function toErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return fallback;
}

function normaliseTier(
  tier: string | null | undefined,
  scorePercent: number
): 'high' | 'medium' | 'low' {
  if (tier === 'high' || tier === 'medium' || tier === 'low') {
    return tier;
  }
  if (scorePercent >= 70) return 'high';
  if (scorePercent >= 40) return 'medium';
  return 'low';
}

function normalizeSkillToken(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(NON_WORD_SKILL_CHARS_RE, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const aliasMap: Record<string, string> = {
    'node js': 'nodejs',
    'react js': 'react',
    'next js': 'nextjs',
    'rest apis': 'rest api',
    'postgre sql': 'postgresql',
    postgres: 'postgresql',
  };
  return aliasMap[cleaned] ?? cleaned;
}

function skillForms(value: string): string[] {
  const token = normalizeSkillToken(value);
  if (!token) return [];
  const forms = new Set<string>([token, token.replace(/\s+/g, '')]);
  if (token.endsWith('s') && token.length > 3) {
    const singular = token.slice(0, -1);
    forms.add(singular);
    forms.add(singular.replace(/\s+/g, ''));
  }
  return Array.from(forms);
}

function extractUserSkillForms(profile: UserProfile | null): Set<string> {
  const forms = new Set<string>();
  if (!profile) return forms;
  for (const skill of profile.skills ?? []) {
    for (const form of skillForms(String(skill.name ?? ''))) {
      forms.add(form);
    }
  }
  return forms;
}

function hasSkillInProfile(skillName: string, userSkillForms: Set<string>): boolean {
  if (userSkillForms.size === 0) return false;
  return skillForms(skillName).some((form) => userSkillForms.has(form));
}

function mapSkills(raw: BackendJob['skills_required_json'], userSkillForms: Set<string>): Job['skills'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') {
        const name = item.trim();
        if (!name) return null;
        return { name, required: true, userHas: hasSkillInProfile(name, userSkillForms) };
      }
      if (item && typeof item === 'object') {
        const name = String(item.name ?? '').trim();
        if (!name) return null;
        const backendUserHas = Boolean(item.userHas ?? false);
        return {
          name,
          required: Boolean(item.required ?? true),
          userHas: backendUserHas || hasSkillInProfile(name, userSkillForms),
        };
      }
      return null;
    })
    .filter((item): item is Job['skills'][number] => item !== null);
}

function toPercent(value: number | null | undefined, fallback: number): number {
  const v = Number(value ?? fallback);
  return Math.round(Number.isFinite(v) ? Math.max(0, Math.min(1, v)) * 100 : fallback * 100);
}

function mapBackendJob(job: BackendJob, userSkillForms: Set<string>): Job {
  const rawScore = Number(job.match_score ?? 0);
  const clamped = Number.isFinite(rawScore) ? Math.max(0, Math.min(1, rawScore)) : 0;
  const overall = Math.round(clamped * 100);
  const tier = normaliseTier(job.match_tier, overall);
  const skills = mapSkills(job.skills_required_json, userSkillForms);

  // Use real sub-scores from the backend when available.
  // Fall back to the overall score only if the sub-scores are missing.
  const skillMatch = toPercent(job.skill_match, clamped);
  const experienceAlignment = toPercent(job.experience_match, 0.75);
  const roleAlignment = toPercent(job.role_match, 0.5);

  return {
    id: String(job.id),
    title: String(job.title ?? ''),
    company: String(job.company ?? ''),
    location: String(job.location ?? 'Remote'),
    remote: Boolean(job.remote),
    description: String(job.description ?? ''),
    skills,
    matchScore: {
      overall,
      tier,
      skillMatch,
      experienceAlignment,
      roleAlignment,
      gapPenalty: Math.max(0, 100 - overall),
    },
    status: 'new',
    source: String(job.source ?? 'discovery'),
    sourceUrl: String(job.source_url ?? ''),
    postedDate: String(job.posted_date ?? job.discovered_at ?? ''),
    createdAt: String(job.discovered_at ?? new Date().toISOString()),
  };
}

async function fetchBackendJobs(userSkillForms: Set<string>): Promise<Job[]> {
  const response = await fetch('/api/jobs');
  if (!response.ok) {
    throw new Error(`Failed to fetch jobs from backend (${response.status})`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.map((item) => mapBackendJob(item as BackendJob, userSkillForms));
}

export async function getJobs(): Promise<ApiResponse<Job[]>> {
  await delay(MOCK_DELAY_MS);
  let userSkillForms = new Set<string>();
  try {
    const profile = await getProfile();
    userSkillForms = extractUserSkillForms(profile.data ?? null);
  } catch {
    // Continue without profile-based enrichment.
  }
  try {
    const data = await fetchBackendJobs(userSkillForms);
    if (data.length > 0) {
      return { data, status: 200 };
    }
  } catch {
    // Fallback to mock feed when backend is unavailable.
  }
  return { data: MOCK_JOBS, status: 200 };
}

export async function getJob(id: string): Promise<ApiResponse<Job | null>> {
  const jobs = await getJobs();
  const job = jobs.data.find((item) => item.id === id) ?? null;
  return { data: job, status: job ? 200 : 404 };
}

export async function markJobInterested(id: string): Promise<ApiResponse<void>> {
  await delay(MOCK_DELAY_MS);
  // stub — real implementation updates local DB
  console.log(`[mock] Marked job ${id} as interested`);
  return { data: undefined, status: 200 };
}

export async function archiveJob(id: string): Promise<ApiResponse<void>> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return {
      data: undefined,
      error: toErrorMessage(payload, 'Failed to remove job'),
      status: response.status,
    };
  }
  return { data: undefined, status: response.status };
}

export async function archiveAllJobs(): Promise<ApiResponse<{ archived: number }>> {
  const response = await fetch('/api/jobs', {
    method: 'DELETE',
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    return {
      data: { archived: 0 },
      error: toErrorMessage(payload, 'Failed to clear jobs'),
      status: response.status,
    };
  }
  const archived =
    payload && typeof payload === 'object' && 'archived' in payload
      ? Number((payload as { archived?: unknown }).archived ?? 0)
      : 0;
  return {
    data: { archived: Number.isFinite(archived) ? Math.max(0, archived) : 0 },
    status: response.status,
  };
}

export async function importExternalJob(input: ImportJobInput): Promise<ApiResponse<Job | null>> {
  const response = await fetch('/api/jobs/import-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_url: input.sourceUrl,
      title: input.title,
      company: input.company,
      location: input.location,
      description: input.description,
      remote: Boolean(input.remote),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: null,
      error: toErrorMessage(payload, 'Failed to import external job'),
      status: response.status,
    };
  }
  let userSkillForms = new Set<string>();
  try {
    const profile = await getProfile();
    userSkillForms = extractUserSkillForms(profile.data ?? null);
  } catch {
    // Continue without profile-based enrichment.
  }
  return { data: mapBackendJob(payload as BackendJob, userSkillForms), status: response.status };
}
