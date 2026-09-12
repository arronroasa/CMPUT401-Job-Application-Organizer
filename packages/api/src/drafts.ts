import type { ApiResponse } from './types';

export interface ChatMessage {
  role: 'ai' | 'user';
  text: string;
  at: string;
}

export interface ChatThreadResult {
  draft_id: string;
  messages: ChatMessage[];
}

export interface PostChatMessageResult {
  ok: boolean;
  draft_id: string;
  applied: string;
  messages: ChatMessage[];
}

export interface AssistedDraft {
  id: string;
  status: string;
}

export interface AssistedFillResult {
  status: string;
  screenshot_path?: string;
  screenshot_url?: string;
  mode?: string;
  requires_explicit_final_submit: boolean;
}

export interface AssistedConfirmResult {
  status: string;
  screenshot_path?: string;
  screenshot_url?: string;
  mode?: string;
  draft?: {
    id?: string;
    status?: string;
    submitted_at?: string | null;
  };
}

export interface AssistedManualSubmittedResult {
  status: string;
  draft?: {
    id?: string;
    status?: string;
    submitted_at?: string | null;
  };
}

export interface AssistedProgressEvent {
  at: string;
  level: string;
  message: string;
}

export interface AssistedScreenshotSnapshot {
  at: string;
  path: string;
}

export interface AssistedProgressResult {
  draft_id: string;
  status: string;
  mode: string;
  phase?: string;
  waiting_for_user?: boolean;
  required_user_action?: string | null;
  required_user_action_detail?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  latest_screenshot_path?: string;
  latest_screenshot_url?: string;
  snapshots?: AssistedScreenshotSnapshot[];
  events: AssistedProgressEvent[];
  error?: string | null;
}

export interface AssistedGuidanceResult {
  ok: boolean;
  draft_id: string;
  applied_guidance: string;
}

export interface AssistedRunOptions {
  useVisibleBrowser?: boolean;
  pauseForManualInputSeconds?: number;
}

function toErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return fallback;
}

export async function prepareDraft(jobId: string): Promise<ApiResponse<AssistedDraft>> {
  const response = await fetch('/api/drafts/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId }),
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: { id: '', status: 'error' },
      error: toErrorMessage(payload, 'Failed to prepare draft'),
      status: response.status,
    };
  }
  return {
    data: {
      id: String(payload.id ?? ''),
      status: String(payload.status ?? 'drafted'),
    },
    status: response.status,
  };
}

export async function approveDraft(draftId: string): Promise<ApiResponse<AssistedDraft>> {
  const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/approve`, {
    method: 'POST',
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: { id: draftId, status: 'error' },
      error: toErrorMessage(payload, 'Failed to approve draft'),
      status: response.status,
    };
  }
  return {
    data: {
      id: String(payload.id ?? draftId),
      status: String(payload.status ?? 'approved'),
    },
    status: response.status,
  };
}

export async function runAssistedFill(
  draftId: string,
  options?: AssistedRunOptions
): Promise<ApiResponse<AssistedFillResult>> {
  const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      confirm_user_assisted: true,
      acknowledge_platform_terms: true,
      use_visible_browser: Boolean(options?.useVisibleBrowser),
      pause_for_manual_input_seconds: Number(options?.pauseForManualInputSeconds ?? 0),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: {
        status: 'error',
        requires_explicit_final_submit: true,
      },
      error: toErrorMessage(payload, 'Failed during assisted form fill'),
      status: response.status,
    };
  }
  return {
    data: {
      status: String(payload.status ?? 'ready_for_final_approval'),
      screenshot_path:
        typeof payload.screenshot_path === 'string' ? payload.screenshot_path : undefined,
      screenshot_url:
        typeof payload.screenshot_url === 'string' ? payload.screenshot_url : undefined,
      mode: typeof payload.mode === 'string' ? payload.mode : undefined,
      requires_explicit_final_submit: Boolean(payload.requires_explicit_final_submit ?? true),
    },
    status: response.status,
  };
}

export async function runAssistedConfirmSubmit(
  draftId: string,
  options?: AssistedRunOptions
): Promise<ApiResponse<AssistedConfirmResult>> {
  const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/confirm-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      confirm_user_assisted: true,
      acknowledge_platform_terms: true,
      confirm_final_submit: true,
      use_visible_browser: Boolean(options?.useVisibleBrowser),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: { status: 'error' },
      error: toErrorMessage(payload, 'Failed during final submit'),
      status: response.status,
    };
  }
  const draftPayload =
    payload.draft && typeof payload.draft === 'object'
      ? (payload.draft as { id?: unknown; status?: unknown; submitted_at?: unknown })
      : undefined;
  return {
    data: {
      status: String(payload.status ?? 'submitted'),
      screenshot_path:
        typeof payload.screenshot_path === 'string' ? payload.screenshot_path : undefined,
      screenshot_url:
        typeof payload.screenshot_url === 'string' ? payload.screenshot_url : undefined,
      mode: typeof payload.mode === 'string' ? payload.mode : undefined,
      draft: draftPayload
        ? {
            id: typeof draftPayload.id === 'string' ? draftPayload.id : undefined,
            status: typeof draftPayload.status === 'string' ? draftPayload.status : undefined,
            submitted_at:
              typeof draftPayload.submitted_at === 'string' ? draftPayload.submitted_at : null,
          }
        : undefined,
    },
    status: response.status,
  };
}

export async function markAssistedSubmitted(
  draftId: string
): Promise<ApiResponse<AssistedManualSubmittedResult>> {
  const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/mark-submitted`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      confirm_user_assisted: true,
      acknowledge_platform_terms: true,
      confirm_final_submit: true,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: { status: 'error' },
      error: toErrorMessage(payload, 'Failed to mark submitted'),
      status: response.status,
    };
  }
  const draftPayload =
    payload.draft && typeof payload.draft === 'object'
      ? (payload.draft as { id?: unknown; status?: unknown; submitted_at?: unknown })
      : undefined;
  return {
    data: {
      status: typeof payload.status === 'string' ? payload.status : 'submitted_manual',
      draft: draftPayload
        ? {
            id: typeof draftPayload.id === 'string' ? draftPayload.id : undefined,
            status: typeof draftPayload.status === 'string' ? draftPayload.status : undefined,
            submitted_at:
              typeof draftPayload.submitted_at === 'string' ? draftPayload.submitted_at : null,
          }
        : undefined,
    },
    status: response.status,
  };
}

