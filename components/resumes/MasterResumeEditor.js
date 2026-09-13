'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useStore } from '@/lib/store';
import Button from '@/components/ui/Button';

export default function MasterResumeEditor() {
  const { data, saveMasterResume } = useStore();
  const master = data.masterResume;
  const [form, setForm] = useState(master);
  const [skillInput, setSkillInput] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(master);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [master]);

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
    saveMasterResume(form);
    setSaved(true);
  }

  return (
    <div className="max-w-2xl bg-surface border border-line rounded-xl p-[26px] animate-[lsPop_.4s_cubic-bezier(.2,.8,.2,1)_both]">
      <p className="text-[13px] text-inkFaint mb-5">
        This is your source of truth. Tailored copies start from whatever is saved here.
      </p>

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
          {form.skills.map((skill) => (
            <span key={skill} className="inline-flex items-center gap-2 bg-panel text-ink text-[13px] px-3 py-1.5 rounded-full hover:bg-mint transition-colors">
              {skill}
              <button onClick={() => removeSkill(skill)} className="text-inkFaint hover:text-ink">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <form onSubmit={addSkill} className="flex gap-2">
          <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} placeholder="Add a skill" className="input" />
          <Button type="submit" variant="secondary">
            Add
          </Button>
        </form>
      </FormField>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave}>Save changes</Button>
        {saved && <span className="text-[13px] text-pine">Saved ✓</span>}
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
