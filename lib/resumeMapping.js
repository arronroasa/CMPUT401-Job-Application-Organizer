// The backend's resume compiler returns a structured `content_json` blob
// (profile fields, scored experience/project fragments, education, etc).
// The frontend's tailored-resume editor works on plain text sections
// (summary/experience/projects as strings + a skills array), matching the
// master resume shape in lib/seedData.js. This flattens one into the other
// so a backend-generated resume can be opened and edited in the existing
// Resumes UI without changing it.

// The compiler rewrites each experience bullet to emphasize the job's
// required skills and stores it as `rewritten_text` alongside the original
// `text` — prefer the rewritten (tailored) version when present.
function bulletText(entry) {
  return (entry && (entry.rewritten_text || entry.text || entry.bullet)) || '';
}

function bulletLine(entry) {
  const text = bulletText(entry);
  if (!text) return '';
  const label = [entry?.company, entry?.role].filter(Boolean).join(' — ');
  return label ? `- ${label}: ${text}` : `- ${text}`;
}

function projectLine(entry) {
  const name = (entry && (entry.name || entry.title)) || '';
  let detail = '';
  if (Array.isArray(entry?.bullets) && entry.bullets.length) {
    detail = entry.bullets.map((b) => (typeof b === 'string' ? b : b?.text || '')).filter(Boolean).join('; ');
  }
  if (!detail) detail = (entry && (entry.description || entry.text)) || '';
  if (!name && !detail) return '';
  return name ? `- ${name}: ${detail}` : `- ${detail}`;
}

// Groups consecutive bullets that share the same company/role under one
// heading line, so multi-bullet roles don't repeat "Company — Role" per line.
function experienceText(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const lines = [];
  let lastKey = null;
  for (const entry of entries) {
    const key = [entry?.company, entry?.role].filter(Boolean).join(' — ');
    const text = bulletText(entry);
    if (!text) continue;
    if (key && key !== lastKey) {
      lines.push(key + ':');
      lastKey = key;
    } else if (!key) {
      lastKey = null;
    }
    lines.push(`- ${text}`);
  }
  return lines.length ? lines.join('\n') : entries.map(bulletLine).filter(Boolean).join('\n');
}

export function flattenBackendResumeContent(content) {
  const safe = content && typeof content === 'object' ? content : {};
  const experienceEntries = safe.fragments?.experience;
  const projectEntries = safe.fragments?.projects;

  return {
    summary: typeof safe.summary === 'string' ? safe.summary : '',
    experience: experienceText(experienceEntries),
    projects: Array.isArray(projectEntries) ? projectEntries.map(projectLine).filter(Boolean).join('\n') : '',
    skills: Array.isArray(safe.skills) ? safe.skills.filter((s) => typeof s === 'string') : [],
  };
}
