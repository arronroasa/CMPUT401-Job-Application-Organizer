export const APP_SECTIONS = [
  { href: '/dashboard', label: 'Today', nextHint: 'Pipeline' },
  { href: '/pipeline', label: 'Pipeline', nextHint: 'Applications' },
  { href: '/applications', label: 'Applications', nextHint: 'Resumes' },
  { href: '/resumes', label: 'Resumes', nextHint: 'Interview Prep' },
  { href: '/prep', label: 'Interview Prep', nextHint: 'Today' },
];

export function sectionIndex(pathname) {
  const i = APP_SECTIONS.findIndex(
    (s) => pathname === s.href || pathname.startsWith(s.href + '/')
  );
  return i;
}

export function neighborSection(pathname, delta) {
  const i = sectionIndex(pathname);
  if (i < 0) return null;
  const n = (i + delta + APP_SECTIONS.length) % APP_SECTIONS.length;
  return APP_SECTIONS[n];
}
