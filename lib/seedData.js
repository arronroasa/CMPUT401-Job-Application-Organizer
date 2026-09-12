export const seedData = {
  applications: [
    {
      id: 'app-1',
      company: 'Northwind Analytics',
      role: 'Frontend Engineer',
      dateApplied: '2026-09-02',
      stage: 'interview',
      location: 'Remote',
      notes: 'Referred by Priya.',
      resumeVersionId: 'res-northwind',
      nextAction: { label: 'Prep for panel interview', date: '2026-09-15', done: false },
      timeline: [
        { id: 't1', label: 'Applied', date: '2026-09-02', stage: 'applied' },
        { id: 't2', label: 'Moved to screening', date: '2026-09-05', stage: 'screening' },
        { id: 't3', label: 'Moved to interview', date: '2026-09-10', stage: 'interview' },
      ],
      communications: [
        { id: 'c1', type: 'Email', date: '2026-09-05', note: 'Recruiter confirmed screening call for Thursday.' },
        { id: 'c2', type: 'Call', date: '2026-09-08', note: '20-minute screen with the recruiter, went well.' },
      ],
    },
    {
      id: 'app-2',
      company: 'Harbor & Finch',
      role: 'Product Designer',
      dateApplied: '2026-09-08',
      stage: 'applied',
      location: 'Edmonton, AB',
      notes: '',
      resumeVersionId: null,
      nextAction: null,
      timeline: [{ id: 't4', label: 'Applied', date: '2026-09-08', stage: 'applied' }],
      communications: [],
    },
    {
      id: 'app-3',
      company: 'Cedarline Robotics',
      role: 'Software Developer',
      dateApplied: '2026-08-28',
      stage: 'screening',
      location: 'Hybrid — Calgary, AB',
      notes: '',
      resumeVersionId: 'res-cedarline',
      nextAction: { label: 'Follow up if no reply', date: '2026-09-13', done: false },
      timeline: [
        { id: 't5', label: 'Applied', date: '2026-08-28', stage: 'applied' },
        { id: 't6', label: 'Moved to screening', date: '2026-09-03', stage: 'screening' },
      ],
      communications: [{ id: 'c3', type: 'Email', date: '2026-09-03', note: 'Take-home assignment sent, due in a week.' }],
    },
    {
      id: 'app-4',
      company: 'Alder Grove Co-op',
      role: 'Junior Web Developer',
      dateApplied: '2026-08-15',
      stage: 'closed',
      location: 'Remote',
      notes: 'Position filled internally.',
      resumeVersionId: null,
      nextAction: null,
      timeline: [
        { id: 't7', label: 'Applied', date: '2026-08-15', stage: 'applied' },
        { id: 't8', label: 'Moved to closed', date: '2026-08-29', stage: 'closed' },
      ],
      communications: [{ id: 'c4', type: 'Email', date: '2026-08-29', note: 'Rejection email — role filled internally.' }],
    },
    {
      id: 'app-5',
      company: 'Basalt Systems',
      role: 'Frontend Engineer',
      dateApplied: '2026-08-20',
      stage: 'offer',
      location: 'Remote',
      notes: 'Great culture fit.',
      resumeVersionId: 'res-northwind',
      nextAction: { label: 'Respond to offer', date: '2026-09-14', done: false },
      timeline: [
        { id: 't9', label: 'Applied', date: '2026-08-20', stage: 'applied' },
        { id: 't10', label: 'Moved to interview', date: '2026-08-27', stage: 'interview' },
        { id: 't11', label: 'Moved to offer', date: '2026-09-10', stage: 'offer' },
      ],
      communications: [
        { id: 'c5', type: 'Interview', date: '2026-08-27', note: 'Final round — team seemed excited about the project walkthrough.' },
        { id: 'c6', type: 'Email', date: '2026-09-10', note: 'Offer letter received, salary range as discussed.' },
      ],
    },
  ],

  masterResume: {
    summary:
      'Frontend-leaning developer with 3 years building accessible, data-heavy web apps. Comfortable across the stack, most at home in React.',
    experience:
      '- Frontend Developer, Sable & Co (2023–present): led rebuild of internal dashboard, cut load time by 40%.\n- Web Developer Intern, Millbrook Labs (2022): built form-heavy internal tools in React.',
    projects:
      '- TrackWise: a personal project for organizing a job search (this one!).\n- Riverside: a small-business booking app built with Next.js.',
    skills: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS', 'Node.js', 'REST APIs', 'Accessibility', 'Git'],
  },

  tailoredResumes: [
    {
      id: 'res-northwind',
      name: 'v1 — Northwind Analytics',
      applicationId: 'app-1',
      summary:
        'Frontend engineer with 3 years building accessible, data-heavy dashboards — a close match for a data-facing analytics product.',
      experience:
        '- Frontend Developer, Sable & Co (2023–present): led rebuild of internal dashboard, cut load time by 40%.\n- Web Developer Intern, Millbrook Labs (2022): built form-heavy internal tools in React.',
      projects:
        '- TrackWise: a personal project for organizing a job search.\n- Riverside: a small-business booking app built with Next.js.',
      skills: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS', 'Data Visualization', 'Accessibility'],
      jobDescription:
        'We are looking for a Frontend Engineer with React and TypeScript experience to help build our analytics dashboard. Experience with data visualization and accessibility is a plus.',
    },
    {
      id: 'res-cedarline',
      name: 'v2 — Cedarline Robotics',
      applicationId: 'app-3',
      summary: 'Full-stack leaning developer comfortable moving between frontend and backend, with a strong Git workflow.',
      experience:
        '- Frontend Developer, Sable & Co (2023–present): led rebuild of internal dashboard.\n- Web Developer Intern, Millbrook Labs (2022): built internal tools end-to-end, including a small Node.js API.',
      projects: '- TrackWise: a personal job-search tracker.\n- Riverside: booking app with a Node.js backend.',
      skills: ['React', 'Node.js', 'REST APIs', 'Git', 'Python'],
      jobDescription:
        'Looking for a Software Developer comfortable with Git, REST APIs, and some Python scripting for internal tooling.',
    },
  ],
};
