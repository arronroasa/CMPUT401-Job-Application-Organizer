import type {
  Certification,
  Education,
  Experience,
  Project,
  RoleInterest,
  Skill,
  UserProfile,
} from '@onfile/core';
import type { ApiResponse } from './types';
import { MOCK_PROFILE } from './mock-data/profile';

type BackendProfile = {
  id?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  location?: string;
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
  summary?: string | null;
  skills_json?: unknown;
  experience_json?: unknown;
  projects_json?: unknown;
  certifications_json?: unknown;
  education_json?: unknown;
  role_interests_json?: unknown;
  updated_at?: string;
  resume_file_name?: string | null;
  resume_uploaded_at?: string | null;
};

type BackendProfileListResponse = {
  profiles?: Array<Record<string, unknown>>;
  active_profile_id?: string;
};

export interface ProfileSummary {
  id: string;
  name: string;
  email: string;
  location: string;
  updatedAt: string;
  resumeFileName?: string;
  resumeUploadedAt?: string;
  isActive: boolean;
}

export interface ResumeUploadExtraction {
  file_name: string;
  skills_extracted: number;
  experiences_extracted: number;
  projects_extracted: number;
  education_extracted?: number;
  certifications_extracted: number;
  role_interests_extracted?: number;
  used_ai: boolean;
}

export interface ResumeUploadResult {
  profile: UserProfile;
  profileId?: string;
  createdNewProfile?: boolean;
  extracted: ResumeUploadExtraction;
}

export interface RoleRecommendationResult {
  profile: UserProfile;
  recommendedCount: number;
  usedAi: boolean;
}

export interface DeleteProfileResult {
  deletedProfileId: string;
  activeProfileId: string;
}

function toErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return fallback;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

function parseSeniority(value: unknown): RoleInterest['seniority'] {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'intern' || normalized === 'entry' || normalized === 'mid' || normalized === 'senior') {
    return normalized;
  }
  return 'entry';
}

function appendQuery(path: string, key: string, value?: string): string {
  if (!value?.trim()) return path;
  const encoded = encodeURIComponent(value.trim());
  return `${path}?${key}=${encoded}`;
}

function normalizeSkill(value: unknown, index: number): Skill {
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return {
      id: String(item.id ?? `sk-${index}`),
      name: String(item.name ?? '').trim(),
      level: (String(item.level ?? 'intermediate') as Skill['level']) || 'intermediate',
      confidenceScore: Number(item.confidenceScore ?? item.confidence_score ?? 65) || 65,
      yearsOfExperience: Number(item.yearsOfExperience ?? item.years_of_experience ?? item.years ?? 1) || 0,
      tags: asArray(item.tags).map((tag) => String(tag)).filter(Boolean),
    };
  }
  const name = String(value ?? '').trim();
  return {
    id: `sk-${index}`,
    name,
    level: 'intermediate',
    confidenceScore: 65,
    yearsOfExperience: 1,
    tags: [],
  };
}

function normalizeExperience(value: unknown, index: number): Experience {
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    const endRaw = String(item.endDate ?? item.end_date ?? item.end ?? '');
    const current =
      Boolean(item.current) ||
      endRaw.toLowerCase() === 'present' ||
      endRaw.toLowerCase() === 'current';
    return {
      id: String(item.id ?? `exp-${index}`),
      company: String(item.company ?? item.employer ?? ''),
      role: String(item.role ?? item.title ?? item.position ?? ''),
      description: String(item.description ?? item.summary ?? ''),
      skills: asArray(item.skills).map((skill) => String(skill)).filter(Boolean),
      startDate: String(item.startDate ?? item.start_date ?? item.start ?? ''),
      endDate: current ? undefined : endRaw || undefined,
      current,
      bullets: asArray(item.bullets).map((bullet) => String(bullet)).filter(Boolean),
    };
  }
  return {
    id: `exp-${index}`,
    company: '',
    role: '',
    description: '',
    skills: [],
    startDate: '',
    endDate: undefined,
    current: false,
    bullets: [],
  };
}

