export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface Skill {
  id: string;
  name: string;
  level: SkillLevel;
  confidenceScore: number; // 0-100, computed from frequency × recency × impact
  yearsOfExperience: number;
  tags: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  techStack: string[];
  skills: string[];
  impactStatement: string;
  url?: string;
  startDate: string;
  endDate?: string;
}

export interface Experience {
  id: string;
  company: string;
  role: string;
  description: string;
  skills: string[];
  startDate: string;
  endDate?: string;
  current: boolean;
  bullets: string[];
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  dateObtained: string;
  url?: string;
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  gpa?: string;
  location?: string;
}

export interface RoleInterest {
  id: string;
  title: string;
  seniority: 'intern' | 'entry' | 'mid' | 'senior';
  domains: string[];
  remote: boolean;
  locations: string[];
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location: string;
  linkedIn?: string;
  github?: string;
  portfolio?: string;
  skills: Skill[];
  projects: Project[];
  experiences: Experience[];
  education: Education[];
  certifications: Certification[];
  roleInterests: RoleInterest[];
  resumeFileName?: string;
  resumeUploadedAt?: string;
  updatedAt: string;
}
