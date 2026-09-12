import { useState } from 'react';
import type { InterviewKit, InterviewQuestion } from '@onfile/core';
import freeLeetcodeCommon200 from '../data/freeLeetcodeCommon200.json';

const starBorderColors: Record<string, string> = {
  situation_hint: 'border-l-2 border-border',
  task_hint: 'border-l-2 border-blue-500/40',
  action_hint: 'border-l-2 border-blue-500',
  result_hint: 'border-l-2 border-green-500',
  reflection_hint: 'border-l-2 border-amber-500',
};

const difficultyColors = {
  easy: 'text-green-400 bg-green-500/10 border-green-500/20',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  hard: 'text-red-400 bg-red-500/10 border-red-500/20',
};

type PracticeQuestion = {
  id: string;
  title: string;
  url: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
};

const FREE_LEETCODE_BANK: PracticeQuestion[] = (freeLeetcodeCommon200 as PracticeQuestion[])
  .filter((q) => Boolean(q?.id && q?.title && q?.url))
  .slice(0, 200);

const COMMON_BEHAVIORAL_POOL: InterviewQuestion[] = [
  {
    id: 'common-beh-1',
    category: 'behavioral',
    difficulty: 'medium',
    question: 'Tell me about a time you handled a high-pressure production issue.',
    rationale: 'Tests incident ownership, prioritization, and communication under pressure.',
    tags: ['ownership', 'incident-response'],
    star_guidance: {
      situation_hint: 'Describe the incident context, impact, and urgency.',
      task_hint: 'Explain your role and immediate responsibilities.',
      action_hint: 'Walk through your debugging, coordination, and mitigation steps.',
      result_hint: 'Share the business/user outcome and recovery metrics if available.',
      reflection_hint: 'Explain what you improved afterward to prevent recurrence.',
    },
  },
  {
    id: 'common-beh-2',
    category: 'behavioral',
    difficulty: 'medium',
    question: 'Describe a time you disagreed with a technical decision and how you handled it.',
    rationale: 'Evaluates collaboration, influence, and decision-making maturity.',
    tags: ['collaboration', 'technical-judgment'],
    star_guidance: {
      situation_hint: 'Set up the design or implementation disagreement.',
      task_hint: 'Clarify the decision you needed to influence.',
      action_hint: 'Show how you used evidence and communication, not authority.',
      result_hint: 'State the final decision and project impact.',
      reflection_hint: 'Share what you learned about alignment and trade-offs.',
    },
  },
  {
    id: 'common-beh-3',
    category: 'behavioral',
    difficulty: 'medium',
    question: 'Tell me about a time you improved reliability or quality in a system you owned.',
    rationale: 'Assesses long-term engineering ownership and quality mindset.',
    tags: ['reliability', 'quality'],
    star_guidance: {
      situation_hint: 'Describe the reliability/quality pain point.',
      task_hint: 'Explain what reliability target or quality bar you were aiming for.',
      action_hint: 'Detail the engineering changes and rollout approach.',
      result_hint: 'Provide measurable outcomes (incidents, latency, defects).',
      reflection_hint: 'Mention what you would improve further.',
    },
  },
  {
    id: 'common-beh-4',
    category: 'behavioral',
    difficulty: 'medium',
    question: 'Give an example of a project where requirements were ambiguous and changed often.',
    rationale: 'Tests adaptability and product-minded execution.',
    tags: ['ambiguity', 'execution'],
    star_guidance: {
      situation_hint: 'Describe the ambiguous project environment.',
      task_hint: 'Define your ownership despite unclear inputs.',
      action_hint: 'Explain how you de-risked and iterated with stakeholders.',
      result_hint: 'Share delivery outcomes and stakeholder impact.',
      reflection_hint: 'Describe how you handle ambiguity better now.',
    },
  },
  {
    id: 'common-beh-5',
    category: 'behavioral',
    difficulty: 'medium',
    question: 'Tell me about a time you had to learn a new skill quickly to deliver.',
    rationale: 'Measures learning velocity and practical problem solving.',
    tags: ['learning', 'adaptability'],
    star_guidance: {
      situation_hint: 'Set the timeline and why the new skill was needed.',
      task_hint: 'Explain the expected outcome and your constraints.',
      action_hint: 'Show your learning plan and how you applied it quickly.',
      result_hint: 'Share the delivery result and quality of outcome.',
      reflection_hint: 'Highlight how this changed your future approach.',
    },
  },
  {
    id: 'common-beh-6',
    category: 'behavioral',
    difficulty: 'medium',
    question: 'Describe a time you made a mistake and how you handled it.',
    rationale: 'Evaluates accountability and growth mindset.',
    tags: ['accountability', 'growth'],
    star_guidance: {
      situation_hint: 'Describe the mistake and context honestly.',
      task_hint: 'Explain your responsibility in the situation.',
      action_hint: 'Show immediate response, communication, and correction steps.',
      result_hint: 'State the final outcome and remediation impact.',
      reflection_hint: 'Share concrete changes to avoid repeating it.',
    },
  },
  {
    id: 'common-beh-7',
    category: 'behavioral',
    difficulty: 'medium',
    question: 'Tell me about a time you improved team efficiency or developer productivity.',
    rationale: 'Assesses systems thinking beyond individual task delivery.',
    tags: ['leadership', 'productivity'],
    star_guidance: {
      situation_hint: 'Describe the repeated bottleneck or inefficiency.',
      task_hint: 'Clarify the improvement goal and scope.',
      action_hint: 'Detail the process/tooling/coordination changes you led.',
      result_hint: 'Share impact on cycle time, quality, or team throughput.',
      reflection_hint: 'Explain what made the change stick.',
    },
  },
  {
    id: 'common-beh-8',
    category: 'behavioral',
    difficulty: 'medium',
    question: 'Give an example of how you balanced speed vs. quality on a delivery.',
    rationale: 'Tests judgment on practical trade-offs.',
    tags: ['trade-offs', 'delivery'],
    star_guidance: {
      situation_hint: 'Describe the deadline pressure and quality risks.',
      task_hint: 'Define what success looked like for both speed and quality.',
      action_hint: 'Explain prioritization, scope control, and risk management.',
      result_hint: 'Share outcome quality and delivery timing.',
      reflection_hint: 'Describe what you would do differently next time.',
    },
  },
  {
    id: 'common-beh-9',
    category: 'behavioral',
    difficulty: 'medium',
    question: 'Tell me about a time you influenced a cross-functional partner without direct authority.',
    rationale: 'Measures communication and stakeholder influence.',
    tags: ['communication', 'cross-functional'],
    star_guidance: {
      situation_hint: 'Describe the partner goals and points of misalignment.',
      task_hint: 'Explain the outcome you needed from the collaboration.',
      action_hint: 'Show how you aligned using data, empathy, and clarity.',
      result_hint: 'Share what changed and the impact on the project.',
      reflection_hint: 'Summarize lessons on influence without authority.',
    },
  },
  {
    id: 'common-beh-10',
    category: 'behavioral',
    difficulty: 'medium',
    question: 'Describe a project you are most proud of and why.',
    rationale: 'Surfaces values, ownership depth, and impact orientation.',
    tags: ['ownership', 'impact'],
    star_guidance: {
      situation_hint: 'Introduce the project scope and problem.',
      task_hint: 'Clarify your specific ownership and success criteria.',
      action_hint: 'Describe the most important decisions and execution steps.',
      result_hint: 'Provide outcomes and measurable impact.',
      reflection_hint: 'Explain why this work matters to you professionally.',
    },
  },
];

