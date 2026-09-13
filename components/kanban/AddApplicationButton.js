'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, ChevronDown, PenLine, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function AddApplicationButton({ onManual, onAutoSearch, label = 'Add' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <Button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="pr-3"
      >
        <Plus size={16} /> {label}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-[220px] rounded-lg border border-line bg-surface shadow-lg overflow-hidden animate-[lsPop_.18s_cubic-bezier(.22,.8,.2,1)_both]"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onManual?.();
            }}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[13.5px] text-ink hover:bg-paper transition-colors"
          >
            <PenLine size={15} className="text-inkSoft" />
            <span>Add manually</span>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onAutoSearch?.();
            }}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[13.5px] text-ink hover:bg-paper transition-colors border-t border-line/70"
          >
            <Sparkles size={15} className="text-inkSoft" />
            <span className="flex flex-col">
              Auto Search
              <span className="text-[11px] text-inkFaint">Find jobs from your resume</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
