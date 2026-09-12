import type { ApiResponse } from './types';

export interface AppSettings {
  dailySubmissionCap: number;
  discoveryIntervalMinutes: number;
  defaultResumeTemplate: 'jakes' | 'minimal' | 'modern';
  exportPath: string;
  llmProvider: 'gemini' | 'openai' | 'local';
  llmApiKey: string;
  updatedAt?: string;
}

function fromBackend(payload: any): AppSettings {
  return {
    dailySubmissionCap: Number(payload?.daily_submission_cap ?? 10),
    discoveryIntervalMinutes: Number(payload?.discovery_interval_minutes ?? 60),
    defaultResumeTemplate: (payload?.default_resume_template ?? 'jakes') as AppSettings['defaultResumeTemplate'],
    exportPath: String(payload?.export_path ?? '~/Downloads'),
    llmProvider: (payload?.llm_provider ?? 'gemini') as AppSettings['llmProvider'],
    llmApiKey: String(payload?.llm_api_key ?? ''),
    updatedAt: payload?.updated_at ? String(payload.updated_at) : undefined,
  };
}

function toBackend(payload: Partial<AppSettings>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (payload.dailySubmissionCap !== undefined) {
    body.daily_submission_cap = payload.dailySubmissionCap;
  }
  if (payload.discoveryIntervalMinutes !== undefined) {
    body.discovery_interval_minutes = payload.discoveryIntervalMinutes;
  }
  if (payload.defaultResumeTemplate !== undefined) {
    body.default_resume_template = payload.defaultResumeTemplate;
  }
  if (payload.exportPath !== undefined) {
    body.export_path = payload.exportPath;
  }
  if (payload.llmProvider !== undefined) {
    body.llm_provider = payload.llmProvider;
  }
  if (payload.llmApiKey !== undefined) {
    body.llm_api_key = payload.llmApiKey;
  }
  return body;
}

async function request(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`Settings API request failed (${response.status})`);
  }
  return response.json();
}

export async function getSettings(): Promise<ApiResponse<AppSettings>> {
  const data = await request('/api/settings');
  return { data: fromBackend(data), status: 200 };
}

export async function updateSettings(payload: Partial<AppSettings>): Promise<ApiResponse<AppSettings>> {
  const data = await request('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(toBackend(payload)),
  });
  return { data: fromBackend(data), status: 200 };
}
