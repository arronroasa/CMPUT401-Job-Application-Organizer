export type MatchTier = 'high' | 'medium' | 'low';

export interface JobSkill {
  name: string;
  required: boolean;
  userHas: boolean;
}

export interface MatchScore {
  overall: number; // 0-100
  tier: MatchTier;
  skillMatch: number;
  experienceAlignment: number;
  roleAlignment: number;
  gapPenalty: number;
}

export type JobStatus = 'new' | 'interested' | 'draft' | 'applied' | 'archived';

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  description: string;
  skills: JobSkill[];
  matchScore: MatchScore;
  status: JobStatus;
  source: string;
  sourceUrl: string;
  postedDate: string;
  createdAt: string;
}
