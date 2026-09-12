import type { ApiResponse } from './types';
import type { ChatMessage } from './drafts';

export interface BrowserConnectionStatus {
  connected: boolean;
  endpoint: string;
  browser_info: { browser?: string; webSocketDebuggerUrl?: string };
  error: string | null;
  how_to_start: string;
}

export type BrowserDiscoverySource = 'linkedin' | 'indeed';

export interface BrowserAssistedDiscoveryInput {
  source: BrowserDiscoverySource;
  query: string;
  maxResults?: number;
  minMatchScore?: number;
  useVisibleBrowser?: boolean;
  cdpEndpoint?: string;
  waitSeconds?: number;
}

export interface BrowserAssistedDiscoveryResult {
  run_id: string;
  status: string;
  mode: string;
  source: string;
  query: string;
  jobs_found: number;
  jobs_new: number;
  min_match_score: number;
  started_at: string;
  completed_at?: string;
}

export interface BrowserAssistedSessionStartInput {
  query: string;
  sources?: BrowserDiscoverySource[];
  maxResults?: number;
  minMatchScore?: number;
  useVisibleBrowser?: boolean;
  cdpEndpoint?: string;
  waitSeconds?: number;
}

export interface BrowserAssistedSessionStartResult {
  run_id: string;
  status: string;
  mode: string;
  query: string;
  sources: string[];
  started_at: string;
}

export interface BrowserAssistedSourceProgress {
  source: string;
  status: string;
  jobs_found: number;
  jobs_new: number;
  error?: string | null;
}

export interface BrowserAssistedDiscoveryProgressEvent {
  at: string;
  level: string;
  message: string;
}

export interface BrowserAssistedSessionProgressResult {
  run_id: string;
  status: string;
  mode: string;
  query: string;
  sources: string[];
  current_source?: string | null;
  jobs_found: number;
  jobs_new: number;
  started_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  elapsed_seconds: number;
  estimated_duration_seconds: number;
  error?: string | null;
  events: BrowserAssistedDiscoveryProgressEvent[];
  source_results: BrowserAssistedSourceProgress[];
}

export interface BrowserAssistedChatThreadResult {
  run_id: string;
  messages: ChatMessage[];
}

export interface BrowserAssistedPostChatResult {
  ok: boolean;
  run_id: string;
  applied: string;
  messages: ChatMessage[];
}

export interface DiscoveryStatusResult {
  id?: string;
  status: string;
  source?: string;
  started_at?: string | null;
  completed_at?: string | null;
  jobs_found?: number;
  jobs_new?: number;
}

function toErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return fallback;
}

export async function runBrowserAssistedDiscovery(
  input: BrowserAssistedDiscoveryInput
): Promise<ApiResponse<BrowserAssistedDiscoveryResult>> {
  const response = await fetch('/api/discovery/browser-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: input.source,
      query: input.query,
      max_results: Number(input.maxResults ?? 20),
      min_match_score: Number(input.minMatchScore ?? 0.15),
      use_visible_browser: Boolean(input.useVisibleBrowser ?? true),
      cdp_endpoint: input.cdpEndpoint,
      wait_seconds: Number(input.waitSeconds ?? 25),
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    return {
      data: {
        run_id: '',
        status: 'failed',
        mode: 'unknown',
        source: input.source,
        query: input.query,
        jobs_found: 0,
        jobs_new: 0,
        min_match_score: Number(input.minMatchScore ?? 0.15),
        started_at: new Date().toISOString(),
      },
      error: toErrorMessage(payload, 'Browser-assisted discovery failed'),
      status: response.status,
    };
  }

  return {
    data: {
      run_id: String(payload.run_id ?? ''),
      status: String(payload.status ?? 'completed'),
      mode: String(payload.mode ?? 'browser_assisted'),
      source: String(payload.source ?? input.source),
      query: String(payload.query ?? input.query),
      jobs_found: Number(payload.jobs_found ?? 0),
      jobs_new: Number(payload.jobs_new ?? 0),
      min_match_score: Number(payload.min_match_score ?? input.minMatchScore ?? 0.15),
      started_at: String(payload.started_at ?? new Date().toISOString()),
      completed_at: payload.completed_at ? String(payload.completed_at) : undefined,
    },
    status: response.status,
  };
}

