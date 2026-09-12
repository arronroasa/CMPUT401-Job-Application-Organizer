import type { Education } from '@onfile/core';

function formatRange(item: Education): string {
  const start = (item.startDate ?? '').slice(0, 7);
  const end = item.current ? 'Present' : (item.endDate ?? '').slice(0, 7);
  if (start && end) return `${start} — ${end}`;
  return start || end || '';
}

export function EducationSection({ education }: { education: Education[] }) {
  if (education.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Education</h2>
      <div className="space-y-3">
        {education.map((entry) => {
          const meta = [entry.degree, entry.field].filter(Boolean).join(', ');
          const secondary = [entry.location, entry.gpa ? `GPA: ${entry.gpa}` : ''].filter(Boolean).join(' · ');
          return (
            <div key={entry.id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between gap-3 mb-1">
                <p className="text-sm font-semibold text-foreground">{entry.institution}</p>
                {formatRange(entry) && (
                  <span className="text-xs text-muted-foreground shrink-0">{formatRange(entry)}</span>
                )}
              </div>
              {meta && <p className="text-sm text-foreground/80">{meta}</p>}
              {secondary && <p className="text-xs text-muted-foreground mt-1">{secondary}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

