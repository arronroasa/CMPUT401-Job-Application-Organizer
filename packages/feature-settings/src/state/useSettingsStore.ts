import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getSettings, updateSettings } from '@onfile/api';

interface SettingsState {
  dailySubmissionCap: number;
  discoveryIntervalMinutes: number;
  defaultResumeTemplate: 'jakes' | 'minimal' | 'modern';
  exportPath: string;
  llmProvider: 'gemini' | 'openai' | 'local';
  llmApiKey: string;
  setDailySubmissionCap: (v: number) => void;
  setDiscoveryInterval: (v: number) => void;
  setDefaultTemplate: (v: SettingsState['defaultResumeTemplate']) => void;
  setExportPath: (v: string) => void;
  setLlmProvider: (v: SettingsState['llmProvider']) => void;
  setLlmApiKey: (v: string) => void;
  hydrateFromBackend: () => Promise<void>;
  resetAll: () => void;
}

type SyncSettingsPayload = Pick<
  SettingsState,
  'dailySubmissionCap' | 'discoveryIntervalMinutes' | 'defaultResumeTemplate' | 'exportPath' | 'llmProvider' | 'llmApiKey'
>;

const DEFAULTS = {
  dailySubmissionCap: 10,
  discoveryIntervalMinutes: 60,
  defaultResumeTemplate: 'jakes' as const,
  exportPath: '~/Downloads',
  llmProvider: 'gemini' as const,
  llmApiKey: '',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => {
      const syncPatch = (patch: Partial<SyncSettingsPayload>) => {
        void updateSettings({
          dailySubmissionCap: patch.dailySubmissionCap,
          discoveryIntervalMinutes: patch.discoveryIntervalMinutes,
          defaultResumeTemplate: patch.defaultResumeTemplate,
          exportPath: patch.exportPath,
          llmProvider: patch.llmProvider,
          llmApiKey: patch.llmApiKey,
        }).catch((error) => {
          console.warn('[settings] backend sync failed', error);
        });
      };

      return {
      ...DEFAULTS,
      setDailySubmissionCap: (v) => {
        set({ dailySubmissionCap: v });
        syncPatch({ dailySubmissionCap: v });
      },
      setDiscoveryInterval: (v) => {
        set({ discoveryIntervalMinutes: v });
        syncPatch({ discoveryIntervalMinutes: v });
      },
      setDefaultTemplate: (v) => {
        set({ defaultResumeTemplate: v });
        syncPatch({ defaultResumeTemplate: v });
      },
      setExportPath: (v) => {
        set({ exportPath: v });
        syncPatch({ exportPath: v });
      },
      setLlmProvider: (v) => {
        set({ llmProvider: v });
        syncPatch({ llmProvider: v });
      },
      setLlmApiKey: (v) => {
        set({ llmApiKey: v });
        syncPatch({ llmApiKey: v });
      },
      hydrateFromBackend: async () => {
        try {
          const response = await getSettings();
          set({
            dailySubmissionCap: response.data.dailySubmissionCap,
            discoveryIntervalMinutes: response.data.discoveryIntervalMinutes,
            defaultResumeTemplate: response.data.defaultResumeTemplate,
            exportPath: response.data.exportPath,
            llmProvider: response.data.llmProvider,
            llmApiKey: response.data.llmApiKey,
          });
        } catch (error) {
          console.warn('[settings] failed to load backend settings', error);
        }
      },
      resetAll: () => {
        set(DEFAULTS);
        syncPatch(DEFAULTS);
      },
      };
    },
    { name: 'onfile-settings' }
  )
);
