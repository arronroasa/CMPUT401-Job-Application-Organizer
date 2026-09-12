import type { ResumeFragment, ResumeVersion } from '@onfile/core';
import { delay, MOCK_DELAY_MS } from './types';
import { MOCK_RESUME_VERSIONS } from './mock-data/resume-versions';
import type { ApiResponse } from './types';

type BackendResume = {
  id?: string;
  label?: string;
  type?: string;
  job_id?: string | null;
  job_title?: string | null;
  job_company?: string | null;
  template_id?: string | null;
  content_json?: unknown;
  strength_score?: number | null;
  keyword_coverage?: number | null;
  skill_alignment?: number | null;
  created_at?: string | null;
};

export interface GeneratedVersionSummary {
  id: string;
  label: string;
  type: string;
  templateId: string;
  strengthScore: number;
  createdAt: string;
}

export interface GenerateAllResult {
  jobId: string;
  versions: GeneratedVersionSummary[];
}

type BackendResumeContent = {
  fragments?: {
    experience?: Array<Record<string, unknown>>;
    projects?: Array<Record<string, unknown>>;
  };
  jd_analysis?: {
    domain?: string;
  };
};

export interface ResumePdfExportResult {
  blob: Blob;
  filename: string;
  savedPath?: string;
  texPath?: string;
  template?: string;
}

function toErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return fallback;
}

function clampPercent(value: unknown): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  const percentage = numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(percentage)));
}

function normaliseSkillNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const values: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      values.push(item.trim());
      continue;
    }
    if (item && typeof item === 'object' && 'name' in item) {
      const name = String((item as { name?: unknown }).name ?? '').trim();
      if (name) values.push(name);
    }
  }
  return values;
}

function parseLabel(label: string): { jobTitle?: string; company?: string } {
  const [title, company] = label.split(' @ ');
  if (!title || !company) return {};
  return { jobTitle: title.trim(), company: company.trim() };
}

function mapFragment(
  section: ResumeFragment['section'],
  item: Record<string, unknown>,
  index: number,
  domainTag?: string
): ResumeFragment | null {
  const text = String(item.rewritten_text ?? item.text ?? item.description ?? '').trim();
  if (!text) return null;

  const scoreRaw = Number(item.score ?? 0);
  const impactScore = Number.isFinite(scoreRaw)
    ? Math.max(0, Math.min(10, scoreRaw <= 1 ? scoreRaw * 10 : scoreRaw))
    : 0;

  const skillTags = normaliseSkillNames(item.skills);

  const domainTags: string[] = [];
  if (domainTag && domainTag.trim()) domainTags.push(domainTag.trim());

  return {
    id: String(item.id ?? `${section}-${index}`),
    section,
    text,
    skillTags,
    impactScore,
    domainTags,
    reasonIncluded: String(item.selection_reason ?? '').trim() || undefined,
  };
}

function mapContentToFragments(content: BackendResumeContent): ResumeFragment[] {
  const fragments = content.fragments ?? {};
  const domain = content.jd_analysis?.domain;

  const experience = Array.isArray(fragments.experience)
    ? fragments.experience
        .map((item, index) => mapFragment('experience', item, index, domain))
        .filter((item): item is ResumeFragment => item !== null)
    : [];

  const projects = Array.isArray(fragments.projects)
    ? fragments.projects
        .map((item, index) => mapFragment('project', item, index, domain))
        .filter((item): item is ResumeFragment => item !== null)
    : [];

  return [...experience, ...projects];
}

function mapBackendResume(row: BackendResume): ResumeVersion {
  const content = (row.content_json && typeof row.content_json === 'object'
    ? row.content_json
    : {}) as BackendResumeContent;

  const label = String(row.label ?? '');
  const parsedLabel = parseLabel(label);

  const type = row.type === 'base' ? 'base' : 'tailored';

  return {
    id: String(row.id ?? ''),
    type,
    jobId: row.job_id ? String(row.job_id) : undefined,
    jobTitle: row.job_title ? String(row.job_title) : parsedLabel.jobTitle,
    company: row.job_company ? String(row.job_company) : parsedLabel.company,
    templateId: row.template_id ? String(row.template_id) : 'classic-serif',
    content: content as Record<string, unknown>,
    fragments: mapContentToFragments(content),
    strengthScore: clampPercent(row.strength_score),
    keywordCoverage: clampPercent(row.keyword_coverage),
    skillAlignment: clampPercent(row.skill_alignment),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const utfMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      // ignore decode failure and fallback to regular filename parsing
    }
  }
  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
}

async function fetchRawResumeRows(): Promise<{ status: number; payload: unknown }> {
  const response = await fetch('/api/resumes');
  if (!response.ok) {
    throw new Error(`Failed to fetch resumes (${response.status})`);
  }
  return { status: response.status, payload: await response.json() };
}

