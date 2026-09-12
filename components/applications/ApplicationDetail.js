'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X, Trash2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { STAGES, COMM_TYPES } from '@/lib/constants';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';

export default function ApplicationDetail({ app: appProp, onClose }) {
  const { data, moveStage, deleteApplication, addCommunication, setNextAction, completeNextAction } = useStore();
  const app = data.applications.find((a) => a.id === appProp.id) || appProp;

  const [commType, setCommType] = useState('Email');
  const [commNote, setCommNote] = useState('');
  const [actionLabel, setActionLabel] = useState(app.nextAction?.label || '');
  const [actionDate, setActionDate] = useState(app.nextAction?.date || '');

  const tailored = app.resumeVersionId ? data.tailoredResumes.find((r) => r.id === app.resumeVersionId) : null;

  function logComm(e) {
    e.preventDefault();
    if (!commNote.trim()) return;
    addCommunication(app.id, { type: commType, note: commNote });
    setCommNote('');
  }

  function saveNextAction(e) {
    e.preventDefault();
    setNextAction(
      app.id,
      actionLabel ? { label: actionLabel, date: actionDate || new Date().toISOString().slice(0, 10), done: false } : null
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-surface border-l border-line overflow-y-auto px-6 py-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="font-serif text-xl text-ink">{app.role}</h2>
            <p className="text-sm text-inkSoft">
              {app.company}
              {app.location ? ` · ${app.location}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-inkFaint hover:text-ink focus-ring rounded">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 my-4 flex-wrap">
          <Badge stageId={app.stage} />
          <select value={app.stage} onChange={(e) => moveStage(app.id, e.target.value)} className="input w-auto text-xs py-1.5">
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                Move to {s.label}
              </option>
            ))}
          </select>
        </div>

        <Section title="Next action">
          <form onSubmit={saveNextAction} className="flex flex-col gap-2">
            <input
              value={actionLabel}
              onChange={(e) => setActionLabel(e.target.value)}
              placeholder="e.g. Follow up with recruiter"
              className="input"
            />
            <div className="flex gap-2">
              <input type="date" value={actionDate} onChange={(e) => setActionDate(e.target.value)} className="input" />
              <Button type="submit" variant="secondary">
                Save
              </Button>
            </div>
          </form>
          {app.nextAction && (
            <div className="flex items-center justify-between mt-2 text-xs text-inkSoft">
              <span>{app.nextAction.done ? 'Done ✓' : `Due ${app.nextAction.date}`}</span>
              {!app.nextAction.done && (
                <button onClick={() => completeNextAction(app.id)} className="text-pineDark hover:underline">
                  Mark done
                </button>
              )}
            </div>
          )}
        </Section>

        <Section title="Timeline">
          <ul className="space-y-2">
            {app.timeline.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-pine mt-1.5 shrink-0" />
                <span className="text-ink">{t.label}</span>
                <span className="text-inkFaint ml-auto shrink-0 text-xs">{t.date}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Resume used">
          {tailored ? (
            <Link href={`/resumes?tailored=${tailored.id}`} className="text-sm text-pineDark hover:underline">
              Open “{tailored.name}” →
            </Link>
          ) : (
            <p className="text-sm text-inkFaint">No tailored resume linked yet.</p>
          )}
        </Section>

        <Section title="Communications">
          <form onSubmit={logComm} className="flex flex-col gap-2 mb-3">
            <div className="flex gap-2">
              <select value={commType} onChange={(e) => setCommType(e.target.value)} className="input w-32">
                {COMM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                value={commNote}
                onChange={(e) => setCommNote(e.target.value)}
                placeholder="What happened?"
                className="input"
              />
            </div>
            <Button type="submit" variant="secondary" className="self-start">
              Log entry
            </Button>
          </form>
          <ul className="space-y-3">
            {app.communications.map((c) => (
              <li key={c.id} className="text-sm border-l-2 border-line pl-3">
                <p className="text-ink">{c.note}</p>
                <p className="text-xs text-inkFaint mt-0.5">
                  {c.type} · {c.date}
                </p>
              </li>
            ))}
            {app.communications.length === 0 && <p className="text-sm text-inkFaint">No communications logged yet.</p>}
          </ul>
        </Section>

        <div className="pt-4 border-t border-line mt-6">
          <Button
            variant="danger"
            onClick={() => {
              deleteApplication(app.id);
              onClose();
            }}
          >
            <Trash2 size={14} /> Delete application
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="py-4 border-t border-line first:border-t-0">
      <h3 className="text-xs font-medium text-inkSoft mb-2">{title}</h3>
      {children}
    </div>
  );
}
