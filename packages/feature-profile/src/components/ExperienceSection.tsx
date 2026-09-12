import type { Experience } from '@onfile/core';

export function ExperienceSection({ experiences }: { experiences: Experience[] }) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Experience</h2>
      <div className="space-y-4">
        {experiences.map((exp) => (
          <div key={exp.id} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{exp.role}</p>
                <p className="text-xs text-muted-foreground">{exp.company}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {exp.startDate.slice(0, 7)} — {exp.current ? 'Present' : exp.endDate?.slice(0, 7)}
              </span>
            </div>
            <ul className="space-y-1 mt-3">
              {exp.bullets.map((b, i) => (
                <li key={i} className="text-sm text-foreground/80 leading-relaxed">• {b}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1 mt-3">
              {exp.skills.map((s) => (
                <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
