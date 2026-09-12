import { create } from 'zustand';
import { getInsights } from '@onfile/api';
import type { InsightsMetrics } from '@onfile/core';

interface InsightsStore {
  metrics: InsightsMetrics | null;
  isLoading: boolean;
  fetchInsights: () => Promise<void>;
}

export const useInsightsStore = create<InsightsStore>((set) => ({
  metrics: null,
  isLoading: false,
  fetchInsights: async () => {
    set({ isLoading: true });
    try {
      const res = await getInsights();
      set({ metrics: res.data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));
