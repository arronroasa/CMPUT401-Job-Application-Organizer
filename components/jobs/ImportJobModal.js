'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Portal from '@/components/ui/Portal';

export default function ImportJobModal({ onClose, onImport }) {
  const [form, setForm] = useState({
    sourceUrl: '',
    title: '',
    company: '',
    location: '',
    remote: false,
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.sourceUrl.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await onImport(form);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not import that link.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Portal>
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/[.34] px-6 animate-[lsFade_.28s_ease_both]"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl border border-line w-full max-w-[470px] p-7 max-h-[90vh] overflow-y-auto animate-[lsPop_.4s_cubic-bezier(.2,.8,.2,1)_both]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-semibold text-[23px] text-ink">Import a job link</h2>
          <button onClick={onClose} className="text-inkFaint hover:text-ink focus-ring rounded text-lg leading-none">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Job posting URL">
            <input
              required
              type="url"
              autoFocus
              value={form.sourceUrl}
              onChange={(e) => update('sourceUrl', e.target.value)}
              placeholder="https://www.linkedin.com/jobs/view/..."
              className="input"
            />
          </Field>
          <p className="text-xs text-inkFaint -mt-2">
            Title and company are pulled from the page automatically — fill them in below only if you want to override that.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title (optional)">
              <input value={form.title} onChange={(e) => update('title', e.target.value)} className="input" />
            </Field>
            <Field label="Company (optional)">
              <input value={form.company} onChange={(e) => update('company', e.target.value)} className="input" />
            </Field>
          </div>
          <Field label="Location (optional)">
            <input
              value={form.location}
              onChange={(e) => update('location', e.target.value)}
              className="input"
              placeholder="Remote, Edmonton AB, etc."
            />
          </Field>
          <label className="flex items-center gap-2 text-[13.5px] text-inkSoft">
            <input
              type="checkbox"
              checked={form.remote}
              onChange={(e) => update('remote', e.target.checked)}
              className="accent-pine"
            />
            Remote position
          </label>
          <Field label="Description (optional — paste it if the link can't be fetched automatically)">
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              className="input min-h-[90px]"
            />
          </Field>
          {error && <p className="text-xs text-stageClosed">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Importing…' : 'Import job'}
            </Button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
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
