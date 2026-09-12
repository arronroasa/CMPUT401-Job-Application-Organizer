import { useEffect, useState } from 'react';
import { PageHeader } from '@onfile/ui';
import { useInterviewsStore } from '../state/useInterviewsStore';
import { QuestionsTab } from './QuestionsTab';
import { AnswerDraftsTab } from './AnswerDraftsTab';
import { MockSimulatorTab } from './MockSimulatorTab';
import { PerformanceHistoryTab } from './PerformanceHistoryTab';

type Tab = 'questions' | 'answers' | 'mock' | 'history';

const TABS: { id: Tab; label: string }[] = [
  { id: 'questions', label: 'Questions' },
  { id: 'answers', label: 'Answer Drafts' },
  { id: 'mock', label: 'Mock Simulator' },
  { id: 'history', label: 'Performance History' },
];

export function InterviewsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('questions');
  const { kits, selectedKitId, isLoading, fetchKits, selectKit } = useInterviewsStore();
  const kit = kits.find((k) => k.id === selectedKitId);

  useEffect(() => { fetchKits(); }, [fetchKits]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-0">
        <PageHeader
          title="Interview Prep"
          description={kit ? `${kit.company} — ${kit.jobTitle}` : 'Loading…'}
        />
        {kits.length > 1 && (
          <div className="mt-4 max-w-md">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Select Company
            </label>
            <select
              value={selectedKitId ?? ''}
              onChange={(e) => selectKit(e.target.value)}
              className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {kits.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.company} — {candidate.jobTitle}
                </option>
              ))}
            </select>
          </div>
        )}
        {/* Tabs */}
        <div className="flex gap-0 mt-5 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? 'border-blue-500 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading || !kit ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            {activeTab === 'questions' && <QuestionsTab kit={kit} />}
            {activeTab === 'answers' && <AnswerDraftsTab kit={kit} />}
            {activeTab === 'mock' && <MockSimulatorTab kit={kit} />}
            {activeTab === 'history' && <PerformanceHistoryTab kit={kit} />}
          </>
        )}
      </div>
    </div>
  );
}
