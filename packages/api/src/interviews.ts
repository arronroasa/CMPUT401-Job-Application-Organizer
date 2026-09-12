import type { CompanyProfile, InterviewKit, InterviewQuestion, MockScore, QuestionBank } from '@onfile/core';
import { delay, MOCK_DELAY_MS } from './types';
import { MOCK_INTERVIEW_KITS } from './mock-data/interview-kits';
import type { ApiResponse } from './types';
import { getApplicationDrafts } from './applications';
import { refreshInsights } from './insights';

function ensureStr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function ensureList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
}

function safeJsonParse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeCompanyProfile(raw: unknown, fallbackCompany: string, fallbackRole: string): CompanyProfile {
  const base = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const legacyCompany = ensureStr(base.company, '');
  const legacyTitle = ensureStr(base.title, '');
  const companyName = ensureStr(base.company_name, legacyCompany || fallbackCompany || 'the company');
  const roleTitle = ensureStr(base.role_title, legacyTitle || fallbackRole || 'the role');
  const companySummary = ensureStr(base.company_summary, '');

  const cleanedProducts = ensureList(base.products).filter((p) => !p.includes('[REQUIRES_REVIEW'));
  const cleanedCulture = ensureList(base.culture_signals).filter((p) => !p.includes('[REQUIRES_REVIEW'));
  const cleanedNews = ensureList(base.recent_news).filter((p) => !p.includes('[REQUIRES_REVIEW'));
  const cleanedFocus = ensureList(base.interview_focus).filter((p) => !p.includes('[REQUIRES_REVIEW'));

  const products = cleanedProducts.length > 0 ? cleanedProducts : ['Core platform capabilities tied to the role'];
  const cultureSignals = cleanedCulture.length > 0 ? cleanedCulture : ['Ownership and collaboration'];
  const vision = ensureStr(base.vision, 'Public material emphasizes product quality and customer impact.');
  const derivedSummary = (companySummary && !companySummary.includes('[REQUIRES_REVIEW')) ? companySummary : (
    `Based on available context, ${companyName} appears relevant to ${roleTitle}, with focus on ` +
    `${products.join(', ')} and culture signals around ${cultureSignals.join(', ')}.`
  );

  return {
    company_name: companyName,
    role_title: roleTitle,
    company_summary: derivedSummary,
    company_website: ensureStr(base.company_website, ''),
    vision,
    products,
    culture_signals: cultureSignals,
    recent_news: cleanedNews.length > 0 ? cleanedNews : ['Check latest updates from the company newsroom.'],
    interview_focus: cleanedFocus.length > 0 ? cleanedFocus : ['Role responsibilities and execution tradeoffs.'],
    sources_note: ensureStr(base.sources_note, 'Generated from available application context.'),
  };
}

function normalizeQuestion(raw: unknown, defaultCategory: InterviewQuestion['category'], index: number): InterviewQuestion {
  const base = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const requested = ensureStr(base.category, defaultCategory).toLowerCase();
  const category: InterviewQuestion['category'] =
    requested === 'behavioral' || requested === 'technical' || requested === 'company' || requested === 'company_specific'
      ? requested
      : defaultCategory;

  const questionText = ensureStr(base.question, ensureStr(base.text, '[REQUIRES_REVIEW: missing question text]'));
  const difficulty = ensureStr(base.difficulty, 'medium');
  const safeDifficulty: InterviewQuestion['difficulty'] =
    difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard' ? difficulty : 'medium';

  const star = (base.star_guidance && typeof base.star_guidance === 'object')
    ? (base.star_guidance as Record<string, unknown>)
    : {};

  return {
    id: ensureStr(base.id, `q-${defaultCategory}-${index}`),
    category,
    difficulty: safeDifficulty,
    question: questionText,
    text: questionText,
    rationale: ensureStr(base.rationale, ensureStr(base.contextNotes, '[REQUIRES_REVIEW: missing rationale]')),
    contextNotes: ensureStr(base.contextNotes, ensureStr(base.rationale, '')),
    tags: ensureList(base.tags).length > 0 ? ensureList(base.tags) : ensureList(base.skills),
    skills: ensureList(base.skills).length > 0 ? ensureList(base.skills) : ensureList(base.tags),
    star_guidance: {
      situation_hint: ensureStr(star.situation_hint, ''),
      task_hint: ensureStr(star.task_hint, ''),
      action_hint: ensureStr(star.action_hint, ''),
      result_hint: ensureStr(star.result_hint, ''),
      reflection_hint: ensureStr(star.reflection_hint, ''),
    },
  };
}

