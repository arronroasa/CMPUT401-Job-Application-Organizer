'use client';

import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import Button from '@/components/ui/Button';
import PrintableResume from './PrintableResume';

export default function TailoredResumeEditor({ resume, onDeleted }) {
  const { updateTailoredResume, deleteTailoredResume } = useStore();
  const [form, setForm] = useState(resume);
  const [skillInput, setSkillInput] = useState('');
  const [saved, setSaved] = useState(false);
  const [keywordResult, setKeywordResult] = useState(null);

  useEffect(() => {
    setForm(resume);
    setKeywordResult(null);
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
    deleteTailoredResume(form.id);
    onDeleted();
  }

  return (
    <div className="grid lg:grid-cols-[1fr,320px] gap-6 items-start">
      <div className="bg-surface border border-line rounded-lg p-6">
        <input
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          className="font-serif text-lg text-ink bg-transparent border-none focus-ring rounded px-0 py-0 w-full mb-5"
        />

        <FormField label="Summary">
          <textarea value={form.summary} onChange={(e) => update('summary', e.target.value)} className="input min-h-[70px]" />
        </FormField>

        <FormField label="Experience">
          <textarea
            value={form.experience}
            onChange={(e) => update('experience', e.target.value)}
            className="input min-h-[110px]"
          />
        </FormField>

        <FormField label="Projects">
          <textarea value={form.projects} onChange={(e) => update('projects', e.target.value)} className="input min-h-[90px]" />
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
                  className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-sm ${
                    status === 'covered'
                      ? 'bg-stageOfferSoft text-stageOffer'
                      : status === 'missing'
                      ? 'bg-stageClosedSoft text-stageClosed'
                      : 'bg-pineSoft text-pineDark'
                  }`}
                >
                  {skill}
                  <button onClick={() => removeSkill(skill)} className="hover:opacity-60">
                    <X size={11} />
                  </button>
                </span>
              );
            })}
          </div>
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
          {saved && <span className="text-xs text-pineDark">Saved.</span>}
        </div>
      </div>

      <div className="bg-surface border border-line rounded-lg p-5">
        <h3 className="text-sm font-medium text-ink mb-1">Job posting keywords</h3>
        <p className="text-xs text-inkFaint mb-3">Paste the job description to see which of your skills show up in it.</p>
        <textarea
          value={form.jobDescription}
          onChange={(e) => update('jobDescription', e.target.value)}
          placeholder="Paste job description here"
          className="input min-h-[120px] mb-3"
        />
        <Button variant="secondary" onClick={checkKeywords} className="w-full justify-center mb-3">
          Check keywords
        </Button>
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

function FormField({ label, children }) {
  return (
    <div className="mb-5">
      <span className="block text-xs text-inkSoft mb-1.5">{label}</span>
      {children}
    </div>
  );
}
