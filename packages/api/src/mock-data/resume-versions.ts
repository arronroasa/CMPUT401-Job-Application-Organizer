import type { ResumeVersion } from '@onfile/core';

export const MOCK_RESUME_VERSIONS: ResumeVersion[] = [
  {
    id: 'rv-001',
    type: 'base',
    fragments: [
      { id: 'frag-1', section: 'experience', text: 'Built internal reconciliation dashboard reducing manual review time by 40%.', skillTags: ['Python', 'React', 'REST APIs'], impactScore: 8.5, domainTags: ['FinTech', 'Backend'] },
      { id: 'frag-2', section: 'experience', text: 'Wrote 3 new REST API endpoints documented with OpenAPI, consumed by billing team.', skillTags: ['REST APIs', 'Python'], impactScore: 7.2, domainTags: ['Backend', 'API Design'] },
      { id: 'frag-3', section: 'project', text: 'StudySync: collaborative platform used by 400+ students, reducing coordination time by 60%.', skillTags: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'], impactScore: 9.0, domainTags: ['Full Stack', 'EdTech'] },
      { id: 'frag-4', section: 'project', text: 'PriceWatch API: handles 10k daily requests with sub-200ms p95 latency.', skillTags: ['Python', 'FastAPI', 'PostgreSQL', 'Docker'], impactScore: 8.8, domainTags: ['Backend', 'API'] },
    ],
    strengthScore: 78,
    keywordCoverage: 72,
    skillAlignment: 75,
    createdAt: '2026-01-10T10:00:00Z',
  },
  {
    id: 'rv-002',
    type: 'tailored',
    jobId: 'job-001',
    jobTitle: 'Backend Engineer — Payments Infrastructure',
    company: 'Stripe',
    fragments: [
      { id: 'frag-5', section: 'experience', text: 'Built reconciliation automation handling financial transaction anomalies at Stripe internship.', skillTags: ['Python', 'PostgreSQL', 'REST APIs'], impactScore: 9.1, domainTags: ['FinTech', 'Backend'], reasonIncluded: 'Directly matches Payments Infrastructure domain' },
      { id: 'frag-6', section: 'experience', text: 'Designed and shipped 3 REST API endpoints with sub-100ms latency, consumed by billing team.', skillTags: ['REST APIs', 'Python', 'PostgreSQL'], impactScore: 8.8, domainTags: ['Backend', 'API Design'], reasonIncluded: 'Matches REST APIs requirement' },
      { id: 'frag-7', section: 'project', text: 'PriceWatch API: high-throughput REST service handling 10k daily requests with sub-200ms p95 latency.', skillTags: ['Python', 'FastAPI', 'PostgreSQL'], impactScore: 9.0, domainTags: ['Backend', 'Scalability'], reasonIncluded: 'Demonstrates scalability experience' },
    ],
    strengthScore: 87,
    keywordCoverage: 89,
    skillAlignment: 91,
    createdAt: '2026-02-16T14:00:00Z',
  },
  {
    id: 'rv-003',
    type: 'tailored',
    jobId: 'job-004',
    jobTitle: 'Full Stack Engineer — Growth',
    company: 'Linear',
    fragments: [
      { id: 'frag-8', section: 'project', text: 'StudySync: full-stack platform (React + TypeScript + Node.js) with real-time collaboration, used by 400+ students.', skillTags: ['React', 'TypeScript', 'Node.js'], impactScore: 9.2, domainTags: ['Full Stack', 'SaaS'], reasonIncluded: 'Strongest full-stack project' },
      { id: 'frag-9', section: 'experience', text: 'Built React dashboard with TypeScript for payment anomaly visualization at Stripe.', skillTags: ['React', 'TypeScript', 'REST APIs'], impactScore: 8.0, domainTags: ['Frontend', 'Full Stack'], reasonIncluded: 'Matches React + TypeScript requirements' },
    ],
    strengthScore: 84,
    keywordCoverage: 85,
    skillAlignment: 87,
    createdAt: '2026-02-18T09:00:00Z',
  },
  {
    id: 'rv-004',
    type: 'tailored',
    jobId: 'job-007',
    jobTitle: 'Backend Engineer — Data Platform',
    company: 'Retool',
    fragments: [
      { id: 'frag-10', section: 'experience', text: 'Designed REST API endpoints with TypeScript and Node.js, served by PostgreSQL backend at Stripe.', skillTags: ['TypeScript', 'Node.js', 'PostgreSQL', 'REST APIs'], impactScore: 8.7, domainTags: ['Backend', 'API Design'], reasonIncluded: 'Matches all 4 required skills' },
      { id: 'frag-11', section: 'project', text: 'PriceWatch API: multi-source data aggregation service built with FastAPI and PostgreSQL.', skillTags: ['Python', 'FastAPI', 'PostgreSQL'], impactScore: 8.8, domainTags: ['Backend', 'Data'], reasonIncluded: 'Data aggregation aligns with Data Platform role' },
    ],
    strengthScore: 85,
    keywordCoverage: 88,
    skillAlignment: 90,
    createdAt: '2026-02-19T11:00:00Z',
  },
];
