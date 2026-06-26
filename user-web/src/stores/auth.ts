import { defineStore } from 'pinia';
import { api, clearToken } from '../api/request';
import { setPreferredSpeechVoiceKey } from '../utils/pronunciation';

export type UserPreferences = {
  autoShowExplanation: boolean;
  autoAddWrong: boolean;
  autoAdvanceOnCorrect: boolean;
  questionFontSize: 'small' | 'standard' | 'large';
  showQuestionOverview: boolean;
  speechVoiceKey: string;
};

export type UserInfo = {
  id: string;
  username?: string;
  nickname: string;
  email?: string;
  avatarUrl?: string;
  role: string;
  isActive?: boolean;
  createdAt?: string;
  preferences: UserPreferences;
};

const defaultPreferences = (): UserPreferences => ({
  autoShowExplanation: true,
  autoAddWrong: true,
  autoAdvanceOnCorrect: true,
  questionFontSize: 'standard',
  showQuestionOverview: true,
  speechVoiceKey: ''
});

function normalizeUser(user: UserInfo): UserInfo {
  const preferences = { ...defaultPreferences(), ...(user.preferences || {}) };
  setPreferredSpeechVoiceKey(preferences.speechVoiceKey || '');
  return {
    ...user,
    email: user.email || '',
    avatarUrl: user.avatarUrl || '',
    preferences
  };
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as UserInfo | null,
    loading: false
  }),
  actions: {
    async login(email: string, password: string) {
      const data = await api.post<{ user: UserInfo }>('/auth/login', { email, password });
      this.user = normalizeUser(data.user);
    },
    async register(payload: { nickname: string; email: string; code: string; password: string }) {
      const data = await api.post<{ user: UserInfo }>('/auth/register', payload);
      this.user = normalizeUser(data.user);
    },
    async fetchMe(force = false) {
      if (this.user && !force) return this.user;
      this.loading = true;
      try {
        this.user = normalizeUser(await api.get<UserInfo>('/auth/me'));
        return this.user;
      } finally {
        this.loading = false;
      }
    },
    async updateProfile(payload: { nickname?: string; avatarUrl?: string | null }) {
      this.user = normalizeUser(await api.put<UserInfo>('/auth/profile', payload));
      return this.user;
    },
    async bindEmail(payload: { email: string; newCode: string; oldCode?: string }) {
      this.user = normalizeUser(await api.put<UserInfo>('/auth/email', payload));
      return this.user;
    },
    async changePassword(newPassword: string, code: string) {
      return api.put<{ changed: boolean }>('/auth/password', { newPassword, code });
    },
    async updatePreferences(preferences: Partial<UserPreferences>) {
      this.user = normalizeUser(await api.put<UserInfo>('/auth/preferences', preferences));
      return this.user;
    },
    async logout() {
      try {
        await api.post('/auth/logout');
      } catch {
        // ignore logout network errors
      }
      clearToken();
      this.user = null;
    }
  }
});
