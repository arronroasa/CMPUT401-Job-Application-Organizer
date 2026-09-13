// Converts the profile the FastAPI backend builds from an uploaded resume
// (backend/app/engines/profile/resume_ingestion.py, fetched via
// lib/careersaversApi.js's getActiveProfile) into the master resume's own
// fields: summary (string), experience (string), projects (string), skills
// (string[]).
//
// There is exactly one resume upload in the app — the "Resume for Auto
// Search & Apply" card (components/resumes/ImportedResumeCard.js) — and the
// backend already parses it into structured JSON (with an AI pass when a
// Gemini key is configured server-side). This just reshapes that JSON into
// the plain-text format the master resume editor and PrintableResume expect,
// matching the "- <entry>: <description>" convention already used by
// lib/seedData.js's masterResume.

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatDateRange(startDate, endDate, current) {
  const start = cleanText(startDate);
  const end = current ? 'present' : cleanText(endDate);
  if (start && end) return `${start}–${end}`;
  return start || end || '';
}

// Bullets from the backend are usually already full sentences ending in a
// period; joining them with ". " would otherwise double up on it.
function joinSentences(parts) {
  const cleaned = parts.map((part) => cleanText(part).replace(/[.\s]+$/, '')).filter(Boolean);
  return cleaned.length ? `${cleaned.join('. ')}.` : '';
}

export function formatExperience(experienceJson) {
  if (!Array.isArray(experienceJson)) return '';
  return experienceJson
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const who = [cleanText(item.role), cleanText(item.company)].filter(Boolean).join(', ');
      const dates = formatDateRange(item.startDate, item.endDate, item.current);
      const head = dates ? `${who} (${dates})` : who;

      const description = Array.isArray(item.bullets) && item.bullets.length
        ? joinSentences(item.bullets)
        : cleanText(item.description);

      if (!head && !description) return '';
      return `- ${head || 'Role'}${description ? `: ${description}` : ''}`;
    })
    .filter(Boolean)
    .join('\n');
}

export function formatProjects(projectsJson) {
  if (!Array.isArray(projectsJson)) return '';
  return projectsJson
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const name = cleanText(item.name) || 'Project';
      const description = cleanText(item.impactStatement) || cleanText(item.description);
      return `- ${name}${description ? `: ${description}` : ''}`;
    })
    .filter(Boolean)
    .join('\n');
}

export function formatSkills(skillsJson) {
  if (!Array.isArray(skillsJson)) return [];
  const seen = new Set();
  const output = [];
  for (const item of skillsJson) {
    const name = cleanText(typeof item === 'string' ? item : item?.name);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    output.push(name);
  }
  return output;
}

/**
 * Reshapes a backend profile into { summary, experience, projects, skills }.
 * Any field the profile has nothing for comes back empty ('' or []) — the
 * caller decides how to present that.
 */
export function profileToMasterResumeFields(profile) {
  return {
    summary: cleanText(profile?.summary),
    experience: formatExperience(profile?.experience_json),
    projects: formatProjects(profile?.projects_json),
    skills: formatSkills(profile?.skills_json),
  };
}
