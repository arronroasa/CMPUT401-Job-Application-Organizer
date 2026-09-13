'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, KanbanSquare, Briefcase, ListChecks, FileText, Code2, Video, Bell } from 'lucide-react';
import { useStore } from '@/lib/store';
import { notifications, unreadNotifications } from '@/lib/derived';
import OnFileLogo from './OnFileLogo';
import ThemeToggle from './ThemeToggle';

// `mobileLabel` keeps the bottom bar from wrapping once the list hits six.
const NAV = [
  { href: '/dashboard', label: 'Today', icon: LayoutGrid },
  { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/applications', label: 'Applications', icon: ListChecks },
  { href: '/resumes', label: 'Resumes', icon: FileText },
  { href: '/prep', label: 'Interview Prep', mobileLabel: 'Prep', icon: Code2 },
  { href: '/prep/mock', label: 'Mock Interview', mobileLabel: 'Mock', icon: Video },
  { href: '/notifications', label: 'Notifications', mobileLabel: 'Alerts', icon: Bell },
];

function isActive(pathname, href) {
  if (href === '/dashboard') return pathname === '/dashboard';
  // Exact match for /prep so /prep/mock does not highlight Interview Prep.
  if (href === '/prep') return pathname === '/prep';
  return pathname === href || pathname.startsWith(href + '/');
}

function UnreadPill({ count, className = '' }) {
  if (!count) return null;
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[19px] h-[19px] px-1.5 rounded-full bg-accent text-paper text-[10.5px] font-semibold leading-none ${className}`}
      aria-label={`${count} unread`}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { data } = useStore();
  const unread = unreadNotifications(notifications(data.applications), data.readNotifications).length;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-[248px] md:shrink-0 border-r border-line bg-surface px-[18px] py-[26px] gap-[26px] transition-colors duration-300">
        <div className="px-2 flex items-start justify-between gap-2">
          <div>
            <Link href="/" className="block" aria-label="OnFile home">
              <OnFileLogo animated />
            </Link>
            <p className="text-[12.5px] text-inkFaint mt-1.5">your job search, organized</p>
          </div>
          <ThemeToggle />
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-md text-[14.5px] transition-colors focus-ring ${
                  active
                    ? 'bg-mint font-semibold text-ink dark:bg-panel nav-active-glow'
                    : 'text-inkSoft hover:bg-panel hover:text-ink'
                }`}
              >
                <Icon size={17} strokeWidth={1.9} className="opacity-75" />
                {label}
                {href === '/notifications' && <UnreadPill count={unread} className="ml-auto" />}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line flex justify-around items-center py-2">
        {NAV.map(({ href, label, mobileLabel, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-1.5 py-1 text-[11px] focus-ring ${
                active ? 'text-pine font-semibold' : 'text-inkFaint'
              }`}
            >
              <span className="relative">
                <Icon size={19} strokeWidth={1.9} />
                {href === '/notifications' && (
                  <UnreadPill count={unread} className="absolute -top-1.5 -right-2.5" />
                )}
              </span>
              {mobileLabel || label}
            </Link>
          );
        })}
        <div className="px-1">
          <ThemeToggle />
        </div>
      </nav>
    </>
  );
}