import type { Certification } from '@onfile/core';
import { Award } from 'lucide-react';

export function CertificationsSection({ certifications }: { certifications: Certification[] }) {
  if (certifications.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Certifications</h2>
      <div className="space-y-2">
        {certifications.map((cert) => (
          <div key={cert.id} className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3">
            <Award className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{cert.name}</p>
              <p className="text-xs text-muted-foreground">{cert.issuer} · {cert.dateObtained.slice(0, 7)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