function normalizeProject(value: unknown, index: number): Project {
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return {
      id: String(item.id ?? `proj-${index}`),
      name: String(item.name ?? ''),
      description: String(item.description ?? ''),
      techStack: asArray(item.techStack ?? item.tech_stack).map((token) => String(token)).filter(Boolean),
      skills: asArray(item.skills).map((token) => String(token)).filter(Boolean),
      impactStatement: String(item.impactStatement ?? item.impact_statement ?? ''),
      url: String(item.url ?? '').trim() || undefined,
      startDate: String(item.startDate ?? item.start_date ?? ''),
      endDate: String(item.endDate ?? item.end_date ?? '').trim() || undefined,
    };
  }
  return {
    id: `proj-${index}`,
    name: '',
    description: '',
    techStack: [],
    skills: [],
    impactStatement: '',
    startDate: '',
    endDate: undefined,
  };
}

function normalizeCertification(value: unknown, index: number): Certification {
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return {
      id: String(item.id ?? `cert-${index}`),
      name: String(item.name ?? ''),
      issuer: String(item.issuer ?? ''),
      dateObtained: String(item.dateObtained ?? item.date_obtained ?? ''),
      url: String(item.url ?? '').trim() || undefined,
    };
  }
  return {
    id: `cert-${index}`,
    name: '',
    issuer: '',
    dateObtained: '',
    url: undefined,
  };
}

function normalizeEducation(value: unknown, index: number): Education {
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    const endRaw = String(item.endDate ?? item.end_date ?? item.end ?? '');
    const current =
      Boolean(item.current) ||
      endRaw.toLowerCase() === 'present' ||
      endRaw.toLowerCase() === 'current';
    return {
      id: String(item.id ?? `edu-${index}`),
      institution: String(item.institution ?? item.school ?? item.university ?? item.college ?? ''),
      degree: String(item.degree ?? item.qualification ?? item.credential ?? ''),
      field: String(item.field ?? item.field_of_study ?? item.major ?? '').trim() || undefined,
      startDate: String(item.startDate ?? item.start_date ?? item.start ?? '').trim() || undefined,
      endDate: current ? undefined : endRaw.trim() || undefined,
      current,
      gpa: String(item.gpa ?? '').trim() || undefined,
      location: String(item.location ?? '').trim() || undefined,
    };
  }
  return {
    id: `edu-${index}`,
    institution: '',
    degree: '',
    field: undefined,
    startDate: undefined,
    endDate: undefined,
    current: false,
    gpa: undefined,
    location: undefined,
  };
}

function normalizeRoleInterest(value: unknown, index: number): RoleInterest {
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return {
      id: String(item.id ?? `ri-${index}`),
      title: String(item.title ?? item.role ?? ''),
      seniority: parseSeniority(item.seniority),
      domains: asArray(item.domains).map((domain) => String(domain)).filter(Boolean),
      remote: Boolean(item.remote ?? true),
      locations: asArray(item.locations).map((location) => String(location)).filter(Boolean),
    };
  }
  return {
    id: `ri-${index}`,
    title: '',
    seniority: 'entry',
    domains: [],
    remote: true,
    locations: [],
  };
}

function fromBackend(payload: BackendProfile): UserProfile {
  return {
    id: String(payload.id ?? 'local'),
    name: String(payload.name ?? ''),
    email: String(payload.email ?? ''),
    phone: payload.phone ? String(payload.phone) : undefined,
    location: String(payload.location ?? ''),
    linkedIn: payload.linkedin_url ? String(payload.linkedin_url) : undefined,
    github: payload.github_url ? String(payload.github_url) : undefined,
    portfolio: payload.portfolio_url ? String(payload.portfolio_url) : undefined,
    skills: asArray(payload.skills_json)
      .map(normalizeSkill)
      .filter((skill) => Boolean(skill.name)),
    experiences: asArray(payload.experience_json)
      .map(normalizeExperience)
      .filter((item) => Boolean(item.role || item.company)),
    projects: asArray(payload.projects_json)
      .map(normalizeProject)
      .filter((item) => Boolean(item.name)),
    education: asArray(payload.education_json)
      .map(normalizeEducation)
      .filter((item) => Boolean(item.institution || item.degree)),
    certifications: asArray(payload.certifications_json)
      .map(normalizeCertification)
      .filter((item) => Boolean(item.name)),
    roleInterests: asArray(payload.role_interests_json)
      .map(normalizeRoleInterest)
      .filter((item) => Boolean(item.title)),
    updatedAt: String(payload.updated_at ?? new Date().toISOString()),
    resumeFileName: payload.resume_file_name ? String(payload.resume_file_name) : undefined,
    resumeUploadedAt: payload.resume_uploaded_at ? String(payload.resume_uploaded_at) : undefined,
  };
}