function normalizeQuestionBank(raw: unknown, legacyQuestions: InterviewQuestion[]): QuestionBank {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const base = raw as Record<string, unknown>;
    const behavioral = Array.isArray(base.behavioral_questions)
      ? base.behavioral_questions.map((q, i) => normalizeQuestion(q, 'behavioral', i + 1))
      : [];
    const technical = Array.isArray(base.technical_questions)
      ? base.technical_questions.map((q, i) => normalizeQuestion(q, 'technical', i + 1))
      : [];
    const company = Array.isArray(base.company_questions)
      ? base.company_questions.map((q, i) => normalizeQuestion(q, 'company', i + 1))
      : [];
    const result = {
      behavioral_questions: behavioral,
      technical_questions: technical,
      company_questions: company,
    };
    if (result.company_questions.length === 0) {
      result.company_questions = [
        normalizeQuestion(
          {
            id: 'q-company-fallback',
            category: 'company',
            difficulty: 'medium',
            question: '[REQUIRES_REVIEW: add company-specific question for this role]',
            rationale: 'Ensures every interview kit includes at least one company-specific question.',
            tags: ['company-context'],
          },
          'company',
          1,
        ),
      ];
    }
    return result;
  }

  const behavioral: InterviewQuestion[] = [];
  const technical: InterviewQuestion[] = [];
  const company: InterviewQuestion[] = [];
  legacyQuestions.forEach((q, i) => {
    const normalized = normalizeQuestion(q, 'technical', i + 1);
    if (normalized.category === 'behavioral') behavioral.push(normalized);
    else if (normalized.category === 'company' || normalized.category === 'company_specific') company.push({ ...normalized, category: 'company' });
    else technical.push(normalized);
  });
  const result = {
    behavioral_questions: behavioral,
    technical_questions: technical,
    company_questions: company,
  };
  if (result.company_questions.length === 0) {
    result.company_questions = [
      normalizeQuestion(
        {
          id: 'q-company-fallback',
          category: 'company',
          difficulty: 'medium',
          question: '[REQUIRES_REVIEW: add company-specific question for this role]',
          rationale: 'Ensures every interview kit includes at least one company-specific question.',
          tags: ['company-context'],
        },
        'company',
        1,
      ),
    ];
  }
  return result;
}

function flattenQuestionBank(bank: QuestionBank): InterviewQuestion[] {
  const company = bank.company_questions.map((q) => ({ ...q, category: 'company_specific' as const, text: q.question ?? q.text }));
  const behavioral = bank.behavioral_questions.map((q) => ({ ...q, category: 'behavioral' as const, text: q.question ?? q.text }));
  const technical = bank.technical_questions.map((q) => ({ ...q, category: 'technical' as const, text: q.question ?? q.text }));
  return [...company, ...behavioral, ...technical];
}

function normalizeKit(input: InterviewKit): InterviewKit {
  const raw = (input ?? {}) as unknown as Record<string, unknown>;
  const parsedCompanyProfile = safeJsonParse(raw.companyProfile ?? raw.company_profile_json);
  const parsedQuestionBank = safeJsonParse(raw.questionBank ?? raw.question_bank_json);
  const parsedQuestions = safeJsonParse(raw.questions);
  const legacyQuestions = Array.isArray(raw.questions)
    ? raw.questions.map((q, i) => normalizeQuestion(q, 'technical', i + 1))
    : Array.isArray(parsedQuestions)
      ? parsedQuestions.map((q, i) => normalizeQuestion(q, 'technical', i + 1))
    : [];
  const company = ensureStr(raw.company, '');
  const jobTitle = ensureStr(raw.jobTitle, '');
  const companyProfile = normalizeCompanyProfile(parsedCompanyProfile, company, jobTitle);
  const questionBank = normalizeQuestionBank(parsedQuestionBank, legacyQuestions);
  const questions = flattenQuestionBank(questionBank);

  return {
    ...input,
    id: ensureStr(raw.id, 'kit-unknown'),
    applicationId: ensureStr(raw.applicationId ?? raw.application_id, 'app-unknown'),
    jobTitle: ensureStr(raw.jobTitle, companyProfile.role_title),
    company: ensureStr(raw.company, companyProfile.company_name),
    interviewType: ensureStr(raw.interviewType ?? raw.interview_type, 'mixed') as InterviewKit['interviewType'],
    companyProfile,
    questionBank,
    questions,
    answerDrafts: Array.isArray(raw.answerDrafts) ? raw.answerDrafts as InterviewKit['answerDrafts'] : [],
    mockScores: Array.isArray(raw.mockScores) ? raw.mockScores as InterviewKit['mockScores'] : [],
    createdAt: ensureStr(raw.createdAt ?? raw.created_at, new Date().toISOString()),
  };
}

