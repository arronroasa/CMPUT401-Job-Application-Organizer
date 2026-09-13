'use client';

// Thin client for the job-search backend (FastAPI service in `backend/`,
// lifted out of the careersavers reference project). It powers the "Auto
// Search" option on the Applications page: you type what to search for,
// the backend searches public job boards (Greenhouse) for it, we poll for
// status, then fetch the ranked matches.
//
// Run the backend separately (from the backend/ folder):
//   uvicorn app.main:app --reload
// It listens on http://localhost:8000 by default and already allows CORS
// from http://localhost:3000 (see backend/app/main.py).

const DEFAULT_BASE_URL = 'http://localhost:8000';

export function getCareersaversApiBase() {
  return process.env.NEXT_PUBLIC_CAREERSAVERS_API_URL || DEFAULT_BASE_URL;
}

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

class CareersaversApiError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.name = 'CareersaversApiError';
    this.cause = opts.cause;
    this.offline = Boolean(opts.offline);
    // Set when the backend's specific complaint is "no profile/resume yet"
    // (see prepareApplicationDraft below) so the UI can offer to upload a
    // resume right there instead of just showing a dead-end error.
    this.needsResume = Boolean(opts.needsResume);
  }
}

function wrapNetworkError(err) {
  if (err instanceof CareersaversApiError) return err;
  return new CareersaversApiError(
    `Can't reach the job-search backend at ${getCareersaversApiBase()}. Make sure it's running (uvicorn app.main:app --reload from the backend/ folder).`,
    { cause: err, offline: true }
  );
}

// --- Profile / resume import ---------------------------------------------
// This is the one resume the backend actually uses: Auto Search's
// match-score ranking and the Apply autofill both read it straight off
// whichever profile is "active" (backend/app/routers/drafts.py's
// _get_active_profile_id, backend/app/engines/applications/draft_generator.py).

// Fetches the currently active profile, or null if none exists yet (i.e.
// no resume has ever been uploaded).
export async function getActiveProfile() {
  const base = getCareersaversApiBase();
  let res;
  try {
    res = await fetch(`${base}/profile`);
  } catch (err) {
    throw wrapNetworkError(err);
  }
  if (res.status === 404) return null;
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new CareersaversApiError(body?.detail || `Could not load your profile (${res.status}).`);
  }
  return body;
}

// Uploads a resume file; the backend runs it through the same AI parser
// careersavers uses (extract name/contact/skills/experience/education/etc.)
// and merges the result into a profile. By default this merges into
// whichever profile is already active, since for the Resumes tab there's
// meant to be exactly one "your resume" — pass createNewProfile: true for
// the Auto Search modal's optional attach-a-resume-for-this-search step,
// which intentionally keeps that upload separate.
export async function uploadResume(file, { createNewProfile = false } = {}) {
  const base = getCareersaversApiBase();
  const form = new FormData();
  form.append('file', file);
  form.append('create_new_profile', createNewProfile ? 'true' : 'false');

  let res;
  try {
    res = await fetch(`${base}/profile/resume`, { method: 'POST', body: form });
  } catch (err) {
    throw wrapNetworkError(err);
  }

  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new CareersaversApiError(body?.detail || `Resume upload failed (${res.status}).`);
  }
  return body; // { profile, profile_id, created_new_profile, extracted }
}

// Back-compat wrapper for the Auto Search modal's optional resume step —
// always creates a fresh profile rather than touching whatever's active.
export async function uploadResumeForAutoSearch(file) {
  return uploadResume(file, { createNewProfile: true });
}

