import { create } from 'zustand';
import { archiveAllJobs, archiveJob, getJobs, markJobInterested } from '@onfile/api';
import type { Job } from '@onfile/core';

interface JobsStore {
  jobs: Job[];
  selectedJobId: string | null;
  isLoading: boolean;
  lastFetchedAt: number | null;
  fetchJobs: (options?: { silent?: boolean }) => Promise<void>;
  selectJob: (id: string) => void;
  markInterested: (id: string) => Promise<void>;
  removeJob: (id: string) => Promise<void>;
  removeJobs: (ids: string[]) => Promise<void>;
  clearAllJobs: () => Promise<number>;
}

export const useJobsStore = create<JobsStore>((set, get) => ({
  jobs: [],
  selectedJobId: null,
  isLoading: false,
  lastFetchedAt: null,
  fetchJobs: async (options) => {
    const silent = Boolean(options?.silent);
    if (!silent && get().jobs.length === 0) {
      set({ isLoading: true });
    }
    try {
      const res = await getJobs();
      const previousSelected = get().selectedJobId;
      const selectedStillExists = previousSelected
        ? res.data.some((job) => job.id === previousSelected)
        : false;
      set({
        jobs: res.data,
        isLoading: false,
        selectedJobId: selectedStillExists ? previousSelected : (res.data[0]?.id ?? null),
        lastFetchedAt: Date.now(),
      });
    } catch {
      set({ isLoading: false });
    }
  },
  selectJob: (id) => set({ selectedJobId: id }),
  markInterested: async (id) => {
    await markJobInterested(id);
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, status: 'interested' as const } : j)),
    }));
  },
  removeJob: async (id) => {
    const res = await archiveJob(id);
    if (res.error) throw new Error(res.error);
    set((state) => {
      const nextJobs = state.jobs.filter((job) => job.id !== id);
      const nextSelected =
        state.selectedJobId === id ? (nextJobs[0]?.id ?? null) : state.selectedJobId;
      return {
        jobs: nextJobs,
        selectedJobId: nextSelected,
        lastFetchedAt: Date.now(),
      };
    });
  },
  removeJobs: async (ids) => {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return;
    const responses = await Promise.all(uniqueIds.map((id) => archiveJob(id)));
    const firstError = responses.find((response) => response.error);
    if (firstError?.error) throw new Error(firstError.error);
    set((state) => {
      const removeSet = new Set(uniqueIds);
      const nextJobs = state.jobs.filter((job) => !removeSet.has(job.id));
      const nextSelected =
        state.selectedJobId && removeSet.has(state.selectedJobId)
          ? (nextJobs[0]?.id ?? null)
          : state.selectedJobId;
      return {
        jobs: nextJobs,
        selectedJobId: nextSelected,
        lastFetchedAt: Date.now(),
      };
    });
  },
  clearAllJobs: async () => {
    const res = await archiveAllJobs();
    if (res.error) throw new Error(res.error);
    const archived = res.data?.archived ?? 0;
    set({
      jobs: [],
      selectedJobId: null,
      lastFetchedAt: Date.now(),
    });
    return archived;
  },
}));
