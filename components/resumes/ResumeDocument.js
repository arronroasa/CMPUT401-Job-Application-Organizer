// Renders a resume version as a white page in the Jake format. This is the
// screen layout; components/resumes/ResumeDocumentPdf.js is the separate
// @react-pdf/renderer layout used for the downloaded file — see
// docs/adr/0002 for why the two are kept apart rather than sharing one
// rendering path.
//
// This stays a plain white page in both themes, because it is a printed
// artifact (see CONTEXT.md's "Resume version").

function ContactLine({ contactHeader }) {
  const parts = [contactHeader.phone, contactHeader.email, contactHeader.linkedin, contactHeader.github].filter(Boolean);
  return <p className="text-center text-[12.5px] text-neutral-600">{parts.join(' · ')}</p>;
}

function SectionHeading({ children }) {
  return (
    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-neutral-900 border-b border-neutral-300 pb-1 mb-2 mt-5">
      {children}
    </h2>
  );
}

export default function ResumeDocument({ resume, contactHeader }) {
  return (
    <div className="bg-white text-neutral-900 rounded-lg shadow-sm border border-neutral-200 p-10 font-sans">
      <h1 className="text-center text-2xl font-semibold tracking-tight">{contactHeader.name || 'Your name'}</h1>
      <ContactLine contactHeader={contactHeader} />

      {resume.education.length > 0 && (
        <section>
          <SectionHeading>Education</SectionHeading>
          {resume.education.map((entry, i) => (
            <div key={i} className="flex justify-between gap-4 text-[13px] mb-1.5">
              <div>
                <span className="font-medium">{entry.school}</span>
                {entry.degree ? <span className="text-neutral-700">, {entry.degree}</span> : null}
                {entry.location ? <span className="text-neutral-500"> — {entry.location}</span> : null}
              </div>
              <span className="text-neutral-500 whitespace-nowrap">{entry.dates}</span>
            </div>
          ))}
        </section>
      )}

      {resume.experience.length > 0 && (
        <section>
          <SectionHeading>Experience</SectionHeading>
          {resume.experience.map((entry, i) => (
            <div key={i} className="mb-3">
              <div className="flex justify-between gap-4 text-[13px]">
                <span className="font-medium">
                  {entry.title}
                  {entry.company ? `, ${entry.company}` : ''}
                  {entry.location ? <span className="text-neutral-500"> — {entry.location}</span> : null}
                </span>
                <span className="text-neutral-500 whitespace-nowrap">{entry.dates}</span>
              </div>
              <ul className="list-disc list-outside ml-4 mt-1 space-y-0.5 text-[12.5px] text-neutral-700">
                {entry.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {resume.projects.length > 0 && (
        <section>
          <SectionHeading>Projects</SectionHeading>
          {resume.projects.map((entry, i) => (
            <div key={i} className="mb-3">
              <div className="flex justify-between gap-4 text-[13px]">
                <span className="font-medium">
                  {entry.name}
                  {entry.tech ? <span className="text-neutral-500 font-normal"> — {entry.tech}</span> : null}
                </span>
                <span className="text-neutral-500 whitespace-nowrap">{entry.dates}</span>
              </div>
              <ul className="list-disc list-outside ml-4 mt-1 space-y-0.5 text-[12.5px] text-neutral-700">
                {entry.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {(resume.skills.languages.length > 0 || resume.skills.frameworks.length > 0 || resume.skills.tools.length > 0) && (
        <section>
          <SectionHeading>Technical Skills</SectionHeading>
          <div className="text-[12.5px] text-neutral-700 space-y-1">
            {resume.skills.languages.length > 0 && (
              <p>
                <span className="font-medium text-neutral-900">Languages: </span>
                {resume.skills.languages.join(', ')}
              </p>
            )}
            {resume.skills.frameworks.length > 0 && (
              <p>
                <span className="font-medium text-neutral-900">Frameworks: </span>
                {resume.skills.frameworks.join(', ')}
              </p>
            )}
            {resume.skills.tools.length > 0 && (
              <p>
                <span className="font-medium text-neutral-900">Tools: </span>
                {resume.skills.tools.join(', ')}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
