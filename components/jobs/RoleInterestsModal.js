'use client';

import { useEffect, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Portal from '@/components/ui/Portal';
import { getProfile, updateProfile } from '@/lib/api';

function emptyRole() {
  return { title: '', remote: true, locations: '' };
}

export default function RoleInterestsModal({ onClose, onSaved }) {
  const [location, setLocation] = useState('');
  const [roles, setRoles] = useState([emptyRole()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((profile) => {
        if (cancelled) return;
        if (profile) {
          setLocation(profile.location || '');
          const existing = Array.isArray(profile.role_interests_json) ? profile.role_interests_json : [];
          setRoles(
            existing.length
              ? existing.map((r) => ({
                  title: r.title || '',
                  remote: r.remote !== false,
                  locations: Array.isArray(r.locations) ? r.locations.join(', ') : '',
                }))
              : [emptyRole()]
          );
        }
      })
      .catch((err) => setError(err.message || 'Could not load your current preferences.'))
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  function updateRole(index, field, value) {
    setRoles((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRole() {
    setRoles((prev) => [...prev, emptyRole()]);
  }

  function removeRole(index) {
    setRoles((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const cleanedRoles = roles
      .map((r) => ({
        title: r.title.trim(),
        remote: !!r.remote,
        locations: r.locations
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }))
      .filter((r) => r.title);

    if (cleanedRoles.length === 0) {
      setError('Add at least one role to search for.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await updateProfile({
        location: location.trim() || null,
        role_interests_json: cleanedRoles,
      });
      onSaved();
    } catch (err) {
      setError(err.message || 'Could not save your preferences.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Portal>
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/[.34] px-6 animate-[lsFade_.28s_ease_both]"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl border border-line w-full max-w-[540px] p-7 max-h-[90vh] overflow-y-auto animate-[lsPop_.4s_cubic-bezier(.2,.8,.2,1)_both]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="font-display font-semibold text-[23px] text-ink">Search preferences</h2>
          <button onClick={onClose} className="text-inkFaint hover:text-ink focus-ring rounded text-lg leading-none">
            <X size={18} />
          </button>
        </div>
        <p className="text-[13px] text-inkSoft mb-5">
          Tell the scanner what roles to look for — it searches job boards using these titles and locations.
        </p>

        {loading ? (
          <p className="text-inkFaint text-sm py-6 text-center">Loading your preferences…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Default location (used when a role doesn't specify its own)">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Remote, Edmonton AB, etc."
                className="input"
              />
            </Field>

            <div className="space-y-3">
              <span className="block text-xs text-inkSoft">Roles to search for</span>
              {roles.map((role, i) => (
                <div key={i} className="border border-line rounded-lg p-3.5 space-y-3 relative">
                  {roles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRole(i)}
                      className="absolute top-2.5 right-2.5 text-inkFaint hover:text-stageClosed focus-ring rounded"
                      aria-label="Remove role"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <Field label="Job title">
                    <input
                      required
                      value={role.title}
                      onChange={(e) => updateRole(i, 'title', e.target.value)}
                      placeholder="Software Engineer"
                      className="input pr-8"
                    />
                  </Field>
                  <Field label="Locations (comma-separated, optional)">
                    <input
                      value={role.locations}
                      onChange={(e) => updateRole(i, 'locations', e.target.value)}
                      placeholder="Remote, Edmonton AB"
                      className="input"
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-[13.5px] text-inkSoft">
                    <input
                      type="checkbox"
                      checked={role.remote}
                      onChange={(e) => updateRole(i, 'remote', e.target.checked)}
                      className="accent-pine"
                    />
                    Open to remote for this role
                  </label>
                </div>
              ))}
              <button
                type="button"
                onClick={addRole}
                className="flex items-center gap-1.5 text-[13px] text-inkSoft hover:text-ink focus-ring rounded"
              >
                <Plus size={14} /> Add another role
              </button>
            </div>

            {error && <p className="text-xs text-stageClosed">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save & scan'}
              </Button>
            </div>
          </form>
        )}
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
