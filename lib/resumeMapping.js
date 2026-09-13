// The backend's resume compiler returns a structured `content_json` blob
// (scored experience/project fragments, skills, etc). This maps it into a
// resume version's structured fields (see CONTEXT.md's "Resume version")
// so a backend-generated resume opens directly in the version editor.
//
// The compiler rewrites each experience bullet to emphasize the job's
// required skills and stores it as `rewritten_text` alongside the original
// `text` — prefer the rewritten (tailored) version when present.
function bulletText(entry) {
  return (entry && (entry.rewritten_text || entry.text || entry.bullet)) || '';
}

function mapExperienceFragments(entries) {
  if (!Array.isArray(entries)) return [];
  const byRole = [];
  let current = null;
  for (const entry of entries) {
    const title = entry?.role || '';
    const company = entry?.company || '';
    const text = bulletText(entry);
    if (!text && !title && !company) continue;
    const key = `${title}|${company}`;
    if (!current || current.key !== key) {
      current = { key, title, company, location: '', dates: entry?.dates || '', bullets: [] };
      byRole.push(current);
    }
    if (text) current.bullets.push(text);
  }
  return byRole.map(({ key, ...rest }) => rest);
}

function mapProjectFragments(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      const name = entry?.name || entry?.title || '';
      const bullets = Array.isArray(entry?.bullets)
        ? entry.bullets.map((b) => (typeof b === 'string' ? b : b?.text || '')).filter(Boolean)
        : [entry?.description || entry?.text || ''].filter(Boolean);
      if (!name && bullets.length === 0) return null;
      return { name, tech: entry?.tech || '', dates: entry?.dates || '', bullets };
    })
    .filter(Boolean);
}

// content_json carries no education — the backend's resume compiler never
// populates it (see docs/adr/0001), so a generated version starts with an
// empty education section for the user to fill in by hand.
export function mapBackendResumeContent(content) {
  const safe = content && typeof content === 'object' ? content : {};
  return {
    education: [],
    experience: mapExperienceFragments(safe.fragments?.experience),
    projects: mapProjectFragments(safe.fragments?.projects),
    skills: { languages: [], frameworks: [], tools: Array.isArray(safe.skills) ? safe.skills.filter((s) => typeof s === 'string') : [] },
  };
}