function dedupeByJobTemplate(versions: ResumeVersion[]): ResumeVersion[] {
  const sorted = [...versions].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const seen = new Set<string>();
  const deduped: ResumeVersion[] = [];

  for (const version of sorted) {
    const key =
      version.type === 'tailored'
        ? `tailored:${version.jobId ?? 'none'}`
        : `base:${version.templateId ?? 'classic-serif'}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(version);
  }
  return deduped;
}

export async function getResumeVersions(): Promise<ApiResponse<ResumeVersion[]>> {
  await delay(MOCK_DELAY_MS);
  try {
    const { status, payload } = await fetchRawResumeRows();
    if (!Array.isArray(payload)) {
      return { data: MOCK_RESUME_VERSIONS, status };
    }
    const mapped = payload.map((item) => mapBackendResume(item as BackendResume));
    if (mapped.length === 0) {
      return { data: MOCK_RESUME_VERSIONS, status };
    }
    return {
      data: dedupeByJobTemplate(mapped),
      status,
    };
  } catch {
    return { data: MOCK_RESUME_VERSIONS, status: 200 };
  }
}

export async function getResumeVersion(id: string): Promise<ApiResponse<ResumeVersion | null>> {
  try {
    const response = await fetch(`/api/resumes/${id}`);
    if (response.status === 404) {
      return { data: null, status: 404 };
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch resume (${response.status})`);
    }
    const payload = (await response.json()) as BackendResume;
    return { data: mapBackendResume(payload), status: response.status };
  } catch {
    const fallback = MOCK_RESUME_VERSIONS.find((item) => item.id === id) ?? null;
    return { data: fallback, status: fallback ? 200 : 404 };
  }
}

export async function exportResumeAsLatex(id: string): Promise<ApiResponse<{ blob: Blob; filename: string } | null>> {
  try {
    const response = await fetch(`/api/resumes/${id}/export/latex`, { method: 'POST' });
    if (!response.ok) {
      let errorPayload: unknown = null;
      try { errorPayload = await response.json(); } catch { /* ignore */ }
      return { data: null, error: toErrorMessage(errorPayload, `LaTeX export failed (${response.status})`), status: response.status };
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? `resume-${id}.tex`;
    return { data: { blob, filename }, status: response.status };
  } catch {
    return { data: null, error: 'Network error during LaTeX export', status: 0 };
  }
}

export async function exportResumeAsPdf(id: string): Promise<ApiResponse<ResumePdfExportResult | null>> {
  let response = await fetch(`/api/resumes/${id}/export/pdf`, {
    method: 'POST',
  });

  if (!response.ok) {
    let errorPayload: unknown = null;
    try {
      errorPayload = await response.json();
    } catch {
      // Ignore JSON parse failure and use fallback message.
    }
    return {
      data: null,
      error: toErrorMessage(errorPayload, `Failed to export PDF (${response.status})`),
      status: response.status,
    };
  }

  const blob = await response.blob();
  const filename =
    parseContentDispositionFilename(response.headers.get('Content-Disposition')) ?? `resume-${id}.pdf`;

  return {
    data: {
      blob,
      filename,
      savedPath: response.headers.get('X-Resume-Export-Path') ?? undefined,
      texPath: response.headers.get('X-Resume-Tex-Path') ?? undefined,
      template: response.headers.get('X-Resume-Template') ?? undefined,
    },
    status: response.status,
  };
}

export async function updateResumeContent(
  id: string,
  content: Record<string, unknown>,
): Promise<ApiResponse<ResumeVersion | null>> {
  try {
    const response = await fetch(`/api/resumes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_json: content }),
    });
    if (!response.ok) {
      let errorPayload: unknown = null;
      try { errorPayload = await response.json(); } catch { /* ignore */ }
      return {
        data: null,
        error: toErrorMessage(errorPayload, `Save failed (${response.status})`),
        status: response.status,
      };
    }
    const payload = (await response.json()) as BackendResume;
    return { data: mapBackendResume(payload), status: response.status };
  } catch {
    return { data: null, error: 'Network error during save', status: 0 };
  }
}

export async function generateAllVersions(jobId: string): Promise<ApiResponse<GenerateAllResult | null>> {
  try {
    const response = await fetch('/api/resumes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId }),
    });

    if (!response.ok) {
      let errorPayload: unknown = null;
      try { errorPayload = await response.json(); } catch { /* ignore */ }
      return {
        data: null,
        error: toErrorMessage(errorPayload, `Resume generation failed (${response.status})`),
        status: response.status,
      };
    }

    const payload = await response.json() as {
      id: string;
      label: string;
      type: string;
      job_id?: string;
      template_id?: string;
      strength_score?: number;
      created_at?: string;
    };

    return {
      data: {
        jobId: String(payload.job_id ?? jobId),
        versions: [
          {
            id: String(payload.id ?? ''),
            label: String(payload.label ?? ''),
            type: String(payload.type ?? 'tailored'),
            templateId: String(payload.template_id ?? 'classic-serif'),
            strengthScore: clampPercent(payload.strength_score ?? 0),
            createdAt: String(payload.created_at ?? new Date().toISOString()),
          },
        ],
      },
      status: response.status,
    };
  } catch {
    return { data: null, error: 'Network error during resume generation', status: 0 };
  }
}
