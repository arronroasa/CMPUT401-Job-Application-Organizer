export default function PrintableResume({ resume }) {
  const title = (resume.name || 'Resume').replace(/^v\d+\s*—\s*/, '');

  return (
    <div className="p-10 max-w-2xl mx-auto font-sans text-ink text-sm">
      <h1 className="font-serif text-2xl mb-1">{title}</h1>
      <p className="text-inkSoft mb-6">{resume.summary}</p>

      <h2 className="font-serif text-base border-b border-line pb-1 mb-2">Experience</h2>
      <p className="whitespace-pre-line mb-6">{resume.experience}</p>

      <h2 className="font-serif text-base border-b border-line pb-1 mb-2">Projects</h2>
      <p className="whitespace-pre-line mb-6">{resume.projects}</p>

      <h2 className="font-serif text-base border-b border-line pb-1 mb-2">Skills</h2>
      <p>{resume.skills.join(' · ')}</p>
    </div>
  );
}