function fallbackKitForApplication(application: Record<string, unknown>): InterviewKit {
  const applicationId = ensureStr(application.id, 'app-unknown');
  const company = ensureStr(application.company, '[REQUIRES_REVIEW: missing company name]');
  const jobTitle = ensureStr(
    application.jobTitle ?? application.job_title,
    '[REQUIRES_REVIEW: missing role title]',
  );
  const createdAt = ensureStr(application.createdAt ?? application.created_at, new Date().toISOString());

  const existing = MOCK_INTERVIEW_KITS.find((kit) => kit.applicationId === applicationId);
  if (existing) {
    return normalizeKit(existing);
  }

  return normalizeKit({
    id: `kit-${applicationId}`,
    applicationId,
    jobTitle,
    company,
    interviewType: 'mixed',
    companyProfile: {
      company_name: company,
      role_title: jobTitle,
      company_summary: '[REQUIRES_REVIEW: add a short summary of what the company does]',
      company_website: '',
      products: ['[REQUIRES_REVIEW: missing product lines]'],
      culture_signals: ['[REQUIRES_REVIEW: missing culture signals]'],
      recent_news: ['[REQUIRES_REVIEW: missing recent updates]'],
      interview_focus: ['[REQUIRES_REVIEW: infer from role + JD]'],
      sources_note: 'Generated from available application context.',
    },
    questionBank: {
      company_questions: [
        {
          id: 'q-company-fallback',
          category: 'company',
          difficulty: 'medium',
          question: `How would you align your engineering decisions with ${company}'s product priorities in this role?`,
          rationale: 'Ensures every interview kit includes at least one company-specific question.',
          tags: ['company-context'],
        },
      ],
      behavioral_questions: [
        {
          id: 'q-behavioral-fallback',
          category: 'behavioral',
          difficulty: 'medium',
          question: `Describe a time you took ownership of a challenging delivery that maps well to ${jobTitle} at ${company}.`,
          rationale: 'Tests ownership and execution.',
          tags: ['ownership'],
          star_guidance: {
            situation_hint: 'Set the context and constraints.',
            task_hint: 'Explain what you were responsible for.',
            action_hint: 'Describe concrete steps you took.',
            result_hint: 'Share the outcome.',
            reflection_hint: 'Explain what you learned.',
          },
        },
      ],
      technical_questions: [
        {
          id: 'q-technical-fallback',
          category: 'technical',
          difficulty: 'medium',
          question: `How would you design and operate a reliable backend API for ${company}'s core workflows in this role?`,
          rationale: 'Assesses system design and operational thinking.',
          tags: ['backend', 'reliability'],
        },
      ],
    },
    questions: [],
    answerDrafts: [],
    mockScores: [],
    createdAt,
  });
}

