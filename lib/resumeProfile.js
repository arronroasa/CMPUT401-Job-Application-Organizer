// Converts the profile the FastAPI backend builds from an uploaded resume
// (backend/app/engines/profile/resume_ingestion.py, fetched via
// lib/careersaversApi.js's getActiveProfile) into a resume version's own
// structured fields: education, experience, projects, and skills.
//
// There is exactly one resume upload in the app — the "Resume for Auto
// Search & Apply" card (components/resumes/ImportedResumeCard.js) — and the
// backend already parses it into structured JSON (with an AI pass when a
// Gemini key is configured server-side). This reshapes that JSON into the
// resume version's field shape (see CONTEXT.md's "Resume version").

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatDateRange(startDate, endDate, current) {
  const start = cleanText(startDate);
  const end = current ? 'Present' : cleanText(endDate);
  if (start && end) return `${start} — ${end}`;
  return start || end || '';
}

export function mapEducation(educationJson) {
  if (!Array.isArray(educationJson)) return [];
  return educationJson
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const school = cleanText(item.institution || item.school);
      const degreeName = cleanText(item.degree);
      const field = cleanText(item.field);
      const degree = degreeName && field ? `${degreeName} in ${field}` : degreeName || field;
      if (!school && !degree) return null;
      return {
        school,
        degree,
        location: cleanText(item.location),
        dates: formatDateRange(item.startDate, item.endDate, item.current),
      };
    })
    .filter(Boolean);
}

export function mapExperience(experienceJson) {
  if (!Array.isArray(experienceJson)) return [];
  return experienceJson
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const title = cleanText(item.role);
      const company = cleanText(item.company);
      const bullets = Array.isArray(item.bullets) && item.bullets.length
        ? item.bullets.map(cleanText).filter(Boolean)
        : [cleanText(item.description)].filter(Boolean);
      if (!title && !company && bullets.length === 0) return null;
      return {
        title,
        company,
        location: '',
        dates: formatDateRange(item.startDate, item.endDate, item.current),
        bullets,
      };
    })
    .filter(Boolean);
}

export function mapProjects(projectsJson) {
  if (!Array.isArray(projectsJson)) return [];
  return projectsJson
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = cleanText(item.name);
      const tech = Array.isArray(item.tech_stack) ? item.tech_stack.filter(Boolean).join(', ') : '';
      const description = cleanText(item.impact_statement) || cleanText(item.description);
      const bullets = description ? [description] : [];
      if (!name && bullets.length === 0) return null;
      return {
        name,
        tech,
        dates: formatDateRange(item.startDate, item.endDate, false),
        bullets,
      };
    })
    .filter(Boolean);
}

// skills_json entries are structured objects ({id, name, level, tags, ...}),
// not plain strings. There is no languages/frameworks/tools split in the
// backend profile, so everything lands in "tools" — the review panel lets
// the user move things around after accepting.
export function mapSkills(skillsJson) {
  if (!Array.isArray(skillsJson)) return { languages: [], frameworks: [], tools: [] };
  const seen = new Set();
  const tools = [];
  for (const item of skillsJson) {
    const name = cleanText(typeof item === 'string' ? item : item?.name);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    tools.push(name);
  }
  return { languages: [], frameworks: [], tools };
}

/**
 * Reshapes a backend profile into { education, experience, projects, skills }
 * matching a resume version's structured fields. Any section the profile has
 * nothing for comes back empty — the caller decides how to present that.
 */
export function profileToResumeVersionFields(profile) {
  return {
    education: mapEducation(profile?.education_json),
    experience: mapExperience(profile?.experience_json),
    projects: mapProjects(profile?.projects_json),
    skills: mapSkills(profile?.skills_json),
  };
}
