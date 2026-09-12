export type ApplicationStatus =
  | 'drafted'
  | 'approved'
  | 'submitted'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'archived';

export interface FormField {
  type: 'text' | 'textarea' | 'dropdown' | 'checkbox' | 'file';
  label: string;
  required: boolean;
  value?: string;
  options?: string[];
}

// For most fields the backend fills in a plain string answer. For `file`
// type fields (e.g. resume upload) it instead returns one of these two
// structured shapes — see backend/app/engines/applications/draft_generator.py.
// Any UI that renders `ApplicationDraft.answers` values must not assume
// they're always strings.
export type FileFieldAnswer =
  | { resume_upload_required: true }
  | { resume_file_path: string; resume_file_name: string };

export type ApplicationAnswerValue = string | FileFieldAnswer;

export interface ApplicationDraft {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  resumeVersionId: string;
  status: ApplicationStatus;
  matchScore: number;
  coverLetter?: string;
  formStructure: FormField[];
  answers: Record<string, ApplicationAnswerValue>;
  missingSkills: string[];
  createdAt: string;
  approvedAt?: string;
  submittedAt?: string;
  responseTimeDays?: number;
  notes?: string;
}