async function fetchInterviewKitFromBackend(applicationId: string): Promise<InterviewKit | null> {
  const response = await fetch(`/api/interviews/${encodeURIComponent(applicationId)}`);
  if (response.status === 404) {
    const generated = await fetch(`/api/interviews/${encodeURIComponent(applicationId)}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!generated.ok) {
      return null;
    }
    const payload = await generated.json();
    return normalizeKit(payload as InterviewKit);
  }
  if (!response.ok) {
    return null;
  }
  const payload = await response.json();
  return normalizeKit(payload as InterviewKit);
}

export async function getInterviewKit(applicationId: string): Promise<ApiResponse<InterviewKit | null>> {
  await delay(MOCK_DELAY_MS / 2);
  try {
    const kit = await fetchInterviewKitFromBackend(applicationId);
    if (kit) {
      return { data: kit, status: 200 };
    }
  } catch {
    // Fall through to deterministic local fallback.
  }

  const applicationsRes = await getApplicationDrafts();
  const app = (applicationsRes.data as unknown[]).find((draft) => {
    if (!draft || typeof draft !== 'object') return false;
    return ensureStr((draft as Record<string, unknown>).id, '') === applicationId;
  });
  if (app && typeof app === 'object') {
    return { data: fallbackKitForApplication(app as Record<string, unknown>), status: 200 };
  }

  const kit = MOCK_INTERVIEW_KITS.find((k) => k.applicationId === applicationId) ?? null;
  return { data: kit ? normalizeKit(kit) : null, status: kit ? 200 : 404 };
}

export async function getInterviewKits(): Promise<ApiResponse<InterviewKit[]>> {
  await delay(MOCK_DELAY_MS / 2);

  try {
    const response = await fetch('/api/interviews');
    if (response.ok) {
      const payload = await response.json();
      if (Array.isArray(payload)) {
        if (payload.length > 0) {
          return { data: payload.map((item) => normalizeKit(item as InterviewKit)), status: 200 };
        }
      }
    }
  } catch {
    // Fall through to app-driven fallback.
  }

  const appsRes = await getApplicationDrafts();
  const interviewApps = (appsRes.data as unknown[]).filter((draft) => {
    if (!draft || typeof draft !== 'object') return false;
    const row = draft as Record<string, unknown>;
    return ensureStr(row.status, '') === 'interview';
  });

  if (interviewApps.length > 0) {
    const kits = await Promise.all(
      interviewApps.map(async (draft) => {
        const row = draft as Record<string, unknown>;
        const appId = ensureStr(row.id, '');
        if (!appId) return fallbackKitForApplication(row);
        try {
          const fromBackend = await fetchInterviewKitFromBackend(appId);
          if (fromBackend) return fromBackend;
        } catch {
          // ignore and fallback
        }
        return fallbackKitForApplication(row);
      }),
    );
    return { data: kits, status: 200 };
  }

  return { data: MOCK_INTERVIEW_KITS.map(normalizeKit), status: 200 };
}

type ScoreMockAnswerInput = {
  questionId: string;
  question: string;
  answer: string;
  category?: string;
  difficulty?: string;
};

function clampDimension(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 3;
  return Math.max(1, Math.min(5, Math.round(num)));
}

function normalizeMockScore(raw: unknown, fallbackQuestionId: string): MockScore {
  const base = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  return {
    sessionId: ensureStr(base.sessionId ?? base.session_id, `session-${Date.now()}`),
    questionId: ensureStr(base.questionId ?? base.question_id, fallbackQuestionId),
    structureScore: clampDimension(base.structureScore),
    relevanceScore: clampDimension(base.relevanceScore),
    technicalDepth: clampDimension(base.technicalDepth),
    specificity: clampDimension(base.specificity),
    clarity: clampDimension(base.clarity),
    finalScore: Math.max(1, Math.min(100, Number(base.finalScore ?? 60) || 60)),
    suggestions: ensureList(base.suggestions).slice(0, 3),
    createdAt: ensureStr(base.createdAt ?? base.created_at, new Date().toISOString()),
  };
}

export async function scoreMockAnswer(
  kitId: string,
  input: ScoreMockAnswerInput,
): Promise<ApiResponse<{ score: MockScore; usedAi: boolean }>> {
  const response = await fetch(`/api/interviews/${encodeURIComponent(kitId)}/mock-score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question_id: input.questionId,
      question: input.question,
      answer: input.answer,
      category: input.category ?? 'behavioral',
      difficulty: input.difficulty ?? 'medium',
    }),
  });

  if (!response.ok) {
    throw new Error(`Mock score request failed (${response.status})`);
  }

  const payload = await response.json();
  const data = (payload && typeof payload === 'object') ? (payload as Record<string, unknown>) : {};
  void refreshInsights();
  return {
    data: {
      score: normalizeMockScore(data.score, input.questionId),
      usedAi: Boolean(data.used_ai ?? data.usedAi),
    },
    status: response.status,
  };
}
