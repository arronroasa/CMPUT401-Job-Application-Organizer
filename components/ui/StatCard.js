export default function StatCard({ label, value }) {
  return (
    <div className="bg-surface border border-line rounded-xl px-[22px] pt-5 pb-[22px] transition-all duration-300 hover:-translate-y-1 hover:border-ink/25 hover:shadow-card">
      <div className="font-display font-semibold text-[34px] leading-none text-ink">{value}</div>
      <div className="text-[13px] text-inkSoft mt-2">{label}</div>
    </div>
  );
}