function isNeedsReview(value: string | undefined): boolean {
  return (value ?? '').includes('[REQUIRES_REVIEW');
}

function getQuestionText(question: InterviewQuestion): string {
  return question.question ?? question.text ?? '[REQUIRES_REVIEW: missing question text]';
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pickFreePractice(kit: InterviewKit): PracticeQuestion[] {
  const seed = hashSeed(`${kit.company}:${kit.jobTitle}:${kit.id}:${new Date().toDateString()}`);
  const rand = rng(seed);
  const pool = [...FREE_LEETCODE_BANK];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 20);
}

function pickCommonBehavioral(kit: InterviewKit, shuffleNonce: number): InterviewQuestion[] {
  const seed = hashSeed(
    `${kit.company}:${kit.jobTitle}:${kit.id}:${new Date().toDateString()}:behavioral:${shuffleNonce}`,
  );
  const rand = rng(seed);
  const pool = [...COMMON_BEHAVIORAL_POOL];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 5).map((q, index) => ({
    ...q,
    id: `${q.id}-${index + 1}`,
  }));
}

function toSection(kit: InterviewKit) {
  const fromBank = kit.questionBank;
  if (fromBank) {
    return [
      { key: 'company', label: 'Company Questions', questions: fromBank.company_questions },
      { key: 'behavioral', label: 'Behavioral Questions (STAR)', questions: fromBank.behavioral_questions },
      { key: 'technical', label: 'Technical Questions', questions: fromBank.technical_questions },
    ] as const;
  }

  return [
    { key: 'company', label: 'Company Questions', questions: kit.questions.filter((q) => q.category === 'company' || q.category === 'company_specific') },
    { key: 'behavioral', label: 'Behavioral Questions (STAR)', questions: kit.questions.filter((q) => q.category === 'behavioral') },
    { key: 'technical', label: 'Technical Questions', questions: kit.questions.filter((q) => q.category === 'technical') },
  ] as const;
}

