import type { Skill } from '@onfile/core';

export function SkillsSection({ skills }: { skills: Skill[] }) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Skills</h2>
      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <span
            key={skill.id}
            className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground"
          >
            {skill.name}
          </span>
        ))}
      </div>
    </section>
  );
}
