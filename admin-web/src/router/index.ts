import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from '../api/request';
import { useAuthStore } from '../stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
    {
      path: '/',
      component: () => import('../layouts/AdminLayout.vue'),
      children: [
        { path: '', redirect: '/workspace' },
        { path: 'workspace', name: '题库工作台', component: () => import('../views/WorkspaceView.vue') },
        { path: 'dashboard', name: '仪表盘', component: () => import('../views/DashboardView.vue') },
        { path: 'activity', name: '活跃度监控', component: () => import('../views/ActivityView.vue') },
        { path: 'announcements', name: '公告管理', component: () => import('../views/AnnouncementAdminView.vue') },
        { path: 'audit-logs', name: '操作日志', component: () => import('../views/AuditLogView.vue') },
        { path: 'users', name: '答题用户', component: () => import('../views/UserView.vue') },
        { path: 'admins', name: '管理员账号', component: () => import('../views/AdminUserView.vue') },
        { path: 'settings', name: '安全设置', component: () => import('../views/SettingsView.vue') }
      ]
    }
  ]
});

router.beforeEach(async (to) => {
  if (to.name === 'login') return true;
  if (!getToken()) return { name: 'login' };
  const auth = useAuthStore();
  if (!auth.user) {
    try { await auth.fetchMe(); } catch { auth.logout(); return { name: 'login' }; }
  }
  return true;
});

export default router;
