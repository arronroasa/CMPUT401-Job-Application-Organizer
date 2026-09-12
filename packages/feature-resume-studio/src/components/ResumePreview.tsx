import { useState, useEffect, useCallback } from 'react';
import type { ResumeVersion } from '@onfile/core';
import { FileDown, Pencil, Check, X, Plus, Trash2 } from 'lucide-react';

interface ResumePreviewProps {
  version: ResumeVersion;
  onExportPdf?: () => void;
  onSave?: (content: Record<string, unknown>) => Promise<void>;
}

// ─── Score bar UI ────────────────────────────────────────────────────────────

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-amber-500' : 'bg-muted-foreground/50';
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground mb-0.5">
        <span>{label}</span>
        <span className="font-medium text-foreground/80">{value}%</span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div className={`${color} h-full transition-all`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

// ─── Template definitions ────────────────────────────────────────────────────

type T = {
  badge: string; font: string; nameSize: string; nameWeight: string | number;
  nameTransform: React.CSSProperties['textTransform']; nameSpacing: string;
  nameColor: string; headerBorderBottom: string; contactSize: string;
  contactColor: string; sectionLabel: string; sectionLabelSize: string;
  sectionLabelWeight: string | number; sectionLabelColor: string;
  sectionLabelTransform: React.CSSProperties['textTransform'];
  sectionLabelSpacing: string; sectionRule: string; sectionRuleMargin: string;
  companySize: string; companyWeight: string | number; companyColor: string;
  roleSize: string; roleStyle: React.CSSProperties['fontStyle']; roleColor: string;
  dateSize: string; dateColor: string; dateWeight: string | number;
  bulletSize: string; bulletColor: string; bulletLeading: string;
  bulletIndent: string; bulletMarker: string; bulletMarkerColor: string;
  projectNameSize: string; projectNameWeight: string | number; projectNameColor: string;
  techStackSize: string; techStackColor: string;
  skillsStyle: 'chips' | 'inline' | 'categorised';
  skillChipPad: string; skillChipBg: string; skillChipBorder: string;
  skillChipColor: string; skillChipRadius: string;
  sectionGap: string; entryGap: string; bulletGap: string; pagePad: string;
};

const TEMPLATES: Record<string, T> = {
  'classic-serif': {
    badge: 'text-violet-400 border-violet-500/30 bg-violet-500/10',
    font: '"Georgia", "Times New Roman", serif',
    nameSize: '26px', nameWeight: 700, nameTransform: 'none', nameSpacing: '-0.01em',
    nameColor: '#111827', headerBorderBottom: '1.5px solid #374151',
    contactSize: '11px', contactColor: '#4b5563',
    sectionLabel: 'EXPERIENCE', sectionLabelSize: '10px', sectionLabelWeight: 700,
    sectionLabelColor: '#111827', sectionLabelTransform: 'uppercase', sectionLabelSpacing: '0.14em',
    sectionRule: '1px solid #374151', sectionRuleMargin: '3px',
    companySize: '12.5px', companyWeight: 700, companyColor: '#111827',
    roleSize: '12px', roleStyle: 'italic', roleColor: '#374151',
    dateSize: '11px', dateColor: '#6b7280', dateWeight: 400,
    bulletSize: '11.5px', bulletColor: '#374151', bulletLeading: '1.6',
    bulletIndent: '12px', bulletMarker: '▸', bulletMarkerColor: '#9ca3af',
    projectNameSize: '12px', projectNameWeight: 700, projectNameColor: '#111827',
    techStackSize: '11px', techStackColor: '#6b7280',
    skillsStyle: 'chips', skillChipPad: '2px 7px', skillChipBg: '#f9fafb',
    skillChipBorder: '1px solid #e5e7eb', skillChipColor: '#374151', skillChipRadius: '3px',
    sectionGap: '18px', entryGap: '12px', bulletGap: '4px', pagePad: '44px 50px 44px',
  },
  'academic': {
    badge: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    font: '"Times New Roman", "Georgia", serif',
    nameSize: '24px', nameWeight: 700, nameTransform: 'none', nameSpacing: '0',
    nameColor: '#0f172a', headerBorderBottom: '2px solid #0f172a',
    contactSize: '11px', contactColor: '#334155',
    sectionLabel: 'Experience', sectionLabelSize: '12px', sectionLabelWeight: 700,
    sectionLabelColor: '#0f172a', sectionLabelTransform: 'none', sectionLabelSpacing: '0',
    sectionRule: '1.5px solid #0f172a', sectionRuleMargin: '2px',
    companySize: '12px', companyWeight: 700, companyColor: '#0f172a',
    roleSize: '12px', roleStyle: 'italic', roleColor: '#334155',
    dateSize: '11px', dateColor: '#334155', dateWeight: 400,
    bulletSize: '11.5px', bulletColor: '#1e293b', bulletLeading: '1.65',
    bulletIndent: '14px', bulletMarker: '•', bulletMarkerColor: '#475569',
    projectNameSize: '12px', projectNameWeight: 700, projectNameColor: '#0f172a',
    techStackSize: '11px', techStackColor: '#475569',
    skillsStyle: 'inline', skillChipPad: '0', skillChipBg: 'transparent',
    skillChipBorder: 'none', skillChipColor: '#1e293b', skillChipRadius: '0',
    sectionGap: '16px', entryGap: '12px', bulletGap: '4px', pagePad: '40px 46px 40px',
  },
  'dense-modern': {
    badge: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    font: '"Helvetica Neue", "Arial", sans-serif',
    nameSize: '22px', nameWeight: 800, nameTransform: 'uppercase', nameSpacing: '0.08em',
    nameColor: '#000000', headerBorderBottom: '2px solid #000000',
    contactSize: '10.5px', contactColor: '#374151',
    sectionLabel: 'EXPERIENCE', sectionLabelSize: '10px', sectionLabelWeight: 800,
    sectionLabelColor: '#000000', sectionLabelTransform: 'uppercase', sectionLabelSpacing: '0.18em',
    sectionRule: '2px solid #000000', sectionRuleMargin: '3px',
    companySize: '12px', companyWeight: 800, companyColor: '#000000',
    roleSize: '11.5px', roleStyle: 'normal', roleColor: '#374151',
    dateSize: '11px', dateColor: '#374151', dateWeight: 600,
    bulletSize: '11px', bulletColor: '#111827', bulletLeading: '1.55',
    bulletIndent: '10px', bulletMarker: '◆', bulletMarkerColor: '#000000',
    projectNameSize: '12px', projectNameWeight: 800, projectNameColor: '#000000',
    techStackSize: '10.5px', techStackColor: '#374151',
    skillsStyle: 'chips', skillChipPad: '1px 6px', skillChipBg: '#f3f4f6',
    skillChipBorder: '1px solid #d1d5db', skillChipColor: '#111827', skillChipRadius: '2px',
    sectionGap: '14px', entryGap: '10px', bulletGap: '3px', pagePad: '36px 44px 36px',
  },
};

const TEMPLATE_LABEL: Record<string, string> = {
  'classic-serif': 'Classic Serif', 'academic': 'Academic', 'dense-modern': 'Dense Modern',
};

// ─── Data types ──────────────────────────────────────────────────────────────

type RawExpEntry   = Record<string, unknown>;
type RawProjectEntry = Record<string, unknown>;
type DateLookup    = Record<string, { startDate?: unknown; endDate?: unknown; current?: unknown }>;

type ExpGroup = {
  company: string; role: string; startDate: string; endDate: string;
  current: boolean; bullets: string[]; bulletIndices: number[];
};

function buildExpGroups(rawExperience: RawExpEntry[], expDateLookup: DateLookup = {}): ExpGroup[] {
  const groups: Map<string, ExpGroup> = new Map();
  const order: string[] = [];
  rawExperience.forEach((entry, idx) => {
    const company = String(entry.company ?? '').trim();
    const role    = String(entry.role    ?? '').trim();
    const key     = `${company}::${role}`;
    const lookup  = expDateLookup[key] ?? {};
    const startDate = String(entry.startDate ?? entry.start_date ?? lookup.startDate ?? '').trim();
    const endDate   = String(entry.endDate   ?? entry.end_date   ?? lookup.endDate   ?? '').trim();
    const current   = Boolean(entry.current ?? lookup.current ?? false);
    if (!groups.has(key)) {
      groups.set(key, { company, role, startDate, endDate, current, bullets: [], bulletIndices: [] });
      order.push(key);
    }
    const text = String(entry.rewritten_text ?? entry.text ?? '').trim();
    if (text) {
      groups.get(key)!.bullets.push(text);
      groups.get(key)!.bulletIndices.push(idx);
    }
  });
  return order.map((k) => groups.get(k)!);
}

function formatDateRange(start: string, end: string, current: boolean): string {
  if (!start && !end) return '';
  const e = current ? 'Present' : (end || 'Present');
  return start ? `${start} – ${e}` : e;
}

// ─── Section heading ─────────────────────────────────────────────────────────

function SectionHeading({ label, t }: { label: string; t: T }) {
  return (
    <div style={{ marginTop: t.sectionGap, marginBottom: '5px' }}>
      <div style={{ fontSize: t.sectionLabelSize, fontWeight: t.sectionLabelWeight, color: t.sectionLabelColor, textTransform: t.sectionLabelTransform, letterSpacing: t.sectionLabelSpacing, lineHeight: 1, marginBottom: t.sectionRuleMargin }}>
        {label}
      </div>
      <div style={{ borderBottom: t.sectionRule }} />
    </div>
  );
}

// ─── Edit-mode helpers ───────────────────────────────────────────────────────

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
      <Trash2 size={11} color="#ef4444" />
    </button>
  );
}

function AddLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#60a5fa', padding: '3px 0', display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'inherit' }}>
      <Plus size={10} /> {label}
    </button>
  );
}

// ─── Skill categorisation (same logic as before) ─────────────────────────────

const LANGUAGE_KEYS  = ['python','javascript','typescript','java',' go','c++','c#','rust','swift','kotlin','ruby','php','scala','assembly','bash','risc'];
const FRAMEWORK_KEYS = ['react','next','fastapi','node','spring','django','flask','express','vue','angular','astro','langchain','langgraph','hugging face','pytorch','tensorflow','mcp'];

function partitionSkills(skills: string[]) {
  const langs  = skills.filter(s => LANGUAGE_KEYS.some(k  => s.toLowerCase().includes(k)));
  const frames = skills.filter(s => !langs.includes(s) && FRAMEWORK_KEYS.some(k => s.toLowerCase().includes(k)));
  const tools  = skills.filter(s => !langs.includes(s) && !frames.includes(s));
  return { langs, frames, tools };
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ResumePreview({ version, onExportPdf, onSave }: ResumePreviewProps) {
  const templateId    = version.templateId ?? 'classic-serif';
  const t             = TEMPLATES[templateId] ?? TEMPLATES['classic-serif'];
  const templateLabel = TEMPLATE_LABEL[templateId] ?? templateId;

  // ── Edit state ──────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft]         = useState<Record<string, unknown>>({});
  const [isSaving, setIsSaving]   = useState(false);

  // Reset whenever the user switches to a different resume
  useEffect(() => {
    setIsEditing(false);
    setDraft(JSON.parse(JSON.stringify(version.content ?? {})));
  }, [version.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEditing = useCallback(() => {
    setDraft(JSON.parse(JSON.stringify(version.content ?? {})));
    setIsEditing(true);
  }, [version.content]);

  const cancelEditing = useCallback(() => {
    setDraft(JSON.parse(JSON.stringify(version.content ?? {})));
    setIsEditing(false);
  }, [version.content]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    await onSave?.(draft);
    setIsEditing(false);
    setIsSaving(false);
  }, [draft, onSave]);

  // ── Draft mutators ───────────────────────────────────────────────────────────

  // Contact
  const setContact = (field: string, value: string) =>
    setDraft((prev) => ({ ...prev, [field]: value }));

  // Experience fragments helpers
  const getFrags = (): RawExpEntry[] => {
    const frags = (draft.fragments as Record<string,unknown> | undefined);
    return Array.isArray(frags?.experience) ? (frags!.experience as RawExpEntry[]) : [];
  };
  const putFrags = (frags: RawExpEntry[]) =>
    setDraft((prev) => ({ ...prev, fragments: { ...(prev.fragments as object ?? {}), experience: frags } }));

  const setBulletText = (fragIdx: number, value: string) => {
    const frags = [...getFrags()];
    frags[fragIdx] = { ...frags[fragIdx], rewritten_text: value, text: value };
    putFrags(frags);
  };
  const removeBullet = (fragIdx: number) => putFrags(getFrags().filter((_, i) => i !== fragIdx));
  const addBullet = (company: string, role: string) => {
    const frags = getFrags();
    const ref = frags.find(f => String(f.company).trim() === company && String(f.role).trim() === role);
    putFrags([...frags, { company, role, rewritten_text: '', text: '', skills: [], score: 0,
      startDate: ref?.startDate ?? '', endDate: ref?.endDate ?? '', current: ref?.current ?? false }]);
  };
  const setExpMeta = (company: string, role: string, field: string, value: unknown) => {
    const frags = getFrags().map((f) =>
      String(f.company).trim() === company && String(f.role).trim() === role ? { ...f, [field]: value } : f
    );
    const key = `${company}::${role}`;
    const lookup = { ...((draft.exp_date_lookup as DateLookup) ?? {}) };
    lookup[key] = { ...(lookup[key] ?? {}), [field]: value };
    setDraft((prev) => ({ ...prev, exp_date_lookup: lookup, fragments: { ...(prev.fragments as object ?? {}), experience: frags } }));
  };

  // Projects
  const getProjs = (): RawProjectEntry[] => {
    const frags = (draft.fragments as Record<string,unknown> | undefined);
    return Array.isArray(frags?.projects) ? (frags!.projects as RawProjectEntry[]) : [];
  };
  const putProjs = (projs: RawProjectEntry[]) =>
    setDraft((prev) => ({ ...prev, fragments: { ...(prev.fragments as object ?? {}), projects: projs } }));
  const setProjField = (idx: number, field: string, value: unknown) => {
    const projs = [...getProjs()];
    projs[idx] = { ...projs[idx], [field]: value };
    putProjs(projs);
  };
  const removeProject = (idx: number) => putProjs(getProjs().filter((_, i) => i !== idx));
  const addProject    = () => putProjs([...getProjs(), { name: '', description: '', techStack: [], skills: [], url: '', startDate: '', endDate: '' }]);

  // Skills
  const rebuildSkills = (langsStr: string, framesStr: string, toolsStr: string) => {
    const toArr = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
    setDraft((prev) => ({ ...prev, skills: [...toArr(langsStr), ...toArr(framesStr), ...toArr(toolsStr)] }));
  };

  // Education
  const setEduField = (idx: number, field: string, value: string) => {
    const edu = [...((Array.isArray(draft.education) ? draft.education : []) as Record<string,unknown>[])];
    edu[idx] = { ...edu[idx], [field]: value };
    setDraft((prev) => ({ ...prev, education: edu }));
  };

  // ── Source of truth: draft in edit mode, version.content otherwise ──────────
  const c: Record<string, unknown> = isEditing ? draft : (version.content ?? {}) as Record<string, unknown>;

  const profileName      = String(c.profile_name      ?? '').trim() || 'Your Name';
  const profileEmail     = String(c.profile_email     ?? '').trim();
  const profilePhone     = String(c.profile_phone     ?? '').trim();
  const profileLocation  = String(c.profile_location  ?? '').trim();
  const profileLinkedin  = String(c.profile_linkedin  ?? '').trim();
  const profileGithub    = String(c.profile_github    ?? '').trim();
  const profilePortfolio = String(c.profile_portfolio ?? '').trim();

  const skills    = Array.isArray(c.skills)    ? (c.skills    as string[]) : [];
  const education = Array.isArray(c.education) ? (c.education as unknown[]) : [];

  const rawFragments   = (c.fragments && typeof c.fragments === 'object') ? (c.fragments as Record<string, unknown>) : {};
  const rawExperience: RawExpEntry[]   = Array.isArray(rawFragments.experience) ? (rawFragments.experience as RawExpEntry[])   : [];
  const rawProjects:   RawProjectEntry[] = Array.isArray(rawFragments.projects)  ? (rawFragments.projects  as RawProjectEntry[]) : [];
  const expDateLookup: DateLookup = (c.exp_date_lookup && typeof c.exp_date_lookup === 'object') ? (c.exp_date_lookup as DateLookup) : {};

  const expGroups  = buildExpGroups(rawExperience, expDateLookup);
  const { langs, frames, tools } = partitionSkills(skills);
  const hasContent = rawExperience.length > 0 || rawProjects.length > 0 || skills.length > 0 || education.length > 0;

  // Shared input style that inherits the paper font / size
  const inp = (extra: React.CSSProperties): React.CSSProperties => ({
    ...extra,
    background: 'transparent',
    border: 'none',
    borderBottom: '1px dashed #93c5fd',
    outline: 'none',
    fontFamily: 'inherit',
    padding: '0 1px',
  });

  return (
    <div className="h-full overflow-y-auto bg-background px-6 py-5">
      <div className="max-w-[720px] mx-auto">

        {/* ── Score / control panel ── */}
        <div className="bg-card border border-border rounded-xl p-4 mb-5 space-y-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${t.badge}`}>
              {templateLabel}
            </span>
            <div className="flex items-center gap-2">
              {/* Edit / Save / Cancel */}
              {onSave && (
                isEditing ? (
                  <>
                    <button onClick={cancelEditing}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md border border-border hover:border-foreground/30 transition-colors">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                    <button onClick={handleSave} disabled={isSaving}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-200 px-2 py-1 rounded-md border border-blue-700 hover:border-blue-500 transition-colors disabled:opacity-50">
                      <Check className="w-3 h-3" /> {isSaving ? 'Saving…' : 'Save'}
                    </button>
                  </>
                ) : (
                  <button onClick={startEditing}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                )
              )}
              {onExportPdf && !isEditing && (
                <button onClick={onExportPdf}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <FileDown className="w-3.5 h-3.5" /> Export PDF
                </button>
              )}
            </div>
          </div>
          <ScoreBar label="Resume Strength"  value={version.strengthScore}  />
          <ScoreBar label="Keyword Coverage" value={version.keywordCoverage} />
          <ScoreBar label="Skill Alignment"  value={version.skillAlignment}  />
        </div>

        {/* ── Paper ── */}
        <div className="bg-white shadow-2xl"
          style={{ fontFamily: t.font, padding: t.pagePad, outline: isEditing ? '2px solid #bfdbfe' : 'none', outlineOffset: '4px' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', paddingBottom: '8px', borderBottom: t.headerBorderBottom, marginBottom: '6px' }}>
            {/* Name */}
            {isEditing ? (
              <input value={profileName === 'Your Name' ? '' : profileName}
                onChange={(e) => setContact('profile_name', e.target.value)}
                placeholder="Your Name"
                style={inp({ fontSize: t.nameSize, fontWeight: t.nameWeight, textTransform: t.nameTransform, letterSpacing: t.nameSpacing, color: t.nameColor, lineHeight: '1.1', textAlign: 'center', width: '100%', marginBottom: '4px', display: 'block' })} />
            ) : (
              <div style={{ fontSize: t.nameSize, fontWeight: t.nameWeight, textTransform: t.nameTransform, letterSpacing: t.nameSpacing, color: t.nameColor, lineHeight: 1.1, marginBottom: '4px' }}>
                {profileName}
              </div>
            )}

            {/* Contact */}
            {isEditing ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 8px', marginTop: '4px' }}>
                {([ ['profile_email','Email'], ['profile_phone','Phone'], ['profile_location','Location'],
                    ['profile_linkedin','LinkedIn URL'], ['profile_github','GitHub URL'], ['profile_portfolio','Portfolio URL'] ] as [string,string][])
                  .map(([field, placeholder]) => (
                    <input key={field}
                      value={String(c[field] ?? '')}
                      onChange={(e) => setContact(field, e.target.value)}
                      placeholder={placeholder}
                      style={inp({ fontSize: t.contactSize, color: t.contactColor, textAlign: 'center', width: '140px' })} />
                  ))}
              </div>
            ) : (
              <div style={{ fontSize: t.contactSize, color: t.contactColor, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 8px', lineHeight: 1.5 }}>
                {[profileEmail, profilePhone, profileLocation].filter(Boolean).map((x, i) => <span key={i}>{x}</span>)}
                {profileLinkedin  && <a href={profileLinkedin}  target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>linkedin.com/in/…</a>}
                {profileGithub    && <a href={profileGithub}    target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>github.com/…</a>}
                {profilePortfolio && <a href={profilePortfolio} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>Portfolio</a>}
              </div>
            )}
            {version.type === 'tailored' && version.company && !isEditing && (
              <div style={{ marginTop: '4px' }}>
                <span className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5 font-sans">
                  Tailored for {version.company}
                </span>
              </div>
            )}
          </div>

          {/* Sections */}
          {hasContent ? (
            <>

              {/* ── EXPERIENCE ── */}
              {expGroups.length > 0 && (
                <>
                  <SectionHeading label="Experience" t={t} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: t.entryGap }}>
                    {expGroups.map((grp, gi) => (
                      <div key={gi}>
                        {/* Company | Role — Dates */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px', flexWrap: 'wrap', gap: '2px' }}>
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '4px', flexWrap: 'wrap' }}>
                            {isEditing ? (
                              <>
                                <input value={grp.company}
                                  onChange={(e) => setExpMeta(grp.company, grp.role, 'company', e.target.value)}
                                  placeholder="Company"
                                  style={inp({ fontSize: t.companySize, fontWeight: t.companyWeight, color: t.companyColor, width: '155px' })} />
                                <span style={{ color: t.roleColor, fontSize: t.roleSize }}>|</span>
                                <input value={grp.role}
                                  onChange={(e) => setExpMeta(grp.company, grp.role, 'role', e.target.value)}
                                  placeholder="Role / Title"
                                  style={inp({ fontSize: t.roleSize, fontStyle: t.roleStyle, color: t.roleColor, width: '180px' })} />
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: t.companySize, fontWeight: t.companyWeight, color: t.companyColor }}>{grp.company}</span>
                                {grp.company && grp.role && <span style={{ color: t.roleColor, fontSize: t.roleSize }}> | </span>}
                                <span style={{ fontSize: t.roleSize, fontStyle: t.roleStyle, color: t.roleColor }}>{grp.role}</span>
                              </>
                            )}
                          </div>
                          {/* Dates */}
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                              <input value={grp.startDate}
                                onChange={(e) => setExpMeta(grp.company, grp.role, 'startDate', e.target.value)}
                                placeholder="Start (e.g. 2023-06)"
                                style={inp({ fontSize: t.dateSize, color: t.dateColor, width: '90px', textAlign: 'right' })} />
                              <span style={{ fontSize: t.dateSize, color: t.dateColor }}>–</span>
                              <input value={grp.current ? 'Present' : grp.endDate}
                                onChange={(e) => setExpMeta(grp.company, grp.role, 'endDate', e.target.value)}
                                placeholder="End / Present"
                                style={inp({ fontSize: t.dateSize, color: t.dateColor, width: '90px' })} />
                            </div>
                          ) : (
                            (grp.startDate || grp.endDate) && (
                              <span style={{ fontSize: t.dateSize, color: t.dateColor, fontWeight: t.dateWeight, whiteSpace: 'nowrap', marginLeft: '12px', flexShrink: 0 }}>
                                {formatDateRange(grp.startDate, grp.endDate, grp.current)}
                              </span>
                            )
                          )}
                        </div>

                        {/* Bullets */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: t.bulletGap, paddingLeft: t.bulletIndent }}>
                          {grp.bulletIndices.map((fragIdx, bi) => (
                            <div key={bi} style={{ display: 'flex', gap: '5px', alignItems: 'flex-start' }}>
                              <span style={{ color: t.bulletMarkerColor, fontSize: t.bulletSize, flexShrink: 0, userSelect: 'none', lineHeight: t.bulletLeading }}>
                                {t.bulletMarker}
                              </span>
                              {isEditing ? (
                                <>
                                  <textarea value={grp.bullets[bi]}
                                    onChange={(e) => setBulletText(fragIdx, e.target.value)}
                                    rows={Math.max(1, Math.ceil(grp.bullets[bi].length / 80))}
                                    style={{ flex: 1, minWidth: 0, fontSize: t.bulletSize, color: t.bulletColor, lineHeight: t.bulletLeading, background: 'transparent', border: 'none', borderBottom: '1px dashed #93c5fd', outline: 'none', fontFamily: 'inherit', resize: 'none', padding: '0 1px' }} />
                                  <DeleteBtn onClick={() => removeBullet(fragIdx)} />
                                </>
                              ) : (
                                <span style={{ flex: 1, minWidth: 0, fontSize: t.bulletSize, color: t.bulletColor, lineHeight: t.bulletLeading }}>{grp.bullets[bi]}</span>
                              )}
                            </div>
                          ))}
                          {isEditing && <AddLink label="Add bullet" onClick={() => addBullet(grp.company, grp.role)} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ── PROJECTS ── */}
              {(rawProjects.length > 0 || isEditing) && (
                <>
                  <SectionHeading label="Projects" t={t} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: t.entryGap }}>
                    {rawProjects.map((proj, i) => {
                      const name        = String(proj.name ?? proj.title ?? '').trim();
                      const techStack   = (Array.isArray(proj.techStack) ? proj.techStack : Array.isArray(proj.skills) ? proj.skills : []) as string[];
                      const url         = String(proj.url ?? proj.link ?? '').trim();
                      const startDate   = String(proj.startDate ?? '').trim();
                      const endDate     = String(proj.endDate   ?? '').trim();
                      const current     = Boolean(proj.current);
                      const description = String(proj.rewritten_text ?? proj.description ?? proj.text ?? '').trim();

                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px', flexWrap: 'wrap', gap: '2px' }}>
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '4px', flexWrap: 'wrap' }}>
                              {isEditing ? (
                                <>
                                  <input value={name}
                                    onChange={(e) => setProjField(i, 'name', e.target.value)}
                                    placeholder="Project Name"
                                    style={inp({ fontSize: t.projectNameSize, fontWeight: t.projectNameWeight, color: t.projectNameColor, width: '150px' })} />
                                  <span style={{ fontSize: t.techStackSize, color: t.techStackColor }}>|</span>
                                  <input
                                    value={techStack.join(', ')}
                                    onChange={(e) => setProjField(i, 'techStack', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                    placeholder="Tech (comma-separated)"
                                    style={inp({ fontSize: t.techStackSize, color: t.techStackColor, width: '200px' })} />
                                  <input value={url}
                                    onChange={(e) => setProjField(i, 'url', e.target.value)}
                                    placeholder="URL (optional)"
                                    style={inp({ fontSize: t.techStackSize, color: '#2563eb', width: '130px' })} />
                                  <DeleteBtn onClick={() => removeProject(i)} />
                                </>
                              ) : (
                                <>
                                  <span style={{ fontSize: t.projectNameSize, fontWeight: t.projectNameWeight, color: t.projectNameColor }}>{name || 'Project'}</span>
                                  {techStack.length > 0 && <span style={{ fontSize: t.techStackSize, color: t.techStackColor }}>{' | '}{techStack.join(' · ')}</span>}
                                  {url && <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: t.techStackSize, color: '#2563eb', marginLeft: '6px', textDecoration: 'none' }}>↗</a>}
                                </>
                              )}
                            </div>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                                <input value={startDate}
                                  onChange={(e) => setProjField(i, 'startDate', e.target.value)}
                                  placeholder="Start"
                                  style={inp({ fontSize: t.dateSize, color: t.dateColor, width: '80px', textAlign: 'right' })} />
                                <span style={{ fontSize: t.dateSize, color: t.dateColor }}>–</span>
                                <input value={current ? 'Present' : endDate}
                                  onChange={(e) => setProjField(i, 'endDate', e.target.value)}
                                  placeholder="End / Present"
                                  style={inp({ fontSize: t.dateSize, color: t.dateColor, width: '80px' })} />
                              </div>
                            ) : (
                              (startDate || endDate) && (
                                <span style={{ fontSize: t.dateSize, color: t.dateColor, fontWeight: t.dateWeight, whiteSpace: 'nowrap', marginLeft: '12px', flexShrink: 0 }}>
                                  {formatDateRange(startDate, endDate, current)}
                                </span>
                              )
                            )}
                          </div>
                          {/* Description */}
                          {(description || isEditing) && (
                            <div style={{ display: 'flex', gap: '5px', alignItems: 'flex-start', paddingLeft: t.bulletIndent }}>
                              <span style={{ color: t.bulletMarkerColor, fontSize: t.bulletSize, flexShrink: 0, userSelect: 'none', lineHeight: t.bulletLeading }}>{t.bulletMarker}</span>
                              {isEditing ? (
                                <textarea value={description}
                                  onChange={(e) => setProjField(i, 'description', e.target.value)}
                                  rows={Math.max(2, Math.ceil(description.length / 80))}
                                  placeholder="Project description…"
                                  style={{ flex: 1, minWidth: 0, fontSize: t.bulletSize, color: t.bulletColor, lineHeight: t.bulletLeading, background: 'transparent', border: 'none', borderBottom: '1px dashed #93c5fd', outline: 'none', fontFamily: 'inherit', resize: 'none', padding: '0 1px' }} />
                              ) : (
                                <span style={{ flex: 1, minWidth: 0, fontSize: t.bulletSize, color: t.bulletColor, lineHeight: t.bulletLeading }}>{description}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {isEditing && <AddLink label="Add project" onClick={addProject} />}
                  </div>
                </>
              )}

              {/* ── SKILLS ── */}
              {skills.length > 0 && (
                <>
                  <SectionHeading label="Skills" t={t} />
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {([
                        { label: 'Languages:', key: 'langs',  value: langs.join(', ')  },
                        { label: 'Frameworks & Libraries:', key: 'frames', value: frames.join(', ') },
                        { label: 'Tools & Platforms:',      key: 'tools',  value: tools.join(', ')  },
                      ] as { label: string; key: string; value: string }[]).map(({ label, key, value }) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: t.bulletSize, fontWeight: 700, color: t.companyColor, whiteSpace: 'nowrap', minWidth: '150px' }}>{label}</span>
                          <input value={value}
                            placeholder="comma-separated"
                            onChange={(e) => {
                              rebuildSkills(
                                key === 'langs'  ? e.target.value : langs.join(', '),
                                key === 'frames' ? e.target.value : frames.join(', '),
                                key === 'tools'  ? e.target.value : tools.join(', '),
                              );
                            }}
                            style={inp({ fontSize: t.bulletSize, color: t.bulletColor, flex: '1', width: '100%' })} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {langs.length  > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 4px' }}><span style={{ fontSize: t.bulletSize, fontWeight: 700, color: t.companyColor, marginRight: '2px' }}>Languages:</span><span style={{ fontSize: t.bulletSize, color: t.bulletColor }}>{langs.join(', ')}</span></div>}
                      {frames.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 4px' }}><span style={{ fontSize: t.bulletSize, fontWeight: 700, color: t.companyColor, marginRight: '2px' }}>Frameworks & Libraries:</span><span style={{ fontSize: t.bulletSize, color: t.bulletColor }}>{frames.join(', ')}</span></div>}
                      {tools.length  > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 4px' }}><span style={{ fontSize: t.bulletSize, fontWeight: 700, color: t.companyColor, marginRight: '2px' }}>Tools & Platforms:</span><span style={{ fontSize: t.bulletSize, color: t.bulletColor }}>{tools.join(', ')}</span></div>}
                    </div>
                  )}
                </>
              )}

              {/* ── EDUCATION ── */}
              {education.length > 0 && (
                <>
                  <SectionHeading label="Education" t={t} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: t.entryGap }}>
                    {education.map((edu, i) => {
                      const e           = edu as Record<string, unknown>;
                      const institution = String(e.institution ?? e.school ?? '').trim();
                      const degree      = String(e.degree      ?? '').trim();
                      const field       = String(e.field       ?? '').trim();
                      const startDate   = String(e.startDate   ?? '').trim();
                      const endDate     = String(e.endDate     ?? '').trim();
                      const current     = Boolean(e.current);
                      const gpa         = String(e.gpa         ?? '').trim();
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px' }}>
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '4px', flexWrap: 'wrap' }}>
                              {isEditing ? (
                                <>
                                  <input value={institution} onChange={(ev) => setEduField(i, 'institution', ev.target.value)} placeholder="Institution"
                                    style={inp({ fontSize: t.companySize, fontWeight: t.companyWeight, color: t.companyColor, width: '155px' })} />
                                  <span style={{ color: t.roleColor, fontSize: t.roleSize }}>|</span>
                                  <input value={degree} onChange={(ev) => setEduField(i, 'degree', ev.target.value)} placeholder="Degree"
                                    style={inp({ fontSize: t.roleSize, fontStyle: t.roleStyle, color: t.roleColor, width: '100px' })} />
                                  <input value={field} onChange={(ev) => setEduField(i, 'field', ev.target.value)} placeholder="Field of Study"
                                    style={inp({ fontSize: t.roleSize, color: t.roleColor, width: '130px' })} />
                                  <input value={gpa} onChange={(ev) => setEduField(i, 'gpa', ev.target.value)} placeholder="GPA"
                                    style={inp({ fontSize: t.roleSize, color: t.roleColor, width: '60px' })} />
                                </>
                              ) : (
                                <>
                                  <span style={{ fontSize: t.companySize, fontWeight: t.companyWeight, color: t.companyColor }}>{institution}</span>
                                  {(degree || field) && <>
                                    <span style={{ color: t.roleColor, fontSize: t.roleSize }}> | </span>
                                    <span style={{ fontSize: t.roleSize, fontStyle: t.roleStyle, color: t.roleColor }}>
                                      {[degree, field].filter(Boolean).join(', ')}{gpa ? ` — GPA: ${gpa}` : ''}
                                    </span>
                                  </>}
                                </>
                              )}
                            </div>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                                <input value={startDate} onChange={(ev) => setEduField(i, 'startDate', ev.target.value)} placeholder="Start"
                                  style={inp({ fontSize: t.dateSize, color: t.dateColor, width: '80px', textAlign: 'right' })} />
                                <span style={{ fontSize: t.dateSize, color: t.dateColor }}>–</span>
                                <input value={current ? 'Present' : endDate} onChange={(ev) => setEduField(i, 'endDate', ev.target.value)} placeholder="End"
                                  style={inp({ fontSize: t.dateSize, color: t.dateColor, width: '80px' })} />
                              </div>
                            ) : (
                              (startDate || endDate) && (
                                <span style={{ fontSize: t.dateSize, color: t.dateColor, fontWeight: t.dateWeight, whiteSpace: 'nowrap', marginLeft: '12px', flexShrink: 0 }}>
                                  {formatDateRange(startDate, endDate, current)}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

            </>
          ) : (
            <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '12px', padding: '40px 0', fontFamily: 'sans-serif' }}>
              No content yet — generate a tailored version to populate.
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
