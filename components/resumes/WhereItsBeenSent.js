// Rail card: "Where it's been sent" — the applications naming this version
// as the resume they were sent with, read by scanning applications rather
// than kept as a reverse pointer. See CONTEXT.md.

export default function WhereItsBeenSent({ resume, applications }) {
  const sent = applications.filter((a) => a.resumeVersionId === resume.id);

  return (
    <div className="bg-surface border border-line rounded-xl p-5">
      <h3 className="font-display font-semibold text-base text-ink mb-1">Where it&rsquo;s been sent</h3>
      {sent.length === 0 ? (
        <p className="text-[12.5px] text-inkFaint">Not sent with any application yet.</p>
      ) : (
        <ul className="space-y-2 mt-2">
          {sent.map((a) => (
            <li key={a.id} className="text-[13px] text-ink">
              {a.company} <span className="text-inkFaint">· {a.role}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