function parseProgressEvents(raw: unknown): BrowserAssistedDiscoveryProgressEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: unknown) => {
      if (!item || typeof item !== 'object') return null;
      const m = item as Record<string, unknown>;
      const at = typeof m.at === 'string' ? m.at : '';
      const level = typeof m.level === 'string' ? m.level : 'info';
      const message = typeof m.message === 'string' ? m.message : '';
      return message ? ({ at, level, message } as BrowserAssistedDiscoveryProgressEvent) : null;
    })
    .filter((m): m is BrowserAssistedDiscoveryProgressEvent => m !== null);
}

function parseSourceProgress(raw: unknown): BrowserAssistedSourceProgress[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: unknown) => {
      if (!item || typeof item !== 'object') return null;
      const m = item as Record<string, unknown>;
      const source = typeof m.source === 'string' ? m.source : '';
      if (!source) return null;
      return {
        source,
        status: typeof m.status === 'string' ? m.status : 'pending',
        jobs_found: Number(m.jobs_found ?? 0),
        jobs_new: Number(m.jobs_new ?? 0),
        error: typeof m.error === 'string' ? m.error : null,
      } as BrowserAssistedSourceProgress;
    })
    .filter((m): m is BrowserAssistedSourceProgress => m !== null);
}

function parseChatMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: unknown) => {
      if (!item || typeof item !== 'object') return null;
      const m = item as Record<string, unknown>;
      const role = m.role === 'user' ? 'user' : 'ai';
      const text = typeof m.text === 'string' ? m.text : '';
      const at = typeof m.at === 'string' ? m.at : '';
      return text ? ({ role, text, at } as ChatMessage) : null;
    })
    .filter((m): m is ChatMessage => m !== null);
}

export async function startBrowserAssistedDiscoverySession(
  input: BrowserAssistedSessionStartInput
): Promise<ApiResponse<BrowserAssistedSessionStartResult>> {
  const response = await fetch('/api/discovery/browser-assist/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: input.query,
      sources: (input.sources ?? ['linkedin']).map((source) => String(source)),
      max_results: Number(input.maxResults ?? 300),
      min_match_score: Number(input.minMatchScore ?? 0.0),
      use_visible_browser: Boolean(input.useVisibleBrowser ?? true),
      cdp_endpoint: input.cdpEndpoint,
      wait_seconds: Number(input.waitSeconds ?? 6),
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    return {
      data: {
        run_id: '',
        status: 'failed',
        mode: 'browser_assisted',
        query: input.query,
        sources: (input.sources ?? ['linkedin']).map((source) => String(source)),
        started_at: new Date().toISOString(),
      },
      error: toErrorMessage(payload, 'Failed to start browser-assisted discovery'),
      status: response.status,
    };
  }

  return {
    data: {
      run_id: String(payload.run_id ?? ''),
      status: String(payload.status ?? 'running'),
      mode: String(payload.mode ?? 'browser_assisted'),
      query: String(payload.query ?? input.query),
      sources: Array.isArray(payload.sources)
        ? payload.sources.map((item: unknown) => String(item))
        : (input.sources ?? ['linkedin']).map((source) => String(source)),
      started_at: String(payload.started_at ?? new Date().toISOString()),
    },
    status: response.status,
  };
}

export async function getBrowserAssistedDiscoveryProgress(
  runId: string
): Promise<ApiResponse<BrowserAssistedSessionProgressResult>> {
  const response = await fetch(`/api/discovery/browser-assist/${encodeURIComponent(runId)}/progress`);
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: {
        run_id: runId,
        status: 'failed',
        mode: 'browser_assisted',
        query: '',
        sources: [],
        current_source: null,
        jobs_found: 0,
        jobs_new: 0,
        started_at: null,
        updated_at: null,
        completed_at: null,
        elapsed_seconds: 0,
        estimated_duration_seconds: 0,
        error: toErrorMessage(payload, 'Failed to fetch discovery progress'),
        events: [],
        source_results: [],
      },
      error: toErrorMessage(payload, 'Failed to fetch discovery progress'),
      status: response.status,
    };
  }
  return {
    data: {
      run_id: typeof payload.run_id === 'string' ? payload.run_id : runId,
      status: typeof payload.status === 'string' ? payload.status : 'running',
      mode: typeof payload.mode === 'string' ? payload.mode : 'browser_assisted',
      query: typeof payload.query === 'string' ? payload.query : '',
      sources: Array.isArray(payload.sources)
        ? payload.sources.map((item: unknown) => String(item))
        : [],
      current_source: typeof payload.current_source === 'string' ? payload.current_source : null,
      jobs_found: Number(payload.jobs_found ?? 0),
      jobs_new: Number(payload.jobs_new ?? 0),
      started_at: typeof payload.started_at === 'string' ? payload.started_at : null,
      updated_at: typeof payload.updated_at === 'string' ? payload.updated_at : null,
      completed_at: typeof payload.completed_at === 'string' ? payload.completed_at : null,
      elapsed_seconds: Number(payload.elapsed_seconds ?? 0),
      estimated_duration_seconds: Number(payload.estimated_duration_seconds ?? 0),
      error: typeof payload.error === 'string' ? payload.error : null,
      events: parseProgressEvents(payload.events),
      source_results: parseSourceProgress(payload.source_results),
    },
    status: response.status,
  };
}