export async function getAssistedProgress(
  draftId: string
): Promise<ApiResponse<AssistedProgressResult>> {
  const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/progress`);
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: {
        draft_id: draftId,
        status: 'error',
        mode: 'unknown',
        events: [],
      },
      error: toErrorMessage(payload, 'Failed to fetch assisted progress'),
      status: response.status,
    };
  }
  const rawEvents: unknown[] = Array.isArray(payload.events) ? payload.events : [];
  const rawSnapshots: unknown[] = Array.isArray(payload.snapshots) ? payload.snapshots : [];
  const events = rawEvents
    .map((item: unknown) =>
      item && typeof item === 'object'
        ? (() => {
            const event = item as Record<string, unknown>;
            return {
              at: typeof event.at === 'string' ? event.at : '',
              level: typeof event.level === 'string' ? event.level : 'info',
              message: typeof event.message === 'string' ? event.message : '',
            };
          })()
        : null
    )
    .filter((item: AssistedProgressEvent | null): item is AssistedProgressEvent =>
      Boolean(item && item.message)
    );
  const snapshots = rawSnapshots
    .map((item: unknown) =>
      item && typeof item === 'object'
        ? (() => {
            const row = item as Record<string, unknown>;
            return {
              at: typeof row.at === 'string' ? row.at : '',
              path: typeof row.path === 'string' ? row.path : '',
            } as AssistedScreenshotSnapshot;
          })()
        : null
    )
    .filter((item: AssistedScreenshotSnapshot | null): item is AssistedScreenshotSnapshot =>
      Boolean(item && item.path)
    );

  return {
    data: {
      draft_id: typeof payload.draft_id === 'string' ? payload.draft_id : draftId,
      status: typeof payload.status === 'string' ? payload.status : 'idle',
      mode: typeof payload.mode === 'string' ? payload.mode : 'unknown',
      phase: typeof payload.phase === 'string' ? payload.phase : undefined,
      waiting_for_user: Boolean(payload.waiting_for_user ?? false),
      required_user_action:
        typeof payload.required_user_action === 'string' ? payload.required_user_action : null,
      required_user_action_detail:
        typeof payload.required_user_action_detail === 'string' ? payload.required_user_action_detail : null,
      started_at: typeof payload.started_at === 'string' ? payload.started_at : null,
      updated_at: typeof payload.updated_at === 'string' ? payload.updated_at : null,
      latest_screenshot_path:
        typeof payload.latest_screenshot_path === 'string' ? payload.latest_screenshot_path : undefined,
      latest_screenshot_url:
        typeof payload.latest_screenshot_url === 'string' ? payload.latest_screenshot_url : undefined,
      snapshots,
      events,
      error: typeof payload.error === 'string' ? payload.error : null,
    },
    status: response.status,
  };
}

export async function sendAssistedGuidance(
  draftId: string,
  message: string
): Promise<ApiResponse<AssistedGuidanceResult>> {
  const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/guidance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: { ok: false, draft_id: draftId, applied_guidance: '' },
      error: toErrorMessage(payload, 'Failed to send operator guidance'),
      status: response.status,
    };
  }
  return {
    data: {
      ok: Boolean(payload.ok),
      draft_id: typeof payload.draft_id === 'string' ? payload.draft_id : draftId,
      applied_guidance:
        typeof payload.applied_guidance === 'string' ? payload.applied_guidance : '',
    },
    status: response.status,
  };
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

export async function getChatMessages(draftId: string): Promise<ApiResponse<ChatThreadResult>> {
  try {
    const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/messages`);
    const payload = await response.json();
    if (!response.ok) {
      return {
        data: { draft_id: draftId, messages: [] },
        error: toErrorMessage(payload, 'Failed to fetch chat messages'),
        status: response.status,
      };
    }
    return {
      data: {
        draft_id: typeof payload.draft_id === 'string' ? payload.draft_id : draftId,
        messages: parseChatMessages(payload.messages),
      },
      status: response.status,
    };
  } catch {
    return { data: { draft_id: draftId, messages: [] }, status: 0 };
  }
}

export async function postChatMessage(
  draftId: string,
  text: string
): Promise<ApiResponse<PostChatMessageResult>> {
  try {
    const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const payload = await response.json();
    if (!response.ok) {
      return {
        data: { ok: false, draft_id: draftId, applied: '', messages: [] },
        error: toErrorMessage(payload, 'Failed to send message'),
        status: response.status,
      };
    }
    return {
      data: {
        ok: Boolean(payload.ok),
        draft_id: typeof payload.draft_id === 'string' ? payload.draft_id : draftId,
        applied: typeof payload.applied === 'string' ? payload.applied : text,
        messages: parseChatMessages(payload.messages),
      },
      status: response.status,
    };
  } catch {
    return { data: { ok: false, draft_id: draftId, applied: '', messages: [] }, status: 0 };
  }
}
