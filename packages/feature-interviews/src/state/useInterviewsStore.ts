import { create } from 'zustand';
import { getInterviewKits } from '@onfile/api';
import type { InterviewKit, MockScore } from '@onfile/core';

interface InterviewsStore {
  kits: InterviewKit[];
  selectedKitId: string | null;
  currentQuestionIndex: number;
  isLoading: boolean;
  fetchKits: () => Promise<void>;
  selectKit: (id: string) => void;
  advanceQuestion: () => void;
  saveMockScore: (score: MockScore) => void;
}

export const useInterviewsStore = create<InterviewsStore>((set, get) => ({
  kits: [],
  selectedKitId: null,
  currentQuestionIndex: 0,
  isLoading: false,
  fetchKits: async () => {
    set({ isLoading: true });
    const res = await getInterviewKits();
    set({ kits: res.data, isLoading: false, selectedKitId: res.data[0]?.id ?? null });
  },
  selectKit: (id) => set({ selectedKitId: id, currentQuestionIndex: 0 }),
  advanceQuestion: () => {
    const { kits, selectedKitId, currentQuestionIndex } = get();
    const kit = kits.find((k) => k.id === selectedKitId);
    if (!kit) return;
    set({ currentQuestionIndex: (currentQuestionIndex + 1) % kit.questions.length });
  },
  saveMockScore: (score) => {
    set((state) => ({
      kits: state.kits.map((k) =>
        k.id === state.selectedKitId ? { ...k, mockScores: [...k.mockScores, score] } : k
      ),
    }));
  },
}));
