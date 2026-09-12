'use client';

import { useState, useEffect } from 'react';
import { X, Trash2, Sparkles, Check } from 'lucide-react';
import { useStore } from '@/lib/store';
import { suggestTailoredEdits, hasApiKey } from '@/lib/aiTailor';
import Button from '@/components/ui/Button';
import PrintableResume from './PrintableResume';

export default function TailoredResumeEditor({ resume, onDeleted }) {
  const { data, updateTailoredResume, deleteTailoredResume, updateApplication } = useStore();
  const [form, setForm] = useState(resume);
  const [skillInput, setSkillInput] = useState('');
  const [saved, setSaved] = useState(false);
  const [keywordResult, setKeywordResult] = useState(null);

  // AI tailoring state
  const [suggestions, setSuggestions] = useState(null); // { summary, experience, projects, skillsToAdd, source }
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    setForm(resume);
    setKeywordResult(null);
    setSuggestions(null);
    setAiError('');
  }, [resume]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
  }

  function addSkill(e) {
    e.preventDefault();
    if (!skillInput.trim()) return;
    update('skills', [...form.skills, skillInput.trim()]);
    setSkillInput('');
  }

  function removeSkill(skill) {
    update(
      'skills',
      form.skills.filter((s) => s !== skill)
    );
  }

  function handleSave() {
    updateTailoredResume(form.id, form);
    setSaved(true);
  }

  function checkKeywords() {
    const text = (form.jobDescription || '').toLowerCase();
    const covered = form.skills.filter((s) => text.includes(s.toLowerCase()));
    const missing = form.skills.filter((s) => !text.includes(s.toLowerCase()));
    setKeywordResult({ covered, missing });
  }

  function handlePrint() {
    handleSave();
    setTimeout(() => window.print(), 50);
  }

  function handleDelete() {
    // Clear the link from any application that pointed at this resume.
    data.applications
      .filter((a) => a.resumeVersionId === form.id)
      .forEach((a) => updateApplication(a.id, { resumeVersionId: null }));
    deleteTailoredResume(form.id);
    onDeleted();
  }

  // Point this resume at an application, keeping both sides of the link in sync.
  function linkApplication(appId) {
    const next = appId || null;
    update('applicationId', next);
    updateTailoredResume(form.id, { applicationId: next });

    // Drop any stale links so exactly one application points here.
    data.applications
      .filter((a) => a.resumeVersionId === form.id && a.id !== next)
      .forEach((a) => updateApplication(a.id, { resumeVersionId: null }));

    if (next) updateApplication(next, { resumeVersionId: form.id });
  }

  async function generateSuggestions() {
    setAiLoading(true);
    setAiError('');
    setSuggestions(null);
    try {
      const result = await suggestTailoredEdits({ resume: form, jobDescription: form.jobDescription });
      setSuggestions(result);
    } catch (err) {
      setAiError(err.message || 'Something went wrong.');
    } finally {
      setAiLoading(false);
    }
  }

  // Accept a section suggestion into the form, then drop it from the panel.
  function acceptSuggestion(field) {
    if (!suggestions?.[field]) return;
    update(field, suggestions[field]);
    setSuggestions((s) => ({ ...s, [field]: '' }));
  }

  function dismissSuggestion(field) {
    setSuggestions((s) => ({ ...s, [field]: '' }));
  }

  function addSuggestedSkill(skill) {
    if (!form.skills.includes(skill)) update('skills', [...form.skills, skill]);
    setSuggestions((s) => ({ ...s, skillsToAdd: s.skillsToAdd.filter((k) => k !== skill) }));
  }

  return (
    <div className="grid lg:grid-cols-[1fr,320px] gap-6 items-start">
      <div className="bg-surface border border-line rounded-xl p-[26px] animate-[lsPop_.4s_cubic-bezier(.2,.8,.2,1)_both]">
        <input
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          className="font-display font-semibold text-xl text-ink bg-transparent border-none focus-ring rounded px-0 py-0 w-full mb-4"
        />

        <FormField label="Linked application">
          <select
            value={form.applicationId || ''}
            onChange={(e) => linkApplication(e.target.value)}
            className="input w-auto max-w-full"
          >
            <option value="">Not linked to an application</option>
            {data.applications.map((a) => (
              <option key={a.id} value={a.id}>
                {a.company} — {a.role}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Summary">
          <textarea value={form.summary} onChange={(e) => update('summary', e.target.value)} className="input min-h-[70px]" />
          <SuggestionCard field="summary" text={suggestions?.summary} onAccept={acceptSuggestion} onDismiss={dismissSuggestion} />
        </FormField>

        <FormField label="Experience">
          <textarea
            value={form.experience}
            onChange={(e) => update('experience', e.target.value)}
            className="input min-h-[110px]"
          />
          <SuggestionCard field="experience" text={suggestions?.experience} onAccept={acceptSuggestion} onDismiss={dismissSuggestion} />
        </FormField>

        <FormField label="Projects">
          <textarea value={form.projects} onChange={(e) => update('projects', e.target.value)} className="input min-h-[90px]" />
          <SuggestionCard field="projects" text={suggestions?.projects} onAccept={acceptSuggestion} onDismiss={dismissSuggestion} />
        </FormField>

        <FormField label="Skills">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.skills.map((skill) => {
              const status = keywordResult
                ? keywordResult.covered.includes(skill)
                  ? 'covered'
                  : 'missing'
                : null;
              return (
                <span
                  key={skill}
                  className={`inline-flex items-center gap-2 text-[13px] px-3 py-1.5 rounded-full ${
                    status === 'covered'
                      ? 'bg-stageOfferSoft text-ink'
                      : status === 'missing'
                      ? 'bg-stageClosedSoft text-ink'
                      : 'bg-panel text-ink'
                  }`}
                >
                  {skill}
                  <button onClick={() => removeSkill(skill)} className="text-inkFaint hover:text-ink">
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>
          {suggestions?.skillsToAdd?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {suggestions.skillsToAdd.map((skill) => (
                <button
                  key={skill}
                  onClick={() => addSuggestedSkill(skill)}
                  className="inline-flex items-center gap-1 text-[13px] px-3 py-1.5 rounded-full border border-dashed border-pine text-pine hover:bg-mint transition-colors"
                  title="Suggested from the job description — click to add"
                >
                  + {skill}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={addSkill} className="flex gap-2">
            <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} placeholder="Add a skill" className="input" />
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>
        </FormField>

        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <Button onClick={handleSave}>Save changes</Button>
          <Button variant="secondary" onClick={handlePrint}>
            Export PDF
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            <Trash2 size={14} /> Delete
          </Button>
          {saved && <span className="text-[13px] text-pine">Saved ✓</span>}
        </div>
      </div>

      <div className="bg-surface border border-line rounded-xl p-5">
        <h3 className="font-display font-semibold text-base text-ink mb-1">Tailor to a job posting</h3>
        <p className="text-xs text-inkFaint mb-3">Paste the job description, then let AI suggest edits or check your keywords.</p>
        <textarea
          value={form.jobDescription}
          onChange={(e) => update('jobDescription', e.target.value)}
          placeholder="Paste job description here"
          className="input min-h-[120px] mb-3"
        />

        <Button onClick={generateSuggestions} disabled={aiLoading} className="w-full justify-center mb-2">
          <Sparkles size={14} /> {aiLoading ? 'Generating…' : 'Suggest tailored edits'}
        </Button>
        <Button variant="secondary" onClick={checkKeywords} className="w-full justify-center mb-3">
          Check keywords
        </Button>

        {aiError && <p className="text-xs text-stageClosed mb-3">{aiError}</p>}

        {suggestions && !aiError && (
          <p className="text-xs text-inkFaint mb-3">
            {suggestions.source === 'gemini'
              ? 'Suggestions from Gemini. Accept the ones you like below.'
              : 'Demo suggestions (no API key set). Add NEXT_PUBLIC_GEMINI_API_KEY for live results.'}
          </p>
        )}

        {keywordResult && (
          <div className="text-xs space-y-2">
            <p className="text-stageOffer">
              {keywordResult.covered.length} covered: {keywordResult.covered.join(', ') || '—'}
            </p>
            <p className="text-stageClosed">
              {keywordResult.missing.length} missing: {keywordResult.missing.join(', ') || '—'}
            </p>
          </div>
        )}
      </div>

      {/* Hidden on screen, shown only when printing (Export PDF) */}
      <div id="printable-resume" className="hidden print:block">
        <PrintableResume resume={form} />
      </div>
    </div>
  );
}

function SuggestionCard({ field, text, onAccept, onDismiss }) {
  if (!text) return null;
  return (
    <div className="mt-2 rounded-md border border-pine/40 bg-mint/50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-pine mb-1.5">
        <Sparkles size={12} /> Suggested edit
      </div>
      <p className="text-sm text-ink whitespace-pre-line mb-2">{text}</p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => onAccept(field)} className="py-1 px-2.5 text-xs">
          <Check size={12} /> Accept
        </Button>
        <Button variant="ghost" onClick={() => onDismiss(field)} className="py-1 px-2.5 text-xs">
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div className="mb-5">
      <span className="block text-[13px] text-inkSoft mb-2">{label}</span>
      {children}
    </div>
  );
}
