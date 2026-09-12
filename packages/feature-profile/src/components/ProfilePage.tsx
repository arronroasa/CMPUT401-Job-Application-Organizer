import { useEffect, useState, type ChangeEvent } from 'react';
import type {
  Certification,
  Education,
  Experience,
  Project,
  RoleInterest,
  Skill,
  UserProfile,
} from '@onfile/core';
import { PageHeader } from '@onfile/ui';
import { useProfileStore } from '../state/useProfileStore';
import { SkillsSection } from './SkillsSection';
import { ProjectsSection } from './ProjectsSection';
import { ExperienceSection } from './ExperienceSection';
import { EducationSection } from './EducationSection';
import { CertificationsSection } from './CertificationsSection';
import { RoleInterestsSection } from './RoleInterestsSection';

interface ProfileEditForm {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedIn: string;
  github: string;
  portfolio: string;
  roleInterests: RoleInterest[];
  skills: Skill[];
  experiences: Experience[];
  education: Education[];
  projects: Project[];
  certifications: Certification[];
}

const SENIORITY_LEVELS: RoleInterest['seniority'][] = ['intern', 'entry', 'mid', 'senior'];

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean);
}

function toForm(profile: UserProfile): ProfileEditForm {
  return {
    name: profile.name,
    email: profile.email,
    phone: profile.phone ?? '',
    location: profile.location,
    linkedIn: profile.linkedIn ?? '',
    github: profile.github ?? '',
    portfolio: profile.portfolio ?? '',
    roleInterests: profile.roleInterests.map((item) => ({ ...item, domains: [...item.domains], locations: [...item.locations] })),
    skills: profile.skills.map((item) => ({ ...item, tags: [...item.tags] })),
    experiences: profile.experiences.map((item) => ({ ...item, skills: [...item.skills], bullets: [...item.bullets] })),
    education: profile.education.map((item) => ({ ...item })),
    projects: profile.projects.map((item) => ({ ...item, techStack: [...item.techStack], skills: [...item.skills] })),
    certifications: profile.certifications.map((item) => ({ ...item })),
  };
}

function toHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withScheme =
    trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname || !parsed.hostname.includes('.')) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function ProfilePage() {
  const {
    profile,
    profiles,
    selectedProfileId,
    isLoading,
    isSaving,
    isUploadingResume,
    isRecommendingRoles,
    fetchProfiles,
    fetchProfile,
    selectProfile,
    createBlankProfile,
    renameSelectedProfile,
    deleteSelectedProfile,
    saveProfile,
    uploadResume,
    recommendRoles,
  } = useProfileStore();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<ProfileEditForm | null>(null);
  const [resumeStatus, setResumeStatus] = useState<string>('');
  const [roleRecommendationStatus, setRoleRecommendationStatus] = useState<string>('');

  useEffect(() => {
    void (async () => {
      await fetchProfiles();
      await fetchProfile();
    })();
  }, [fetchProfiles, fetchProfile]);

  useEffect(() => {
    if (profile && !isEditing) {
      setForm(toForm(profile));
    }
  }, [profile, isEditing]);

  useEffect(() => {
    setRoleRecommendationStatus('');
  }, [selectedProfileId]);

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="px-6 pt-6 pb-10 max-w-3xl space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-muted rounded-lg h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Profile unavailable.</div>;
  }

  const handleChange = (key: keyof ProfileEditForm, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleCancel = () => {
    setForm(toForm(profile));
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!form) return;

    const payload: Partial<UserProfile> = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      location: form.location.trim(),
      linkedIn: form.linkedIn.trim() || undefined,
      github: form.github.trim() || undefined,
      portfolio: form.portfolio.trim() || undefined,
      roleInterests: form.roleInterests
        .map((item) => ({
          ...item,
          title: item.title.trim(),
          domains: item.domains.map((value) => value.trim()).filter(Boolean),
          locations: item.locations.map((value) => value.trim()).filter(Boolean),
        }))
        .filter((item) => item.title),
      skills: form.skills
        .map((item) => ({
          ...item,
          name: item.name.trim(),
          confidenceScore: clampScore(Number(item.confidenceScore) || 0),
          yearsOfExperience: Number(item.yearsOfExperience) || 0,
          tags: item.tags.map((value) => value.trim()).filter(Boolean),
        }))
        .filter((item) => item.name),
      experiences: form.experiences
        .map((item) => ({
          ...item,
          company: item.company.trim(),
          role: item.role.trim(),
          description: item.description.trim(),
          skills: item.skills.map((value) => value.trim()).filter(Boolean),
          bullets: item.bullets.map((value) => value.trim()).filter(Boolean),
          startDate: item.startDate.trim(),
          endDate: item.current ? undefined : item.endDate?.trim() || undefined,
        }))
        .filter((item) => item.company || item.role),
      education: form.education
        .map((item) => ({
          ...item,
          institution: item.institution.trim(),
          degree: item.degree.trim(),
          field: item.field?.trim() || undefined,
          startDate: item.startDate?.trim() || undefined,
          endDate: item.current ? undefined : item.endDate?.trim() || undefined,
          current: Boolean(item.current),
          gpa: item.gpa?.trim() || undefined,
          location: item.location?.trim() || undefined,
        }))
        .filter((item) => item.institution || item.degree),
      projects: form.projects
        .map((item) => ({
          ...item,
          name: item.name.trim(),
          description: item.description.trim(),
          techStack: item.techStack.map((value) => value.trim()).filter(Boolean),
          skills: item.skills.map((value) => value.trim()).filter(Boolean),
          impactStatement: item.impactStatement.trim(),
          url: item.url?.trim() || undefined,
          startDate: item.startDate.trim(),
          endDate: item.endDate?.trim() || undefined,
        }))
        .filter((item) => item.name),
      certifications: form.certifications
        .map((item) => ({
          ...item,
          name: item.name.trim(),
          issuer: item.issuer.trim(),
          dateObtained: item.dateObtained.trim(),
          url: item.url?.trim() || undefined,
        }))
        .filter((item) => item.name),
    };

    await saveProfile(payload);
    setIsEditing(false);
  };

  const canSave = Boolean(form?.name.trim() && form.email.trim() && form.location.trim());
  const resumeUploadedLabel = profile.resumeUploadedAt
    ? new Date(profile.resumeUploadedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const handleResumeUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setResumeStatus('');
    try {
      const result = await uploadResume(file, { createNewProfile: true });
      const extracted = result.extracted;
      setResumeStatus(
        `${result.createdNewProfile ? 'Created new profile. ' : ''}Resume parsed (${extracted.file_name}): ${extracted.skills_extracted} skills, ${extracted.experiences_extracted} experiences, ${extracted.projects_extracted} projects, ${extracted.education_extracted ?? 0} education entries, ${extracted.role_interests_extracted ?? 0} target-role recommendations${
          extracted.used_ai ? ' with AI assistance' : ''
        }.`
      );
      if (isEditing && result.profile) {
        setForm(toForm(result.profile));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload resume.';
      setResumeStatus(message);
    } finally {
      event.target.value = '';
    }
  };

  const handleRecommendRoles = async () => {
    setRoleRecommendationStatus('');
    try {
      const result = await recommendRoles();
      setRoleRecommendationStatus(
        `${result.recommendedCount} AI target-role recommendation${result.recommendedCount === 1 ? '' : 's'} added${
          result.usedAi ? ' using Gemini' : ' from fallback logic'
        }.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate role recommendations.';
      setRoleRecommendationStatus(message);
    }
  };

  const handleDeleteProfile = async () => {
    if (profiles.length <= 1) {
      window.alert('Cannot delete the last profile.');
      return;
    }
    const confirmed = window.confirm(`Delete profile "${profile.name}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await deleteSelectedProfile();
      setIsEditing(false);
      setResumeStatus('');
      setRoleRecommendationStatus('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete profile.';
      window.alert(message);
    }
  };

  const lastUpdated = new Date(profile.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const inputCls =
    'w-full rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500';
  const textareaCls = `${inputCls} min-h-20`;
  const githubHref = profile.github ? toHref(profile.github) : '';
  const linkedInHref = profile.linkedIn ? toHref(profile.linkedIn) : '';
  const portfolioHref = profile.portfolio ? toHref(profile.portfolio) : '';

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 pt-6 pb-10 max-w-5xl space-y-8">
        <div>
          <div className="flex items-start justify-between gap-3">
            <PageHeader title={profile.name} description={`${profile.email} | ${profile.location}`} />
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                Edit Profile
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancel}
                  className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!canSave || isSaving}
                  className="rounded-md border border-blue-500/30 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Last updated: {lastUpdated}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={selectedProfileId ?? profile.id}
              onChange={(event) => {
                void selectProfile(event.target.value);
              }}
              className="rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {profiles.map((item, index) => (
                <option key={item.id} value={item.id}>
                  {item.name || `Profile ${index + 1}`}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const nextName = window.prompt('Rename profile', profile.name || '');
                if (nextName && nextName.trim()) {
                  void renameSelectedProfile(nextName.trim());
                }
              }}
              className="rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground/80 hover:bg-muted transition-colors"
            >
              Rename Profile
            </button>
            <button
              onClick={() => {
                const name = window.prompt('New profile name', '');
                void createBlankProfile(name ?? undefined);
              }}
              className="rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground/80 hover:bg-muted transition-colors"
            >
              New Profile
            </button>
            <button
              onClick={() => void handleDeleteProfile()}
              disabled={profiles.length <= 1}
              className="rounded-md border border-red-500/40 bg-red-900/30 px-2.5 py-1.5 text-xs text-red-200 hover:bg-red-900/50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete Profile
            </button>
          </div>
          {!isEditing && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors">
                {isUploadingResume ? 'Uploading Resume...' : 'Upload Resume (PDF/DOCX/TXT) — creates new profile'}
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.rtf"
                  onChange={(event) => void handleResumeUpload(event)}
                  disabled={isUploadingResume}
                  className="hidden"
                />
              </label>
              {profile.resumeFileName && (
                <p className="text-xs text-muted-foreground">
                  Resume on file: {profile.resumeFileName}
                  {resumeUploadedLabel ? ` (uploaded ${resumeUploadedLabel})` : ''}
                </p>
              )}
              {resumeStatus && <p className="text-xs text-muted-foreground">{resumeStatus}</p>}
            </div>
          )}

          {isEditing && form ? (
            <div className="mt-4 rounded-lg border border-border bg-card p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-xs text-muted-foreground">
                  Name
                  <input value={form.name} onChange={(e) => handleChange('name', e.target.value)} className={inputCls} />
                </label>
                <label className="text-xs text-muted-foreground">
                  Email
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Phone
                  <input value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} className={inputCls} />
                </label>
                <label className="text-xs text-muted-foreground">
                  Location
                  <input
                    value={form.location}
                    onChange={(e) => handleChange('location', e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  GitHub
                  <input value={form.github} onChange={(e) => handleChange('github', e.target.value)} className={inputCls} />
                </label>
                <label className="text-xs text-muted-foreground">
                  LinkedIn
                  <input
                    value={form.linkedIn}
                    onChange={(e) => handleChange('linkedIn', e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="text-xs text-muted-foreground md:col-span-2">
                  Portfolio
                  <input
                    value={form.portfolio}
                    onChange={(e) => handleChange('portfolio', e.target.value)}
                    className={inputCls}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              {githubHref && (
                <a href={githubHref} target="_blank" rel="noreferrer" className="hover:text-foreground/80 transition-colors">
                  {profile.github}
                </a>
              )}
              {linkedInHref && (
                <a href={linkedInHref} target="_blank" rel="noreferrer" className="hover:text-foreground/80 transition-colors">
                  {profile.linkedIn}
                </a>
              )}
              {portfolioHref && (
                <a href={portfolioHref} target="_blank" rel="noreferrer" className="hover:text-foreground/80 transition-colors">
                  {profile.portfolio}
                </a>
              )}
            </div>
          )}
        </div>

        {isEditing && form ? (
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Target Roles</h2>
                <button
                  onClick={() =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            roleInterests: [
                              ...prev.roleInterests,
                              {
                                id: makeId('ri'),
                                title: '',
                                seniority: 'entry',
                                domains: [],
                                remote: true,
                                locations: [],
                              },
                            ],
                          }
                        : prev
                    )
                  }
                  className="text-xs rounded-md border border-border bg-muted px-2 py-1 text-foreground/80 hover:bg-muted"
                >
                  Add Role
                </button>
              </div>
              {form.roleInterests.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-border bg-background p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                      className={inputCls}
                      placeholder="Role title"
                      value={item.title}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.roleInterests];
                          next[index] = { ...next[index], title: e.target.value };
                          return { ...prev, roleInterests: next };
                        })
                      }
                    />
                    <select
                      className={inputCls}
                      value={item.seniority}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.roleInterests];
                          next[index] = { ...next[index], seniority: e.target.value as RoleInterest['seniority'] };
                          return { ...prev, roleInterests: next };
                        })
                      }
                    >
                      {SENIORITY_LEVELS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    <input
                      className={inputCls}
                      placeholder="Domains (comma-separated)"
                      value={item.domains.join(', ')}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.roleInterests];
                          next[index] = { ...next[index], domains: splitCsv(e.target.value) };
                          return { ...prev, roleInterests: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="Locations (comma-separated)"
                      value={item.locations.join(', ')}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.roleInterests];
                          next[index] = { ...next[index], locations: splitCsv(e.target.value) };
                          return { ...prev, roleInterests: next };
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.remote}
                        onChange={(e) =>
                          setForm((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.roleInterests];
                            next[index] = { ...next[index], remote: e.target.checked };
                            return { ...prev, roleInterests: next };
                          })
                        }
                      />
                      Remote
                    </label>
                    <button
                      onClick={() =>
                        setForm((prev) =>
                          prev
                            ? { ...prev, roleInterests: prev.roleInterests.filter((_, i) => i !== index) }
                            : prev
                        )
                      }
                      className="text-xs rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skills</h2>
                <button
                  onClick={() =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            skills: [
                              ...prev.skills,
                              {
                                id: makeId('sk'),
                                name: '',
                                level: 'beginner',
                                confidenceScore: 50,
                                yearsOfExperience: 0,
                                tags: [],
                              },
                            ],
                          }
                        : prev
                    )
                  }
                  className="text-xs rounded-md border border-border bg-muted px-2 py-1 text-foreground/80 hover:bg-muted"
                >
                  Add Skill
                </button>
              </div>
              {form.skills.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-border bg-background p-3 flex items-center gap-2">
                  <input
                    className={inputCls}
                    placeholder="Skill"
                    value={item.name}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.skills];
                        next[index] = { ...next[index], name: e.target.value };
                        return { ...prev, skills: next };
                      })
                    }
                  />
                  <button
                    onClick={() =>
                      setForm((prev) => (prev ? { ...prev, skills: prev.skills.filter((_, i) => i !== index) } : prev))
                    }
                    className="text-xs rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 hover:bg-red-500/20"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Experience</h2>
                <button
                  onClick={() =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            experiences: [
                              ...prev.experiences,
                              {
                                id: makeId('exp'),
                                company: '',
                                role: '',
                                description: '',
                                skills: [],
                                startDate: '',
                                current: false,
                                bullets: [],
                              },
                            ],
                          }
                        : prev
                    )
                  }
                  className="text-xs rounded-md border border-border bg-muted px-2 py-1 text-foreground/80 hover:bg-muted"
                >
                  Add Experience
                </button>
              </div>
              {form.experiences.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-border bg-background p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                      className={inputCls}
                      placeholder="Role"
                      value={item.role}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.experiences];
                          next[index] = { ...next[index], role: e.target.value };
                          return { ...prev, experiences: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="Company"
                      value={item.company}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.experiences];
                          next[index] = { ...next[index], company: e.target.value };
                          return { ...prev, experiences: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="Start date (YYYY-MM)"
                      value={item.startDate}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.experiences];
                          next[index] = { ...next[index], startDate: e.target.value };
                          return { ...prev, experiences: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="End date (YYYY-MM)"
                      value={item.endDate ?? ''}
                      disabled={item.current}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.experiences];
                          next[index] = { ...next[index], endDate: e.target.value };
                          return { ...prev, experiences: next };
                        })
                      }
                    />
                  </div>
                  <label className="text-xs text-muted-foreground flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.current}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.experiences];
                          next[index] = {
                            ...next[index],
                            current: e.target.checked,
                            endDate: e.target.checked ? undefined : next[index].endDate,
                          };
                          return { ...prev, experiences: next };
                        })
                      }
                    />
                    Current role
                  </label>
                  <textarea
                    className={textareaCls}
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.experiences];
                        next[index] = { ...next[index], description: e.target.value };
                        return { ...prev, experiences: next };
                      })
                    }
                  />
                  <input
                    className={inputCls}
                    placeholder="Skills (comma-separated)"
                    value={item.skills.join(', ')}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.experiences];
                        next[index] = { ...next[index], skills: splitCsv(e.target.value) };
                        return { ...prev, experiences: next };
                      })
                    }
                  />
                  <textarea
                    className={textareaCls}
                    placeholder="Bullets (one per line)"
                    value={item.bullets.join('\n')}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.experiences];
                        next[index] = { ...next[index], bullets: splitLines(e.target.value) };
                        return { ...prev, experiences: next };
                      })
                    }
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() =>
                        setForm((prev) =>
                          prev ? { ...prev, experiences: prev.experiences.filter((_, i) => i !== index) } : prev
                        )
                      }
                      className="text-xs rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Education</h2>
                <button
                  onClick={() =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            education: [
                              ...prev.education,
                              {
                                id: makeId('edu'),
                                institution: '',
                                degree: '',
                                field: '',
                                startDate: '',
                                endDate: '',
                                current: false,
                                gpa: '',
                                location: '',
                              },
                            ],
                          }
                        : prev
                    )
                  }
                  className="text-xs rounded-md border border-border bg-muted px-2 py-1 text-foreground/80 hover:bg-muted"
                >
                  Add Education
                </button>
              </div>
              {form.education.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-border bg-background p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                      className={inputCls}
                      placeholder="Institution"
                      value={item.institution}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.education];
                          next[index] = { ...next[index], institution: e.target.value };
                          return { ...prev, education: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="Degree"
                      value={item.degree}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.education];
                          next[index] = { ...next[index], degree: e.target.value };
                          return { ...prev, education: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="Field of study"
                      value={item.field ?? ''}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.education];
                          next[index] = { ...next[index], field: e.target.value };
                          return { ...prev, education: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="Location"
                      value={item.location ?? ''}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.education];
                          next[index] = { ...next[index], location: e.target.value };
                          return { ...prev, education: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="Start date (YYYY-MM)"
                      value={item.startDate ?? ''}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.education];
                          next[index] = { ...next[index], startDate: e.target.value };
                          return { ...prev, education: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="End date (YYYY-MM)"
                      value={item.endDate ?? ''}
                      disabled={Boolean(item.current)}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.education];
                          next[index] = { ...next[index], endDate: e.target.value };
                          return { ...prev, education: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="GPA (optional)"
                      value={item.gpa ?? ''}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.education];
                          next[index] = { ...next[index], gpa: e.target.value };
                          return { ...prev, education: next };
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(item.current)}
                        onChange={(e) =>
                          setForm((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.education];
                            next[index] = {
                              ...next[index],
                              current: e.target.checked,
                              endDate: e.target.checked ? undefined : next[index].endDate,
                            };
                            return { ...prev, education: next };
                          })
                        }
                      />
                      Currently studying
                    </label>
                    <button
                      onClick={() =>
                        setForm((prev) =>
                          prev ? { ...prev, education: prev.education.filter((_, i) => i !== index) } : prev
                        )
                      }
                      className="text-xs rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Projects</h2>
                <button
                  onClick={() =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            projects: [
                              ...prev.projects,
                              {
                                id: makeId('proj'),
                                name: '',
                                description: '',
                                techStack: [],
                                skills: [],
                                impactStatement: '',
                                startDate: '',
                              },
                            ],
                          }
                        : prev
                    )
                  }
                  className="text-xs rounded-md border border-border bg-muted px-2 py-1 text-foreground/80 hover:bg-muted"
                >
                  Add Project
                </button>
              </div>
              {form.projects.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-border bg-background p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                      className={inputCls}
                      placeholder="Project name"
                      value={item.name}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.projects];
                          next[index] = { ...next[index], name: e.target.value };
                          return { ...prev, projects: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="URL"
                      value={item.url ?? ''}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.projects];
                          next[index] = { ...next[index], url: e.target.value };
                          return { ...prev, projects: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="Start date (YYYY-MM)"
                      value={item.startDate}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.projects];
                          next[index] = { ...next[index], startDate: e.target.value };
                          return { ...prev, projects: next };
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      placeholder="End date (YYYY-MM)"
                      value={item.endDate ?? ''}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.projects];
                          next[index] = { ...next[index], endDate: e.target.value };
                          return { ...prev, projects: next };
                        })
                      }
                    />
                  </div>
                  <textarea
                    className={textareaCls}
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.projects];
                        next[index] = { ...next[index], description: e.target.value };
                        return { ...prev, projects: next };
                      })
                    }
                  />
                  <input
                    className={inputCls}
                    placeholder="Tech stack (comma-separated)"
                    value={item.techStack.join(', ')}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.projects];
                        next[index] = { ...next[index], techStack: splitCsv(e.target.value) };
                        return { ...prev, projects: next };
                      })
                    }
                  />
                  <input
                    className={inputCls}
                    placeholder="Skills (comma-separated)"
                    value={item.skills.join(', ')}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.projects];
                        next[index] = { ...next[index], skills: splitCsv(e.target.value) };
                        return { ...prev, projects: next };
                      })
                    }
                  />
                  <textarea
                    className={textareaCls}
                    placeholder="Impact statement"
                    value={item.impactStatement}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.projects];
                        next[index] = { ...next[index], impactStatement: e.target.value };
                        return { ...prev, projects: next };
                      })
                    }
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() =>
                        setForm((prev) =>
                          prev ? { ...prev, projects: prev.projects.filter((_, i) => i !== index) } : prev
                        )
                      }
                      className="text-xs rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Certifications</h2>
                <button
                  onClick={() =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            certifications: [
                              ...prev.certifications,
                              {
                                id: makeId('cert'),
                                name: '',
                                issuer: '',
                                dateObtained: '',
                              },
                            ],
                          }
                        : prev
                    )
                  }
                  className="text-xs rounded-md border border-border bg-muted px-2 py-1 text-foreground/80 hover:bg-muted"
                >
                  Add Certification
                </button>
              </div>
              {form.certifications.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-border bg-background p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                  <input
                    className={inputCls}
                    placeholder="Certification"
                    value={item.name}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.certifications];
                        next[index] = { ...next[index], name: e.target.value };
                        return { ...prev, certifications: next };
                      })
                    }
                  />
                  <input
                    className={inputCls}
                    placeholder="Issuer"
                    value={item.issuer}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.certifications];
                        next[index] = { ...next[index], issuer: e.target.value };
                        return { ...prev, certifications: next };
                      })
                    }
                  />
                  <input
                    className={inputCls}
                    placeholder="Date obtained"
                    value={item.dateObtained}
                    onChange={(e) =>
                      setForm((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.certifications];
                        next[index] = { ...next[index], dateObtained: e.target.value };
                        return { ...prev, certifications: next };
                      })
                    }
                  />
                  <div className="flex items-center gap-2">
                    <input
                      className={inputCls}
                      placeholder="URL"
                      value={item.url ?? ''}
                      onChange={(e) =>
                        setForm((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.certifications];
                          next[index] = { ...next[index], url: e.target.value };
                          return { ...prev, certifications: next };
                        })
                      }
                    />
                    <button
                      onClick={() =>
                        setForm((prev) =>
                          prev
                            ? { ...prev, certifications: prev.certifications.filter((_, i) => i !== index) }
                            : prev
                        )
                      }
                      className="text-xs rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </div>
        ) : (
          <>
            <RoleInterestsSection
              interests={profile.roleInterests}
              onRecommend={() => void handleRecommendRoles()}
              isRecommending={isRecommendingRoles}
              recommendationStatus={roleRecommendationStatus}
            />
            <SkillsSection skills={profile.skills} />
            <ExperienceSection experiences={profile.experiences} />
            <EducationSection education={profile.education} />
            <ProjectsSection projects={profile.projects} />
            <CertificationsSection certifications={profile.certifications} />
          </>
        )}
      </div>
    </div>
  );
}