export async function getBrowserAssistedDiscoveryMessages(
  runId: string
): Promise<ApiResponse<BrowserAssistedChatThreadResult>> {
  const response = await fetch(`/api/discovery/browser-assist/${encodeURIComponent(runId)}/messages`);
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: { run_id: runId, messages: [] },
      error: toErrorMessage(payload, 'Failed to fetch discovery chat'),
      status: response.status,
    };
  }
  return {
    data: {
      run_id: typeof payload.run_id === 'string' ? payload.run_id : runId,
      messages: parseChatMessages(payload.messages),
    },
    status: response.status,
  };
}

export async function postBrowserAssistedDiscoveryMessage(
  runId: string,
  text: string
): Promise<ApiResponse<BrowserAssistedPostChatResult>> {
  const response = await fetch(`/api/discovery/browser-assist/${encodeURIComponent(runId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: { ok: false, run_id: runId, applied: '', messages: [] },
      error: toErrorMessage(payload, 'Failed to send discovery chat message'),
      status: response.status,
    };
  }
  return {
    data: {
      ok: Boolean(payload.ok),
      run_id: typeof payload.run_id === 'string' ? payload.run_id : runId,
      applied: typeof payload.applied === 'string' ? payload.applied : text,
      messages: parseChatMessages(payload.messages),
    },
    status: response.status,
  };
}

export async function checkBrowserConnection(
  cdpEndpoint?: string
): Promise<ApiResponse<BrowserConnectionStatus>> {
  const params = cdpEndpoint ? `?cdp_endpoint=${encodeURIComponent(cdpEndpoint)}` : '';
  try {
    const response = await fetch(`/api/discovery/browser-status${params}`);
    const payload = await response.json();
    return {
      data: {
        connected: Boolean(payload.connected),
        endpoint: String(payload.endpoint ?? 'http://host.docker.internal:9222'),
        browser_info: payload.browser_info ?? {},
        error: payload.error ?? null,
        how_to_start: String(payload.how_to_start ?? ''),
      },
      status: response.status,
    };
  } catch {
    return {
      data: {
        connected: false,
        endpoint: cdpEndpoint ?? 'http://host.docker.internal:9222',
        browser_info: {},
        error: 'Could not reach backend to check browser status.',
        how_to_start:
          'macOS/Linux: google-chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --no-first-run\n' +
          'Windows:     chrome.exe --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0\n' +
          'Docker backend endpoint: http://host.docker.internal:9222\n' +
          'Host backend endpoint:   http://localhost:9222',
      },
      status: 0,
    };
  }
}

export async function getDiscoveryStatus(): Promise<ApiResponse<DiscoveryStatusResult>> {
  try {
    const response = await fetch('/api/discovery/status');
    const payload = await response.json();
    if (!response.ok) {
      return {
        data: { status: 'unknown' },
        error: toErrorMessage(payload, 'Failed to fetch discovery status'),
        status: response.status,
      };
    }
    return {
      data: {
        id: typeof payload.id === 'string' ? payload.id : undefined,
        status: typeof payload.status === 'string' ? payload.status : 'idle',
        source: typeof payload.source === 'string' ? payload.source : undefined,
        started_at: typeof payload.started_at === 'string' ? payload.started_at : null,
        completed_at: typeof payload.completed_at === 'string' ? payload.completed_at : null,
        jobs_found: Number(payload.jobs_found ?? 0),
        jobs_new: Number(payload.jobs_new ?? 0),
      },
      status: response.status,
    };
  } catch {
    return {
      data: { status: 'unknown' },
      error: 'Could not reach backend to fetch discovery status.',
      status: 0,
    };
  }
}