// Kicks off an async discovery run against public sources (Greenhouse by
// default) for the search terms you provide — same idea as typing a
// search into the original careersavers UI, rather than having the
// backend infer roles from a resume on its own.
export async function startAutoSearchDiscovery({ query, location, remote = false, sources } = {}) {
  const base = getCareersaversApiBase();
  const payload = {};
  if (query && query.trim()) payload.query = query.trim();
  if (location && location.trim()) payload.location = location.trim();
  if (remote) payload.remote = true;
  if (sources && sources.length) payload.sources = sources;

  let res;
  try {
    res = await fetch(`${base}/discovery/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw wrapNetworkError(err);
  }
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new CareersaversApiError(body?.detail || `Could not start search (${res.status}).`);
  }
  return body; // { queued, status, sources, query, mode, started_at }
}

export async function getAutoSearchStatus() {
  const base = getCareersaversApiBase();
  let res;
  try {
    res = await fetch(`${base}/discovery/status`);
  } catch (err) {
    throw wrapNetworkError(err);
  }
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new CareersaversApiError(body?.detail || `Could not check search status (${res.status}).`);
  }
  return body; // { status: 'idle'|'running'|'completed'|'failed', jobs_found, jobs_new, ... }
}

export async function getDiscoveredJobs() {
  const base = getCareersaversApiBase();
  let res;
  try {
    res = await fetch(`${base}/jobs`);
  } catch (err) {
    throw wrapNetworkError(err);
  }
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new CareersaversApiError(body?.detail || `Could not load search results (${res.status}).`);
  }
  return Array.isArray(body) ? body : [];
}

// Polls /discovery/status until it settles into 'completed' or 'failed'
// (or the timeout elapses), calling onTick after every check.
export async function pollAutoSearchStatus({ onTick, intervalMs = 1500, timeoutMs = 120000 } = {}) {
  const start = Date.now();
  for (;;) {
    const status = await getAutoSearchStatus();
    if (onTick) onTick(status);
    const state = String(status.status || '').toLowerCase();
    if (state === 'completed' || state === 'failed') return status;
    if (Date.now() - start > timeoutMs) {
      throw new CareersaversApiError('Search is taking longer than expected. Check the backend logs.');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// --- Apply / autofill --------------------------------------------------
// Scans a job's application page and drafts answers for it from your
// active profile (whatever resume you last uploaded via Auto Search).
// Doesn't touch a browser yet — that's fillApplicationDraft below.
export async function prepareApplicationDraft(jobId) {
  const base = getCareersaversApiBase();
  let res;
  try {
    res = await fetch(`${base}/drafts/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId }),
    });
  } catch (err) {
    throw wrapNetworkError(err);
  }
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    const detail = body?.detail || `Could not prepare application (${res.status}).`;
    // The backend returns 404 with this specific message when there's no
    // active profile yet (i.e. you've never uploaded a resume) — distinct
    // from a 404 for a job that no longer exists.
    const needsResume = res.status === 404 && /resume/i.test(detail);
    throw new CareersaversApiError(detail, { needsResume });
  }
  return body; // draft row: { id, job_id, form_structure_json, filled_answers_json, ... }
}

// Connects to a Chrome window you already have open with remote debugging
// enabled, navigates it to the job's application page, and fills it in.
// Never submits anything — always stops at a review screenshot.
export async function fillApplicationDraft(draftId) {
  const base = getCareersaversApiBase();
  let res;
  try {
    res = await fetch(`${base}/drafts/${encodeURIComponent(draftId)}/fill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true }),
    });
  } catch (err) {
    throw wrapNetworkError(err);
  }
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    if (res.status === 503) {
      throw new CareersaversApiError(
        body?.detail ||
          "Couldn't connect to a Chrome window. Launch Chrome with remote debugging enabled first, e.g. `google-chrome --remote-debugging-port=9222` (macOS: `open -a \"Google Chrome\" --args --remote-debugging-port=9222`), then try again."
      );
    }
    throw new CareersaversApiError(body?.detail || `Could not fill in the application (${res.status}).`);
  }
  return body; // { status, screenshot_path, screenshot_url, mode }
}

export function resolveBackendUrl(path) {
  if (!path) return null;
  const base = getCareersaversApiBase();
  return path.startsWith('http') ? path : `${base}${path}`;
}

export { CareersaversApiError };
