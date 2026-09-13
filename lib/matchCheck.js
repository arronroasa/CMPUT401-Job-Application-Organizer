// Checks a resume version against a pasted job description using Gemini.
// See docs/adr/0003: the score and missing keywords come from the model,
// never from local keyword overlap, so there is only ever one way a match
// percentage got computed.

const MODEL = 'gemini-2.0-flash';

function apiKey() {
  return process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
}

export function hasApiKey() {
  return apiKey().trim().length > 0;
}

function resumeText(resume) {
  const education = (resume.education || [])
    .map((e) => `${e.degree || ''} ${e.school || ''}`.trim())
    .join('; ');
  const experience = (resume.experience || [])
    .map((e) => `${e.title || ''} at ${e.company || ''}: ${(e.bullets || []).join(' ')}`)
    .join('\n');
  const projects = (resume.projects || [])
    .map((p) => `${p.name || ''} (${p.tech || ''}): ${(p.bullets || []).join(' ')}`)
    .join('\n');
  const skills = [...(resume.skills?.languages || []), ...(resume.skills?.frameworks || []), ...(resume.skills?.tools || [])].join(', ');
  return `EDUCATION\n${education}\n\nEXPERIENCE\n${experience}\n\nPROJECTS\n${projects}\n\nSKILLS\n${skills}`;
}

const PROMPT = (resume, jobDescription) => `You are checking how well a resume matches a job description.

Read the RESUME and the JOB DESCRIPTION below. Return ONLY JSON with these keys:
- "score": an integer 0-100 for how well the resume matches the job
- "missingKeywords": an array of short terms or skills the job description asks for that the resume does not cover (array of strings, may be empty)
- "company": the company name read out of the job description (string, empty if not stated)
- "role": the job title read out of the job description (string, empty if not stated)

RESUME
${resumeText(resume)}

JOB DESCRIPTION
${jobDescription}`;

function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Could not read the match check response as JSON.');
  }
}

function validate(parsed) {
  const score = Number(parsed.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error('The match check response did not include a valid score.');
  }
  if (!Array.isArray(parsed.missingKeywords) || parsed.missingKeywords.some((k) => typeof k !== 'string')) {
    throw new Error('The match check response did not include a valid list of missing keywords.');
  }
  return {
    score: Math.round(score),
    missingKeywords: parsed.missingKeywords.map((k) => k.trim()).filter(Boolean),
    company: typeof parsed.company === 'string' ? parsed.company.trim() : '',
    role: typeof parsed.role === 'string' ? parsed.role.trim() : '',
  };
}

// Returns { score, missingKeywords, company, role, jobDescription, checkedAt }.
// Throws rather than returning a partial/malformed result, so the caller
// never writes a broken match result onto the version.
export async function runMatchCheck({ resume, jobDescription }) {
  const jd = (jobDescription || '').trim();
  if (!jd) throw new Error('Paste a job description first.');
  if (!hasApiKey()) throw new Error('Set NEXT_PUBLIC_GEMINI_API_KEY to run a match check.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(resume, jd) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini request failed (${res.status}). ${detail.slice(0, 200)}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response.');

  const result = validate(parseJson(text));
  return { ...result, jobDescription: jd, checkedAt: new Date().toISOString() };
}
