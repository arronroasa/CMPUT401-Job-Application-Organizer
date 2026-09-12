export type { ApiResponse } from './types';
export { delay, MOCK_DELAY_MS } from './types';

export { getJobs, getJob, markJobInterested, archiveJob, archiveAllJobs, importExternalJob } from './jobs';
export { getResumeVersions, getResumeVersion, exportResumeAsLatex, exportResumeAsPdf, generateAllVersions, updateResumeContent } from './resumes';
export type { ResumePdfExportResult, GenerateAllResult, GeneratedVersionSummary } from './resumes';
export { getApplicationDrafts, getApplicationDraft, updateDraftStatus } from './applications';
export {
  prepareDraft,
  approveDraft,
  runAssistedFill,
  runAssistedConfirmSubmit,
  markAssistedSubmitted,
  getAssistedProgress,
  sendAssistedGuidance,
  getChatMessages,
  postChatMessage,
} from './drafts';
export type {
  AssistedProgressResult,
  AssistedRunOptions,
  AssistedProgressEvent,
  AssistedGuidanceResult,
  ChatMessage,
  ChatThreadResult,
  PostChatMessageResult,
  AssistedManualSubmittedResult,
  AssistedScreenshotSnapshot,
} from './drafts';
export {
  runBrowserAssistedDiscovery,
  checkBrowserConnection,
  startBrowserAssistedDiscoverySession,
  getBrowserAssistedDiscoveryProgress,
  getBrowserAssistedDiscoveryMessages,
  postBrowserAssistedDiscoveryMessage,
  getDiscoveryStatus,
} from './discovery';
export type {
  BrowserAssistedDiscoveryInput,
  BrowserAssistedDiscoveryResult,
  BrowserAssistedSessionStartInput,
  BrowserAssistedSessionStartResult,
  BrowserAssistedSessionProgressResult,
  BrowserAssistedDiscoveryProgressEvent,
  BrowserAssistedSourceProgress,
  BrowserAssistedChatThreadResult,
  BrowserAssistedPostChatResult,
  BrowserDiscoverySource,
  BrowserConnectionStatus,
  DiscoveryStatusResult,
} from './discovery';
export { getInterviewKit, getInterviewKits, scoreMockAnswer } from './interviews';
export {
  getProfiles,
  createProfile,
  activateProfile,
  renameProfile,
  deleteProfile,
  getProfile,
  updateProfile,
  uploadProfileResume,
  recommendProfileRoles,
} from './profile';
export type {
  ProfileSummary,
  ResumeUploadResult,
  ResumeUploadExtraction,
  RoleRecommendationResult,
  DeleteProfileResult,
} from './profile';
export { getInsights, refreshInsights } from './insights';
export { getSettings, updateSettings } from './settings';
export type { AppSettings } from './settings';

// Mock data exports (for seeding stores directly if needed)
export { MOCK_JOBS } from './mock-data/jobs';
export { MOCK_RESUME_VERSIONS } from './mock-data/resume-versions';
export { MOCK_APPLICATIONS } from './mock-data/applications';
export { MOCK_INTERVIEW_KITS } from './mock-data/interview-kits';
export { MOCK_PROFILE } from './mock-data/profile';
export { MOCK_INSIGHTS } from './mock-data/insights';
