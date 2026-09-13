// The Jake-format layout re-implemented in @react-pdf/renderer primitives
// for the downloaded PDF. Kept deliberately separate from
// ResumeDocument.js's screen layout — see docs/adr/0002. A change to the
// document's structure has to land in both files.

import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#171717' },
  name: { fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 2 },
  contact: { fontSize: 9, textAlign: 'center', color: '#525252', marginBottom: 14 },
  heading: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderBottom: '1pt solid #d4d4d4',
    paddingBottom: 3,
    marginTop: 12,
    marginBottom: 6,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  entryTitle: { fontWeight: 700 },
  entryMeta: { color: '#525252' },
  bullet: { flexDirection: 'row', marginBottom: 2, paddingLeft: 10 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1, color: '#404040' },
  skillsLine: { marginBottom: 3, color: '#404040' },
});

function Bullets({ items }) {
  return items.map((b, i) => (
    <View key={i} style={styles.bullet}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{b}</Text>
    </View>
  ));
}

function ResumePdfDocument({ resume, contactHeader }) {
  const contactLine = [contactHeader.phone, contactHeader.email, contactHeader.linkedin, contactHeader.github]
    .filter(Boolean)
    .join(' · ');

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.name}>{contactHeader.name || 'Your name'}</Text>
        {contactLine ? <Text style={styles.contact}>{contactLine}</Text> : null}

        {resume.education.length > 0 && (
          <View>
            <Text style={styles.heading}>Education</Text>
            {resume.education.map((e, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.entryTitle}>
                  {e.school}
                  {e.degree ? `, ${e.degree}` : ''}
                  {e.location ? ` — ${e.location}` : ''}
                </Text>
                <Text style={styles.entryMeta}>{e.dates}</Text>
              </View>
            ))}
          </View>
        )}

        {resume.experience.length > 0 && (
          <View>
            <Text style={styles.heading}>Experience</Text>
            {resume.experience.map((e, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <View style={styles.row}>
                  <Text style={styles.entryTitle}>
                    {e.title}
                    {e.company ? `, ${e.company}` : ''}
                    {e.location ? ` — ${e.location}` : ''}
                  </Text>
                  <Text style={styles.entryMeta}>{e.dates}</Text>
                </View>
                <Bullets items={e.bullets} />
              </View>
            ))}
          </View>
        )}

        {resume.projects.length > 0 && (
          <View>
            <Text style={styles.heading}>Projects</Text>
            {resume.projects.map((p, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <View style={styles.row}>
                  <Text style={styles.entryTitle}>
                    {p.name}
                    {p.tech ? ` — ${p.tech}` : ''}
                  </Text>
                  <Text style={styles.entryMeta}>{p.dates}</Text>
                </View>
                <Bullets items={p.bullets} />
              </View>
            ))}
          </View>
        )}

        {(resume.skills.languages.length > 0 || resume.skills.frameworks.length > 0 || resume.skills.tools.length > 0) && (
          <View>
            <Text style={styles.heading}>Technical Skills</Text>
            {resume.skills.languages.length > 0 && (
              <Text style={styles.skillsLine}>Languages: {resume.skills.languages.join(', ')}</Text>
            )}
            {resume.skills.frameworks.length > 0 && (
              <Text style={styles.skillsLine}>Frameworks: {resume.skills.frameworks.join(', ')}</Text>
            )}
            {resume.skills.tools.length > 0 && <Text style={styles.skillsLine}>Tools: {resume.skills.tools.join(', ')}</Text>}
          </View>
        )}
      </Page>
    </Document>
  );
}

// Builds the PDF client-side and triggers a browser download named after
// the version, e.g. "frontend-2026.pdf".
export async function downloadResumePdf(resume, contactHeader) {
  const slug = (resume.name || 'resume').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const blob = await pdf(<ResumePdfDocument resume={resume} contactHeader={contactHeader} />).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slug || 'resume'}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
