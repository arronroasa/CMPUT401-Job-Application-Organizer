export default function StatCard({ label, value }) {
  return (
    <div className="bg-surface border border-line rounded-lg px-5 py-4">
      <div className="font-serif text-3xl text-ink">{value}</div>
      <div className="text-xs text-inkSoft mt-1">{label}</div>
    </div>
  );
}
