'use client';

import { useState } from 'react';
import { X, Mail, Send } from 'lucide-react';
import { useStore } from '@/lib/store';
import { COMM_TYPES } from '@/lib/constants';
import Button from '@/components/ui/Button';

export default function CommunicationThread({ app: appProp, onClose }) {
  const { data, addCommunication, updateApplication } = useStore();
  const app = data.applications.find((a) => a.id === appProp.id) || appProp;

  const [contactName, setContactName] = useState(app.contactName || '');
  const [contactEmail, setContactEmail] = useState(app.contactEmail || '');
  const [type, setType] = useState('Email');
  const [direction, setDirection] = useState('out');
  const [note, setNote] = useState('');

  const thread = [...(app.communications || [])].sort((a, b) => a.date.localeCompare(b.date));

  function saveContact() {
    if (contactName !== (app.contactName || '') || contactEmail !== (app.contactEmail || '')) {
      updateApplication(app.id, { contactName, contactEmail });
    }
  }

  function log(e) {
    e?.preventDefault();
    if (!note.trim()) return;
    addCommunication(app.id, { type, note: note.trim(), direction });
    setNote('');
  }

  function openInMail() {
    if (!note.trim()) return;
    const subject = `${app.role} — ${app.company}`;
    const url = `mailto:${encodeURIComponent(contactEmail)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(note.trim())}`;
    saveContact();
    addCommunication(app.id, { type: 'Email', note: note.trim(), direction: 'out' });
    setNote('');
    window.location.href = url;
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-ink/[.34] p-4 sm:p-6 animate-[lsFade_.28s_ease_both]"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="bg-surface rounded-2xl border border-line w-full max-w-[560px] flex flex-col max-h-[88dvh] animate-[lsPop_.4s_cubic-bezier(.2,.8,.2,1)_both]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-line">
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-[19px] text-ink truncate">{app.company}</h2>
            <p className="text-[13px] text-inkSoft truncate">{app.role}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-inkFaint hover:text-ink focus-ring rounded">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-5 sm:px-6 py-3 border-b border-line">
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            onBlur={saveContact}
            placeholder="Contact name"
            className="input"
          />
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            onBlur={saveContact}
            placeholder="recruiter@company.com"
            className="input"
          />
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 flex flex-col gap-3">
          {thread.length === 0 && (
            <p className="text-sm text-inkFaint text-center py-8">No messages yet. Log the first one below.</p>
          )}
          {thread.map((c) => {
            const outbound = c.direction !== 'in';
            return (
              <div key={c.id} className={`flex flex-col max-w-[82%] ${outbound ? 'self-end items-end' : 'self-start items-start'}`}>
                <div
                  className={`rounded-2xl px-4 py-2.5 text-[14px] leading-snug ${
                    outbound ? 'bg-ink text-paper rounded-br-md' : 'bg-panel text-ink rounded-bl-md'
                  }`}
                >
                  {c.note}
                </div>
                <span className="text-[11.5px] text-inkFaint mt-1 px-1">
                  {outbound ? 'You' : app.contactName || app.company} · {c.type} · {c.date}
                </span>
              </div>
            );
          })}
        </div>

        <form onSubmit={log} className="border-t border-line px-5 sm:px-6 py-4 flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            <select value={direction} onChange={(e) => setDirection(e.target.value)} className="input w-full sm:w-[132px]">
              <option value="out">You sent</option>
              <option value="in">They sent</option>
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)} className="input w-full sm:w-[112px]">
              {COMM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was said?"
            className="input min-h-[72px]"
          />
          <div className="flex flex-wrap gap-2 justify-end">
            <Button type="submit" variant="secondary" disabled={!note.trim()}>
              <Send size={14} /> Log
            </Button>
            <Button type="button" onClick={openInMail} disabled={!note.trim() || !contactEmail.trim()}>
              <Mail size={14} /> Open in mail
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
