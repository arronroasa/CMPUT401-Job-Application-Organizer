import { create } from 'zustand';
import {
  getResumeVersions,
  exportResumeAsLatex,
  exportResumeAsPdf,
  generateAllVersions,
  updateResumeContent,
} from '@onfile/api';
import type { ResumeVersion } from '@onfile/core';

type GenerationStatus = 'idle' | 'generating' | 'done' | 'error';

interface ResumeStore {
  versions: ResumeVersion[];
  selectedId: string | null;
  compareId: string | null;
  isLoading: boolean;
  generationStatus: GenerationStatus;
  generationError: string | null;
  activeJobId: string | null;

  fetchVersions: () => Promise<void>;
  selectVersion: (id: string) => void;
  setCompareId: (id: string | null) => void;
  exportLatex: (id: string) => Promise<void>;
  exportPdf: (id: string) => Promise<void>;
  generateForJob: (jobId: string) => Promise<void>;
  updateVersionContent: (id: string, content: Record<string, unknown>) => Promise<void>;
}

export const useResumeStore = create<ResumeStore>((set) => ({
  versions: [],
  selectedId: null,
  compareId: null,
  isLoading: false,
  generationStatus: 'idle',
  generationError: null,
  activeJobId: null,

  fetchVersions: async () => {
    set({ isLoading: true });
    const res = await getResumeVersions();
    set({ versions: res.data, isLoading: false, selectedId: res.data[0]?.id ?? null });
  },

  selectVersion: (id) => set({ selectedId: id, compareId: null }),
  setCompareId: (id) => set({ compareId: id }),

  generateForJob: async (jobId: string) => {
    const startedAt = Date.now();
    set({ generationStatus: 'generating', generationError: null, activeJobId: jobId });
    try {
      const res = await generateAllVersions(jobId);
      if (!res.data || res.data.versions.length === 0) {
        // Backend can still finish after proxy timeout (504). Recover by polling resumes briefly.
        if (res.status === 504) {
          for (let attempt = 0; attempt < 5; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            const allRes = await getResumeVersions();
            const maybeGenerated = allRes.data
              .filter((v) => v.jobId === jobId)
              .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
              .find((v) => +new Date(v.createdAt) >= startedAt - 2000);
            if (maybeGenerated) {
              set({
                versions: allRes.data,
                selectedId: maybeGenerated.id,
                generationStatus: 'done',
                generationError: null,
              });
              return;
            }
          }
        }
        set({ generationStatus: 'error', generationError: res.error ?? 'Generation failed' });
        return;
      }
      // Re-fetch all versions so the newly created ones appear
      const allRes = await getResumeVersions();
      const newIds = new Set(res.data.versions.map((v) => v.id));
      const firstNew = allRes.data.find((v) => newIds.has(v.id));
      set({
        versions: allRes.data,
        selectedId: firstNew?.id ?? allRes.data[0]?.id ?? null,
        generationStatus: 'done',
      });
    } catch (err) {
      set({
        generationStatus: 'error',
        generationError: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  },

  updateVersionContent: async (id: string, content: Record<string, unknown>) => {
    const res = await updateResumeContent(id, content);
    if (res.data) {
      set((state) => ({
        versions: state.versions.map((v) => (v.id === id ? res.data! : v)),
      }));
    }
  },

  exportLatex: async (id) => {
    const res = await exportResumeAsLatex(id);
    if (!res.data) {
      const message = res.error ?? 'LaTeX export failed';
      console.warn('[resume] LaTeX export failed', message);
      if (typeof window !== 'undefined') window.alert(message);
      return;
    }
    const url = URL.createObjectURL(res.data.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.data.filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  exportPdf: async (id) => {
    const res = await exportResumeAsPdf(id);
    if (!res.data) {
      const message = res.error ?? 'PDF export failed';
      console.warn('[resume] PDF export failed', message);
      if (typeof window !== 'undefined') window.alert(message);
      return;
    }
    const url = URL.createObjectURL(res.data.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.data.filename;
    a.click();
    URL.revokeObjectURL(url);
    if (res.data.savedPath) console.info('[resume] PDF saved to', res.data.savedPath);
  },
}));