function toBackend(payload: Partial<UserProfile>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (payload.id !== undefined) body.id = payload.id;
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.email !== undefined) body.email = payload.email;
  if (payload.phone !== undefined) body.phone = payload.phone;
  if (payload.location !== undefined) body.location = payload.location;
  if (payload.linkedIn !== undefined) body.linkedin_url = payload.linkedIn;
  if (payload.github !== undefined) body.github_url = payload.github;
  if (payload.portfolio !== undefined) body.portfolio_url = payload.portfolio;
  if (payload.skills !== undefined) body.skills_json = payload.skills;
  if (payload.experiences !== undefined) body.experience_json = payload.experiences;
  if (payload.projects !== undefined) body.projects_json = payload.projects;
  if (payload.education !== undefined) body.education_json = payload.education;
  if (payload.certifications !== undefined) body.certifications_json = payload.certifications;
  if (payload.roleInterests !== undefined) body.role_interests_json = payload.roleInterests;
  return body;
}

function profileSummaryFromBackend(
  item: Record<string, unknown>,
  activeProfileId: string
): ProfileSummary {
  const id = String(item.id ?? '');
  return {
    id,
    name: String(item.name ?? ''),
    email: String(item.email ?? ''),
    location: String(item.location ?? ''),
    updatedAt: String(item.updated_at ?? new Date().toISOString()),
    resumeFileName: item.resume_file_name ? String(item.resume_file_name) : undefined,
    resumeUploadedAt: item.resume_uploaded_at ? String(item.resume_uploaded_at) : undefined,
    isActive: Boolean(item.is_active) || id === activeProfileId,
  };
}

async function seedDefaultProfile(): Promise<UserProfile> {
  const seed = { ...MOCK_PROFILE, id: 'local' };
  const response = await fetch('/api/profile?profile_id=local', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toBackend(seed)),
  });
  if (!response.ok) {
    throw new Error(`Failed to create default profile (${response.status})`);
  }
  const payload = (await response.json()) as BackendProfile;
  return fromBackend(payload);
}

export async function getProfiles(): Promise<ApiResponse<ProfileSummary[]>> {
  const response = await fetch('/api/profiles');
  if (!response.ok) {
    throw new Error(`Failed to fetch profiles (${response.status})`);
  }
  const payload = (await response.json()) as BackendProfileListResponse;
  const activeId = String(payload.active_profile_id ?? 'local');
  const profiles = asArray(payload.profiles)
    .map((item) =>
      item && typeof item === 'object'
        ? profileSummaryFromBackend(item as Record<string, unknown>, activeId)
        : null
    )
    .filter((item): item is ProfileSummary => item !== null);
  return { data: profiles, status: response.status };
}

export async function createProfile(name?: string): Promise<ApiResponse<UserProfile>> {
  const response = await fetch('/api/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(name?.trim() ? { name: name.trim() } : {}),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(toErrorMessage(payload, `Failed to create profile (${response.status})`));
  }
  return { data: fromBackend(payload as BackendProfile), status: response.status };
}

export async function activateProfile(profileId: string): Promise<ApiResponse<{ activeProfileId: string }>> {
  const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/activate`, {
    method: 'PUT',
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(toErrorMessage(payload, `Failed to activate profile (${response.status})`));
  }
  return {
    data: {
      activeProfileId: String((payload as { active_profile_id?: unknown }).active_profile_id ?? profileId),
    },
    status: response.status,
  };
}

export async function renameProfile(profileId: string, name: string): Promise<ApiResponse<UserProfile>> {
  const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/rename`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(toErrorMessage(payload, `Failed to rename profile (${response.status})`));
  }
  return { data: fromBackend(payload as BackendProfile), status: response.status };
}