export function QuestionsTab({ kit }: { kit: InterviewKit }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [shuffleNonce, setShuffleNonce] = useState(0);
  const [behavioralShuffleNonce, setBehavioralShuffleNonce] = useState(0);
  const companyProfile = kit.companyProfile ?? {
    company_name: kit.company,
    role_title: kit.jobTitle,
    company_summary: '[REQUIRES_REVIEW: add a short summary of what the company does]',
    company_website: '',
    sources_note: 'Generated from available interview context.',
  };
  const sections = toSection(kit);
  const hasPlaceholder = [
    companyProfile.company_summary,
    companyProfile.sources_note,
  ].some((item) => isNeedsReview(item));

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const companySnapshot = companyProfile.company_summary
    ?? `Based on available context, ${companyProfile.company_name} is hiring for ${companyProfile.role_title}.`;
  const practiceQuestions = pickFreePractice({
    ...kit,
    id: `${kit.id}-${shuffleNonce}`,
  });
  const randomizedBehavioral = pickCommonBehavioral(kit, behavioralShuffleNonce);

  return (
    <div className="px-6 py-5 space-y-6">
      <section className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Company Research</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {companyProfile.company_name} - {companyProfile.role_title}
            </p>
          </div>
          {hasPlaceholder && (
            <span className="text-[11px] uppercase tracking-wider px-2 py-1 rounded border border-amber-500/30 text-amber-300 bg-amber-500/10">
              Needs review
            </span>
          )}
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Company Snapshot</p>
            <p className="text-sm text-foreground leading-relaxed">{companySnapshot}</p>
          </div>
          {companyProfile.company_website && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Website</p>
              <a
                href={companyProfile.company_website}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2"
              >
                {companyProfile.company_website}
              </a>
            </div>
          )}
          {(companyProfile.sources_note?.length ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">{companyProfile.sources_note}</p>
          )}
        </div>
      </section>

      <section className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Free LeetCode Practice</h3>
          <button
            type="button"
            onClick={() => setShuffleNonce((v) => v + 1)}
            className="text-xs px-3 py-1 rounded border border-border text-foreground/80 hover:border-foreground/30 hover:text-foreground"
          >
            Shuffle
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
          {practiceQuestions.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 bg-background border border-border rounded-md px-3 py-2 hover:border-border transition-colors"
            >
              <span className="text-sm text-foreground">{item.id}. {item.title}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${difficultyColors[item.difficulty]}`}>
                {item.difficulty}
              </span>
            </a>
          ))}
        </div>
      </section>

      {sections.map((section) => {
        const questions = (() => {
          if (section.key !== 'behavioral') return section.questions;
          return randomizedBehavioral;
        })();
        if (questions.length === 0) return null;
        return (
          <section key={section.key}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {section.label}
              </h3>
              {section.key === 'behavioral' && (
                <button
                  type="button"
                  onClick={() => setBehavioralShuffleNonce((v) => v + 1)}
                  className="text-xs px-3 py-1 rounded border border-border text-foreground/80 hover:border-foreground/30 hover:text-foreground"
                >
                  Shuffle
                </button>
              )}
            </div>
            <div className="space-y-2">
              {questions.map((q) => {
                const isExpanded = expandedId === q.id;
                return (
                  <div
                    key={q.id}
                    className="bg-card border border-border rounded-lg p-4 cursor-pointer transition-colors hover:border-border"
                    onClick={() => toggleExpand(q.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-foreground leading-relaxed">{getQuestionText(q)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${difficultyColors[q.difficulty ?? 'medium']}`}>
                        {q.difficulty ?? 'medium'}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border space-y-2">
                        {(q.rationale || q.contextNotes) && (
                          <p className="text-xs text-muted-foreground leading-relaxed">{q.rationale ?? q.contextNotes}</p>
                        )}
                        {((q.tags?.length ?? 0) > 0 || (q.skills?.length ?? 0) > 0) && (
                          <div className="flex flex-wrap gap-1">
                            {(q.tags ?? q.skills ?? []).map((s) => (
                              <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{s}</span>
                            ))}
                          </div>
                        )}
                        {section.key === 'behavioral' && q.star_guidance && (
                          <div className="pt-2 space-y-2">
                            {([
                              ['situation_hint', 'Situation'],
                              ['task_hint', 'Task'],
                              ['action_hint', 'Action'],
                              ['result_hint', 'Result'],
                              ['reflection_hint', 'Reflection'],
                            ] as const).map(([key, label]) => {
                              const value = q.star_guidance?.[key];
                              if (!value) return null;
                              return (
                                <div key={key} className={`pl-3 ${starBorderColors[key]}`}>
                                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
                                  <p className="text-sm text-foreground mt-1 leading-relaxed">{value}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
