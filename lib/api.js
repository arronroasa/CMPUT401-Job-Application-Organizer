// Client for the OnFile backend (job scraping + AI resume generation).
//
// This is the only file that knows the backend's HTTP shape. The backend is
// a separate FastAPI service (see the `backend/` repo) that must be running
// separately — set NEXT_PUBLIC_API_BASE_URL if it's not on the default port.
//
// Every call throws a plain Error with a human-readable message on failure
// (including "can't reach the backend at all") so callers can show it inline
// instead of the app crashing. Nothing here touches localStorage — that's
// still handled by lib/store.js for applications/resumes data.

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

export function getApiBase() {
  return API_BASE;
}

async function request(path, options = {}, { allowMissing = false } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new Error(
      `Can't reach the OnFile backend at ${API_BASE}. Make sure it's running (see README).`
    );
  }

  if (!res.ok) {
    if (allowMissing && res.status === 404) return null;
    let detail = '';
    try {
      const body = await res.json();
      detail = typeof body.detail === 'string' ? body.detail : '';
    } catch {
      // response wasn't JSON — fall through to generic message
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Jobs ─────────────────────────────────────────────────────────────────

export function fetchJobs() {
  return request('/jobs');
}

export function importJobLink({ sourceUrl, title, company, location, description, remote }) {
  return request('/jobs/import-link', {
    method: 'POST',
    body: JSON.stringify({
      source_url: sourceUrl,
      title: title || null,
      company: company || null,
      location: location || null,
      description: description || null,
      remote: !!remote,
    }),
  });
}

export function archiveJob(jobId) {
  return request(`/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
}

// ── Profile (search preferences) ────────────────────────────────────────

// Returns null if no profile has been saved yet — treat that as "empty".
export function getProfile() {
  return request('/profile', {}, { allowMissing: true });
}

export function updateProfile(payload) {
  return request('/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ── Discovery (scraping) ────────────────────────────────────────────────

export function runDiscovery(sources) {
  return request('/discovery/run', {
    method: 'POST',
    body: JSON.stringify(sources && sources.length ? { sources } : {}),
  });
}

export function getDiscoveryStatus() {
  return request('/discovery/status');
}

// ── Resume generation ───────────────────────────────────────────────────

export function generateResumesForJob(jobId) {
  return request('/resumes/generate-all', {
    method: 'POST',
    body: JSON.stringify({ job_id: jobId }),
  });
}

export function getResume(resumeId) {
  return request(`/resumes/${encodeURIComponent(resumeId)}`);
}