export async function deleteProfile(profileId: string): Promise<ApiResponse<DeleteProfileResult>> {
  const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(toErrorMessage(payload, `Failed to delete profile (${response.status})`));
  }
  const typedPayload = payload as {
    deleted_profile_id?: unknown;
    active_profile_id?: unknown;
  };
  return {
    data: {
      deletedProfileId: String(typedPayload.deleted_profile_id ?? profileId),
      activeProfileId: String(typedPayload.active_profile_id ?? ''),
    },
    status: response.status,
  };
}

export async function getProfile(profileId?: string): Promise<ApiResponse<UserProfile>> {
  const response = await fetch(appendQuery('/api/profile', 'profile_id', profileId));
  if (response.status === 404) {
    const profile = await seedDefaultProfile();
    return { data: profile, status: 200 };
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch profile (${response.status})`);
  }
  const payload = (await response.json()) as BackendProfile;
  return { data: fromBackend(payload), status: response.status };
}

export async function updateProfile(partial: Partial<UserProfile>, profileId?: string): Promise<ApiResponse<UserProfile>> {
  const response = await fetch(appendQuery('/api/profile', 'profile_id', profileId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toBackend(partial)),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(toErrorMessage(payload, `Failed to update profile (${response.status})`));
  }
  return { data: fromBackend(payload as BackendProfile), status: response.status };
}

export async function uploadProfileResume(
  file: File,
  profileId?: string,
  createNewProfile = true
): Promise<ApiResponse<ResumeUploadResult>> {
  const formData = new FormData();
  formData.append('file', file);
  if (profileId) {
    formData.append('profile_id', profileId);
  }
  formData.append('create_new_profile', createNewProfile ? 'true' : 'false');

  const response = await fetch('/api/profile/resume', {
    method: 'POST',
    body: formData,
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: {
        profile: MOCK_PROFILE,
        extracted: {
          file_name: file.name,
          skills_extracted: 0,
          experiences_extracted: 0,
          projects_extracted: 0,
          certifications_extracted: 0,
          role_interests_extracted: 0,
          used_ai: false,
        },
      },
      error: toErrorMessage(payload, 'Failed to upload resume'),
      status: response.status,
    };
  }

  const profilePayload =
    payload && typeof payload === 'object' && 'profile' in payload
      ? (payload as { profile: BackendProfile }).profile
      : (payload as BackendProfile);

  const extractedRaw =
    payload && typeof payload === 'object' && 'extracted' in payload
      ? (payload as { extracted: Record<string, unknown> }).extracted
      : {};

  const extracted: ResumeUploadExtraction = {
    file_name: String(extractedRaw.file_name ?? file.name),
    skills_extracted: Number(extractedRaw.skills_extracted ?? 0),
    experiences_extracted: Number(extractedRaw.experiences_extracted ?? 0),
    projects_extracted: Number(extractedRaw.projects_extracted ?? 0),
    certifications_extracted: Number(extractedRaw.certifications_extracted ?? 0),
    role_interests_extracted: Number(extractedRaw.role_interests_extracted ?? 0),
    used_ai: Boolean(extractedRaw.used_ai ?? false),
  };

  const payloadObj = payload as {
    profile_id?: unknown;
    created_new_profile?: unknown;
  };

  return {
    data: {
      profile: fromBackend(profilePayload),
      profileId: payloadObj.profile_id ? String(payloadObj.profile_id) : undefined,
      createdNewProfile: Boolean(payloadObj.created_new_profile),
      extracted,
    },
    status: response.status,
  };
}

export async function recommendProfileRoles(profileId?: string): Promise<ApiResponse<RoleRecommendationResult>> {
  const response = await fetch(appendQuery('/api/profile/recommend-roles', 'profile_id', profileId), {
    method: 'POST',
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(toErrorMessage(payload, `Failed to recommend target roles (${response.status})`));
  }

  const profilePayload =
    payload && typeof payload === 'object' && 'profile' in payload
      ? (payload as { profile: BackendProfile }).profile
      : (payload as BackendProfile);

  const typedPayload = payload as {
    recommended_count?: unknown;
    used_ai?: unknown;
  };

  return {
    data: {
      profile: fromBackend(profilePayload),
      recommendedCount: Number(typedPayload.recommended_count ?? 0),
      usedAi: Boolean(typedPayload.used_ai ?? false),
    },
    status: response.status,
  };
}
