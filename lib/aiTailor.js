// Tailors a resume to a job description using Gemini.
//
// Falls back to canned, job-description-aware suggestions when no API key is
// set, so the feature is always demoable (offline, no quota, no key).

const MODEL = 'gemini-2.0-flash';

function apiKey() {
  return process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
}

export function hasApiKey() {
  return apiKey().trim().length > 0;
}

const PROMPT = (resume, jobDescription) => `You are helping a job seeker tailor their resume to a specific job.

Rewrite the resume sections below to emphasize what is most relevant to the JOB DESCRIPTION. Keep every fact truthful: do not invent employers, dates, degrees, or projects. Only rephrase and re-order to highlight relevance. Keep the same bullet format ("- ...") for experience and projects.

Return ONLY JSON with these keys:
- "summary": a rewritten 1-2 sentence summary (string)
- "experience": the rewritten experience section (string, keep bullets)
- "projects": the rewritten projects section (string, keep bullets)
- "skillsToAdd": an array of short skill names that appear in the job description and are a genuine fit but are missing from the current skills (array of strings, may be empty)

CURRENT RESUME
Summary: ${resume.summary || ''}
Experience: ${resume.experience || ''}
Projects: ${resume.projects || ''}
Skills: ${(resume.skills || []).join(', ')}

JOB DESCRIPTION
${jobDescription}`;

// Returns { summary, experience, projects, skillsToAdd, source }
// source is 'gemini' for a live result or 'demo' for the canned fallback.
export async function suggestTailoredEdits({ resume, jobDescription }) {
  const jd = (jobDescription || '').trim();
  if (!jd) throw new Error('Paste a job description first.');

  if (!hasApiKey()) {
    return { ...cannedSuggestions(resume, jd), source: 'demo' };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(resume, jd) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini request failed (${res.status}). ${detail.slice(0, 200)}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response.');

  const parsed = parseJson(text);
  return {
    summary: str(parsed.summary),
    experience: str(parsed.experience),
    projects: str(parsed.projects),
    skillsToAdd: cleanSkills(parsed.skillsToAdd, resume.skills),
    source: 'gemini',
  };
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function parseJson(text) {
  // Model usually returns clean JSON, but strip code fences just in case.
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Could not read the AI response as JSON.');
  }
}

function cleanSkills(list, existing) {
  if (!Array.isArray(list)) return [];
  const have = new Set((existing || []).map((s) => s.toLowerCase()));
  const seen = new Set();
  return list
    .filter((s) => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s && !have.has(s.toLowerCase()))
    .filter((s) => (seen.has(s.toLowerCase()) ? false : seen.add(s.toLowerCase())))
    .slice(0, 8);
}

// --- Canned fallback (no API key) ---------------------------------------

// A small catalog so the demo can surface plausible, job-aware skill picks.
const SKILL_CATALOG = [
  'React', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js', 'Python', 'Django',
  'Vue', 'Svelte', 'Tailwind CSS', 'CSS', 'HTML', 'REST APIs', 'GraphQL', 'SQL',
  'PostgreSQL', 'MongoDB', 'AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Git',
  'Data Visualization', 'Accessibility', 'Testing', 'Agile', 'Figma', 'Java',
  'C++', 'Go', 'Rust', 'Machine Learning',
];

function cannedSuggestions(resume, jd) {
  const lower = jd.toLowerCase();
  const skillsToAdd = cleanSkills(
    SKILL_CATALOG.filter((s) => lower.includes(s.toLowerCase())),
    resume.skills
  );

  const role = detectRole(jd);
  const emphasis = skillsToAdd.slice(0, 3).join(', ');
  const summary = role
    ? `${strip(resume.summary)} Well suited to a ${role} role${emphasis ? `, with strengths in ${emphasis}` : ''}.`
    : resume.summary || '';

  return {
    summary: summary.trim(),
    // The canned mode does not rewrite prose it cannot understand; it leaves
    // experience/projects as-is so the user still gets useful skill picks.
    experience: '',
    projects: '',
    skillsToAdd,
  };
}

function strip(s) {
  return (s || '').replace(/\s+$/, '').replace(/\.$/, '') + (s ? '.' : '');
}

function detectRole(jd) {
  const m = jd.match(/\b(frontend|front-end|backend|back-end|full[- ]?stack|software|web|product|data)\b[^.\n]{0,20}?\b(engineer|developer|designer|analyst|scientist)\b/i);
  return m ? m[0].toLowerCase() : '';
}
