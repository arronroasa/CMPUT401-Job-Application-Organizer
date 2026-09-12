import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  activateProfile,
  createProfile,
  deleteProfile,
  getProfile,
  getProfiles,
  recommendProfileRoles,
  renameProfile,
  updateProfile,
  uploadProfileResume,
} from '@onfile/api';
import type { ProfileSummary, ResumeUploadResult, RoleRecommendationResult } from '@onfile/api';
import type { UserProfile } from '@onfile/core';

interface ProfileStore {
  profile: UserProfile | null;
  profiles: ProfileSummary[];
  selectedProfileId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  isUploadingResume: boolean;
  isRecommendingRoles: boolean;
  fetchProfiles: () => Promise<void>;
  fetchProfile: (profileId?: string) => Promise<void>;
  selectProfile: (profileId: string) => Promise<void>;
  createBlankProfile: (name?: string) => Promise<void>;
  renameSelectedProfile: (name: string) => Promise<void>;
  deleteSelectedProfile: () => Promise<void>;
  saveProfile: (partial: Partial<UserProfile>) => Promise<void>;
  uploadResume: (file: File, options?: { createNewProfile?: boolean }) => Promise<ResumeUploadResult>;
  recommendRoles: () => Promise<RoleRecommendationResult>;
}

function dedupeProfiles(items: ProfileSummary[]): ProfileSummary[] {
  const seen = new Set<string>();
  const result: ProfileSummary[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

export const useProfileStore = create<ProfileStore>()(
  persist(
    (set, get) => ({
      profile: null,
      profiles: [],
      selectedProfileId: null,
      isLoading: false,
      isSaving: false,
      isUploadingResume: false,
      isRecommendingRoles: false,
      fetchProfiles: async () => {
        const response = await getProfiles();
        const profiles = dedupeProfiles(response.data);
        const active = profiles.find((item) => item.isActive) ?? profiles[0] ?? null;
        set({
          profiles,
          selectedProfileId: active?.id ?? null,
        });
      },
      fetchProfile: async (profileId) => {
        set({ isLoading: true });
        try {
          if (get().profiles.length === 0) {
            await get().fetchProfiles();
          }
          const requestedId = profileId ?? get().selectedProfileId ?? undefined;
          const response = await getProfile(requestedId);
          const selectedId = response.data.id;

          await get().fetchProfiles();
          set({ profile: response.data, selectedProfileId: selectedId, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },
      selectProfile: async (profileId) => {
        await activateProfile(profileId);
        const response = await getProfile(profileId);
        await get().fetchProfiles();
        set({ profile: response.data, selectedProfileId: profileId });
      },
      createBlankProfile: async (name) => {
        const response = await createProfile(name);
        await activateProfile(response.data.id);
        await get().fetchProfiles();
        set({ profile: response.data, selectedProfileId: response.data.id });
      },
      renameSelectedProfile: async (name) => {
        const selected = get().selectedProfileId;
        if (!selected) return;
        const response = await renameProfile(selected, name);
        const updatedProfile = response.data;
        await get().fetchProfiles();
        set({ profile: updatedProfile, selectedProfileId: updatedProfile.id });
      },
      deleteSelectedProfile: async () => {
        const selected = get().selectedProfileId;
        if (!selected) return;
        const response = await deleteProfile(selected);
        const nextId = response.data.activeProfileId || undefined;
        await get().fetchProfiles();
        if (!nextId) {
          set({ profile: null, selectedProfileId: null });
          return;
        }
        const profileResponse = await getProfile(nextId);
        set({ profile: profileResponse.data, selectedProfileId: profileResponse.data.id });
      },
      saveProfile: async (partial) => {
        const selected = get().selectedProfileId ?? undefined;
        set({ isSaving: true });
        try {
          const response = await updateProfile(partial, selected);
          await get().fetchProfiles();
          set({ profile: response.data, selectedProfileId: response.data.id, isSaving: false });
        } catch (error) {
          set({ isSaving: false });
          throw error;
        }
      },
      uploadResume: async (file, options) => {
        const selected = get().selectedProfileId ?? undefined;
        const createNewProfile = options?.createNewProfile ?? true;
        set({ isUploadingResume: true });
        try {
          const response = await uploadProfileResume(file, selected, createNewProfile);
          if (response.error) {
            throw new Error(response.error);
          }
          const profile = response.data.profile;
          const nextProfileId = response.data.profileId ?? profile.id;
          await activateProfile(nextProfileId);
          await get().fetchProfiles();
          set({ profile, selectedProfileId: nextProfileId, isUploadingResume: false });
          return response.data;
        } catch (error) {
          set({ isUploadingResume: false });
          throw error;
        }
      },
      recommendRoles: async () => {
        const selected = get().selectedProfileId ?? undefined;
        set({ isRecommendingRoles: true });
        try {
          const response = await recommendProfileRoles(selected);
          if (response.error) {
            throw new Error(response.error);
          }
          const result = response.data;
          await get().fetchProfiles();
          set({
            profile: result.profile,
            selectedProfileId: result.profile.id,
            isRecommendingRoles: false,
          });
          return result;
        } catch (error) {
          set({ isRecommendingRoles: false });
          throw error;
        }
      },
    }),
    {
      name: 'onfile-profile-selection',
      partialize: (state) => ({ selectedProfileId: state.selectedProfileId }),
    }
  )
);
