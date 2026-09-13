// Rewrites a resume version's experience and project bullets to cover the
// missing keywords its match check found, using the same job description
// the match check already has — see CONTEXT.md's "AI tailoring".
//
// Falls back to canned, keyword-aware suggestions when no API key is set,
// so the feature is always demoable (offline, no quota, no key).

const MODEL = 'gemini-2.0-flash';

function apiKey() {
  return process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
}

export function hasApiKey() {
  return apiKey().trim().length > 0;
}

const PROMPT = (resume, missingKeywords, jobDescription) => `You are helping a job seeker tailor their resume to a specific job.

Rewrite bullet points in the resume's experience and project entries below to work in the MISSING KEYWORDS, wherever they genuinely apply. Keep every fact truthful: do not invent employers, dates, degrees, or projects, and do not invent achievements that aren't implied by the original bullet. Only rephrase and re-order existing bullets. Only include an entry in your response if you actually changed its bullets.

Return ONLY JSON with these keys:
- "experience": an array of { "index": <0-based index into the EXPERIENCE list below>, "bullets": [<rewritten bullet strings>] }
- "projects": an array of { "index": <0-based index into the PROJECTS list below>, "bullets": [<rewritten bullet strings>] }
- "skillsToAdd": an array of short skill names from the missing keywords that are a genuine fit for this resume (array of strings, may be empty)

MISSING KEYWORDS
${missingKeywords.join(', ')}

EXPERIENCE
${(resume.experience || []).map((e, i) => `${i}. ${e.title} at ${e.company}: ${(e.bullets || []).join(' | ')}`).join('\n')}

PROJECTS
${(resume.projects || []).map((p, i) => `${i}. ${p.name}: ${(p.bullets || []).join(' | ')}`).join('\n')}

JOB DESCRIPTION
${jobDescription}`;

function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Could not read the AI response as JSON.');
  }
}

function cleanEntries(list, maxIndex) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && Number.isInteger(e.index) && e.index >= 0 && e.index < maxIndex && Array.isArray(e.bullets))
    .map((e) => ({ index: e.index, bullets: e.bullets.map((b) => String(b || '').trim()).filter(Boolean) }))
    .filter((e) => e.bullets.length > 0);
}

function cleanSkills(list, existing) {
  if (!Array.isArray(list)) return [];
  const flatExisting = [...(existing?.languages || []), ...(existing?.frameworks || []), ...(existing?.tools || [])];
  const have = new Set(flatExisting.map((s) => s.toLowerCase()));
  const seen = new Set();
  return list
    .filter((s) => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s && !have.has(s.toLowerCase()))
    .filter((s) => (seen.has(s.toLowerCase()) ? false : seen.add(s.toLowerCase())))
    .slice(0, 8);
}

// Returns { experience, projects, skillsToAdd, source }.
// source is 'gemini' for a live result or 'demo' for the canned fallback.
export async function suggestTailoredEdits({ resume, missingKeywords, jobDescription }) {
  const jd = (jobDescription || '').trim();
  const keywords = missingKeywords || [];
  if (!jd) throw new Error('Run a match check first.');

  if (!hasApiKey()) {
    return { ...cannedSuggestions(resume, keywords), source: 'demo' };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(resume, keywords, jd) }] }],
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
    experience: cleanEntries(parsed.experience, (resume.experience || []).length),
    projects: cleanEntries(parsed.projects, (resume.projects || []).length),
    skillsToAdd: cleanSkills(parsed.skillsToAdd, resume.skills),
    source: 'gemini',
  };
}

// --- Canned fallback (no API key) ---------------------------------------

function cannedSuggestions(resume, missingKeywords) {
  const skillsToAdd = cleanSkills(missingKeywords, resume.skills);
  // The canned mode does not rewrite prose it cannot understand; it leaves
  // bullets as-is so the user still gets useful skill picks.
  return { experience: [], projects: [], skillsToAdd };
}
