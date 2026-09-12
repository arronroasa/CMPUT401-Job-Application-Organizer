export type ResumeType = 'base' | 'tailored';

export interface ResumeFragment {
  id: string;
  section: 'experience' | 'project' | 'achievement' | 'skill';
  text: string;
  skillTags: string[];
  impactScore: number;
  domainTags: string[];
  reasonIncluded?: string;
}

export interface ResumeVersion {
  id: string;
  type: ResumeType;
  jobId?: string;
  jobTitle?: string;
  company?: string;
  templateId?: string;
  content?: Record<string, unknown>;
  fragments: ResumeFragment[];
  strengthScore: number; // 0-100
  keywordCoverage: number;
  skillAlignment: number;
  createdAt: string;
  pdfUrl?: string;
}
