'use client';

// Flips the document card into a form in place — see CONTEXT.md. Nothing
// reaches the version (or the shared contact header) until Save is
// pressed; Cancel discards every change made here.

import { useState } from 'react';
import { Plus, Trash2, X, Sparkles, Check, Loader2 } from 'lucide-react';
import ResumeImport from './ResumeImport';
import { suggestTailoredEdits, hasApiKey as hasTailorKey } from '@/lib/aiTailor';
import Button from '@/components/ui/Button';

const CONTACT_FIELDS = [
  { field: 'name', placeholder: 'Name' },
  { field: 'phone', placeholder: 'Phone' },
  { field: 'email', placeholder: 'Email' },
  { field: 'linkedin', placeholder: 'LinkedIn' },
  { field: 'github', placeholder: 'GitHub' },
];

function cloneResumeFields(resume) {
  return {
    education: resume.education.map((e) => ({ ...e })),
    experience: resume.experience.map((e) => ({ ...e, bullets: [...e.bullets] })),
    projects: resume.projects.map((p) => ({ ...p, bullets: [...p.bullets] })),
    skills: {
      languages: [...resume.skills.languages],
      frameworks: [...resume.skills.frameworks],
      tools: [...resume.skills.tools],
    },
  };
}

export default function ResumeEditForm({ resume, contactHeader, onSave, onCancel }) {
  const [form, setForm] = useState(() => cloneResumeFields(resume));
  const [contact, setContact] = useState(contactHeader);
  const [suggestions, setSuggestions] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  function updateContact(field, value) {
    setContact((c) => ({ ...c, [field]: value }));
  }

  function addEducation() {
    setForm((f) => ({ ...f, education: [...f.education, { school: '', degree: '', location: '', dates: '' }] }));
  }
  function updateEducation(i, field, value) {
    setForm((f) => ({ ...f, education: f.education.map((e, j) => (j === i ? { ...e, [field]: value } : e)) }));
  }
  function removeEducation(i) {
    setForm((f) => ({ ...f, education: f.education.filter((_, j) => j !== i) }));
  }

  // Adding/removing entries shifts indices, and AI-tailoring suggestions are
  // keyed by index into experience/projects — so any suggestions pending
  // for this section are dropped rather than risk applying them to the
  // wrong entry.
  function addExperience() {
    setForm((f) => ({
      ...f,
      experience: [...f.experience, { title: '', company: '', location: '', dates: '', bullets: [] }],
    }));
    setSuggestions((s) => (s ? { ...s, experience: [] } : s));
  }
  function updateExperience(i, field, value) {
    setForm((f) => ({ ...f, experience: f.experience.map((e, j) => (j === i ? { ...e, [field]: value } : e)) }));
  }
  function removeExperience(i) {
    setForm((f) => ({ ...f, experience: f.experience.filter((_, j) => j !== i) }));
    setSuggestions((s) => (s ? { ...s, experience: [] } : s));
  }
  function addBullet(section, i) {
    setForm((f) => ({
      ...f,
      [section]: f[section].map((e, j) => (j === i ? { ...e, bullets: [...e.bullets, ''] } : e)),
    }));
  }
  function updateBullet(section, i, k, value) {
    setForm((f) => ({
      ...f,
      [section]: f[section].map((e, j) => (j === i ? { ...e, bullets: e.bullets.map((b, l) => (l === k ? value : b)) } : e)),
    }));
  }
  function removeBullet(section, i, k) {
    setForm((f) => ({
      ...f,
      [section]: f[section].map((e, j) => (j === i ? { ...e, bullets: e.bullets.filter((_, l) => l !== k) } : e)),
    }));
  }

  function addProject() {
    setForm((f) => ({ ...f, projects: [...f.projects, { name: '', tech: '', dates: '', bullets: [] }] }));
    setSuggestions((s) => (s ? { ...s, projects: [] } : s));
  }
  function updateProject(i, field, value) {
    setForm((f) => ({ ...f, projects: f.projects.map((p, j) => (j === i ? { ...p, [field]: value } : p)) }));
  }
  function removeProject(i) {
    setForm((f) => ({ ...f, projects: f.projects.filter((_, j) => j !== i) }));
    setSuggestions((s) => (s ? { ...s, projects: [] } : s));
  }

  function addSkill(group, value) {
    const name = value.trim();
    if (!name) return;
    setForm((f) =>
      f.skills[group].some((s) => s.toLowerCase() === name.toLowerCase())
        ? f
        : { ...f, skills: { ...f.skills, [group]: [...f.skills[group], name] } }
    );
  }
  function removeSkill(group, name) {
    setForm((f) => ({ ...f, skills: { ...f.skills, [group]: f.skills[group].filter((s) => s !== name) } }));
  }

  function acceptImportSection(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (field === 'experience' || field === 'projects') {
      setSuggestions((s) => (s ? { ...s, [field]: [] } : s));
    }
  }

  async function generateTailoring() {
    setAiLoading(true);
    setAiError('');
    setSuggestions(null);
    try {
      const result = await suggestTailoredEdits({
        resume: form,
        missingKeywords: resume.match.missingKeywords,
        jobDescription: resume.match.jobDescription,
      });
      setSuggestions(result);
    } catch (err) {
      setAiError(err.message || 'Something went wrong.');
    } finally {
      setAiLoading(false);
    }
  }

  function acceptTailoring(section, index) {
    const entry = suggestions[section].find((s) => s.index === index);
    if (!entry) return;
    setForm((f) => ({ ...f, [section]: f[section].map((e, j) => (j === index ? { ...e, bullets: entry.bullets } : e)) }));
    setSuggestions((s) => ({ ...s, [section]: s[section].filter((e) => e.index !== index) }));
  }
  function dismissTailoring(section, index) {
    setSuggestions((s) => ({ ...s, [section]: s[section].filter((e) => e.index !== index) }));
  }
  function addTailoredSkill(skill) {
    addSkill('tools', skill);
    setSuggestions((s) => ({ ...s, skillsToAdd: s.skillsToAdd.filter((k) => k !== skill) }));
  }

  return (
    <div className="grid lg:grid-cols-[1fr,320px] gap-6 items-start">
      <div className="bg-surface border border-line rounded-xl p-[26px]">
        <ResumeImport onAcceptSection={acceptImportSection} onAddSkill={(skill) => addSkill('tools', skill)} />

        <FormSection label="Contact header">
          <div className="grid sm:grid-cols-2 gap-3">
            {CONTACT_FIELDS.map(({ field, placeholder }) => (
              <input
                key={field}
                value={contact[field] || ''}
                onChange={(e) => updateContact(field, e.target.value)}
                placeholder={placeholder}
                className="input"
              />
            ))}
          </div>
        </FormSection>

        <FormSection label="Education">
          {form.education.map((entry, i) => (
            <div key={i} className="rounded-lg border border-line p-3 mb-2.5">
              <div className="grid sm:grid-cols-2 gap-2 mb-2">
                <input value={entry.school} onChange={(e) => updateEducation(i, 'school', e.target.value)} placeholder="School" className="input" />
                <input value={entry.degree} onChange={(e) => updateEducation(i, 'degree', e.target.value)} placeholder="Degree" className="input" />
                <input value={entry.location} onChange={(e) => updateEducation(i, 'location', e.target.value)} placeholder="Location" className="input" />
                <input value={entry.dates} onChange={(e) => updateEducation(i, 'dates', e.target.value)} placeholder="Dates" className="input" />
              </div>
              <button onClick={() => removeEducation(i)} className="text-[12px] text-inkFaint hover:text-stageClosed flex items-center gap-1">
                <Trash2 size={12} /> Remove
              </button>
            </div>
          ))}
          <AddButton onClick={addEducation} label="Add education" />
        </FormSection>

        <FormSection label="Experience">
          {form.experience.map((entry, i) => (
            <div key={i} className="rounded-lg border border-line p-3 mb-2.5">
              <div className="grid sm:grid-cols-2 gap-2 mb-2">
                <input value={entry.title} onChange={(e) => updateExperience(i, 'title', e.target.value)} placeholder="Title" className="input" />
                <input value={entry.company} onChange={(e) => updateExperience(i, 'company', e.target.value)} placeholder="Company" className="input" />
                <input value={entry.location} onChange={(e) => updateExperience(i, 'location', e.target.value)} placeholder="Location" className="input" />
                <input value={entry.dates} onChange={(e) => updateExperience(i, 'dates', e.target.value)} placeholder="Dates" className="input" />
              </div>
              <BulletList
                bullets={entry.bullets}
                onAdd={() => addBullet('experience', i)}
                onChange={(k, v) => updateBullet('experience', i, k, v)}
                onRemove={(k) => removeBullet('experience', i, k)}
              />
              {suggestions?.experience?.some((s) => s.index === i) && (
                <TailorSuggestion
                  bullets={suggestions.experience.find((s) => s.index === i).bullets}
                  onAccept={() => acceptTailoring('experience', i)}
                  onDismiss={() => dismissTailoring('experience', i)}
                />
              )}
              <button onClick={() => removeExperience(i)} className="text-[12px] text-inkFaint hover:text-stageClosed flex items-center gap-1 mt-2">
                <Trash2 size={12} /> Remove entry
              </button>
            </div>
          ))}
          <AddButton onClick={addExperience} label="Add experience" />
        </FormSection>

        <FormSection label="Projects">
          {form.projects.map((entry, i) => (
            <div key={i} className="rounded-lg border border-line p-3 mb-2.5">
              <div className="grid sm:grid-cols-3 gap-2 mb-2">
                <input value={entry.name} onChange={(e) => updateProject(i, 'name', e.target.value)} placeholder="Name" className="input" />
                <input value={entry.tech} onChange={(e) => updateProject(i, 'tech', e.target.value)} placeholder="Tech" className="input" />
                <input value={entry.dates} onChange={(e) => updateProject(i, 'dates', e.target.value)} placeholder="Dates" className="input" />
              </div>
              <BulletList
                bullets={entry.bullets}
                onAdd={() => addBullet('projects', i)}
                onChange={(k, v) => updateBullet('projects', i, k, v)}
                onRemove={(k) => removeBullet('projects', i, k)}
              />
              {suggestions?.projects?.some((s) => s.index === i) && (
                <TailorSuggestion
                  bullets={suggestions.projects.find((s) => s.index === i).bullets}
                  onAccept={() => acceptTailoring('projects', i)}
                  onDismiss={() => dismissTailoring('projects', i)}
                />
              )}
              <button onClick={() => removeProject(i)} className="text-[12px] text-inkFaint hover:text-stageClosed flex items-center gap-1 mt-2">
                <Trash2 size={12} /> Remove entry
              </button>
            </div>
          ))}
          <AddButton onClick={addProject} label="Add project" />
        </FormSection>

        <FormSection label="Technical skills">
          {['languages', 'frameworks', 'tools'].map((group) => (
            <SkillGroup key={group} label={group} skills={form.skills[group]} onAdd={(v) => addSkill(group, v)} onRemove={(s) => removeSkill(group, s)} />
          ))}
        </FormSection>

        {suggestions?.skillsToAdd?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {suggestions.skillsToAdd.map((skill) => (
              <button
                key={skill}
                onClick={() => addTailoredSkill(skill)}
                className="inline-flex items-center gap-1 text-[12.5px] px-2.5 py-1 rounded-full border border-dashed border-pine text-pine hover:bg-mint transition-colors"
              >
                + {skill}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <Button onClick={() => onSave(form, contact)}>Save changes</Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-xl p-5">
        <h3 className="font-display font-semibold text-base text-ink mb-1 flex items-center gap-1.5">
          <Sparkles size={15} /> AI tailoring
        </h3>
        {resume.match?.missingKeywords?.length > 0 ? (
          <>
            <p className="text-xs text-inkFaint mb-3">
              Rewrite bullets to cover the missing keywords from the last match check against{' '}
              {resume.match.company || 'that job'}.
            </p>
            <Button onClick={generateTailoring} disabled={aiLoading} className="w-full justify-center">
              {aiLoading ? <Loader2 size={14} className="animate-spin" /> : null} {aiLoading ? 'Generating…' : 'Suggest tailored edits'}
            </Button>
            {!hasTailorKey() && (
              <p className="text-[11px] text-inkFaint mt-2">No Gemini key set — showing demo suggestions.</p>
            )}
            {aiError && <p className="text-xs text-stageClosed mt-3">{aiError}</p>}
          </>
        ) : (
          <p className="text-xs text-inkFaint">Run a match check to unlock AI tailoring.</p>
        )}
      </div>
    </div>
  );
}

function FormSection({ label, children }) {
  return (
    <div className="mb-5">
      <span className="block text-[13px] text-inkSoft mb-2">{label}</span>
      {children}
    </div>
  );
}

function AddButton({ onClick, label }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-[12.5px] text-inkSoft hover:text-ink transition-colors">
      <Plus size={13} /> {label}
    </button>
  );
}

function BulletList({ bullets, onAdd, onChange, onRemove }) {
  return (
    <div className="space-y-1.5 mb-1">
      {bullets.map((b, k) => (
        <div key={k} className="flex items-center gap-1.5">
          <input value={b} onChange={(e) => onChange(k, e.target.value)} className="input flex-1" />
          <button onClick={() => onRemove(k)} className="text-inkFaint hover:text-stageClosed">
            <X size={13} />
          </button>
        </div>
      ))}
      <AddButton onClick={onAdd} label="Add bullet" />
    </div>
  );
}

function SkillGroup({ label, skills, onAdd, onRemove }) {
  const [input, setInput] = useState('');
  function submit(e) {
    e.preventDefault();
    onAdd(input);
    setInput('');
  }
  return (
    <div className="mb-3">
      <span className="block text-[12px] text-inkFaint mb-1.5 capitalize">{label}</span>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {skills.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1 rounded-full bg-panel text-ink">
            {s}
            <button onClick={() => onRemove(s)} className="text-inkFaint hover:text-ink">
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Add a ${label.slice(0, -1)}`} className="input" />
        <Button type="submit" variant="secondary">
          Add
        </Button>
      </form>
    </div>
  );
}

function TailorSuggestion({ bullets, onAccept, onDismiss }) {
  return (
    <div className="mt-2 rounded-md border border-pine/40 bg-mint/50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-pine mb-1.5">
        <Sparkles size={12} /> Suggested bullets
      </div>
      <ul className="list-disc list-outside ml-4 text-[13px] text-ink space-y-1 mb-2">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onAccept} className="py-1 px-2.5 text-xs">
          <Check size={12} /> Accept
        </Button>
        <Button variant="ghost" onClick={onDismiss} className="py-1 px-2.5 text-xs">
          Dismiss
        </Button>
      </div>
    </div>
  );
}
