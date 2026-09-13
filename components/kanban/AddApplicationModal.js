'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { STAGES } from '@/lib/constants';
import { useStore } from '@/lib/store';
import Button from '@/components/ui/Button';

export default function AddApplicationModal({ onClose }) {
  const { addApplication } = useStore();
  const [form, setForm] = useState({
    company: '',
    role: '',
    dateApplied: new Date().toISOString().slice(0, 10),
    stage: 'applied',
    location: '',
    notes: '',
  });

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.company.trim() || !form.role.trim()) return;
    addApplication(form);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/[.34] p-4 sm:p-6 animate-[lsFade_.28s_ease_both]"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl border border-line w-full max-w-[470px] p-5 sm:p-7 max-h-[88dvh] overflow-y-auto overscroll-contain animate-[lsPop_.4s_cubic-bezier(.2,.8,.2,1)_both]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-semibold text-[20px] sm:text-[23px] text-ink">Add application</h2>
          <button onClick={onClose} className="text-inkFaint hover:text-ink focus-ring rounded text-lg leading-none">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Company">
            <input required value={form.company} onChange={(e) => update('company', e.target.value)} className="input" />
          </Field>
          <Field label="Role">
            <input required value={form.role} onChange={(e) => update('role', e.target.value)} className="input" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Date applied">
              <input
                type="date"
                value={form.dateApplied}
                onChange={(e) => update('dateApplied', e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Stage">
              <select value={form.stage} onChange={(e) => update('stage', e.target.value)} className="input">
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Location">
            <input
              value={form.location}
              onChange={(e) => update('location', e.target.value)}
              className="input"
              placeholder="Remote, Edmonton AB, etc."
            />
          </Field>
          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} className="input min-h-[70px]" />
          </Field>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Add application</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-inkSoft mb-1">{label}</span>
      {children}
    </label>
  );
}
