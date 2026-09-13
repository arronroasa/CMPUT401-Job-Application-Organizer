export const seedData = {
  // Timeline-entry ids the user has already looked at on /notifications.
  readNotifications: [],
  applications: [
    {
      id: 'app-1',
      company: 'Northwind Analytics',
      role: 'Frontend Engineer',
      dateApplied: '2026-09-02',
      stage: 'interview',
      location: 'Remote',
      notes: 'Referred by Priya.',
      resumeVersionId: 'res-frontend-2026',
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
      resumeVersionId: 'res-design-2025',
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
      resumeVersionId: 'res-backend-2026',
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
      resumeVersionId: 'res-frontend-2026',
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

  contactHeader: {
    name: 'Jordan Avery',
    phone: '(780) 555-0142',
    email: 'jordan.avery@example.com',
    linkedin: 'linkedin.com/in/jordanavery',
    github: 'github.com/jordanavery',
  },

  masterResumeId: 'res-frontend-2026',

  resumes: [
    {
      id: 'res-frontend-2026',
      name: 'Frontend — 2026',
      updatedAt: '2026-09-10',
      education: [
        {
          school: 'University of Waterloo',
          degree: 'B.A.Sc. in Computer Engineering',
          location: 'Waterloo, ON',
          dates: '2019 — 2023',
        },
      ],
      experience: [
        {
          title: 'Frontend Engineer',
          company: 'Meridian Health',
          location: 'Remote',
          dates: 'Mar. 2023 — Present',
          bullets: [
            'Led the rebuild of the patient intake dashboard in React, cutting median load time by 40%.',
            'Introduced a shared component library adopted across three product teams.',
            'Paired with design to close accessibility gaps, bringing the app to WCAG 2.1 AA.',
          ],
        },
        {
          title: 'Web Developer Intern',
          company: 'Larkfield Systems',
          location: 'Toronto, ON',
          dates: 'May 2022 — Aug. 2022',
          bullets: [
            'Built form-heavy internal tools in React and TypeScript for the operations team.',
            'Migrated a legacy jQuery admin panel to a typed component structure.',
          ],
        },
      ],
      projects: [
        {
          name: 'Ledgerlight',
          tech: 'Next.js, Postgres, Tailwind CSS',
          dates: '2024',
          bullets: ['A small-business invoicing app with real-time payment status tracking.'],
        },
        {
          name: 'Kanbanish',
          tech: 'React, Node.js',
          dates: '2023',
          bullets: ['A keyboard-first kanban board built as a personal project.'],
        },
      ],
      skills: {
        languages: ['JavaScript', 'TypeScript', 'Python'],
        frameworks: ['React', 'Next.js', 'Tailwind CSS'],
        tools: ['Git', 'Docker', 'Figma'],
      },
      match: {
        score: 78,
        missingKeywords: ['System Design', 'Distributed Systems', 'gRPC'],
        company: 'Google',
        role: 'Software Engineer, Front End',
        jobDescription:
          'We are looking for a Front End Software Engineer to build scalable, distributed UIs serving billions of users. Experience with system design, distributed systems, and gRPC-based services is a plus, alongside strong fundamentals in JavaScript and modern frontend frameworks.',
        checkedAt: '2026-09-11T16:20:00.000Z',
      },
    },
    {
      id: 'res-backend-2026',
      name: 'Backend — 2026',
      updatedAt: '2026-09-08',
      education: [
        {
          school: 'University of Waterloo',
          degree: 'B.A.Sc. in Computer Engineering',
          location: 'Waterloo, ON',
          dates: '2019 — 2023',
        },
      ],
      experience: [
        {
          title: 'Frontend Engineer',
          company: 'Meridian Health',
          location: 'Remote',
          dates: 'Mar. 2023 — Present',
          bullets: [
            'Built a Node.js service that batches and syncs intake records overnight.',
            'Owned the REST API layer between the dashboard and the scheduling service.',
          ],
        },
        {
          title: 'Web Developer Intern',
          company: 'Larkfield Systems',
          location: 'Toronto, ON',
          dates: 'May 2022 — Aug. 2022',
          bullets: [
            'Built a small Node.js API powering internal operations tooling.',
            'Wrote integration tests covering the API’s core endpoints.',
          ],
        },
      ],
      projects: [
        {
          name: 'Ledgerlight',
          tech: 'Node.js, Postgres',
          dates: '2024',
          bullets: ['Designed the schema and API for a small-business invoicing app.'],
        },
      ],
      skills: {
        languages: ['JavaScript', 'TypeScript', 'Python', 'SQL'],
        frameworks: ['Node.js', 'Express'],
        tools: ['Docker', 'Postgres', 'Git'],
      },
      match: null,
    },
    {
      id: 'res-design-2025',
      name: 'Design-leaning — 2025',
      updatedAt: '2026-08-30',
      education: [
        {
          school: 'University of Waterloo',
          degree: 'B.A.Sc. in Computer Engineering',
          location: 'Waterloo, ON',
          dates: '2019 — 2023',
        },
      ],
      experience: [
        {
          title: 'Frontend Engineer',
          company: 'Meridian Health',
          location: 'Remote',
          dates: 'Mar. 2023 — Present',
          bullets: [
            'Partnered with design on a token-based system that unified spacing, color, and type across the app.',
            'Ran fortnightly usability sessions that shaped two dashboard redesigns.',
          ],
        },
        {
          title: 'Design Intern',
          company: 'Kestrel Studio',
          location: 'Toronto, ON',
          dates: 'Summer 2021',
          bullets: [
            'Prototyped onboarding flows in Figma for a client-facing mobile app.',
            'Ran a small round of usability testing and folded findings back into the flow.',
          ],
        },
      ],
      projects: [
        {
          name: 'Kanbanish',
          tech: 'React, Figma',
          dates: '2023',
          bullets: ['Designed and built the interaction model for a keyboard-first kanban board.'],
        },
      ],
      skills: {
        languages: ['JavaScript', 'TypeScript'],
        frameworks: ['React', 'Tailwind CSS'],
        tools: ['Figma', 'Git'],
      },
      match: null,
    },
  ],
};
