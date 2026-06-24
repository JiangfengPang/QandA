import { defineStore } from 'pinia';
import { api, clearToken } from '../api/request';

export const useAuthStore = defineStore('admin-auth', {
  state: () => ({ user: null as any }),
  actions: {
    async login(username: string, password: string) {
      const data = await api.post<{ user: any }>('/auth/login', { username, password, adminOnly: true });
      this.user = data.user;
    },
    async fetchMe(force = false) {
      if (this.user && !force) return this.user;
      const user = await api.get<any>('/auth/me');
      if (user.role !== 'ADMIN') throw new Error('需要管理员权限');
      this.user = user;
      return user;
    },
    async changePassword(oldPassword: string, newPassword: string) {
      return api.put<{ changed: boolean }>('/admin/password', { oldPassword, newPassword });
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
