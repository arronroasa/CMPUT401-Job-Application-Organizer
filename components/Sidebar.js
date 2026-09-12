'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, KanbanSquare, ListChecks, FileText, Code2 } from 'lucide-react';
import OnFileLogo from './OnFileLogo';

const NAV = [
  { href: '/dashboard', label: 'Today', icon: LayoutGrid },
  { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { href: '/applications', label: 'Applications', icon: ListChecks },
  { href: '/resumes', label: 'Resumes', icon: FileText },
  { href: '/prep', label: 'Interview Prep', icon: Code2 },
];

function isActive(pathname, href) {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-[248px] md:shrink-0 border-r border-line bg-surface px-[18px] py-[26px] gap-[26px]">
        <div className="px-2">
          <Link href="/" className="block" aria-label="OnFile home">
            <OnFileLogo animated />
          </Link>
          <p className="text-[12.5px] text-inkFaint mt-1.5">your job search, organized</p>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-md text-[14.5px] transition-colors focus-ring ${
                  active ? 'bg-mint font-semibold text-ink' : 'text-inkSoft hover:bg-panel hover:text-ink'
                }`}
              >
                <Icon size={17} strokeWidth={1.9} className="opacity-75" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-lg bg-panel border border-line px-3.5 pt-3.5 pb-4">
          <div className="text-[11px] tracking-[.18em] uppercase text-inkFaint">Local demo</div>
          <div className="text-[12.5px] text-inkSoft mt-1.5 leading-snug">
            Data lives in your browser. Nothing leaves this device.
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line flex justify-around py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] focus-ring ${
                active ? 'text-pine font-semibold' : 'text-inkFaint'
              }`}
            >
              <Icon size={19} strokeWidth={1.9} />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
