'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X, Trash2, MessagesSquare } from 'lucide-react';
import { useStore } from '@/lib/store';
import { STAGES } from '@/lib/constants';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import CommunicationThread from '@/components/communications/CommunicationThread';

export default function ApplicationDetail({ app: appProp, onClose }) {
  const { data, moveStage, updateApplication, deleteApplication, addCommunication, setNextAction, completeNextAction } = useStore();
  const app = data.applications.find((a) => a.id === appProp.id) || appProp;

  const [showThread, setShowThread] = useState(false);
  const [actionLabel, setActionLabel] = useState(app.nextAction?.label || '');
  const [actionDate, setActionDate] = useState(app.nextAction?.date || '');
  const [notes, setNotes] = useState(app.notes || '');

  const resumeVersion = app.resumeVersionId ? data.resumes.find((r) => r.id === app.resumeVersionId) : null;

  function saveNextAction(e) {
    e.preventDefault();
    setNextAction(
      app.id,
      actionLabel ? { label: actionLabel, date: actionDate || new Date().toISOString().slice(0, 10), done: false } : null
    );
  }

  function saveNotes() {
    updateApplication(app.id, { notes });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/[.34] animate-[lsFade_.3s_ease_both]" onClick={onClose}>
      <div
        className="w-full max-w-[470px] h-[100dvh] bg-surface border-l border-line overflow-y-auto overscroll-contain px-5 py-6 sm:px-[30px] sm:py-[30px] animate-[lsSlide_.42s_cubic-bezier(.2,.8,.2,1)_both]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-[21px] sm:text-[25px] text-ink mb-1 break-words">{app.role}</h2>
            <p className="text-[13.5px] text-inkSoft">
              {app.company}
              {app.location ? ` · ${app.location}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-inkFaint hover:text-ink focus-ring rounded text-lg leading-none">
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
            <div className="flex flex-wrap gap-2">
              <input type="date" value={actionDate} onChange={(e) => setActionDate(e.target.value)} className="input flex-1 min-w-[140px]" />
              <Button type="submit" variant="secondary">
                Save
              </Button>
            </div>
          </form>
          {app.nextAction && (
            <div className="flex items-center justify-between mt-2 text-xs text-inkSoft">
              <span>{app.nextAction.done ? 'Done ✓' : `Due ${app.nextAction.date}`}</span>
              {!app.nextAction.done && (
                <button onClick={() => completeNextAction(app.id)} className="text-pine hover:underline">
                  Mark done
                </button>
              )}
            </div>
          )}
        </Section>

        <Section title="Timeline">
          <ul className="space-y-2">
            {app.timeline.map((t) => (
              <li key={t.id} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-pine mt-1.5 shrink-0" />
                <span className="text-ink min-w-0 break-words">{t.label}</span>
                <span className="text-inkFaint ml-auto shrink-0 text-xs">{t.date}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Resume used">
          <select
            value={app.resumeVersionId || ''}
            onChange={(e) => updateApplication(app.id, { resumeVersionId: e.target.value || null })}
            className="input w-full mb-2"
          >
            <option value="">No resume linked</option>
            {data.resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {resumeVersion && (
            <Link href={`/resumes?version=${resumeVersion.id}`} className="text-sm text-pine hover:underline">
              Open “{resumeVersion.name}” →
            </Link>
          )}
        </Section>

        <Section title="Communications">
          <Button variant="secondary" onClick={() => setShowThread(true)} className="w-full justify-center mb-3">
            <MessagesSquare size={14} /> Open conversation
            {app.communications.length > 0 ? ` (${app.communications.length})` : ''}
          </Button>
          <ul className="space-y-3">
            {app.communications.slice(0, 3).map((c) => (
              <li key={c.id} className="text-sm border-l-2 border-mint pl-3">
                <p className="text-ink">{c.note}</p>
                <p className="text-xs text-inkFaint mt-0.5">
                  {c.direction === 'in' ? 'Them' : 'You'} · {c.type} · {c.date}
                </p>
              </li>
            ))}
            {app.communications.length === 0 && <p className="text-sm text-inkFaint">No communications logged yet.</p>}
          </ul>
        </Section>

        <Section title="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Add notes about this application…"
            className="input min-h-[80px]"
          />
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

      {showThread && <CommunicationThread app={app} onClose={() => setShowThread(false)} />}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="py-4 border-t border-line first:border-t-0">
      <h3 className="text-[11px] tracking-[.18em] uppercase text-inkFaint mb-2.5">{title}</h3>
      {children}
    </div>
  );
}
