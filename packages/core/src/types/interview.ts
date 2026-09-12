export type InterviewType =
  | 'technical_coding'
  | 'system_design'
  | 'behavioral'
  | 'product_case'
  | 'mixed';

export type QuestionCategory = 'technical' | 'behavioral' | 'company' | 'company_specific';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface StarGuidance {
  situation_hint?: string;
  task_hint?: string;
  action_hint?: string;
  result_hint?: string;
  reflection_hint?: string;
}

export interface InterviewQuestion {
  id: string;
  text?: string; // legacy key
  question?: string; // new key
  category: QuestionCategory;
  difficulty?: Difficulty;
  rationale?: string;
  star_guidance?: StarGuidance;
  contextNotes?: string;
  skills?: string[];
  tags?: string[];
}

export interface CompanyProfile {
  company_name: string;
  role_title: string;
  company_summary?: string;
  company_website?: string;
  vision?: string;
  products?: string[];
  culture_signals?: string[];
  recent_news?: string[];
  interview_focus?: string[];
  sources_note?: string;
}

export interface QuestionBank {
  behavioral_questions: InterviewQuestion[];
  technical_questions: InterviewQuestion[];
  company_questions: InterviewQuestion[];
}

export interface AnswerDraft {
  questionId: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
}

export interface MockScore {
  sessionId: string;
  questionId: string;
  structureScore: number;   // 1-5
  relevanceScore: number;
  technicalDepth: number;
  specificity: number;
  clarity: number;
  finalScore: number;
  suggestions: string[];
  createdAt: string;
}

export interface InterviewKit {
  id: string;
  applicationId: string;
  jobTitle: string;
  company: string;
  interviewType: InterviewType;
  companyProfile?: CompanyProfile;
  questionBank?: QuestionBank;
  company_profile_json?: CompanyProfile; // API/raw compatibility
  question_bank_json?: QuestionBank; // API/raw compatibility
  // Legacy kits still use this flat list.
  questions: InterviewQuestion[];
  answerDrafts: AnswerDraft[];
  mockScores: MockScore[];
  createdAt: string;
}
