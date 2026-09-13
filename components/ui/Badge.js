import { stageMeta } from '@/lib/constants';

// Soft pill matching the OnFile template: stage-tinted background, dark text.
export default function Badge({ stageId, className = '' }) {
  const meta = stageMeta(stageId);
  return (
    <span className={`inline-flex items-center rounded-full px-[11px] py-[5px] text-xs font-medium text-ink ${meta.bg} ${className}`}>
      {meta.label}
    </span>
  );
}
