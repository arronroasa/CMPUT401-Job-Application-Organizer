import { create } from 'zustand';
import { getApplicationDrafts, updateDraftStatus } from '@onfile/api';
import type { ApplicationDraft, ApplicationStatus } from '@onfile/core';

interface ApplicationsStore {
  drafts: ApplicationDraft[];
  selectedDraftId: string | null;
  isLoading: boolean;
  fetchDrafts: () => Promise<void>;
  selectDraft: (id: string | null) => void;
  moveDraft: (id: string, status: ApplicationStatus) => Promise<void>;
}

export const useApplicationsStore = create<ApplicationsStore>((set) => ({
  drafts: [],
  selectedDraftId: null,
  isLoading: false,
  fetchDrafts: async () => {
    set({ isLoading: true });
    const res = await getApplicationDrafts();
    set({ drafts: res.data, isLoading: false });
  },
  selectDraft: (id) => set({ selectedDraftId: id }),
  moveDraft: async (id, status) => {
    set((state) => ({
      drafts: state.drafts.map((d) => (d.id === id ? { ...d, status } : d)),
    }));
    await updateDraftStatus(id, status);
  },
}));
