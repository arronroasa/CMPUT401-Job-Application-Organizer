export const APP_SECTIONS = [
  { href: '/dashboard', label: 'Today', nextHint: 'Pipeline' },
  { href: '/pipeline', label: 'Pipeline', nextHint: 'Jobs' },
  { href: '/jobs', label: 'Jobs', nextHint: 'Applications' },
  { href: '/applications', label: 'Applications', nextHint: 'Resumes' },
  { href: '/resumes', label: 'Resumes', nextHint: 'Interview Prep' },
  { href: '/prep', label: 'Interview Prep', nextHint: 'Mock Interview' },
  { href: '/prep/mock', label: 'Mock Interview', nextHint: 'Notifications' },
  { href: '/notifications', label: 'Notifications', nextHint: 'Today' },
];

export function sectionIndex(pathname) {
  // Prefer the longest href match so /prep/mock does not collapse into /prep.
  let best = -1;
  let bestLen = -1;
  APP_SECTIONS.forEach((s, i) => {
    if (pathname === s.href || pathname.startsWith(s.href + '/')) {
      if (s.href.length > bestLen) {
        best = i;
        bestLen = s.href.length;
      }
    }
  });
  return best;
}

export function neighborSection(pathname, delta) {
  const i = sectionIndex(pathname);
  if (i < 0) return null;
  const n = (i + delta + APP_SECTIONS.length) % APP_SECTIONS.length;
  return APP_SECTIONS[n];
}