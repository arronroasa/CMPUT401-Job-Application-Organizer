'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, KanbanSquare, ListChecks, FileText } from 'lucide-react';

const NAV = [
  { href: '/', label: 'Today', icon: LayoutGrid },
  { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { href: '/applications', label: 'Applications', icon: ListChecks },
  { href: '/resumes', label: 'Resumes', icon: FileText },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-60 md:shrink-0 border-r border-line bg-surface px-5 py-6">
        <div className="mb-8">
          <span className="font-serif text-xl text-ink">TrackWise</span>
          <p className="text-xs text-inkFaint mt-1">your job search, organized</p>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors focus-ring ${
                  active ? 'bg-pineSoft text-pineDark font-medium' : 'text-inkSoft hover:bg-paper hover:text-ink'
                }`}
              >
                <Icon size={17} strokeWidth={1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line flex justify-around py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] focus-ring ${
                active ? 'text-pineDark' : 'text-inkFaint'
              }`}
            >
              <Icon size={19} strokeWidth={1.8} />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
